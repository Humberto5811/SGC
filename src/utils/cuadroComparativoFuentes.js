/**
 * Helpers cliente — segunda fuente Anexo 8A (RC8.3.1).
 * Espejo liviano de server/lib/cuadroComparativoSchema.js (sin import Node).
 */
import { TIPOS_SEGUNDA_FUENTE, labelTipoSegundaFuente } from './cuadroComparativoMatriz.js';

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function calcPrecioActualizado(precioOriginal, factor) {
  const p = toNum(precioOriginal);
  const f = toNum(factor);
  if (p == null || f == null) return null;
  return Math.round(p * f * 100) / 100;
}

export function normalizeSegundaFuente(raw = {}, idx = 0, items = []) {
  const id = raw.id_fuente || raw.id || `sf-${Date.now()}-${idx}`;
  const factorGlobal = toNum(raw.factor_ajuste) ?? 1;
  const precios = {};
  (items || []).forEach((it) => {
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
    precios_por_item: Object.keys(precios).length ? precios : (raw.precios_por_item || {}),
    documentos: Array.isArray(raw.documentos) ? raw.documentos : [],
    informacion_adicional: {
      marca: 'NO APLICA',
      modelo: 'NO APLICA',
      procedencia: 'NO APLICA',
      anio_fabricacion: 'NO APLICA',
      garantia: 'NO APLICA',
      plazo_entrega: 'NO APLICA',
      forma_pago: 'NO APLICA',
      moneda: raw.moneda || 'PEN',
      ...(raw.informacion_adicional || {}),
    },
    acciones_administrativas: raw.acciones_administrativas || {},
    observacion: String(raw.observacion || '').trim(),
    registrado_por: raw.registrado_por || '',
    registrado_at: raw.registrado_at || new Date().toISOString(),
    readonly: false,
  };
}

export { TIPOS_SEGUNDA_FUENTE, labelTipoSegundaFuente };
