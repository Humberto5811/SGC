/**
 * OD35 — Flags CCP + evidencia de órdenes para propagar estado vigente a todas las bandejas.
 * Delega en el cargador central (CCP + Registro de Órdenes) — sin N+1.
 */
import { query } from '../db.js';
import {
  attachEstadoExpedienteEvidenceToRows,
  applyEstadoEvidenceToRow,
  loadEstadoExpedienteEvidenceByIds,
} from './estadoExpedienteEvidence.js';
import {
  resolveEstadoExpedienteVigente,
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
 * Incluye evidencia de orden del requerimiento vinculado (mejor esfuerzo).
 * @returns {Promise<Map<number, object>>}
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
        BOOL_OR(sol.estado = 'ENVIADA_OPPM' AND csr.activo = TRUE) AS enviada_oppm,
        ARRAY_AGG(DISTINCT sr.requerimiento_id) AS requerimiento_ids
      FROM solicitud_requerimientos sr
      LEFT JOIN ccp_codigos cod ON cod.requerimiento_id = sr.requerimiento_id
      LEFT JOIN ccp_solicitud_requerimientos csr
        ON csr.requerimiento_id = sr.requerimiento_id AND csr.activo = TRUE
      LEFT JOIN ccp_solicitudes sol ON sol.id = csr.solicitud_id AND sol.estado <> 'ANULADA'
      WHERE sr.solicitud_id = ANY($1::int[])
      GROUP BY sr.solicitud_id
    `, [ids]);

    const allReqIds = [];
    rows.forEach((r) => {
      const reqIds = (r.requerimiento_ids || []).map((x) => Number(x)).filter(Boolean);
      allReqIds.push(...reqIds);
      map.set(Number(r.solicitud_id), {
        codigo_ccp: r.codigo_ccp || '',
        ccp_activo: !!r.ccp_activo,
        enviada_oppm: !!r.enviada_oppm,
        requerimiento_ids: reqIds,
      });
    });

    // Adjuntar evidencia de órdenes (batch) a cada solicitud
    const evidence = await loadEstadoExpedienteEvidenceByIds(allReqIds);
    for (const [sid, info] of map.entries()) {
      let bestOrden = null;
      for (const rid of (info.requerimiento_ids || [])) {
        const ev = evidence.get(rid);
        if (!ev) continue;
        if (!bestOrden) bestOrden = ev;
        else {
          // Preferir la evidencia más avanzada (notificada > registrada)
          const a = ev.enviado_proveedor_at || ev.orden_estado === 'ORDEN_NOTIFICADA';
          const b = bestOrden.enviado_proveedor_at || bestOrden.orden_estado === 'ORDEN_NOTIFICADA';
          if (a && !b) bestOrden = ev;
          else if (ev.orden_id && !bestOrden.orden_id) bestOrden = ev;
        }
      }
      if (bestOrden) {
        info.orden_id = bestOrden.orden_id;
        info.orden_estado = bestOrden.orden_estado;
        info.enviado_proveedor_at = bestOrden.enviado_proveedor_at;
        info.recibido_proveedor_at = bestOrden.recibido_proveedor_at;
        info.derivado_ejecucion_at = bestOrden.derivado_ejecucion_at;
        info.orden_resuelta = bestOrden.orden_resuelta;
        info.expediente_derivado_pago = bestOrden.expediente_derivado_pago;
      }
    }
  } catch (_) { /* migración pendiente */ }
  return map;
}

/** Adjunta flags CCP + evidencia de órdenes a filas de requerimiento. */
export async function attachCcpFlagsToRows(rows = []) {
  return attachEstadoExpedienteEvidenceToRows(rows);
}

export function applyCcpFlagsToRow(row = {}, info = null, extras = {}) {
  const evidence = {
    codigo_ccp: String(info?.codigo_ccp || extras.codigo_ccp || row.codigo_ccp || '').trim(),
    ccp_activo: !!(info?.codigo_ccp || extras.ccp_activo || info?.ccp_activo),
    enviada_oppm: !!(extras.enviada_oppm || info?.enviada_oppm || row.enviada_oppm),
    orden_id: info?.orden_id ?? extras.orden_id ?? row.orden_id ?? null,
    orden_estado: info?.orden_estado || extras.orden_estado || row.orden_estado || '',
    enviado_proveedor_at: info?.enviado_proveedor_at || extras.enviado_proveedor_at || row.enviado_proveedor_at || null,
    recibido_proveedor_at: info?.recibido_proveedor_at || extras.recibido_proveedor_at || row.recibido_proveedor_at || null,
    derivado_ejecucion_at: info?.derivado_ejecucion_at || extras.derivado_ejecucion_at || row.derivado_ejecucion_at || null,
    orden_resuelta: !!(info?.orden_resuelta || extras.orden_resuelta),
    expediente_derivado_pago: !!(info?.expediente_derivado_pago || extras.expediente_derivado_pago),
  };
  if (evidence.codigo_ccp) evidence.ccp_activo = true;
  return applyEstadoEvidenceToRow(row, evidence);
}

/** Payload estándar post-mutación CCP para el frontend. */
export function buildCcpEstadoResponse(rowLike = {}) {
  const enriched = applyCcpFlagsToRow(rowLike, {
    codigo_ccp: rowLike.codigo_ccp || '',
    orden_estado: rowLike.orden_estado || '',
    enviado_proveedor_at: rowLike.enviado_proveedor_at || null,
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
    estadoVigente: enriched.estadoVigente || {
      codigo: enriched.estado_vigente,
      label: enriched.estado_vigente_label,
    },
    situacion: enriched.situacion || null,
    estadoInterno: enriched.estadoInterno || null,
  };
}

export {
  resolveEstadoExpedienteVigente,
  badgeVisualEstadoVigente,
  loadEstadoExpedienteEvidenceByIds,
};
