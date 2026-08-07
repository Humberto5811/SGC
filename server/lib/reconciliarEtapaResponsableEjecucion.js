/**
 * RC8.6F.3 — Reconciliación de etapa/responsable por evidencia de ejecución.
 * Precedencia: CCP < REGISTRO_ORDEN < RECEPCION_BIENES < CONFORMIDAD < PAGOS < FINALIZADO
 * No retrocede. Dry-run por defecto; --apply escribe vía expedienteEstadoPersistido.
 */
import { query } from '../db.js';
import { withTransaction } from './workflow/workflowTransaction.js';
import {
  cerrarAsignacionActiva,
  crearAsignacion,
  upsertEstadoVigente,
  syncLegacyRequerimiento,
  ORIGEN_ESCRITURA_VIGENTE,
} from './expedienteEstadoPersistido.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { getEtapaMeta } from '../../shared/workflow/etapas.js';
import { isRolGenerico } from '../../shared/identificadoresUsuarios.js';
import { resolveUsuarioDesdeIdentificador } from './resolveAsignacionRealExistente.js';
import { loadEstadoExpedienteEvidenceByIds } from './estadoExpedienteEvidence.js';
import { getLabelEstado } from '../../shared/estadoExpedienteCatalog.js';

export const ORIGEN_RECONCILIACION_F3 = 'RECONCILIACION_ETAPA_RESPONSABLE_EJECUCION';

const RANK = Object.freeze({
  CCP: 10,
  REGISTRO_ORDEN: 20,
  REGISTRO_ORDENES: 20,
  ORDEN: 20,
  RECEPCION_BIENES: 30,
  CONFORMIDAD: 40,
  PAGOS: 50,
  DERIVACION_PAGO: 50,
  FINALIZADO: 60,
});

function rankOf(etapa) {
  const e = String(etapa || '').toUpperCase();
  if (RANK[e] != null) return RANK[e];
  if (e.includes('PAGO')) return RANK.PAGOS;
  if (e.includes('CONFORM')) return RANK.CONFORMIDAD;
  if (e.includes('RECEPCION') || e === 'EN_EJECUCION') return RANK.RECEPCION_BIENES;
  if (e.includes('ORDEN')) return RANK.REGISTRO_ORDEN;
  if (e === 'CCP') return RANK.CCP;
  return 0;
}

function canonEtapa(etapa) {
  const e = String(etapa || '').toUpperCase();
  if (e === 'REGISTRO_ORDENES' || e === 'ORDEN') return 'REGISTRO_ORDEN';
  if (e === 'DERIVACION_PAGO') return 'PAGOS';
  if (e === 'EN_EJECUCION') return 'RECEPCION_BIENES';
  return e;
}

/**
 * Determina la etapa más avanzada demostrada por evidencia (sin inventar).
 */
export function resolverEtapaDesdeEvidencia(ev = {}, extras = {}) {
  const hallazgos = [];
  let best = { etapa: null, rank: 0, estadoCodigo: null, evidencia: null };

  const bump = (etapa, estadoCodigo, evidencia, detalle) => {
    const c = canonEtapa(etapa);
    const r = rankOf(c);
    if (r <= 0) return;
    hallazgos.push({ etapa: c, estadoCodigo, evidencia, detalle, fecha: detalle?.fecha || null });
    if (r > best.rank) {
      best = { etapa: c, rank: r, estadoCodigo, evidencia, detalle };
    }
  };

  if (ev.codigo_ccp || ev.ccp_activo) {
    bump('CCP', 'CCP_REGISTRADA', 'ccp_codigos', {
      codigo_ccp: ev.codigo_ccp,
      fecha: extras.ccpRegistradoAt || null,
    });
  }
  // Obs46 / RC8.7 — derivado a RO sin OC aún (p.ej. Locadores EN_ORDEN).
  const solEst = String(extras.solicitudEstado || ev.solicitud_estado || '').toUpperCase();
  if (solEst === 'EN_ORDEN' || extras.enRegistroOrdenes === true || ev.en_registro_ordenes === true) {
    bump('REGISTRO_ORDEN', 'REGISTRO_ORDENES', 'solicitud_cotizacion.EN_ORDEN', {
      solicitud_estado: solEst || 'EN_ORDEN',
      fecha: extras.solicitudUpdatedAt || null,
    });
  }
  if (ev.orden_id) {
    bump('REGISTRO_ORDEN', ev.orden_estado || 'REGISTRO_ORDENES', 'ordenes_contratacion', {
      orden_id: ev.orden_id,
      orden_estado: ev.orden_estado,
      fecha: extras.ordenCreadoAt || null,
    });
  }
  const tieneRecepcion = !!(
    ev.recepcion_bienes_expediente_id
    || ev.recepcion_estado_global
    || ev.derivado_ejecucion_at
  );
  if (tieneRecepcion) {
    bump(
      'RECEPCION_BIENES',
      ev.recepcion_estado_global || 'RECEPCION_BIENES_PENDIENTE',
      'recepcion_bienes_expedientes',
      {
        recepcion_id: ev.recepcion_bienes_expediente_id,
        estado_global: ev.recepcion_estado_global,
        derivado_ejecucion_at: ev.derivado_ejecucion_at,
        fecha: extras.recepcionUpdatedAt || extras.recepcionCreatedAt || null,
      },
    );
  }
  if (extras.conformidadId || extras.tieneConformidad) {
    bump('CONFORMIDAD', 'CONFORMIDAD', 'conformidades', {
      conformidad_id: extras.conformidadId,
      fecha: extras.conformidadAt || null,
    });
  }
  if (ev.expediente_derivado_pago || ev.derivado_pago_at) {
    bump('PAGOS', 'EXPEDIENTE_DERIVADO_PAGO', 'ordenes_contratacion.derivado_pago', {
      fecha: ev.derivado_pago_at || null,
    });
  }
  if (extras.finalizado) {
    bump('FINALIZADO', 'FINALIZADO', 'evidencia_finalizado', {});
  }

  return { best, hallazgos };
}

/**
 * Resuelve responsable destino según etapa propuesta + evidencia de dominio.
 */
export async function resolverResponsableParaEtapa({
  etapaCodigo,
  requerimientoId = null,
  client = null,
  recepcion = null,
  asignacionActiva = null,
} = {}) {
  const etapa = canonEtapa(etapaCodigo);
  const rid = parseInt(requerimientoId ?? recepcion?.requerimiento_id ?? asignacionActiva?.requerimiento_id, 10);
  const run = async (sql, params) => (client
    ? client.query(sql, params)
    : query(sql, params));

  // Asignación activa coherente con la etapa
  if (asignacionActiva && canonEtapa(asignacionActiva.etapa_codigo) === etapa) {
    if (asignacionActiva.usuario_id) {
      return {
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: Number(asignacionActiva.usuario_id),
        responsableUnidad: asignacionActiva.unidad_codigo || unidadDefault(etapa),
        responsableFuente: ORIGEN_RECONCILIACION_F3,
        motivo: 'asignacion_activa_coherente',
      };
    }
    if (asignacionActiva.unidad_codigo) {
      return {
        responsableTipo: TIPO_RESPONSABLE.UNIDAD,
        responsableUsuarioId: null,
        responsableUnidad: asignacionActiva.unidad_codigo,
        responsableFuente: ORIGEN_RECONCILIACION_F3,
        motivo: 'asignacion_unidad_coherente',
      };
    }
  }

  if (etapa === 'RECEPCION_BIENES' && recepcion) {
    const uid = recepcion.actor_responsable_id != null
      ? Number(recepcion.actor_responsable_id)
      : null;
    if (uid && Number.isFinite(uid)) {
      return {
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: uid,
        responsableUnidad: 'Almacén',
        responsableFuente: ORIGEN_RECONCILIACION_F3,
        motivo: 'actor_responsable_id_recepcion',
      };
    }
    const actor = String(recepcion.actor_responsable || recepcion.usuario_asignado || '').trim();
    if (actor && !isRolGenerico(actor) && !/^invitaciones$/i.test(actor)) {
      const u = await resolveUsuarioDesdeIdentificador(client, actor);
      if (u?.id) {
        return {
          responsableTipo: TIPO_RESPONSABLE.PERSONA,
          responsableUsuarioId: Number(u.id),
          responsableUnidad: 'Almacén',
          responsableFuente: ORIGEN_RECONCILIACION_F3,
          motivo: 'actor_responsable_recepcion_resuelto',
          responsableNombre: u.nombre || actor,
        };
      }
    }
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: 'Almacén',
      responsableFuente: ORIGEN_RECONCILIACION_F3,
      motivo: 'unidad_almacen_por_etapa',
    };
  }

  if (etapa === 'REGISTRO_ORDEN' && Number.isFinite(rid) && rid > 0) {
    const { rows: prevPers } = await run(`
      SELECT usuario_id FROM expediente_asignaciones
      WHERE requerimiento_id = $1
        AND usuario_id IS NOT NULL
        AND UPPER(COALESCE(etapa_codigo,'')) IN ('CCP','REGISTRO_ORDEN','REGISTRO_ORDENES')
      ORDER BY
        CASE WHEN UPPER(COALESCE(etapa_codigo,'')) LIKE 'REGISTRO%' THEN 0 ELSE 1 END,
        CASE WHEN activo IS TRUE THEN 0 ELSE 1 END,
        id DESC
      LIMIT 1
    `, [rid]);
    if (prevPers[0]?.usuario_id) {
      return {
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: Number(prevPers[0].usuario_id),
        responsableUnidad: 'Registro de Órdenes',
        responsableFuente: ORIGEN_RECONCILIACION_F3,
        motivo: 'analista_ccp_o_ro_previo',
      };
    }
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: 'Registro de Órdenes',
      responsableFuente: ORIGEN_RECONCILIACION_F3,
      motivo: 'unidad_registro_ordenes',
    };
  }

  if (etapa === 'REGISTRO_ORDEN') {
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: 'Registro de Órdenes',
      responsableFuente: ORIGEN_RECONCILIACION_F3,
      motivo: 'unidad_registro_ordenes',
    };
  }

  if (etapa === 'CCP') {
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: 'CCP',
      responsableFuente: ORIGEN_RECONCILIACION_F3,
      motivo: 'unidad_ccp',
    };
  }

  if (etapa === 'CONFORMIDAD') {
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: 'Área Usuaria',
      responsableFuente: ORIGEN_RECONCILIACION_F3,
      motivo: 'unidad_conformidad',
    };
  }

  if (etapa === 'PAGOS') {
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: 'Tesorería / Pagaduría',
      responsableFuente: ORIGEN_RECONCILIACION_F3,
      motivo: 'unidad_pagos',
    };
  }

  return {
    responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
    responsableUsuarioId: null,
    responsableUnidad: null,
    responsableFuente: ORIGEN_RECONCILIACION_F3,
    motivo: 'pendiente_sin_evidencia_responsable',
  };
}

function unidadDefault(etapa) {
  const e = canonEtapa(etapa);
  if (e === 'RECEPCION_BIENES') return 'Almacén';
  if (e === 'REGISTRO_ORDEN') return 'Registro de Órdenes';
  if (e === 'CCP') return 'CCP';
  return getEtapaMeta(e)?.responsableLabel || null;
}

function sameResponsable(a, b) {
  return String(a?.responsableTipo || '') === String(b?.responsableTipo || '')
    && String(a?.responsableUsuarioId || '') === String(b?.responsableUsuarioId || '')
    && String(a?.responsableUnidad || '') === String(b?.responsableUnidad || '');
}

/**
 * Planifica reconciliación para un conjunto de requerimientos (o todos con orden/recepción).
 */
export async function planReconciliarEtapaResponsableEjecucion({
  requerimientoIds = null,
  client = null,
} = {}) {
  const run = async (sql, params) => (client
    ? client.query(sql, params)
    : query(sql, params));

  let ids = requerimientoIds;
  if (!ids?.length) {
    const { rows } = await run(`
      SELECT DISTINCT r.id
      FROM requerimientos r
      LEFT JOIN ordenes_contratacion oc
        ON oc.requerimiento_id = r.id
       AND COALESCE(oc.estado,'') NOT IN ('ORDEN_ANULADA','ANULADA')
      LEFT JOIN recepcion_bienes_expedientes rbe ON rbe.requerimiento_id = r.id
      LEFT JOIN ccp_codigos c ON c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
      WHERE oc.id IS NOT NULL OR rbe.id IS NOT NULL OR c.id IS NOT NULL
      ORDER BY r.id
    `);
    ids = rows.map((r) => Number(r.id));
  }
  ids = [...new Set((ids || []).map((x) => parseInt(x, 10)).filter((n) => n > 0))];
  if (!ids.length) return { rows: [], dryRun: true };

  const evidenceMap = await loadEstadoExpedienteEvidenceByIds(ids);

  const { rows: reqRows } = await run(
    `SELECT id, codigo, estado_actual, sub_modulo_actual, responsable_actual
     FROM requerimientos WHERE id = ANY($1::int[])`,
    [ids],
  );
  const reqMap = new Map(reqRows.map((r) => [Number(r.id), r]));

  const { rows: vigRows } = await run(
    `SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = ANY($1::int[])`,
    [ids],
  );
  const vigMap = new Map(vigRows.map((r) => [Number(r.requerimiento_id), r]));

  const { rows: asgRows } = await run(
    `SELECT * FROM expediente_asignaciones
     WHERE requerimiento_id = ANY($1::int[]) AND activo = TRUE`,
    [ids],
  );
  const asgMap = new Map();
  asgRows.forEach((a) => asgMap.set(Number(a.requerimiento_id), a));

  const { rows: rbeRows } = await run(
    `SELECT * FROM recepcion_bienes_expedientes
     WHERE requerimiento_id = ANY($1::int[])
     ORDER BY id DESC`,
    [ids],
  );
  const rbeMap = new Map();
  rbeRows.forEach((r) => {
    const rid = Number(r.requerimiento_id);
    if (!rbeMap.has(rid)) rbeMap.set(rid, r);
  });

  const { rows: ccpRows } = await run(
    `SELECT DISTINCT ON (requerimiento_id) requerimiento_id, registrado_at, codigo_ccp
     FROM ccp_codigos WHERE requerimiento_id = ANY($1::int[]) AND estado = 'ACTIVO'
     ORDER BY requerimiento_id, id DESC`,
    [ids],
  );
  const ccpAt = new Map(ccpRows.map((r) => [Number(r.requerimiento_id), r.registrado_at]));

  const { rows: ocRows } = await run(
    `SELECT DISTINCT ON (requerimiento_id) requerimiento_id, id, creado_at, numero_orden
     FROM ordenes_contratacion
     WHERE requerimiento_id = ANY($1::int[])
       AND COALESCE(estado,'') NOT IN ('ORDEN_ANULADA','ANULADA')
     ORDER BY requerimiento_id, id DESC`,
    [ids],
  );
  const ocAt = new Map(ocRows.map((r) => [Number(r.requerimiento_id), r]));

  const { rows: solRows } = await run(
    `SELECT DISTINCT ON (sr.requerimiento_id)
       sr.requerimiento_id, sc.estado AS solicitud_estado, sc.updated_at
     FROM solicitud_requerimientos sr
     JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
     WHERE sr.requerimiento_id = ANY($1::int[])
     ORDER BY sr.requerimiento_id, sc.updated_at DESC NULLS LAST, sc.id DESC`,
    [ids],
  );
  const solMap = new Map(solRows.map((r) => [Number(r.requerimiento_id), r]));

  let confMap = new Map();
  try {
    const { rows: conf } = await run(
      `SELECT DISTINCT ON (requerimiento_id) requerimiento_id, id, created_at
       FROM conformidades WHERE requerimiento_id = ANY($1::int[])
       ORDER BY requerimiento_id, id DESC`,
      [ids],
    );
    confMap = new Map(conf.map((c) => [Number(c.requerimiento_id), c]));
  } catch (_) { /* tabla opcional */ }

  const out = [];
  for (const rid of ids) {
    const req = reqMap.get(rid);
    const vig = vigMap.get(rid) || null;
    const asg = asgMap.get(rid) || null;
    const rbe = rbeMap.get(rid) || null;
    const ev = evidenceMap.get(rid) || {};
    const conf = confMap.get(rid) || null;
    const oc = ocAt.get(rid) || null;
    const sol = solMap.get(rid) || null;

    const { best, hallazgos } = resolverEtapaDesdeEvidencia(ev, {
      ccpRegistradoAt: ccpAt.get(rid) || null,
      ordenCreadoAt: oc?.creado_at || null,
      recepcionCreatedAt: rbe?.created_at || null,
      recepcionUpdatedAt: rbe?.updated_at || null,
      conformidadId: conf?.id || null,
      conformidadAt: conf?.created_at || null,
      tieneConformidad: !!conf,
      solicitudEstado: sol?.solicitud_estado || '',
      solicitudUpdatedAt: sol?.updated_at || null,
    });

    const etapaPersistida = canonEtapa(vig?.etapa_codigo || req?.estado_actual || '');
    const rankPersistida = rankOf(etapaPersistida);
    let etapaPropuesta = best.etapa;
    let estadoPropuesto = best.estadoCodigo;

    // No retroceder
    if (etapaPropuesta && rankPersistida > rankOf(etapaPropuesta)) {
      etapaPropuesta = etapaPersistida;
      estadoPropuesto = vig?.estado_codigo || estadoPropuesto;
    }
    if (!etapaPropuesta) {
      etapaPropuesta = etapaPersistida || null;
      estadoPropuesto = vig?.estado_codigo || null;
    }
    // Códigos canónicos de estado (no usar etapa como estado).
    const epU = String(estadoPropuesto || '').toUpperCase();
    if (etapaPropuesta === 'REGISTRO_ORDEN'
      && (epU === 'REGISTRO_ORDEN' || epU === 'CCP' || epU === 'CCP_REGISTRADA' || !epU)) {
      estadoPropuesto = 'REGISTRO_ORDENES';
    }
    if (etapaPropuesta === 'RECEPCION_BIENES' && ev.recepcion_estado_global) {
      estadoPropuesto = ev.recepcion_estado_global;
    }
    if (etapaPropuesta === 'CCP' && (ev.codigo_ccp || ev.ccp_activo)) {
      estadoPropuesto = 'CCP_REGISTRADA';
    }

    const respProp = etapaPropuesta
      ? await resolverResponsableParaEtapa({
        etapaCodigo: etapaPropuesta,
        requerimientoId: rid,
        client,
        recepcion: rbe ? { ...rbe, requerimiento_id: rid } : null,
        asignacionActiva: asg ? { ...asg, requerimiento_id: rid } : null,
      })
      : {
        responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
        responsableUsuarioId: null,
        responsableUnidad: null,
        responsableFuente: ORIGEN_RECONCILIACION_F3,
        motivo: 'sin_etapa',
      };

    const respActual = {
      responsableTipo: vig?.responsable_tipo || null,
      responsableUsuarioId: vig?.responsable_usuario_id ?? null,
      responsableUnidad: vig?.responsable_unidad || null,
      responsableFuente: vig?.responsable_fuente || null,
    };

    const etapaOk = etapaPersistida && etapaPropuesta
      && etapaPersistida === etapaPropuesta;
    const respOk = sameResponsable(respActual, respProp);
    let accion = 'MANTENER';
    if (!etapaPropuesta) accion = 'OMITIR_SIN_EVIDENCIA';
    else if (!etapaOk || !respOk) accion = 'RECONCILIAR';

    // Nunca proponer Invitaciones
    if (/^invitaciones$/i.test(String(respProp.responsableUnidad || ''))) {
      respProp.responsableUnidad = unidadDefault(etapaPropuesta);
      if (!respProp.responsableUnidad) {
        respProp.responsableTipo = TIPO_RESPONSABLE.PENDIENTE;
        respProp.responsableUnidad = null;
      }
    }

    out.push({
      requerimientoId: rid,
      codigo: req?.codigo || `ID-${rid}`,
      etapaPersistida: etapaPersistida || null,
      evidenciaAvanzada: best.evidencia || null,
      etapaPropuesta,
      estadoPropuesto,
      responsableActual: respActual,
      responsablePropuesto: respProp,
      fuente: ORIGEN_RECONCILIACION_F3,
      accion,
      hallazgos,
      ordenId: oc?.id || ev.orden_id || null,
      numeroOrden: oc?.numero_orden || null,
      recepcionId: rbe?.id || ev.recepcion_bienes_expediente_id || null,
    });
  }

  return { rows: out };
}

/**
 * Aplica el plan en una sola transacción por lote (idempotente).
 */
export async function aplicarReconciliarEtapaResponsableEjecucion({
  requerimientoIds = null,
  dryRun = true,
} = {}) {
  const plan = await planReconciliarEtapaResponsableEjecucion({ requerimientoIds });
  if (dryRun) {
    return { dryRun: true, applied: 0, rows: plan.rows };
  }

  const toApply = plan.rows.filter((r) => r.accion === 'RECONCILIAR');
  if (!toApply.length) {
    return { dryRun: false, applied: 0, rows: plan.rows };
  }

  await withTransaction(async (tx) => {
    const origenEscritura = ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION;
    for (const row of toApply) {
      const rid = row.requerimientoId;
      const etapa = row.etapaPropuesta;
      const meta = getEtapaMeta(etapa);
      const resp = row.responsablePropuesto;
      const estadoCodigo = row.estadoPropuesto || etapa;
      const estadoLabel = getLabelEstado(estadoCodigo) || meta?.label || estadoCodigo;
      const etapaLabel = meta?.label || etapa;

      await cerrarAsignacionActiva(tx, rid, { origenEscritura });
      await crearAsignacion(tx, {
        requerimientoId: rid,
        etapaCodigo: etapa,
        usuarioId: resp.responsableUsuarioId,
        unidadCodigo: resp.responsableUnidad,
        tipoResponsable: resp.responsableTipo,
        origenAsignacion: ORIGEN_RECONCILIACION_F3,
        asignadoPor: 'rc86f3',
        motivo: resp.motivo || 'reconciliacion_evidencia_ejecucion',
        origenEscritura,
      });
      await upsertEstadoVigente(tx, {
        requerimientoId: rid,
        estadoCodigo,
        estadoLabel,
        etapaCodigo: etapa,
        etapaLabel,
        responsableTipo: resp.responsableTipo,
        responsableUsuarioId: resp.responsableUsuarioId,
        responsableUnidad: resp.responsableUnidad,
        responsableFuente: ORIGEN_RECONCILIACION_F3,
        actualizadoPor: 'rc86f3',
        metadata: {
          origen: ORIGEN_RECONCILIACION_F3,
          evidencia: row.evidenciaAvanzada,
          motivo: resp.motivo,
        },
        origenEscritura,
      });
      await syncLegacyRequerimiento(tx, {
        requerimientoId: rid,
        etapaCodigo: etapa,
        estadoNegocio: estadoLabel,
        responsableTipo: resp.responsableTipo,
        responsableUsuarioId: resp.responsableUsuarioId,
        responsableUnidad: resp.responsableUnidad,
        subModuloLabel: meta?.submoduloLabel || etapaLabel,
      });

      try {
        await tx.query(`
          INSERT INTO expediente_movimientos (
            requerimiento_id, tipo, etapa, estado, usuario, observacion, created_at
          ) VALUES ($1,'RECONCILIACION',$2,$3,'rc86f3',$4,NOW())
        `, [
          rid,
          etapa,
          estadoCodigo,
          `RC8.6F.3 ${row.evidenciaAvanzada || ''} → ${etapa} / ${resp.responsableTipo}`,
        ]);
      } catch (_) {
        // tabla movimientos puede variar; no bloquear reconciliación
      }
    }
  });

  const after = await planReconciliarEtapaResponsableEjecucion({ requerimientoIds });
  return { dryRun: false, applied: toApply.length, rows: after.rows };
}

export default {
  planReconciliarEtapaResponsableEjecucion,
  aplicarReconciliarEtapaResponsableEjecucion,
  resolverEtapaDesdeEvidencia,
  resolverResponsableParaEtapa,
  ORIGEN_RECONCILIACION_F3,
};
