/**
 * RC8.17.8H6-C1AB1 — Cronograma solicitado BIENES (referencial por requerimiento).
 * La propuesta del proveedor es plazo_entrega textual por ítem (Anexo 05-A).
 */
import { resolveEntregablesCotizacion } from './entregablesCotizacion.js';

/** Entregas programadas canónicas del payload.entregas del requerimiento (vía entregables_source). */
export function programadasEntregasBienesRequerimiento(workspace, requerimientoId) {
  const rid = Number(requerimientoId);
  const item = (workspace?.items || []).find((it) => Number(it.requerimiento_id) === rid);
  if (!item?.entregables_source) return [];
  return resolveEntregablesCotizacion(item.entregables_source, 'Bienes');
}

export function agruparItemsPorRequerimiento(workspace) {
  const map = new Map();
  for (const it of workspace?.items || []) {
    const key = String(it.requerimiento_id);
    if (!map.has(key)) {
      map.set(key, {
        requerimiento_id: Number(it.requerimiento_id),
        requerimiento_codigo: it.requerimiento_codigo || '',
        items: [],
      });
    }
    map.get(key).items.push(it);
  }
  return [...map.values()];
}

/** Bloques referenciales del cronograma contractual, uno por requerimiento con entregas. */
export function bloquesCronogramaSolicitadoBienes(workspace) {
  return agruparItemsPorRequerimiento(workspace)
    .map((grp) => ({
      requerimiento_id: grp.requerimiento_id,
      requerimiento_codigo: grp.requerimiento_codigo,
      entregas: programadasEntregasBienesRequerimiento(workspace, grp.requerimiento_id),
    }))
    .filter((b) => b.entregas.length > 0);
}

/** Contrato nuevo: solo items[].plazo_entrega (sin cronogramas_por_requerimiento). */
export function buildPropuestaTecnicaBienesPayload(formItems) {
  return { items: formItems };
}
