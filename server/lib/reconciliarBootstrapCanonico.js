/**
 * RC8.11 — Bootstrap canónico completo pre-CCP y post-CCP.
 * Ranking tipo-aware por evidencia real. Dry-run por defecto.
 * No inventa persona desde created_by / usuario_modificacion / snapshot.
 */
import { query } from '../db.js';
import { withTransaction } from './workflow/workflowTransaction.js';
import { normalizarTipo } from '../../shared/workflow/tiposContratacion.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { getEtapaMeta } from '../../shared/workflow/etapas.js';
import { getLabelEstado } from '../../shared/estadoExpedienteCatalog.js';
import { loadEstadoExpedienteEvidenceByIds } from './estadoExpedienteEvidence.js';
import {
  resolveAsignacionRealExistente,
  resolveUsuarioDesdeIdentificador,
} from './resolveAsignacionRealExistente.js';
import { isRolGenerico } from '../../shared/identificadoresUsuarios.js';
import {
  cerrarAsignacionActiva,
  crearAsignacion,
  upsertEstadoVigente,
  syncLegacyRequerimiento,
  ORIGEN_ESCRITURA_VIGENTE,
} from './expedienteEstadoPersistido.js';

export const ORIGEN_RECONCILIACION_RC811 = 'RECONCILIACION_RC811_BOOTSTRAP';

/** Ranking canónico RC8.11 (mayor = más avanzado). */
export const RANK_ETAPA = Object.freeze({
  REGISTRO: 10,
  EVALUACION: 12,
  DEC: 15,
  PROGRAMACION: 20,
  COORDINACION_CM: 25,
  ACTOS_PREPARATORIOS: 25,
  INVITACIONES: 30,
  RECEPCION_COTIZACIONES: 40,
  VALIDACIONES: 50,
  VALIDACION_USUARIO: 50,
  CUADRO_COMPARATIVO: 60,
  CCP: 70,
  REGISTRO_ORDEN: 80,
  REGISTRO_ORDENES: 80,
  ORDEN: 80,
  RECEPCION_BIENES: 90,
  PRESENTACION_ENTREGABLES: 90,
  EN_EJECUCION: 90,
  CONFORMIDAD: 95,
  PAGOS: 100,
  DERIVACION_PAGO: 100,
  FINALIZADO: 100,
});

export const CLASIFICACION = Object.freeze({
  CANONICO_CONFIRMADO: 'CANONICO_CONFIRMADO',
  BACKFILL_INICIAL: 'BACKFILL_INICIAL',
  SIN_ERV: 'SIN_ERV',
  ASIGNACION_FALTANTE: 'ASIGNACION_FALTANTE',
  ERV_ATRASADO: 'ERV_ATRASADO',
  INCONSISTENTE: 'INCONSISTENTE',
  INCONSISTENTE_TIPO_ETAPA: 'INCONSISTENTE_TIPO_ETAPA',
  SIN_EVIDENCIA_SUFICIENTE: 'SIN_EVIDENCIA_SUFICIENTE',
});

export function canonEtapa(etapa) {
  const e = String(etapa || '').toUpperCase();
  if (e === 'REGISTRO_ORDENES' || e === 'ORDEN') return 'REGISTRO_ORDEN';
  if (e === 'DERIVACION_PAGO') return 'PAGOS';
  if (e === 'EN_EJECUCION') return 'RECEPCION_BIENES';
  if (e === 'VALIDACION' || e === 'VALIDACION_USUARIO') return 'VALIDACIONES';
  if (e === 'ACTOS_PREPARATORIOS') return 'COORDINACION_CM';
  if (e === 'REGISTRADO') return 'REGISTRO';
  return e;
}

export function rankOf(etapa) {
  const c = canonEtapa(etapa);
  if (RANK_ETAPA[c] != null) return RANK_ETAPA[c];
  if (c.includes('PAGO')) return RANK_ETAPA.PAGOS;
  if (c.includes('CONFORM')) return RANK_ETAPA.CONFORMIDAD;
  if (c.includes('RECEPCION_BIEN') || c.includes('PRESENTACION')) return RANK_ETAPA.RECEPCION_BIENES;
  if (c.includes('ORDEN')) return RANK_ETAPA.REGISTRO_ORDEN;
  if (c === 'CCP') return RANK_ETAPA.CCP;
  if (c.includes('CUADRO')) return RANK_ETAPA.CUADRO_COMPARATIVO;
  if (c.includes('VALID')) return RANK_ETAPA.VALIDACIONES;
  if (c.includes('RECEPCION_COT')) return RANK_ETAPA.RECEPCION_COTIZACIONES;
  if (c.includes('INVIT')) return RANK_ETAPA.INVITACIONES;
  return 0;
}

export function esLocacion(tipo) {
  return normalizarTipo(tipo) === 'LOCACION';
}

export function esBienOServicio(tipo) {
  const t = normalizarTipo(tipo);
  return t === 'BIEN' || t === 'SERVICIO';
}

/** Etapas prohibidas para LOCACION. */
export function etapaProhibidaParaTipo(etapa, tipo) {
  if (!esLocacion(tipo)) return false;
  const c = canonEtapa(etapa);
  return c === 'VALIDACIONES' || c === 'CUADRO_COMPARATIVO';
}

/**
 * Determina la etapa más avanzada por evidencia (tipo-aware).
 * @param {object} ev — evidencia post-CCP (estadoExpedienteEvidence) + flags bootstrap
 * @param {object} extras — tipo, solicitud, cotizaciones, etc.
 */
export function resolverEtapaDesdeEvidencia(ev = {}, extras = {}) {
  const hallazgos = [];
  let best = { etapa: null, rank: 0, estadoCodigo: null, evidencia: null, detalle: null };
  const tipo = normalizarTipo(extras.tipo || ev.tipo || '');
  const locacion = esLocacion(tipo);
  const bienServ = esBienOServicio(tipo);

  const bump = (etapa, estadoCodigo, evidencia, detalle = {}) => {
    const c = canonEtapa(etapa);
    if (etapaProhibidaParaTipo(c, tipo)) {
      hallazgos.push({
        etapa: c,
        estadoCodigo,
        evidencia,
        detalle: { ...detalle, veto: 'INCONSISTENTE_TIPO_ETAPA' },
        fecha: detalle?.fecha || null,
        descartado: true,
      });
      return;
    }
    const r = rankOf(c);
    if (r <= 0) return;
    hallazgos.push({ etapa: c, estadoCodigo, evidencia, detalle, fecha: detalle?.fecha || null });
    if (r > best.rank) {
      best = { etapa: c, rank: r, estadoCodigo, evidencia, detalle };
    }
  };

  // —— Rank 100: PAGOS / FINALIZADO ——
  if (extras.finalizado) {
    bump('FINALIZADO', 'FINALIZADO', 'evidencia_finalizado', {});
  }
  if (ev.expediente_derivado_pago || ev.derivado_pago_at) {
    bump('PAGOS', 'EXPEDIENTE_DERIVADO_PAGO', 'ordenes_contratacion.derivado_pago', {
      fecha: ev.derivado_pago_at || null,
    });
  }

  // —— Rank 90–95: recepción / conformidad ——
  if (extras.conformidadId || extras.tieneConformidad) {
    bump('CONFORMIDAD', 'CONFORMIDAD', 'conformidades', {
      conformidad_id: extras.conformidadId,
      fecha: extras.conformidadAt || null,
    });
  }
  const tieneRecepcion = !!(
    ev.recepcion_bienes_expediente_id
    || ev.recepcion_estado_global
    || ev.derivado_ejecucion_at
    || extras.tieneRecepcion
  );
  if (tieneRecepcion) {
    const etapaRec = locacion || normalizarTipo(tipo) === 'SERVICIO'
      ? 'PRESENTACION_ENTREGABLES'
      : 'RECEPCION_BIENES';
    bump(
      etapaRec,
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

  // —— Rank 80: REGISTRO_ORDEN ——
  const solEst = String(extras.solicitudEstado || ev.solicitud_estado || '').toUpperCase();
  if (solEst === 'EN_ORDEN' || extras.enRegistroOrdenes === true || ev.en_registro_ordenes === true) {
    bump('REGISTRO_ORDEN', 'REGISTRO_ORDENES', 'solicitud_cotizacion.EN_ORDEN', {
      solicitud_estado: solEst || 'EN_ORDEN',
      fecha: extras.solicitudUpdatedAt || null,
    });
  }
  if (ev.orden_id || extras.ordenId) {
    bump('REGISTRO_ORDEN', ev.orden_estado || 'REGISTRO_ORDENES', 'ordenes_contratacion', {
      orden_id: ev.orden_id || extras.ordenId,
      orden_estado: ev.orden_estado,
      fecha: extras.ordenCreadoAt || null,
    });
  }

  // —— Rank 70: CCP (incluye Locación EN_CCP sin ccp_codigos) ——
  if (ev.codigo_ccp || ev.ccp_activo) {
    bump('CCP', 'CCP_REGISTRADA', 'ccp_codigos', {
      codigo_ccp: ev.codigo_ccp,
      fecha: extras.ccpRegistradoAt || null,
    });
  }
  if (solEst === 'EN_CCP') {
    bump('CCP', 'EN_CCP', 'solicitud_cotizacion.EN_CCP', {
      solicitud_estado: 'EN_CCP',
      tipo,
      fecha: extras.solicitudUpdatedAt || null,
    });
  }

  // —— Rank 60: CUADRO (solo B/S) ——
  const cuadroEst = String(ev.cuadro_estado || extras.cuadroEstado || '').toUpperCase();
  if (bienServ && cuadroEst && cuadroEst !== 'ANULADO') {
    bump('CUADRO_COMPARATIVO', cuadroEst, 'cuadros_comparativos', {
      cuadro_estado: cuadroEst,
      fecha: extras.cuadroUpdatedAt || null,
    });
  }
  if (locacion && cuadroEst && cuadroEst !== 'ANULADO') {
    hallazgos.push({
      etapa: 'CUADRO_COMPARATIVO',
      evidencia: 'cuadros_comparativos',
      detalle: { veto: 'LOCACION_NO_CUADRO', cuadro_estado: cuadroEst },
      descartado: true,
    });
  }

  // —— Rank 50: VALIDACIONES (solo B/S, AU real) ——
  const valEstados = extras.validacionEstados || [];
  const tieneValidacionAu = valEstados.some((s) => {
    const u = String(s || '').toUpperCase();
    return ['DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO'].includes(u);
  }) || extras.tieneDerivacionAu === true;
  if (bienServ && tieneValidacionAu) {
    bump('VALIDACIONES', 'VALIDACION_USUARIO', 'cotizacion.validacion_estado_au', {
      estados: valEstados,
      fecha: extras.validacionAt || null,
    });
  }
  if (locacion && (tieneValidacionAu || valEstados.length)) {
    hallazgos.push({
      etapa: 'VALIDACIONES',
      evidencia: 'cotizacion.validacion_*',
      detalle: { veto: 'LOCACION_NO_VALIDACIONES', estados: valEstados },
      descartado: true,
    });
  }

  // —— Rank 40: RECEPCION_COTIZACIONES ——
  if (extras.tieneCotizacionPresentada || ev.cotizacion_presentada) {
    bump('RECEPCION_COTIZACIONES', 'RECEPCION_COTIZACIONES', 'cotizaciones_proveedor.COTIZACION_PRESENTADA', {
      fecha: extras.cotizacionPresentadaAt || null,
    });
  }

  // —— Rank 30: INVITACIONES ——
  const enInvit = ['BORRADOR', 'PUBLICADA'].includes(solEst)
    || extras.tieneInvitacionEnviada === true;
  if (enInvit && !extras.tieneCotizacionPresentada && !ev.cotizacion_presentada) {
    bump('INVITACIONES', solEst || 'INVITACIONES', 'solicitud_cotizacion.invitaciones', {
      solicitud_estado: solEst,
      invitacion_enviada: extras.tieneInvitacionEnviada || false,
      fecha: extras.solicitudUpdatedAt || null,
    });
  }

  // —— Rank 10–25: ACTOS / PROGRAMACION / DEC / REGISTRO (hints suaves) ——
  const estadoNegocio = String(extras.estadoNegocio || '').trim();
  const etapaLegacy = canonEtapa(extras.estadoActual || '');
  if (/programad/i.test(estadoNegocio) || etapaLegacy === 'COORDINACION_CM') {
    bump('COORDINACION_CM', estadoNegocio || 'ACTOS_PREPARATORIOS', 'requerimientos.estado|estado_actual', {
      estado: estadoNegocio,
      estado_actual: etapaLegacy,
    });
  } else if (/programaci/i.test(estadoNegocio) || etapaLegacy === 'PROGRAMACION') {
    bump('PROGRAMACION', estadoNegocio || 'PROGRAMACION', 'requerimientos.estado|estado_actual', {
      estado: estadoNegocio,
    });
  } else if (/\bdec\b/i.test(estadoNegocio) || etapaLegacy === 'DEC') {
    bump('DEC', estadoNegocio || 'DEC', 'requerimientos.estado|estado_actual', {
      estado: estadoNegocio,
    });
  } else if (/evalu/i.test(estadoNegocio) || etapaLegacy === 'EVALUACION') {
    bump('EVALUACION', estadoNegocio || 'EVALUACION', 'requerimientos.estado|estado_actual', {
      estado: estadoNegocio,
    });
  } else if (/registr/i.test(estadoNegocio) || etapaLegacy === 'REGISTRO') {
    bump('REGISTRO', estadoNegocio || 'REGISTRO', 'requerimientos.estado|estado_actual', {
      estado: estadoNegocio,
    });
  }

  return { best, hallazgos, tipo, locacion };
}

function unidadDefault(etapa) {
  const e = canonEtapa(etapa);
  const meta = getEtapaMeta(e);
  if (meta?.responsableLabel) return meta.responsableLabel;
  if (e === 'INVITACIONES') return 'Invitaciones';
  if (e === 'RECEPCION_COTIZACIONES') return 'Recepción de Cotizaciones';
  if (e === 'VALIDACIONES') return 'Validaciones';
  if (e === 'CUADRO_COMPARATIVO') return 'Cuadro Comparativo';
  if (e === 'CCP') return 'CCP';
  if (e === 'REGISTRO_ORDEN') return 'Registro de Órdenes';
  if (e === 'RECEPCION_BIENES' || e === 'PRESENTACION_ENTREGABLES') return 'Almacén';
  return null;
}

function sameResponsable(a, b) {
  return String(a?.responsableTipo || '') === String(b?.responsableTipo || '')
    && String(a?.responsableUsuarioId || '') === String(b?.responsableUsuarioId || '')
    && String(a?.responsableUnidad || '') === String(b?.responsableUnidad || '');
}

/**
 * Resuelve responsable para etapa propuesta (usa resolveAsignacionRealExistente + sc.responsable).
 */
export async function resolverResponsableBootstrap({
  etapaCodigo,
  requerimientoId,
  client = null,
  solicitudResponsable = null,
  responsableCcpId = null,
  asignacionActiva = null,
  recepcion = null,
} = {}) {
  const etapa = canonEtapa(etapaCodigo);
  const rid = parseInt(requerimientoId, 10);

  // 1. Asignación activa coherente
  if (asignacionActiva?.usuario_id
    && canonEtapa(asignacionActiva.etapa_codigo) === etapa) {
    return {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: Number(asignacionActiva.usuario_id),
      responsableUnidad: asignacionActiva.unidad_codigo || unidadDefault(etapa),
      responsableFuente: ORIGEN_RECONCILIACION_RC811,
      motivo: 'asignacion_activa_coherente',
    };
  }

  // 2. Evidencia de dominio por etapa
  const asig = await resolveAsignacionRealExistente({
    requerimientoId: rid,
    etapaCodigo: etapa,
    client,
  });
  if (asig?.usuarioId) {
    return {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: Number(asig.usuarioId),
      responsableUnidad: asig.unidad || unidadDefault(etapa),
      responsableFuente: ORIGEN_RECONCILIACION_RC811,
      motivo: asig.fuente || 'asignacion_real_existente',
      responsableNombre: asig.nombre || null,
      responsableUsername: asig.username || null,
    };
  }

  // 3. CCP: responsable_ccp_id explícito
  if (etapa === 'CCP' && responsableCcpId != null) {
    const u = await resolveUsuarioDesdeIdentificador(client, String(responsableCcpId));
    if (u?.id) {
      return {
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: Number(u.id),
        responsableUnidad: 'CCP',
        responsableFuente: ORIGEN_RECONCILIACION_RC811,
        motivo: 'responsable_ccp_id',
        responsableNombre: u.nombre || null,
        responsableUsername: u.username || null,
      };
    }
  }

  // 4. sc.responsable resoluble (Invitaciones / Recepción / CCP Locación)
  const etapasSc = new Set([
    'INVITACIONES', 'RECEPCION_COTIZACIONES', 'CCP', 'CONSULTAS', 'CONSULTAS_OBSERVACIONES',
  ]);
  if (etapasSc.has(etapa) && solicitudResponsable) {
    const txt = String(solicitudResponsable || '').trim();
    if (txt && !isRolGenerico(txt)) {
      const u = await resolveUsuarioDesdeIdentificador(client, txt);
      if (u?.id) {
        return {
          responsableTipo: TIPO_RESPONSABLE.PERSONA,
          responsableUsuarioId: Number(u.id),
          responsableUnidad: unidadDefault(etapa),
          responsableFuente: ORIGEN_RECONCILIACION_RC811,
          motivo: 'solicitud.responsable_resuelto',
          responsableNombre: u.nombre || txt,
          responsableUsername: u.username || null,
        };
      }
    }
  }

  // 5. Recepción bienes (ya cubierto en resolveAsignacion; refuerzo)
  if ((etapa === 'RECEPCION_BIENES' || etapa === 'PRESENTACION_ENTREGABLES') && recepcion) {
    const uid = recepcion.actor_responsable_id != null
      ? Number(recepcion.actor_responsable_id) : null;
    if (uid && Number.isFinite(uid)) {
      return {
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: uid,
        responsableUnidad: 'Almacén',
        responsableFuente: ORIGEN_RECONCILIACION_RC811,
        motivo: 'actor_responsable_id_recepcion',
      };
    }
  }

  // 6. Unidad institucional
  if (asig?.unidad) {
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: asig.unidad,
      responsableFuente: ORIGEN_RECONCILIACION_RC811,
      motivo: asig.fuente || 'unidad_destino_etapa',
    };
  }
  const unidad = unidadDefault(etapa);
  if (unidad) {
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: unidad,
      responsableFuente: ORIGEN_RECONCILIACION_RC811,
      motivo: 'unidad_institucional_etapa',
    };
  }

  // 7. PENDIENTE
  return {
    responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
    responsableUsuarioId: null,
    responsableUnidad: null,
    responsableFuente: ORIGEN_RECONCILIACION_RC811,
    motivo: 'pendiente_sin_evidencia_responsable',
  };
}

/**
 * Carga batch de evidencias pre-CCP + puente a post-CCP.
 */
export async function loadEvidenciaBootstrapBatch(requerimientoIds = [], client = null) {
  const run = (text, params) => (client ? client.query(text, params) : query(text, params));
  const ids = [...new Set(
    (requerimientoIds || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  const map = new Map();
  ids.forEach((id) => map.set(id, {
    requerimiento_id: id,
    tipo: '',
    estado_negocio: '',
    estado_actual: '',
    solicitud_estado: '',
    solicitud_responsable: null,
    solicitud_updated_at: null,
    tiene_cotizacion_presentada: false,
    cotizacion_presentada_at: null,
    validacion_estados: [],
    tiene_derivacion_au: false,
    tiene_invitacion_enviada: false,
    cuadro_estado: '',
    responsable_ccp_id: null,
    tiene_recepcion: false,
  }));
  if (!ids.length) return map;

  const { rows: reqs } = await run(
    `SELECT id, tipo, estado, estado_actual FROM requerimientos WHERE id = ANY($1::int[])`,
    [ids],
  );
  reqs.forEach((r) => {
    const e = map.get(Number(r.id));
    if (!e) return;
    e.tipo = r.tipo || '';
    e.estado_negocio = r.estado || '';
    e.estado_actual = r.estado_actual || '';
  });

  try {
    const { rows } = await run(`
      SELECT DISTINCT ON (sr.requerimiento_id)
        sr.requerimiento_id,
        sc.estado AS solicitud_estado,
        sc.responsable AS solicitud_responsable,
        sc.updated_at AS solicitud_updated_at,
        sc.id AS solicitud_id
      FROM solicitud_requerimientos sr
      JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
      WHERE sr.requerimiento_id = ANY($1::int[])
      ORDER BY sr.requerimiento_id, sc.updated_at DESC NULLS LAST, sc.id DESC
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.solicitud_estado = r.solicitud_estado || '';
      e.solicitud_responsable = r.solicitud_responsable || null;
      e.solicitud_updated_at = r.solicitud_updated_at || null;
      e.solicitud_id = r.solicitud_id;
    });
  } catch (_) { /* ok */ }

  try {
    const { rows } = await run(`
      SELECT sr.requerimiento_id,
        BOOL_OR(UPPER(COALESCE(cot.estado,'')) = 'COTIZACION_PRESENTADA') AS presentada,
        MAX(cot.fecha_presentacion) FILTER (
          WHERE UPPER(COALESCE(cot.estado,'')) = 'COTIZACION_PRESENTADA'
        ) AS presentada_at,
        ARRAY_AGG(DISTINCT UPPER(TRIM(COALESCE(cot.validacion_estado,''))))
          FILTER (WHERE TRIM(COALESCE(cot.validacion_estado,'')) <> '') AS val_estados
      FROM solicitud_requerimientos sr
      JOIN cotizaciones_proveedor cot ON cot.solicitud_id = sr.solicitud_id
      WHERE sr.requerimiento_id = ANY($1::int[])
      GROUP BY sr.requerimiento_id
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.tiene_cotizacion_presentada = !!r.presentada;
      e.cotizacion_presentada_at = r.presentada_at || null;
      e.validacion_estados = (r.val_estados || []).filter(Boolean);
    });
  } catch (_) { /* ok */ }

  try {
    const { rows } = await run(`
      SELECT sr.requerimiento_id,
        BOOL_OR(
          cot.validacion_informe ? 'derivacion'
          AND COALESCE(cot.validacion_informe->'derivacion_ccp', 'null'::jsonb) = 'null'::jsonb
        ) AS der_au
      FROM solicitud_requerimientos sr
      JOIN cotizaciones_proveedor cot ON cot.solicitud_id = sr.solicitud_id
      WHERE sr.requerimiento_id = ANY($1::int[])
      GROUP BY sr.requerimiento_id
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.tiene_derivacion_au = !!r.der_au;
    });
  } catch (_) { /* ok */ }

  try {
    const { rows } = await run(`
      SELECT DISTINCT sr.requerimiento_id
      FROM solicitud_requerimientos sr
      JOIN invitacion_proveedores ip ON ip.solicitud_id = sr.solicitud_id
      WHERE sr.requerimiento_id = ANY($1::int[])
        AND UPPER(COALESCE(ip.estado,'')) IN ('ENVIADA','ABIERTA','COTIZACION_PRESENTADA','ACEPTADA')
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (e) e.tiene_invitacion_enviada = true;
    });
  } catch (_) { /* ok */ }

  try {
    const { rows } = await run(`
      SELECT DISTINCT ON (sr.requerimiento_id)
        sr.requerimiento_id,
        cc.estado AS cuadro_estado,
        cc.responsable_ccp_id,
        cc.actualizado_at
      FROM solicitud_requerimientos sr
      JOIN cuadros_comparativos cc ON cc.solicitud_id = sr.solicitud_id
      WHERE sr.requerimiento_id = ANY($1::int[])
        AND COALESCE(cc.estado, '') <> 'ANULADO'
      ORDER BY sr.requerimiento_id, cc.id DESC
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.cuadro_estado = r.cuadro_estado || '';
      e.responsable_ccp_id = r.responsable_ccp_id;
      e.cuadro_updated_at = r.actualizado_at;
    });
  } catch (_) { /* ok */ }

  // Locación: derivacion_ccp en informe como hint de responsable CCP (no Validaciones)
  try {
    const { rows } = await run(`
      SELECT DISTINCT ON (sr.requerimiento_id)
        sr.requerimiento_id,
        (cot.validacion_informe->'derivacion_ccp'->>'responsable_id') AS ccp_uid
      FROM solicitud_requerimientos sr
      JOIN cotizaciones_proveedor cot ON cot.solicitud_id = sr.solicitud_id
      WHERE sr.requerimiento_id = ANY($1::int[])
        AND cot.validacion_informe ? 'derivacion_ccp'
      ORDER BY sr.requerimiento_id, cot.id DESC
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      if (e.responsable_ccp_id == null && r.ccp_uid) {
        e.responsable_ccp_id = parseInt(r.ccp_uid, 10) || null;
      }
    });
  } catch (_) { /* ok */ }

  return map;
}

function clasificar({
  vig,
  asg,
  etapaPersistida,
  etapaPropuesta,
  tipo,
  best,
  accion,
}) {
  const warnings = [];
  const clases = [];

  if (!vig) {
    clases.push(CLASIFICACION.SIN_ERV);
  }
  const fuente = String(vig?.responsable_fuente || '').toLowerCase();
  if (fuente === 'backfill_inicial' || fuente.includes('backfill')) {
    clases.push(CLASIFICACION.BACKFILL_INICIAL);
    warnings.push('backfill_inicial_no_confirmado');
  }
  if (!asg) {
    clases.push(CLASIFICACION.ASIGNACION_FALTANTE);
    warnings.push('sin_asignacion_activa');
  }
  if (etapaProhibidaParaTipo(etapaPersistida, tipo)) {
    clases.push(CLASIFICACION.INCONSISTENTE_TIPO_ETAPA);
    warnings.push(`locacion_en_${canonEtapa(etapaPersistida)}`);
  }
  if (best?.etapa && etapaPersistida && rankOf(etapaPersistida) < rankOf(best.etapa)
    && !etapaProhibidaParaTipo(etapaPersistida, tipo)) {
    clases.push(CLASIFICACION.ERV_ATRASADO);
  }
  if (!best?.etapa && !etapaPropuesta) {
    clases.push(CLASIFICACION.SIN_EVIDENCIA_SUFICIENTE);
  }
  if (accion === 'RECONCILIAR' && !clases.includes(CLASIFICACION.INCONSISTENTE_TIPO_ETAPA)) {
    clases.push(CLASIFICACION.INCONSISTENTE);
  }
  if (!clases.length && accion === 'MANTENER' && vig && asg) {
    clases.push(CLASIFICACION.CANONICO_CONFIRMADO);
  } else if (!clases.length && accion === 'MANTENER' && vig) {
    clases.push(CLASIFICACION.CANONICO_CONFIRMADO);
  }

  return { clasificaciones: [...new Set(clases)], warnings };
}

/**
 * Plan dry-run completo (todos los requerimientos si ids vacío).
 */
export async function planReconciliarBootstrapCanonico({
  requerimientoIds = null,
  client = null,
} = {}) {
  const run = (text, params) => (client ? client.query(text, params) : query(text, params));

  let ids = requerimientoIds;
  if (!ids?.length) {
    const { rows } = await run(`SELECT id FROM requerimientos ORDER BY id`);
    ids = rows.map((r) => Number(r.id));
  }
  ids = [...new Set((ids || []).map((x) => parseInt(x, 10)).filter((n) => n > 0))];
  if (!ids.length) {
    return { rows: [], dryRun: true, contadores: contadoresVacios(), origen: ORIGEN_RECONCILIACION_RC811 };
  }

  const [evidenceMap, bootMap] = await Promise.all([
    loadEstadoExpedienteEvidenceByIds(ids),
    loadEvidenciaBootstrapBatch(ids, client),
  ]);

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

  const { rows: reqRows } = await run(
    `SELECT id, codigo, tipo, estado, estado_actual, sub_modulo_actual, responsable_actual
     FROM requerimientos WHERE id = ANY($1::int[])`,
    [ids],
  );
  const reqMap = new Map(reqRows.map((r) => [Number(r.id), r]));

  const { rows: rbeRows } = await run(
    `SELECT * FROM recepcion_bienes_expedientes
     WHERE requerimiento_id = ANY($1::int[]) ORDER BY id DESC`,
    [ids],
  ).catch(() => ({ rows: [] }));
  const rbeMap = new Map();
  rbeRows.forEach((r) => {
    const rid = Number(r.requerimiento_id);
    if (!rbeMap.has(rid)) rbeMap.set(rid, r);
  });

  const out = [];
  for (const rid of ids) {
    const req = reqMap.get(rid) || {};
    const boot = bootMap.get(rid) || {};
    const ev = { ...(evidenceMap.get(rid) || {}), tipo: boot.tipo || req.tipo };
    const vig = vigMap.get(rid) || null;
    const asg = asgMap.get(rid) || null;
    const rbe = rbeMap.get(rid) || null;
    const tipo = normalizarTipo(boot.tipo || req.tipo || '');

    const { best, hallazgos } = resolverEtapaDesdeEvidencia(ev, {
      tipo,
      solicitudEstado: boot.solicitud_estado,
      solicitudUpdatedAt: boot.solicitud_updated_at,
      tieneCotizacionPresentada: boot.tiene_cotizacion_presentada,
      cotizacionPresentadaAt: boot.cotizacion_presentada_at,
      validacionEstados: boot.validacion_estados,
      tieneDerivacionAu: boot.tiene_derivacion_au,
      tieneInvitacionEnviada: boot.tiene_invitacion_enviada,
      cuadroEstado: boot.cuadro_estado || ev.cuadro_estado,
      cuadroUpdatedAt: boot.cuadro_updated_at,
      estadoNegocio: boot.estado_negocio || req.estado,
      estadoActual: boot.estado_actual || req.estado_actual,
      ordenId: ev.orden_id,
      ordenCreadoAt: null,
      ccpRegistradoAt: null,
      tieneRecepcion: !!(rbe || ev.recepcion_bienes_expediente_id),
      recepcionCreatedAt: rbe?.created_at,
      recepcionUpdatedAt: rbe?.updated_at,
    });

    let etapaPersistida = canonEtapa(vig?.etapa_codigo || req.estado_actual || '');
    const persistidaInvalida = etapaProhibidaParaTipo(etapaPersistida, tipo);
    let etapaPropuesta = best.etapa;
    let estadoPropuesto = best.estadoCodigo;

    // No retroceder salvo etapa inválida por tipo (p.ej. LOCACION en VALIDACIONES)
    if (
      etapaPropuesta
      && !persistidaInvalida
      && etapaPersistida
      && rankOf(etapaPersistida) > rankOf(etapaPropuesta)
    ) {
      etapaPropuesta = etapaPersistida;
      estadoPropuesto = vig?.estado_codigo || estadoPropuesto;
    }
    if (!etapaPropuesta) {
      if (persistidaInvalida) {
        // Forzar a la mejor evidencia válida o RECEPCION/INVITACIONES
        etapaPropuesta = best.etapa
          || (boot.tiene_cotizacion_presentada ? 'RECEPCION_COTIZACIONES' : 'INVITACIONES');
        estadoPropuesto = best.estadoCodigo || etapaPropuesta;
      } else {
        etapaPropuesta = etapaPersistida || null;
        estadoPropuesto = vig?.estado_codigo || null;
      }
    }

    if (etapaPropuesta === 'REGISTRO_ORDEN'
      && !['REGISTRO_ORDENES', 'REGISTRO_ORDEN'].includes(String(estadoPropuesto || '').toUpperCase())) {
      estadoPropuesto = 'REGISTRO_ORDENES';
    }
    if (etapaPropuesta === 'CCP' && (ev.codigo_ccp || ev.ccp_activo)) {
      estadoPropuesto = 'CCP_REGISTRADA';
    }
    if (etapaPropuesta === 'CCP' && !estadoPropuesto) {
      estadoPropuesto = 'EN_CCP';
    }

    const respProp = etapaPropuesta
      ? await resolverResponsableBootstrap({
        etapaCodigo: etapaPropuesta,
        requerimientoId: rid,
        client,
        solicitudResponsable: boot.solicitud_responsable,
        responsableCcpId: boot.responsable_ccp_id,
        asignacionActiva: asg,
        recepcion: rbe,
      })
      : {
        responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
        responsableUsuarioId: null,
        responsableUnidad: null,
        responsableFuente: ORIGEN_RECONCILIACION_RC811,
        motivo: 'sin_etapa',
      };

    const respActual = {
      responsableTipo: vig?.responsable_tipo || null,
      responsableUsuarioId: vig?.responsable_usuario_id ?? null,
      responsableUnidad: vig?.responsable_unidad || null,
      responsableFuente: vig?.responsable_fuente || null,
    };

    const etapaOk = etapaPersistida && etapaPropuesta
      && etapaPersistida === etapaPropuesta
      && !persistidaInvalida;
    const respOk = sameResponsable(respActual, respProp)
      && !(String(vig?.responsable_fuente || '').includes('backfill') && !asg);
    let accion = 'MANTENER';
    if (!etapaPropuesta) accion = 'OMITIR_SIN_EVIDENCIA';
    else if (!etapaOk || !respOk || !asg || persistidaInvalida) accion = 'RECONCILIAR';

    // Si backfill + misma etapa pero sin asignación y hay persona propuesta → RECONCILIAR
    if (accion === 'MANTENER' && !asg && respProp.responsableTipo === 'PERSONA') {
      accion = 'RECONCILIAR';
    }

    const { clasificaciones, warnings } = clasificar({
      vig,
      asg,
      etapaPersistida,
      etapaPropuesta,
      tipo,
      best,
      accion,
    });

    out.push({
      requerimientoId: rid,
      codigo: req.codigo || `ID-${rid}`,
      tipo: tipo || normalizarTipo(req.tipo) || '',
      ervActual: {
        etapa: etapaPersistida || null,
        estado: vig?.estado_codigo || null,
        responsableTipo: respActual.responsableTipo,
        responsableUsuarioId: respActual.responsableUsuarioId,
        responsableUnidad: respActual.responsableUnidad,
        fuente: respActual.responsableFuente,
        version: vig?.version ?? null,
      },
      evidenciaAvanzada: best.evidencia || null,
      evidenciaDetalle: best.detalle || null,
      etapaPropuesta,
      estadoPropuesto: estadoPropuesto || etapaPropuesta,
      estadoLabelPropuesto: getLabelEstado(estadoPropuesto || etapaPropuesta)
        || getEtapaMeta(etapaPropuesta)?.label
        || etapaPropuesta,
      responsableActual: respActual,
      responsablePropuesto: respProp,
      fuente: ORIGEN_RECONCILIACION_RC811,
      accion,
      clasificaciones,
      warnings,
      hallazgos,
      solicitudEstado: boot.solicitud_estado || null,
      tieneAsignacionActiva: !!asg,
    });
  }

  const contadores = resumirContadores(out);
  return {
    rows: out,
    dryRun: true,
    origen: ORIGEN_RECONCILIACION_RC811,
    contadores,
  };
}

function contadoresVacios() {
  return {
    total: 0,
    canonicosConfirmados: 0,
    backfillInicial: 0,
    sinAsignacion: 0,
    inconsistentes: 0,
    inconsistenteTipoEtapa: 0,
    sinEvidenciaSuficiente: 0,
    aReconciliar: 0,
  };
}

function resumirContadores(rows) {
  const c = contadoresVacios();
  c.total = rows.length;
  for (const r of rows) {
    const cl = r.clasificaciones || [];
    if (cl.includes(CLASIFICACION.CANONICO_CONFIRMADO)) c.canonicosConfirmados += 1;
    if (cl.includes(CLASIFICACION.BACKFILL_INICIAL)) c.backfillInicial += 1;
    if (cl.includes(CLASIFICACION.ASIGNACION_FALTANTE)) c.sinAsignacion += 1;
    if (cl.includes(CLASIFICACION.INCONSISTENTE)
      || cl.includes(CLASIFICACION.INCONSISTENTE_TIPO_ETAPA)
      || cl.includes(CLASIFICACION.ERV_ATRASADO)) {
      c.inconsistentes += 1;
    }
    if (cl.includes(CLASIFICACION.INCONSISTENTE_TIPO_ETAPA)) c.inconsistenteTipoEtapa += 1;
    if (cl.includes(CLASIFICACION.SIN_EVIDENCIA_SUFICIENTE)) c.sinEvidenciaSuficiente += 1;
    if (r.accion === 'RECONCILIAR') c.aReconciliar += 1;
  }
  return c;
}

/**
 * Apply (idempotente). RC8.11 scripts no deben llamarlo; API admin sí con motivo.
 */
export async function aplicarReconciliarBootstrapCanonico({
  requerimientoIds = null,
  dryRun = true,
} = {}) {
  const plan = await planReconciliarBootstrapCanonico({ requerimientoIds });
  if (dryRun !== false) {
    return { dryRun: true, applied: 0, rows: plan.rows, contadores: plan.contadores };
  }

  const toApply = (plan.rows || []).filter((r) => r.accion === 'RECONCILIAR');
  if (!toApply.length) {
    return { dryRun: false, applied: 0, rows: plan.rows, contadores: plan.contadores };
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
        origenAsignacion: ORIGEN_RECONCILIACION_RC811,
        asignadoPor: 'rc811',
        motivo: resp.motivo || 'reconciliacion_bootstrap_canonico',
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
        responsableFuente: ORIGEN_RECONCILIACION_RC811,
        actualizadoPor: 'rc811',
        metadata: {
          origen: ORIGEN_RECONCILIACION_RC811,
          evidencia: row.evidenciaAvanzada,
          clasificaciones: row.clasificaciones,
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
    }
  });

  const after = await planReconciliarBootstrapCanonico({ requerimientoIds });
  return {
    dryRun: false,
    applied: toApply.length,
    rows: after.rows,
    contadores: after.contadores,
  };
}

export default {
  planReconciliarBootstrapCanonico,
  aplicarReconciliarBootstrapCanonico,
  resolverEtapaDesdeEvidencia,
  resolverResponsableBootstrap,
  loadEvidenciaBootstrapBatch,
  rankOf,
  canonEtapa,
  ORIGEN_RECONCILIACION_RC811,
  CLASIFICACION,
  RANK_ETAPA,
};
