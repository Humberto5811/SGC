/**
 * Resolución de centro organizacional para bandejas / portal.
 * No usa responsable_actual ni usuario creador.
 * `requerimientos.responsable` sí es centro de área (p. ej. CNCC).
 */
import { esCodigoCmnCentro } from './validacionesCotizacion.js';

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const p = JSON.parse(String(raw));
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch (_) {
    return {};
  }
}

function pickValid(valor, cmnHint = '') {
  const s = String(valor ?? '').trim();
  if (!s || s === '—' || s === '-') return '';
  if (esCodigoCmnCentro(s, cmnHint)) return '';
  return s;
}

/**
 * @param {object} row — fila de requerimiento / ítem / pedido enriquecido
 * @returns {string} texto de centro (p. ej. "CNCC") o ''
 */
export function resolveCentroDisplay(row = {}) {
  const payload = parsePayload(row.payload);
  const areaObj = payload.area && typeof payload.area === 'object' && !Array.isArray(payload.area)
    ? payload.area
    : {};
  const cmnHint = String(row.cmn || payload.cmn || '').trim();

  const candidatos = [
    row.centro_nombre,
    row.centro_display,
    row.centro,
    row.centro_codigo,
    payload.centro_display,
    payload.centro_nombre,
    payload.centro,
    areaObj.centro,
    areaObj.responsable,
    // requerimientos.responsable = centro del área (CNCC), no persona
    row.responsable,
    payload.responsable,
    row.pedido_centro,
    row.catalogo_centro_nombre,
    row.catalogo_centro_codigo,
    row.centro_costo_codigo,
  ];

  for (const c of candidatos) {
    const v = pickValid(c, cmnHint);
    if (v) return v;
  }
  return '';
}

/**
 * Enriquece ítems de detalle_items con centro por requerimiento_id.
 * No pisa un centro ya válido en el ítem.
 */
export function enrichDetalleItemsCentro(items = [], reqById = new Map()) {
  return (Array.isArray(items) ? items : []).map((it) => {
    const existing = resolveCentroDisplay(it);
    if (existing) {
      return { ...it, centro: existing, centro_nombre: existing };
    }
    const req = reqById.get(Number(it.requerimiento_id)) || reqById.get(it.requerimiento_id) || {};
    const centro = resolveCentroDisplay({ ...req, ...it, payload: req.payload ?? it.payload });
    return {
      ...it,
      centro: centro || '',
      centro_nombre: centro || '',
    };
  });
}
