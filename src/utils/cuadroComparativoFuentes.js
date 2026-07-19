/**
 * Helpers cliente — segunda fuente Anexo 8A (RC8.3.1 / RC8.3.2-B).
 * Espejo liviano de server/lib/cuadroComparativoSchema.js (sin import Node).
 */
import { TIPOS_SEGUNDA_FUENTE, labelTipoSegundaFuente } from './cuadroComparativoMatriz.js';

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function textOrNa(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s === '—' || s === '-' || s.toLowerCase() === 'n/a') return 'NO APLICA';
  return s;
}

export function calcPrecioActualizado(precioOriginal, factor) {
  const p = toNum(precioOriginal);
  const f = toNum(factor);
  if (p == null || f == null) return null;
  return Math.round(p * f * 100) / 100;
}

/** Resuelve ítems afectados por la segunda fuente (requerimiento / item_keys). */
export function resolveItemsAsociadosSegundaFuente(raw = {}, items = []) {
  const all = Array.isArray(items) ? items : [];
  let keys = Array.isArray(raw.item_keys) ? raw.item_keys.filter(Boolean).map(String) : [];
  if (keys.length) {
    return all.filter((it) => keys.includes(String(it.item_key)));
  }
  if (raw.requerimiento_id != null && raw.requerimiento_id !== '') {
    return all.filter((it) => String(it.requerimiento_id) === String(raw.requerimiento_id));
  }
  if (raw.requerimiento_codigo) {
    return all.filter((it) => String(it.requerimiento_codigo || '') === String(raw.requerimiento_codigo));
  }
  // Legacy sin asociación: todos los ítems
  return all;
}

export function normalizeSegundaFuente(raw = {}, idx = 0, items = []) {
  const id = raw.id_fuente || raw.id || `sf-${Date.now()}-${idx}`;
  const factorGlobal = toNum(raw.factor_ajuste) ?? 1;
  const asociados = resolveItemsAsociadosSegundaFuente(raw, items);
  const itemKeys = asociados.map((it) => it.item_key);
  const reqFromItems = asociados[0] || null;
  const precios = {};
  asociados.forEach((it) => {
    const row = (raw.precios_por_item || {})[it.item_key] || {};
    const original = toNum(row.precio_unitario ?? row.precio_original);
    const factor = toNum(row.factor_ajuste) ?? factorGlobal;
    const actualizado = toNum(row.precio_actualizado) ?? calcPrecioActualizado(original, factor);
    const cant = toNum(it.cantidad);
    const total = actualizado != null && cant != null
      ? Math.round(actualizado * cant * 100) / 100
      : null;
    precios[it.item_key] = {
      precio_unitario: original,
      precio_original: original,
      factor_ajuste: factor,
      precio_actualizado: actualizado,
      precio_total: total,
      precio_total_actualizado: total,
      moneda: raw.moneda || 'PEN',
      incompleto: original == null,
    };
  });
  return {
    id_fuente: id,
    id,
    tipo: 'SEGUNDA_FUENTE',
    tipo_fuente: raw.tipo_fuente || 'OTRA',
    tipo_fuente_label: labelTipoSegundaFuente(raw.tipo_fuente || 'OTRA'),
    nro: raw.nro || idx + 1,
    label: raw.label || `Segunda fuente ${idx + 1}`,
    denominacion: String(raw.denominacion || '').trim(),
    entidad: String(raw.entidad || '').trim(),
    ruc: String(raw.ruc || '').trim(),
    referencia: String(raw.referencia || '').trim(),
    anio: raw.anio != null ? String(raw.anio) : '',
    url: String(raw.url || '').trim(),
    fecha_consulta: raw.fecha_consulta || null,
    moneda: raw.moneda || 'PEN',
    factor_ajuste: factorGlobal,
    requerimiento_id: raw.requerimiento_id ?? reqFromItems?.requerimiento_id ?? null,
    requerimiento_codigo: String(
      raw.requerimiento_codigo || reqFromItems?.requerimiento_codigo || ''
    ).trim(),
    item_keys: itemKeys,
    precios_por_item: Object.keys(precios).length ? precios : {},
    documentos: Array.isArray(raw.documentos) ? raw.documentos : [],
    informacion_adicional: {
      marca: textOrNa(raw.informacion_adicional?.marca),
      modelo: textOrNa(raw.informacion_adicional?.modelo),
      procedencia: textOrNa(raw.informacion_adicional?.procedencia),
      anio_fabricacion: textOrNa(raw.informacion_adicional?.anio_fabricacion),
      garantia: textOrNa(raw.informacion_adicional?.garantia),
      plazo_entrega: textOrNa(raw.informacion_adicional?.plazo_entrega),
      forma_pago: textOrNa(raw.informacion_adicional?.forma_pago),
      moneda: String(raw.moneda || raw.informacion_adicional?.moneda || 'PEN').trim() || 'PEN',
    },
    acciones_administrativas: {
      fecha_solicitud: 'NO APLICA',
      reiteraciones: 'NO APLICA',
      fecha_recepcion: 'NO APLICA',
      dedicado_objeto: 'NO APLICA',
      au_participo_rtm: 'NO APLICA',
      cumple_rtm_o_similar: 'NO APLICA',
      tomo_valor_referencial: 'NO APLICA',
    },
    observacion: String(raw.observacion || '').trim(),
    registrado_por: raw.registrado_por || '',
    registrado_at: raw.registrado_at || new Date().toISOString(),
    readonly: false,
  };
}

export { TIPOS_SEGUNDA_FUENTE, labelTipoSegundaFuente };
