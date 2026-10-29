/**
 * RC8.17.8H6-D10-E3-C2.6B3 — Reparación ERV administrativa (cuadro, sin re-derivación).
 * Persiste ERV/asignación vía RECONCILIACION; un solo evento REPARACION_*; no muta cuadros_comparativos ni PDFs.
 */
import { query } from '../db.js';
import { withTransaction } from './workflow/workflowTransaction.js';
import { insertWorkflowEvento } from './workflow/workflowHistory.js';
import {
  cerrarAsignacionActiva,
  crearAsignacion,
  upsertEstadoVigente,
  syncLegacyRequerimiento,
  FUENTE_RESPONSABLE,
  ORIGEN_ESCRITURA_VIGENTE,
} from './expedienteEstadoPersistido.js';
import {
  assertUsuarioDestinoTransicionElegible,
  listarCandidatosTransicion,
  getPilotEstadoLabelsForEvento,
} from './workflowTransicionResponsable.js';
import { getTransition } from '../../shared/workflow/transiciones.js';
import {
  tipoDeRequerimiento,
  etapaDeRequerimiento,
  getExistingEventByIdempotencyKey,
} from './workflow/workflowRepository.js';
import { ESTADOS_REVISION_CUADRO, RESPONSABLES_REVISION } from './cuadroComparativoRevision.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { getEtapaMeta } from '../../shared/workflow/etapas.js';
import { ETAPAS } from '../../core/workflowEngine/WorkflowState.js';

export const REPAIR_TICKET = 'RC8.17.8H6-D10-E3-C2.6B3';
export const EVENTO_REPARACION_AUDIT = 'REPARACION_RC8178H6_C26B3_ERV_CUADRO_COORD';
/** Solo validación de elegibilidad (listar/assert); no se emite en reparación. */
export const EVENTO_CANONICO = 'CUADRO_DERIVADO_COORDINACION';

export const ESTRATEGIA_REPARACION_C26B3 = Object.freeze({
  modo: 'ADMINISTRATIVA',
  emite_eventos: [EVENTO_REPARACION_AUDIT],
  prohibido: Object.freeze([
    'CUADRO_DERIVADO_COORDINACION',
    'transicionarExpediente',
    'appendMovimiento',
  ]),
});

export const CASE_DEFAULT = Object.freeze({
  solicitud_codigo: 'SC-00001-2026-INS',
  requerimiento_codigo: 'REQ-00001',
  nro_invitacion: 7,
  cuadro_id: 2,
  cuadro_version: 3,
  revision_estado_esperado: ESTADOS_REVISION_CUADRO.PENDIENTE_COORDINADOR,
});

export function buildAuditIdempotencyKey(requerimientoId) {
  return `repair-c26b3:req${Number(requerimientoId)}:audit-erv-cuadro-coord`;
}

/**
 * @returns {{ needsRepair: boolean, reasons: string[], alreadyOk: boolean }}
 */
/**
 * Guardas obligatorias antes de --execute (caso acotado SC-00001 / REQ-00001 / cuadro 2 v3).
 * @returns {{ ok: boolean, errores: string[] }}
 */
export function validarPrecondicionesEjecucionC26b3(
  audit,
  {
    requerimientoCodigo = CASE_DEFAULT.requerimiento_codigo,
    cuadroId = CASE_DEFAULT.cuadro_id,
    cuadroVersion = CASE_DEFAULT.cuadro_version,
    nroInvitacion = CASE_DEFAULT.nro_invitacion,
    exigirAsignacionUnidad = true,
  } = {},
) {
  const errores = [];
  if (!audit?.ok) {
    errores.push('auditoría inválida o incompleta');
    return { ok: false, errores };
  }
  if (String(audit.alcance?.requerimiento_codigo || '') !== String(requerimientoCodigo)) {
    errores.push(`requerimiento ${audit.alcance?.requerimiento_codigo} ≠ ${requerimientoCodigo}`);
  }
  const cuadro = audit.alcance?.cuadro || {};
  if (Number(cuadro.id) !== Number(cuadroId)) {
    errores.push(`cuadro id=${cuadro.id} ≠ ${cuadroId}`);
  }
  if (Number(cuadro.version) !== Number(cuadroVersion)) {
    errores.push(`cuadro version=${cuadro.version} ≠ ${cuadroVersion}`);
  }
  if (Number(audit.alcance?.nro_invitacion) !== Number(nroInvitacion)) {
    errores.push(`nro_invitacion ${audit.alcance?.nro_invitacion} ≠ ${nroInvitacion}`);
  }
  if (String(cuadro.estado || '') !== CASE_DEFAULT.revision_estado_esperado) {
    errores.push(`estado cuadro=${cuadro.estado} ≠ ${CASE_DEFAULT.revision_estado_esperado}`);
  }
  const erv = audit.expediente_estado_vigente || {};
  const ervTipo = String(erv.responsable_tipo || '').toUpperCase();
  if (ervTipo !== TIPO_RESPONSABLE.UNIDAD) {
    errores.push(`ERV responsable_tipo=${ervTipo || '—'}; se esperaba UNIDAD antes de reparar`);
  }
  const asig = (audit.asignacion_activa || [])[0] || null;
  if (exigirAsignacionUnidad) {
    const asigTipo = String(asig?.tipo_responsable || '').toUpperCase();
    if (asigTipo !== TIPO_RESPONSABLE.UNIDAD) {
      errores.push(`asignación activa tipo=${asigTipo || '—'}; se esperaba UNIDAD`);
    }
  }
  if (!audit.hallazgos?.gap?.needsRepair && !audit.hallazgos?.gap?.alreadyOk) {
    errores.push('ERV no reporta brecha de reparación reconocida');
  }
  return { ok: errores.length === 0, errores };
}

export function assessErvCuadroCoordGap(erv = {}, asignacionActiva = null) {
  const reasons = [];
  const etapa = String(erv.etapa_codigo || '').toUpperCase();
  const estado = String(erv.estado_codigo || '').toUpperCase();
  const tipo = String(erv.responsable_tipo || '').toUpperCase();
  const uid = erv.responsable_usuario_id != null ? Number(erv.responsable_usuario_id) : null;

  if (etapa !== ETAPAS.CUADRO_COMPARATIVO) {
    reasons.push(`etapa vigente ${etapa || '—'} ≠ CUADRO_COMPARATIVO`);
  }
  if (estado !== 'EN_TRAMITE') {
    reasons.push(`estado vigente ${estado || '—'} ≠ EN_TRAMITE (p. ej. alias CUADRO_COMPARATIVO)`);
  }
  if (tipo !== TIPO_RESPONSABLE.PERSONA || !Number.isFinite(uid) || uid <= 0) {
    reasons.push(`responsable ${tipo || '—'} sin persona (usuario_id=${uid ?? 'NULL'})`);
  }
  const asigTipo = String(asignacionActiva?.tipo_responsable || '').toUpperCase();
  const asigUid = asignacionActiva?.usuario_id != null ? Number(asignacionActiva.usuario_id) : null;
  if (asignacionActiva && (asigTipo !== TIPO_RESPONSABLE.PERSONA || !Number.isFinite(asigUid))) {
    reasons.push(`asignación activa id=${asignacionActiva.id} no es PERSONA`);
  }

  const alreadyOk = reasons.length === 0
    && asignacionActiva
    && asigTipo === TIPO_RESPONSABLE.PERSONA
    && Number.isFinite(asigUid)
    && uid === asigUid;

  return {
    needsRepair: !alreadyOk && reasons.length > 0,
    alreadyOk,
    reasons,
  };
}

function parsePayload(raw) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
  } catch (_) {
    return {};
  }
}

async function loadUsuarioBasico(usuarioId, client = null) {
  const q = client?.query ? client.query.bind(client) : query;
  const { rows } = await q(
    `SELECT id, username, apellidos, nombres, nombre, cargo, activo
     FROM usuarios WHERE id = $1 LIMIT 1`,
    [Number(usuarioId)],
  );
  return rows[0] || null;
}

function nombreUsuario(u = {}) {
  const comp = [u.apellidos, u.nombres].filter(Boolean).join(' ').trim();
  return comp || u.nombre || u.username || (u.id ? `Usuario #${u.id}` : '');
}

/**
 * Auditoría de solo lectura del caso acotado (solicitud + REQ + invitación + cuadro).
 */
export async function auditarErvCuadroDerivacionCoord({
  solicitudCodigo = CASE_DEFAULT.solicitud_codigo,
  requerimientoCodigo = CASE_DEFAULT.requerimiento_codigo,
  nroInvitacion = CASE_DEFAULT.nro_invitacion,
  cuadroId = CASE_DEFAULT.cuadro_id,
  cuadroVersion = CASE_DEFAULT.cuadro_version,
} = {}) {
  const { rows: solRows } = await query(
    `SELECT id, codigo, estado, tipo FROM solicitudes_cotizacion WHERE codigo = $1 LIMIT 1`,
    [solicitudCodigo],
  );
  const solicitud = solRows[0];
  if (!solicitud) {
    return { ok: false, error: `Solicitud ${solicitudCodigo} no encontrada` };
  }

  const { rows: reqRows } = await query(
    `SELECT id, codigo, estado, estado_actual, payload FROM requerimientos WHERE codigo = $1 LIMIT 1`,
    [requerimientoCodigo],
  );
  const requerimiento = reqRows[0];
  if (!requerimiento) {
    return { ok: false, error: `Requerimiento ${requerimientoCodigo} no encontrado` };
  }

  const { rows: linkRows } = await query(
    `SELECT 1 FROM solicitud_requerimientos
     WHERE solicitud_id = $1 AND requerimiento_id = $2 LIMIT 1`,
    [solicitud.id, requerimiento.id],
  );
  if (!linkRows.length) {
    return {
      ok: false,
      error: `${requerimientoCodigo} no está vinculado a ${solicitudCodigo}`,
    };
  }

  const { rows: otrosReqs } = await query(
    `SELECT r.id, r.codigo FROM solicitud_requerimientos sr
     JOIN requerimientos r ON r.id = sr.requerimiento_id
     WHERE sr.solicitud_id = $1 AND sr.requerimiento_id <> $2`,
    [solicitud.id, requerimiento.id],
  );

  const { rows: cuadroRows } = await query(
    `SELECT id, solicitud_id, version, estado, nro_invitacion, invitacion_id,
            actualizado_at, derivado_at, derivado_por,
            LENGTH(COALESCE(pdf_contenido, '')) AS pdf_len,
            LENGTH(COALESCE(firmado_contenido, '')) AS firmado_len,
            firmado_at, firmado_por
     FROM cuadros_comparativos
     WHERE id = $1 AND version = $2 AND solicitud_id = $3
     LIMIT 1`,
    [cuadroId, cuadroVersion, solicitud.id],
  );
  const cuadro = cuadroRows[0];
  if (!cuadro) {
    return { ok: false, error: `Cuadro id=${cuadroId} v${cuadroVersion} no encontrado para la solicitud` };
  }
  if (Number(cuadro.nro_invitacion) !== Number(nroInvitacion)) {
    return {
      ok: false,
      error: `Cuadro nro_invitacion=${cuadro.nro_invitacion} ≠ ${nroInvitacion}`,
    };
  }

  const rid = Number(requerimiento.id);
  const [{ rows: ervRows }, { rows: asigAct }, { rows: asigHist }, { rows: wfCuadro }] = await Promise.all([
    query(`SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1`, [rid]),
    query(
      `SELECT a.*, u.username FROM expediente_asignaciones a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.requerimiento_id = $1 AND a.activo = TRUE
       ORDER BY a.asignado_at DESC, a.id DESC`,
      [rid],
    ),
    query(
      `SELECT a.id, a.etapa_codigo, a.tipo_responsable, a.usuario_id, a.unidad_codigo,
              a.activo, a.asignado_at, a.cerrado_at, a.motivo, a.origen_asignacion, u.username
       FROM expediente_asignaciones a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.requerimiento_id = $1
       ORDER BY a.asignado_at ASC, a.id ASC`,
      [rid],
    ),
    query(
      `SELECT id, evento_codigo, etapa_origen, etapa_destino, actor_rol, created_at,
              metadata->>'usuario_destino_id' AS metadata_usuario_destino_id,
              metadata->>'responsable_seleccionado_id' AS metadata_responsable_seleccionado_id,
              metadata->>'client_request_id' AS metadata_client_request_id
       FROM workflow_eventos
       WHERE expediente_id = $1
         AND (evento_codigo ILIKE 'CUADRO%' OR evento_codigo ILIKE '%REPARACION%C26B3%')
       ORDER BY id ASC`,
      [rid],
    ),
  ]);

  const erv = ervRows[0] || null;
  const gap = assessErvCuadroCoordGap(erv, asigAct[0] || null);
  const derivEvents = wfCuadro.filter((e) => e.evento_codigo === EVENTO_CANONICO);
  const derivSinPersona = derivEvents.filter(
    (e) => !e.metadata_usuario_destino_id && !e.metadata_responsable_seleccionado_id,
  );

  const payload = parsePayload(requerimiento.payload);
  const snap = payload.workflowSnapshot || {};

  return {
    ok: true,
    ticket: REPAIR_TICKET,
    alcance: {
      solicitud_id: solicitud.id,
      solicitud_codigo: solicitud.codigo,
      requerimiento_id: rid,
      requerimiento_codigo: requerimiento.codigo,
      nro_invitacion: Number(nroInvitacion),
      otros_requerimientos_misma_solicitud: otrosReqs,
      cuadro: {
        id: cuadro.id,
        version: cuadro.version,
        estado: cuadro.estado,
        firmado_len: Number(cuadro.firmado_len) || 0,
        pdf_len: Number(cuadro.pdf_len) || 0,
      },
    },
    expediente_estado_vigente: erv,
    asignacion_activa: asigAct,
    asignaciones_historial_count: asigHist.length,
    workflow_eventos_cuadro: wfCuadro,
    hallazgos: {
      gap,
      revision_estado_documental: cuadro.estado,
      revision_estado_payload: snap.revisionEstado || null,
      derivaciones_coord_count: derivEvents.length,
      derivaciones_coord_sin_persona: derivSinPersona,
    },
    objetivo_post_reparacion: {
      etapa_codigo: ETAPAS.CUADRO_COMPARATIVO,
      estado_codigo: 'EN_TRAMITE',
      estado_label: 'En trámite',
      responsable_tipo: TIPO_RESPONSABLE.PERSONA,
      revision_estado_documental: CASE_DEFAULT.revision_estado_esperado,
      cuadro_documental_sin_cambios: true,
    },
  };
}

export async function validarUsuarioDestinoCuadroCoord(requerimientoId, usuarioDestinoId, client = null) {
  const uid = Number(usuarioDestinoId);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('usuario_destino_id obligatorio (entero > 0)');
    err.code = 'USUARIO_DESTINO_REQUERIDO';
    err.status = 400;
    throw err;
  }
  const usuario = await loadUsuarioBasico(uid, client);
  if (!usuario?.activo) {
    const err = new Error(`Usuario destino id=${uid} inactivo o inexistente`);
    err.code = 'USUARIO_DESTINO_INVALIDO';
    err.status = 422;
    throw err;
  }
  const eleg = await assertUsuarioDestinoTransicionElegible(
    requerimientoId,
    EVENTO_CANONICO,
    uid,
    null,
    client,
  );
  return {
    usuario: {
      id: usuario.id,
      username: usuario.username,
      nombre: nombreUsuario(usuario),
      cargo: usuario.cargo || '',
    },
    candidato: eleg.candidato,
  };
}

async function assertTransicionPermitida(requerimientoRow) {
  const tipo = tipoDeRequerimiento(requerimientoRow) || 'BIEN';
  const etapaOrigen = String(
    (await query(
      `SELECT etapa_codigo FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
      [requerimientoRow.id],
    )).rows[0]?.etapa_codigo
    || etapaDeRequerimiento(requerimientoRow)
    || ETAPAS.CUADRO_COMPARATIVO,
  ).toUpperCase();
  const transicion = getTransition({
    tipoContratacion: tipo,
    etapaOrigen,
    eventoCodigo: EVENTO_CANONICO,
  });
  if (!transicion) {
    const err = new Error(
      `Transición no permitida en planificación: ${tipo} ${etapaOrigen} ${EVENTO_CANONICO}`,
    );
    err.code = 'TRANSITION_NOT_FOUND';
    throw err;
  }
  return { etapaOrigen, transicion, tipo };
}

/**
 * Plan de reparación (dry-run). No escribe BD.
 */
export async function planReparacionErvCuadroDerivacionCoord({
  solicitudCodigo = CASE_DEFAULT.solicitud_codigo,
  requerimientoCodigo = CASE_DEFAULT.requerimiento_codigo,
  nroInvitacion = CASE_DEFAULT.nro_invitacion,
  cuadroId = CASE_DEFAULT.cuadro_id,
  cuadroVersion = CASE_DEFAULT.cuadro_version,
  usuarioDestinoId,
} = {}) {
  const audit = await auditarErvCuadroDerivacionCoord({
    solicitudCodigo,
    requerimientoCodigo,
    nroInvitacion,
    cuadroId,
    cuadroVersion,
  });
  if (!audit.ok) {
    return { ok: false, error: audit.error, audit: null, plan: null };
  }

  const rid = audit.alcance.requerimiento_id;
  let destino = null;
  try {
    destino = await validarUsuarioDestinoCuadroCoord(rid, usuarioDestinoId);
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      code: err.code,
      audit,
      plan: null,
    };
  }

  const { rows: reqRows } = await query(
    `SELECT * FROM requerimientos WHERE id = $1`,
    [rid],
  );
  const reqRow = reqRows[0];
  let transicionInfo;
  try {
    transicionInfo = await assertTransicionPermitida(reqRow);
  } catch (err) {
    return { ok: false, error: err.message, code: err.code, audit, plan: null };
  }

  if (audit.hallazgos.gap.alreadyOk && Number(audit.expediente_estado_vigente?.responsable_usuario_id) === destino.usuario.id) {
    return {
      ok: true,
      audit,
      plan: {
        accion: 'NINGUNA',
        idempotente: true,
        mensaje: 'ERV ya cumple objetivo para el usuario destino indicado',
      },
    };
  }

  if (audit.alcance.cuadro.estado !== CASE_DEFAULT.revision_estado_esperado) {
    return {
      ok: false,
      error: `Estado documental cuadro=${audit.alcance.cuadro.estado}; se esperaba ${CASE_DEFAULT.revision_estado_esperado}. Abortar (fuera de alcance).`,
      audit,
      plan: null,
    };
  }

  const labels = getPilotEstadoLabelsForEvento(EVENTO_CANONICO);
  const metaEtapa = getEtapaMeta(ETAPAS.CUADRO_COMPARATIVO) || {};

  return {
    ok: true,
    audit,
    plan: {
      accion: 'APLICAR_REPARACION_ADMINISTRATIVA',
      estrategia: ESTRATEGIA_REPARACION_C26B3.modo,
      requerimiento_id: rid,
      evento_auditoria: EVENTO_REPARACION_AUDIT,
      usuario_destino_id: destino.usuario.id,
      usuario_destino_nombre: destino.usuario.nombre,
      audit_idempotency_key: buildAuditIdempotencyKey(rid),
      etapa_origen: transicionInfo.etapaOrigen,
      etapa_destino: ETAPAS.CUADRO_COMPARATIVO,
      estado_esperado: labels,
      responsable_unidad: RESPONSABLES_REVISION.COORDINADOR_CM,
      revision_estado_payload: CASE_DEFAULT.revision_estado_esperado,
      operaciones: [
        'cerrarAsignacionActiva + crearAsignacion PERSONA (origen RECONCILIACION)',
        'upsertEstadoVigente EN_TRAMITE / CUADRO_COMPARATIVO',
        'syncLegacyRequerimiento + payload.workflowSnapshot',
        `insertWorkflowEvento(${EVENTO_REPARACION_AUDIT}) único`,
      ],
      no_emite: [...ESTRATEGIA_REPARACION_C26B3.prohibido],
      no_modifica: [
        'cuadros_comparativos (PDF/firmado/datos_json)',
        'otras solicitudes o invitaciones',
        `requerimientos distintos de ${requerimientoCodigo}`,
      ],
      etapa_label: metaEtapa.label || 'Cuadro Comparativo',
    },
  };
}

export async function listarCandidatosCoordinadorCmCuadro(requerimientoId) {
  return listarCandidatosTransicion(requerimientoId, EVENTO_CANONICO, {});
}

/**
 * Aplica reparación (solo invocar con execute=true tras revisión humana).
 */
export async function aplicarReparacionErvCuadroDerivacionCoord(options = {}) {
  const planned = await planReparacionErvCuadroDerivacionCoord(options);
  if (!planned.ok) {
    return { ok: false, ...planned };
  }
  if (planned.plan?.accion === 'NINGUNA') {
    return { ok: true, applied: false, idempotente: true, audit: planned.audit, plan: planned.plan };
  }
  if (planned.plan?.accion !== 'APLICAR_REPARACION_ADMINISTRATIVA') {
    return { ok: false, error: 'Plan no aplicable', audit: planned.audit, plan: planned.plan };
  }

  const pre = validarPrecondicionesEjecucionC26b3(planned.audit, {
    requerimientoCodigo: options.requerimientoCodigo ?? CASE_DEFAULT.requerimiento_codigo,
    cuadroId: options.cuadroId ?? CASE_DEFAULT.cuadro_id,
    cuadroVersion: options.cuadroVersion ?? CASE_DEFAULT.cuadro_version,
    nroInvitacion: options.nroInvitacion ?? CASE_DEFAULT.nro_invitacion,
  });
  if (!pre.ok) {
    return {
      ok: false,
      error: `Precondiciones de ejecución no cumplidas: ${pre.errores.join('; ')}`,
      code: 'PRECONDICIONES_EJECUCION',
      precondiciones: pre,
      audit: planned.audit,
      plan: planned.plan,
    };
  }

  const rid = planned.plan.requerimiento_id;
  const uid = planned.plan.usuario_destino_id;
  const derivSinPersona = planned.audit.hallazgos.derivaciones_coord_sin_persona || [];
  const refEventoId = derivSinPersona.length ? derivSinPersona[derivSinPersona.length - 1].id : null;
  const { rows: reqTipoRows } = await query(`SELECT * FROM requerimientos WHERE id = $1`, [rid]);
  const reqRowApply = reqTipoRows[0];
  const tipoContratacion = tipoDeRequerimiento(reqRowApply) || 'BIEN';

  const snapshotReversion = {
    expediente_estado_vigente: planned.audit.expediente_estado_vigente,
    asignacion_activa: planned.audit.asignacion_activa,
    capturado_at: new Date().toISOString(),
  };

  const nombreResponsable = planned.plan.usuario_destino_nombre || '';
  const auditKey = buildAuditIdempotencyKey(rid);
  const auditPrevioGlobal = await getExistingEventByIdempotencyKey(auditKey);
  if (auditPrevioGlobal) {
    return {
      ok: true,
      applied: false,
      idempotente: true,
      evento_reparacion_id: auditPrevioGlobal.id,
      audit: planned.audit,
      plan: planned.plan,
    };
  }

  const labels = planned.plan.estado_esperado || getPilotEstadoLabelsForEvento(EVENTO_CANONICO);
  const metaEtapa = getEtapaMeta(ETAPAS.CUADRO_COMPARATIVO) || {};
  const motivoReparacion = `Reparación ${REPAIR_TICKET}: ERV nominal Coordinador CM (administrativa, sin re-derivación)`;
  const origenEscritura = ORIGEN_ESCRITURA_VIGENTE.RECONCILIACION;

  const estadoNuevo = {
    etapa_codigo: ETAPAS.CUADRO_COMPARATIVO,
    etapa_label: metaEtapa.label || 'Cuadro Comparativo',
    estado_codigo: labels?.estadoCodigo || 'EN_TRAMITE',
    estado_label: labels?.estadoLabel || 'En trámite',
    responsable_tipo: TIPO_RESPONSABLE.PERSONA,
    responsable_usuario_id: uid,
    responsable_usuario_nombre: nombreResponsable,
    responsable_unidad: planned.plan.responsable_unidad,
  };

  await withTransaction(async (tx) => {
    const auditPrevio = await getExistingEventByIdempotencyKey(auditKey, tx);
    if (auditPrevio) return;

    await tx.query('SELECT id FROM requerimientos WHERE id = $1 FOR UPDATE', [rid]);

    await cerrarAsignacionActiva(tx, rid, { origenEscritura });
    await crearAsignacion(tx, {
      requerimientoId: rid,
      etapaCodigo: ETAPAS.CUADRO_COMPARATIVO,
      usuarioId: uid,
      unidadCodigo: planned.plan.responsable_unidad,
      tipoResponsable: TIPO_RESPONSABLE.PERSONA,
      origenAsignacion: 'repair-c26b3',
      asignadoPor: REPAIR_TICKET,
      motivo: motivoReparacion,
      origenEscritura,
    });

    await upsertEstadoVigente(tx, {
      requerimientoId: rid,
      estadoCodigo: estadoNuevo.estado_codigo,
      estadoLabel: estadoNuevo.estado_label,
      etapaCodigo: estadoNuevo.etapa_codigo,
      etapaLabel: estadoNuevo.etapa_label,
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: planned.plan.responsable_unidad,
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
      actualizadoPor: REPAIR_TICKET,
      metadata: {
        reparacion: true,
        ticket: REPAIR_TICKET,
        modo: ESTRATEGIA_REPARACION_C26B3.modo,
      },
      origenEscritura,
    });

    await syncLegacyRequerimiento(tx, {
      requerimientoId: rid,
      etapaCodigo: ETAPAS.CUADRO_COMPARATIVO,
      estadoNegocio: estadoNuevo.estado_label,
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: planned.plan.responsable_unidad,
      subModuloLabel: metaEtapa.submoduloLabel || 'Cuadro Comparativo',
    });

    const { rows } = await tx.query('SELECT payload FROM requerimientos WHERE id = $1', [rid]);
    if (rows.length) {
      const payload = parsePayload(rows[0].payload);
      payload.workflowSnapshot = {
        ...(payload.workflowSnapshot || {}),
        etapaActual: ETAPAS.CUADRO_COMPARATIVO,
        subModuloActual: 'Cuadro Comparativo',
        moduloActual: 'Contrataciones',
        responsableActual: planned.plan.responsable_unidad,
        revisionEstado: planned.plan.revision_estado_payload,
        fechaEstadoActual: new Date().toISOString(),
      };
      await tx.query(
        `UPDATE requerimientos SET payload = $2::jsonb, responsable_actual = $3, updated_at = NOW() WHERE id = $1`,
        [rid, JSON.stringify(payload), nombreResponsable || String(uid)],
      );
    }

    await insertWorkflowEvento(tx, {
      expediente_id: rid,
      tipo_contratacion: tipoContratacion,
      evento_codigo: EVENTO_REPARACION_AUDIT,
      etapa_origen: planned.plan.etapa_origen,
      etapa_destino: planned.plan.etapa_destino,
      actor_rol: REPAIR_TICKET,
      responsable_destino: String(uid),
      metadata: {
        reparacion: true,
        ticket: REPAIR_TICKET,
        modo: ESTRATEGIA_REPARACION_C26B3.modo,
        motivo: motivoReparacion,
        objetivo: 'CUADRO_COMPARATIVO/EN_TRAMITE/PERSONA',
        usuario_destino_id: uid,
        usuario_destino_nombre: nombreResponsable || null,
        referencia_evento_derivacion_id: refEventoId,
        estado_anterior: {
          expediente_estado_vigente: planned.audit.expediente_estado_vigente,
          asignacion_activa: planned.audit.asignacion_activa,
        },
        estado_nuevo: estadoNuevo,
        snapshot_reversion: snapshotReversion,
        dueno_persistencia: REPAIR_TICKET,
      },
      idempotency_key: auditKey,
    });
  });

  const post = await auditarErvCuadroDerivacionCoord({
    solicitudCodigo: options.solicitudCodigo,
    requerimientoCodigo: options.requerimientoCodigo,
    nroInvitacion: options.nroInvitacion,
    cuadroId: options.cuadroId,
    cuadroVersion: options.cuadroVersion,
  });

  return {
    ok: true,
    applied: true,
    audit_antes: planned.audit,
    audit_despues: post,
    plan: planned.plan,
    snapshot_reversion: snapshotReversion,
  };
}

/** Procedimiento de reversión (documentación operativa; aplicar manualmente con supervisión). */
export const PROCEDIMIENTO_REVERSION = Object.freeze({
  descripcion:
    'Restaurar ERV/asignación usando metadata.snapshot_reversion / estado_anterior del evento REPARACION_RC8178H6_C26B3_ERV_CUADRO_COORD.',
  pasos: [
    '1. Localizar en workflow_eventos el evento REPARACION_RC8178H6_C26B3_ERV_CUADRO_COORD (idempotency repair-c26b3:req{N}:audit-erv-cuadro-coord).',
    '2. Extraer metadata.snapshot_reversion (expediente_estado_vigente + asignacion_activa previa).',
    '3. En transacción: cerrar asignación PERSONA creada por la reparación; reactivar o recrear asignación según snapshot (origen RECONCILIACION).',
    '4. upsertEstadoVigente con valores del snapshot (NO tocar cuadros_comparativos).',
    '5. Registrar evento REVERSION_MANUAL_C26B3 con actor humano y motivo.',
  ],
  advertencia: 'No eliminar eventos históricos; solo compensar estado vigente.',
});
