/**
 * OD35 — Flags CCP para propagar estado vigente a todas las bandejas.
 * Fuente de datos: ccp_codigos activos (+ consolidación enviada a OPPM).
 */
import { query } from '../db.js';
import {
  resolveEstadoActualExpediente,
  badgeVisualEstadoVigente,
} from '../../shared/estadoExpedienteVigente.js';

/**
 * @param {number[]} requerimientoIds
 * @returns {Promise<Map<number, { codigo_ccp: string, registrado_por: string, registrado_at: any }>>}
 */
export async function loadCcpActivosByRequerimientoIds(requerimientoIds = []) {
  const ids = [...new Set((requerimientoIds || [])
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0))];
  const map = new Map();
  if (!ids.length) return map;
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (requerimiento_id)
        requerimiento_id, codigo_ccp, registrado_por, registrado_at
      FROM ccp_codigos
      WHERE estado = 'ACTIVO' AND requerimiento_id = ANY($1::int[])
      ORDER BY requerimiento_id, id DESC
    `, [ids]);
    rows.forEach((r) => {
      map.set(Number(r.requerimiento_id), {
        codigo_ccp: r.codigo_ccp || '',
        registrado_por: r.registrado_por || '',
        registrado_at: r.registrado_at || null,
      });
    });
  } catch (_) {
    // Tablas aún no migradas: no romper bandejas
  }
  return map;
}

/**
 * Por solicitud: si algún requerimiento tiene CCP activo → expediente CCP registrado.
 * @returns {Promise<Map<number, { codigo_ccp: string, ccp_activo: boolean, enviada_oppm: boolean }>>}
 */
export async function loadCcpFlagsBySolicitudIds(solicitudIds = []) {
  const ids = [...new Set((solicitudIds || [])
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n) && n > 0))];
  const map = new Map();
  if (!ids.length) return map;
  try {
    const { rows } = await query(`
      SELECT sr.solicitud_id,
        MAX(cod.codigo_ccp) FILTER (WHERE cod.estado = 'ACTIVO') AS codigo_ccp,
        BOOL_OR(cod.estado = 'ACTIVO') AS ccp_activo,
        BOOL_OR(sol.estado = 'ENVIADA_OPPM' AND csr.activo = TRUE) AS enviada_oppm
      FROM solicitud_requerimientos sr
      LEFT JOIN ccp_codigos cod ON cod.requerimiento_id = sr.requerimiento_id
      LEFT JOIN ccp_solicitud_requerimientos csr
        ON csr.requerimiento_id = sr.requerimiento_id AND csr.activo = TRUE
      LEFT JOIN ccp_solicitudes sol ON sol.id = csr.solicitud_id AND sol.estado <> 'ANULADA'
      WHERE sr.solicitud_id = ANY($1::int[])
      GROUP BY sr.solicitud_id
    `, [ids]);
    rows.forEach((r) => {
      map.set(Number(r.solicitud_id), {
        codigo_ccp: r.codigo_ccp || '',
        ccp_activo: !!r.ccp_activo,
        enviada_oppm: !!r.enviada_oppm,
      });
    });
  } catch (_) { /* migración pendiente */ }
  return map;
}

/** Adjunta flags CCP a filas de requerimiento (id = requerimiento_id). */
export async function attachCcpFlagsToRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const map = await loadCcpActivosByRequerimientoIds(list.map((r) => r.id || r.requerimiento_id));
  return list.map((r) => {
    const key = Number(r.id || r.requerimiento_id);
    const info = map.get(key);
    return applyCcpFlagsToRow(r, info);
  });
}

export function applyCcpFlagsToRow(row = {}, info = null, extras = {}) {
  const codigo = String(info?.codigo_ccp || extras.codigo_ccp || row.codigo_ccp || '').trim();
  const ccpActivo = !!(info?.codigo_ccp || extras.ccp_activo || codigo);
  const enviadaOppm = !!(extras.enviada_oppm || row.enviada_oppm);
  const seeded = {
    ...row,
    codigo_ccp: codigo,
    ccp_activo: ccpActivo,
    tiene_codigo: ccpActivo,
    enviada_oppm: enviadaOppm,
    consolidacion_estado: enviadaOppm
      ? 'ENVIADA_OPPM'
      : (row.consolidacion_estado || ''),
    estado_ccp: ccpActivo
      ? 'CCP_REGISTRADO'
      : (enviadaOppm ? 'ENVIADA_OPPM' : (row.estado_ccp || '')),
  };
  const vigente = resolveEstadoActualExpediente(seeded);
  const badge = badgeVisualEstadoVigente(seeded);
  // No sobrescribir estado_actual (etapa de workflow / ubicación del expediente).
  return {
    ...seeded,
    estado_codigo: vigente.code,
    etiqueta_estado: vigente.label,
    estado_vigente: vigente.code,
    estado_vigente_label: vigente.label,
    badge_variante: badge.bootstrap || (badge.color ? 'custom' : 'secondary'),
    badge_color: badge.color || null,
    badge_style: badge.style || '',
    derivado_ccp: vigente.derivadoCcp,
    ccp_registrado: vigente.ccpRegistrado === true || vigente.code === 'CCP_REGISTRADO',
  };
}

/** Payload estándar post-mutación CCP para el frontend. */
export function buildCcpEstadoResponse(rowLike = {}) {
  const enriched = applyCcpFlagsToRow(rowLike, {
    codigo_ccp: rowLike.codigo_ccp || '',
  }, {
    ccp_activo: !!rowLike.codigo_ccp,
    enviada_oppm: !!rowLike.enviada_oppm,
  });
  return {
    codigo_ccp: enriched.codigo_ccp || '',
    ccp_activo: !!enriched.ccp_activo,
    estado_actual: enriched.estado_actual,
    estado_codigo: enriched.estado_codigo,
    etiqueta_estado: enriched.etiqueta_estado,
    badge_color: enriched.badge_color,
    badge_style: enriched.badge_style,
    badge_variante: enriched.badge_variante,
    derivado_ccp: !!enriched.derivado_ccp,
    ccp_registrado: !!enriched.ccp_registrado,
  };
}
