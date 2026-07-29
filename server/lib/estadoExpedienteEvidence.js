/**
 * Cargador central de evidencias de estado global del expediente.
 * Batch por IDs — sin N+1. Incluye CCP + Registro de Órdenes / notificación.
 */
import { query } from '../db.js';
import {
  resolveEstadoExpedienteVigente,
  badgeVisualEstadoVigente,
  buildEstadoApiContract,
  normalizeEstadoCode,
} from '../../shared/estadoExpedienteVigente.js';

/**
 * Carga evidencias de estado para múltiples requerimientos.
 * @param {number[]} expedienteIds — requerimiento_id
 * @returns {Promise<Map<number, object>>}
 */
export async function loadEstadoExpedienteEvidenceByIds(expedienteIds = []) {
  const ids = [...new Set((expedienteIds || [])
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0))];
  const map = new Map();
  if (!ids.length) return map;

  ids.forEach((id) => {
    map.set(id, {
      requerimiento_id: id,
      codigo_ccp: '',
      ccp_activo: false,
      enviada_oppm: false,
      orden_id: null,
      orden_estado: '',
      enviado_proveedor_at: null,
      recibido_proveedor_at: null,
      derivado_ejecucion_at: null,
      orden_resuelta: false,
      orden_resuelta_at: null,
      expediente_derivado_pago: false,
      derivado_pago_at: null,
      cuadro_estado: '',
      ccp_firmado_id: null,
      recepcion_estado_global: '',
      recepcion_estado_interno: '',
      recepcion_bienes_expediente_id: null,
    });
  });

  // CCP activos
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (requerimiento_id)
        requerimiento_id, codigo_ccp, registrado_por, registrado_at
      FROM ccp_codigos
      WHERE estado = 'ACTIVO' AND requerimiento_id = ANY($1::int[])
      ORDER BY requerimiento_id, id DESC
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.codigo_ccp = r.codigo_ccp || '';
      e.ccp_activo = !!r.codigo_ccp;
    });
  } catch (_) { /* migración pendiente */ }

  // Enviada OPPM (consolidación)
  try {
    const { rows } = await query(`
      SELECT sr.requerimiento_id,
        BOOL_OR(sol.estado = 'ENVIADA_OPPM' AND csr.activo = TRUE) AS enviada_oppm
      FROM solicitud_requerimientos sr
      LEFT JOIN ccp_solicitud_requerimientos csr
        ON csr.requerimiento_id = sr.requerimiento_id AND csr.activo = TRUE
      LEFT JOIN ccp_solicitudes sol ON sol.id = csr.solicitud_id AND sol.estado <> 'ANULADA'
      WHERE sr.requerimiento_id = ANY($1::int[])
      GROUP BY sr.requerimiento_id
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.enviada_oppm = !!r.enviada_oppm;
    });
  } catch (_) { /* ok */ }

  // Órdenes de contratación (última no anulada por requerimiento)
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (requerimiento_id)
        id AS orden_id,
        requerimiento_id,
        estado AS orden_estado,
        enviado_proveedor_at,
        recibido_proveedor_at,
        derivado_ejecucion_at,
        creado_at
      FROM ordenes_contratacion
      WHERE requerimiento_id = ANY($1::int[])
        AND COALESCE(estado, '') <> 'ORDEN_ANULADA'
        AND COALESCE(estado, '') <> 'ANULADA'
      ORDER BY requerimiento_id, id DESC
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.orden_id = r.orden_id;
      e.orden_estado = normalizeEstadoCode(r.orden_estado) || r.orden_estado || '';
      e.enviado_proveedor_at = r.enviado_proveedor_at || null;
      e.recibido_proveedor_at = r.recibido_proveedor_at || null;
      e.derivado_ejecucion_at = r.derivado_ejecucion_at || null;
    });
  } catch (_) { /* ok */ }

  // CCP firmado (entrada a Registro de Órdenes) — best effort
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (requerimiento_id)
        requerimiento_id, id AS ccp_firmado_id
      FROM ccp_documentos_firmados
      WHERE requerimiento_id = ANY($1::int[])
      ORDER BY requerimiento_id, id DESC
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.ccp_firmado_id = r.ccp_firmado_id;
    });
  } catch (_) {
    // Tabla puede no existir o tener otro nombre
  }

  // Cuadro comparativo estado (si hay vínculo)
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (sr.requerimiento_id)
        sr.requerimiento_id,
        cc.estado AS cuadro_estado
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
      e.estado_cuadro = r.cuadro_estado || '';
    });
  } catch (_) { /* ok */ }

  // Resolución / derivado pago — columnas opcionales (no inventar si no existen)
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (requerimiento_id)
        requerimiento_id, estado, resuelta_at, derivado_pago_at
      FROM ordenes_contratacion
      WHERE requerimiento_id = ANY($1::int[])
      ORDER BY requerimiento_id, id DESC
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      const st = normalizeEstadoCode(r.estado);
      if (st === 'ORDEN_RESUELTA' || r.resuelta_at) {
        e.orden_resuelta = true;
        e.orden_resuelta_at = r.resuelta_at || null;
        e.orden_estado = 'ORDEN_RESUELTA';
      }
      if (st === 'EXPEDIENTE_DERIVADO_PAGO' || r.derivado_pago_at) {
        e.expediente_derivado_pago = true;
        e.derivado_pago_at = r.derivado_pago_at || null;
      }
    });
  } catch (_) {
    // Columnas resuelta_at / derivado_pago_at pueden no existir aún
  }

  // Recepción de Bienes (estado global post-orden OC notificada)
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (requerimiento_id)
        id AS recepcion_bienes_expediente_id,
        requerimiento_id,
        orden_id,
        estado_global AS recepcion_estado_global,
        estado_interno AS recepcion_estado_interno,
        updated_at
      FROM recepcion_bienes_expedientes
      WHERE requerimiento_id = ANY($1::int[])
      ORDER BY requerimiento_id, updated_at DESC, id DESC
    `, [ids]);
    rows.forEach((r) => {
      const e = map.get(Number(r.requerimiento_id));
      if (!e) return;
      e.recepcion_bienes_expediente_id = r.recepcion_bienes_expediente_id;
      e.recepcion_estado_global = normalizeEstadoCode(r.recepcion_estado_global) || r.recepcion_estado_global || '';
      e.recepcion_estado_interno = r.recepcion_estado_interno || '';
      if (e.recepcion_estado_global === 'EXPEDIENTE_DERIVADO_PAGO') {
        e.expediente_derivado_pago = true;
      }
      if (!e.orden_id && r.orden_id) e.orden_id = r.orden_id;
    });
  } catch (_) { /* migración 029 pendiente */ }

  return map;
}

/**
 * Une evidencia a una fila de requerimiento y resuelve estado vigente.
 */
export function applyEstadoEvidenceToRow(row = {}, evidence = null) {
  const ev = evidence || {};
  const seeded = {
    ...row,
    codigo_ccp: ev.codigo_ccp || row.codigo_ccp || '',
    ccp_activo: !!(ev.ccp_activo || ev.codigo_ccp || row.ccp_activo),
    tiene_codigo: !!(ev.ccp_activo || ev.codigo_ccp || row.tiene_codigo),
    enviada_oppm: !!(ev.enviada_oppm || row.enviada_oppm),
    consolidacion_estado: (ev.enviada_oppm || row.enviada_oppm)
      ? 'ENVIADA_OPPM'
      : (row.consolidacion_estado || ''),
    estado_ccp: (ev.ccp_activo || ev.codigo_ccp)
      ? 'CCP_REGISTRADA'
      : ((ev.enviada_oppm || row.enviada_oppm) ? 'ENVIADA_OPPM' : (row.estado_ccp || '')),
    orden_id: ev.orden_id ?? row.orden_id ?? null,
    orden_estado: ev.orden_estado || row.orden_estado || '',
    estado_orden: ev.orden_estado || row.estado_orden || '',
    enviado_proveedor_at: ev.enviado_proveedor_at || row.enviado_proveedor_at || null,
    recibido_proveedor_at: ev.recibido_proveedor_at || row.recibido_proveedor_at || null,
    derivado_ejecucion_at: ev.derivado_ejecucion_at || row.derivado_ejecucion_at || null,
    orden_resuelta: !!(ev.orden_resuelta || row.orden_resuelta),
    orden_resuelta_at: ev.orden_resuelta_at || row.orden_resuelta_at || null,
    expediente_derivado_pago: !!(ev.expediente_derivado_pago || row.expediente_derivado_pago),
    derivado_pago_at: ev.derivado_pago_at || row.derivado_pago_at || null,
    ccp_firmado_id: ev.ccp_firmado_id || row.ccp_firmado_id || null,
    estado_cuadro: ev.estado_cuadro || ev.cuadro_estado || row.estado_cuadro || '',
    cuadro_estado: ev.cuadro_estado || row.cuadro_estado || '',
    recepcion_estado_global: ev.recepcion_estado_global || row.recepcion_estado_global || '',
    recepcion_estado_interno: ev.recepcion_estado_interno || row.recepcion_estado_interno || '',
    recepcion_bienes_expediente_id: ev.recepcion_bienes_expediente_id
      || row.recepcion_bienes_expediente_id || null,
  };

  const vigente = resolveEstadoExpedienteVigente(seeded);
  const badge = badgeVisualEstadoVigente(seeded);
  const contract = buildEstadoApiContract(seeded);

  return {
    ...seeded,
    ...contract,
    estado_codigo: vigente.codigo,
    etiqueta_estado: vigente.label,
    estado_vigente: vigente.codigo,
    estado_vigente_label: vigente.label,
    badge_variante: badge.bootstrap || (badge.color ? 'custom' : 'secondary'),
    badge_color: badge.color || null,
    badge_style: badge.style || '',
    derivado_ccp: vigente.derivadoCcp,
    ccp_registrado: vigente.ccpRegistrado === true
      || vigente.codigo === 'CCP_REGISTRADA',
    // Compat label histórico masculino → canónico
    ccp_registrado_label: vigente.codigo === 'CCP_REGISTRADA' ? 'CCP registrada' : null,
  };
}

/**
 * Adjunta evidencias (CCP + órdenes) a filas con id / requerimiento_id.
 */
export async function attachEstadoExpedienteEvidenceToRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const ids = list.map((r) => r.id || r.requerimiento_id);
  const map = await loadEstadoExpedienteEvidenceByIds(ids);
  return list.map((r) => {
    const key = Number(r.id || r.requerimiento_id);
    return applyEstadoEvidenceToRow(r, map.get(key) || null);
  });
}
