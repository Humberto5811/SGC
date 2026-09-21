/**
 * RC8.17.8H6-C1A/B — Cronograma multi-entrega BIENES a nivel REQUERIMIENTO.
 */
import { resolveEntregablesCotizacion } from './entregablesCotizacion.js';
import { unidadMedidaCotizacion } from './proveedorCotizacionConfig.js';

/** Extrae días numéricos de plazo programado (payload o texto). */
export function parsePlazoProgramadoDias(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  const m = s.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

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

/**
 * U.M. del cronograma: solo si todos los ítems del REQ comparten la misma U.M.
 * Si hay U.M. distintas, no se asume UND ni la primera fila del ítem.
 */
export function resolveUnidadMedidaCronogramaRequerimiento(items = []) {
  const ums = [...new Set(
    items.map((it) => unidadMedidaCotizacion(it, 'Bienes')).filter((u) => String(u || '').trim()),
  )];
  if (ums.length === 1) {
    return { unidad_medida: ums[0], display: ums[0], homogenea: true };
  }
  return { unidad_medida: null, display: '—', homogenea: false };
}

export function requerimientoTieneCronogramaProgramado(workspace, requerimientoId) {
  return programadasEntregasBienesRequerimiento(workspace, requerimientoId).length > 0;
}

export function workspaceUsaCronogramaEntregasBienes(workspace) {
  return agruparItemsPorRequerimiento(workspace).some(
    (g) => requerimientoTieneCronogramaProgramado(workspace, g.requerimiento_id),
  );
}

/** Cantidad de requerimiento_id distintos en el workspace de cotización. */
export function cantidadRequerimientosDistintos(workspace) {
  const ids = (workspace?.items || [])
    .map((it) => Number(it.requerimiento_id))
    .filter((n) => Number.isFinite(n));
  return new Set(ids).size;
}

/**
 * Bloque inferior «Cronograma programado» (referencial TDR):
 * omite REQs ya cubiertos por Propuesta de entregas C1;
 * si algún REQ usa C1, no reutiliza el listado global (evita duplicar el primer REQ).
 */
export function filasCronogramaReferencialInferiorBienes(workspace, resolveEntregablesGlobal) {
  const groups = agruparItemsPorRequerimiento(workspace);
  const hayPropuestaC1 = groups.some(
    (g) => requerimientoTieneCronogramaProgramado(workspace, g.requerimiento_id),
  );
  const rows = [];
  for (const grp of groups) {
    if (requerimientoTieneCronogramaProgramado(workspace, grp.requerimiento_id)) continue;
    const programadas = programadasEntregasBienesRequerimiento(workspace, grp.requerimiento_id);
    programadas.forEach((p, i) => {
      rows.push({
        numero: Number(p.numero ?? p.numero_entrega ?? i + 1) || (i + 1),
        nombre: p.descripcion || p.condicion || '',
        descripcion: p.descripcion || p.condicion || '',
        cantidad: p.cantidad,
        unidad_medida: p.unidad_medida,
        plazo_texto: p.plazo_texto ?? p.plazo ?? '',
      });
    });
  }
  if (rows.length) return rows;
  if (hayPropuestaC1) return [];
  return typeof resolveEntregablesGlobal === 'function'
    ? (resolveEntregablesGlobal(workspace) || [])
    : [];
}

/** @deprecated usar requerimientoTieneCronogramaProgramado */
export function itemUsaCronogramaEntregas(workspace, item) {
  return requerimientoTieneCronogramaProgramado(workspace, item?.requerimiento_id);
}

function legacySavedRowsForRequerimiento(prev, requerimientoId, workspace) {
  const rid = String(requerimientoId);
  const porReq = prev.cronogramas_por_requerimiento;
  if (porReq && typeof porReq === 'object') {
    const saved = porReq[rid] ?? porReq[Number(requerimientoId)];
    if (Array.isArray(saved) && saved.length) return saved;
  }
  const porItem = prev.cronogramas_por_item;
  if (porItem && typeof porItem === 'object') {
    const rep = (workspace?.items || []).find((it) => String(it.requerimiento_id) === rid);
    if (rep && Array.isArray(porItem[rep.item_key]) && porItem[rep.item_key].length) {
      return porItem[rep.item_key];
    }
  }
  if (Array.isArray(prev.cronograma_entregas) && prev.cronograma_entregas.length) {
    const nReq = cantidadRequerimientosDistintos(workspace);
    if (nReq === 1) {
      const unicoId = [...new Set(
        (workspace?.items || []).map((it) => String(it.requerimiento_id)),
      )][0];
      if (unicoId != null && String(requerimientoId) === unicoId) {
        return prev.cronograma_entregas;
      }
    }
  }
  return [];
}

/** Construye filas editables fusionando programación + guardado previo. */
export function filasCronogramaDesdeProgramadas(programadas, umInfo, savedRows = []) {
  const byNum = new Map(
    (Array.isArray(savedRows) ? savedRows : []).map((r) => [Number(r.numero_entrega), r]),
  );
  const umDefault = umInfo?.homogenea ? umInfo.unidad_medida : null;
  return programadas.map((p, i) => {
    const numero_entrega = Number(p.numero ?? p.numero_entrega ?? i + 1) || (i + 1);
    const saved = byNum.get(numero_entrega) || {};
    const plazoProg = parsePlazoProgramadoDias(p.plazo_texto ?? p.plazo ?? saved.plazo_programado);
    const umSaved = saved.unidad_medida;
    const umRow = umInfo?.homogenea
      ? (umSaved || umDefault)
      : (umSaved || null);
    return {
      numero_entrega,
      cantidad_requerida: p.cantidad != null && p.cantidad !== ''
        ? Number(p.cantidad)
        : (saved.cantidad_requerida != null ? Number(saved.cantidad_requerida) : null),
      unidad_medida: umRow,
      unidad_medida_display: umInfo?.homogenea ? (umRow || umInfo.display) : (umRow || '—'),
      plazo_programado: plazoProg ?? saved.plazo_programado ?? '',
      condicion: String(p.descripcion || p.condicion || saved.condicion || '').trim(),
      plazo_ofertado: saved.plazo_ofertado != null && saved.plazo_ofertado !== ''
        ? saved.plazo_ofertado
        : '',
    };
  });
}

export function initCronogramaEntregasPorRequerimiento(workspace, propuestaTecnicaPrev = {}) {
  const prev = propuestaTecnicaPrev && typeof propuestaTecnicaPrev === 'object'
    ? propuestaTecnicaPrev
    : {};
  const out = {};
  for (const grp of agruparItemsPorRequerimiento(workspace)) {
    const rid = String(grp.requerimiento_id);
    const programadas = programadasEntregasBienesRequerimiento(workspace, grp.requerimiento_id);
    if (!programadas.length) {
      out[rid] = [];
      continue;
    }
    const umInfo = resolveUnidadMedidaCronogramaRequerimiento(grp.items);
    const saved = legacySavedRowsForRequerimiento(prev, grp.requerimiento_id, workspace);
    out[rid] = filasCronogramaDesdeProgramadas(programadas, umInfo, saved);
  }
  return out;
}

/** @deprecated lectura legacy dev — usar initCronogramaEntregasPorRequerimiento */
export function initCronogramaEntregasPorItem(workspace, prev) {
  return initCronogramaEntregasPorRequerimiento(workspace, prev);
}

export function sumCantidadRequeridaCronograma(filas = []) {
  return (filas || []).reduce((acc, r) => {
    const n = Number(r.cantidad_requerida);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** Solo plazos ofertados; no compara suma vs cantidad de ítem. */
export function validateCronogramaEntregasBienes(filas) {
  const errors = [];
  if (!filas?.length) return errors;
  filas.forEach((r) => {
    const n = Number(r.numero_entrega);
    const plazo = String(r.plazo_ofertado ?? '').trim();
    if (!plazo) errors.push(`Entrega ${n || '?'}: falta plazo ofertado`);
  });
  return errors;
}

export function buildPropuestaTecnicaBienesPayload(formItems, cronogramaEntregasPorRequerimiento) {
  return {
    items: formItems,
    cronogramas_por_requerimiento: { ...(cronogramaEntregasPorRequerimiento || {}) },
  };
}

export function formatPlazoProgramadoLabel(dias) {
  if (dias == null || dias === '') return '—';
  const n = Number(dias);
  if (!Number.isFinite(n)) return String(dias);
  return `${n} día${n === 1 ? '' : 's'}`;
}

export function filasCronogramaParaRequerimiento(cronogramasPorRequerimiento, requerimientoId) {
  const map = cronogramasPorRequerimiento || {};
  return map[String(requerimientoId)] ?? map[Number(requerimientoId)] ?? [];
}
