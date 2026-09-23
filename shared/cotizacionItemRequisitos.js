/**
 * RC8.17.8H6-C3-B1 — Contrato compartido ítems cotizados × requisitos técnicos (SC).
 * Puro: sin DOM, sin BD. Usable en backend y frontend.
 *
 * Claves alineadas con portal/recepción (misCotizacionesView, cotizacionDocumentosPresentados).
 */

/** Orden de precedencia documentado para listItemsCotizados (mayor prioridad primero). */
export const LIST_ITEMS_COTIZADOS_PRECEDENCE = Object.freeze([
  'EXPLICIT_COTIZA_FLAGS',
  'EXPLICIT_ITEMS_COTIZADOS_ARRAY',
  'LEGACY_PROPUESTA_TECNICA_ITEMS_SUBSET',
  'LEGACY_PROPUESTA_TECNICA_ITEMS_FULL',
  'LEGACY_ALL_DETALLE_ITEMS',
]);

/**
 * Misma fórmula que src/utils/cotizacionDocumentosPresentados.js → docKeySolicitud.
 */
export function docKeySolicitud(d, i) {
  return `doc-${i}-${d.documento || d.archivo || i}`;
}

/**
 * Misma fórmula que src/utils/cotizacionDocumentosPresentados.js → reqKeySolicitud.
 * Identidad estable por índice en la SC + texto del requisito (no nombre de archivo).
 */
export function reqKeySolicitud(r, i) {
  return `req-${i}-${r.requisito || i}`;
}

/** Clave compuesta futura documento RTM por ítem (C3-B+); no persiste en B1. */
export function requisitoItemSlotKey(itemKey, reqKey) {
  const ik = String(itemKey ?? '').trim();
  const rk = String(reqKey ?? '').trim();
  if (!ik || !rk) return '';
  return `${ik}|${rk}`;
}

function parseJson(val, fallback) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  try {
    return JSON.parse(val || 'null') ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function readReqId(item) {
  const id = item?.requerimiento_id ?? item?.requerimientoId;
  if (id == null || id === '') return null;
  const n = Number(id);
  return Number.isFinite(n) ? n : id;
}

function readItemIndex(item, fallbackIndex) {
  if (item?.item_index != null && item?.item_index !== '') {
    const n = Number(item.item_index);
    return Number.isFinite(n) ? n : item.item_index;
  }
  if (fallbackIndex != null) return fallbackIndex;
  return 0;
}

/**
 * Normaliza item_key canónico: `${requerimiento_id}-${item_index}`.
 * Prioridad: item.item_key válido → construcción determinista.
 */
export function normalizeItemKey(item, fallbackIndex = null) {
  const raw = item?.item_key;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).trim();
  }
  const reqId = readReqId(item);
  if (reqId == null) return '';
  const idx = readItemIndex(item, fallbackIndex);
  return `${reqId}-${idx}`;
}

/**
 * Normaliza filas de detalle_items conservando el orden exacto del array SC.
 * Añade sc_ordinal (posición 0-based) e item_key si faltan.
 */
export function normalizeDetalleItemsSc(detalleItems) {
  const list = parseJson(detalleItems, []);
  if (!Array.isArray(list)) return [];
  return list.map((raw, scOrdinal) => {
    const it = raw && typeof raw === 'object' ? { ...raw } : {};
    const item_index = readItemIndex(it, scOrdinal);
    const item_key = normalizeItemKey({ ...it, item_index }, scOrdinal);
    const pedido = it.pedido_sigamef;
    const pedido_sigamef = pedido == null ? '' : String(pedido);
    return {
      ...it,
      item_index,
      item_key,
      sc_ordinal: scOrdinal,
      requerimiento_codigo: it.requerimiento_codigo ?? it.codigo_requerimiento ?? it.codigo ?? '',
      pedido_sigamef,
      codigo_sigamef: it.codigo_sigamef ?? it.codigo_siga ?? '',
    };
  });
}

function extractRequisitosArray(scOrArray) {
  if (Array.isArray(scOrArray)) return scOrArray;
  if (!scOrArray || typeof scOrArray !== 'object') return [];
  const src = scOrArray.requisitos_tecnicos ?? scOrArray.requisitosTecnicos;
  return parseJson(src, []);
}

/**
 * Lista requisitos técnicos configurados en la SC (orden original, sin dedupe).
 */
export function listRequisitosConfig(scOrArray) {
  const list = extractRequisitosArray(scOrArray);
  if (!Array.isArray(list)) return [];
  return list.map((raw, index) => {
    const r = raw && typeof raw === 'object' ? raw : { requisito: String(raw ?? '') };
    const requisito = String(r.requisito ?? r.nombre ?? '').trim();
    let obligatorio = r.obligatorio;
    if (obligatorio === 'NO' || obligatorio === 'No' || obligatorio === 0 || obligatorio === '0') {
      obligatorio = false;
    } else if (obligatorio === 'SI' || obligatorio === 'Si' || obligatorio === 1 || obligatorio === '1') {
      obligatorio = true;
    } else {
      obligatorio = obligatorio !== false;
    }
    const custom = r.custom === true || r.personalizado === true;
    return {
      index,
      req_key: reqKeySolicitud({ requisito }, index),
      requisito,
      obligatorio,
      observacion: String(r.observacion ?? r.comentario ?? '').trim(),
      custom,
      personalizado: custom,
    };
  });
}

function parseCotizacionFields(cotizacion) {
  const cot = cotizacion && typeof cotizacion === 'object' ? cotizacion : {};
  const propTec = parseJson(cot.propuesta_tecnica, {});
  const propEco = parseJson(cot.propuesta_economica, {});
  const propItems = Array.isArray(propTec.items) ? propTec.items : [];
  return { cot, propTec, propEco, propItems };
}

function collectExplicitCotizaKeys(propItems) {
  const hasCotizaField = propItems.some((p) => typeof p?.cotiza === 'boolean');
  if (!hasCotizaField) return { keys: null, mode: null };
  const keys = propItems
    .filter((p) => p?.cotiza === true)
    .map((p, idx) => normalizeItemKey(p, idx))
    .filter(Boolean);
  return { keys, mode: 'EXPLICIT_COTIZA_FLAGS' };
}

function collectExplicitItemsCotizados(cot, propTec, propEco) {
  const raw = cot.items_cotizados
    ?? propTec.items_cotizados
    ?? propEco.items_cotizados
    ?? null;
  if (raw == null) return { keys: null, mode: null };
  const arr = Array.isArray(raw) ? raw : [];
  const keys = arr.map((k) => String(k ?? '').trim()).filter(Boolean);
  return { keys, mode: 'EXPLICIT_ITEMS_COTIZADOS_ARRAY' };
}

function keysFromPropuestaItems(propItems) {
  return propItems
    .map((p, idx) => normalizeItemKey(p, idx))
    .filter(Boolean);
}

function orderKeysByScDetalle(selectedKeys, detalleNorm) {
  const want = new Set(selectedKeys.map(String));
  return detalleNorm
    .filter((row) => want.has(String(row.item_key)))
    .map((row) => ({ ...row }));
}

/**
 * @typedef {object} ListItemsCotizadosResult
 * @property {object[]} items — filas detalle SC (orden original) filtradas a ítems cotizados
 * @property {string} precedence — clave de LIST_ITEMS_COTIZADOS_PRECEDENCE aplicada
 * @property {string[]} item_keys
 */

/**
 * Determina ítems efectivamente cotizados por un proveedor.
 *
 * Precedencia:
 * 1. cotiza === true/false en propuesta_tecnica.items (si existe al menos un cotiza boolean)
 * 2. items_cotizados explícito (cot / propuesta_tecnica / propuesta_economica)
 * 3. Legacy: propuesta_tecnica.items con item_key — subconjunto si no cubre todo el detalle identificable
 * 4. Legacy: propuesta_tecnica.items cubre todas las claves del detalle → todos
 * 5. Legacy: sin señal → todos los detalle_items SC (comportamiento compatible recepción actual)
 *
 * @param {object} cotizacion — fila o payload cotizaciones_proveedor
 * @param {object[]|string} detalleItemsSc — solicitudes_cotizacion.detalle_items
 * @param {object} [opciones]
 * @returns {ListItemsCotizadosResult}
 */
export function listItemsCotizados(cotizacion, detalleItemsSc, opciones = {}) {
  const detalleNorm = normalizeDetalleItemsSc(detalleItemsSc);
  const detalleKeys = new Set(detalleNorm.map((r) => String(r.item_key)));

  const { cot, propItems } = parseCotizacionFields(cotizacion);

  let selectedKeys = null;
  let precedence = 'LEGACY_ALL_DETALLE_ITEMS';

  const cotizaExplicit = collectExplicitCotizaKeys(propItems);
  if (cotizaExplicit.keys != null) {
    selectedKeys = cotizaExplicit.keys;
    precedence = cotizaExplicit.mode;
  }

  if (selectedKeys == null) {
    const arrExplicit = collectExplicitItemsCotizados(cot, parseJson(cot.propuesta_tecnica, {}), parseJson(cot.propuesta_economica, {}));
    if (arrExplicit.keys != null) {
      selectedKeys = arrExplicit.keys;
      precedence = arrExplicit.mode;
    }
  }

  if (selectedKeys == null && propItems.length > 0) {
    const propKeys = keysFromPropuestaItems(propItems);
    const uniqueProp = [...new Set(propKeys)];
    const allDetalleCovered = detalleNorm.length > 0
      && uniqueProp.length === detalleNorm.length
      && detalleNorm.every((row) => uniqueProp.includes(String(row.item_key)));
    const strictSubset = detalleNorm.length > 0
      && uniqueProp.length > 0
      && uniqueProp.length < detalleNorm.length
      && uniqueProp.every((k) => detalleKeys.has(String(k)));

    if (strictSubset || (uniqueProp.length > 0 && !allDetalleCovered && uniqueProp.every((k) => detalleKeys.has(String(k))))) {
      selectedKeys = uniqueProp;
      precedence = 'LEGACY_PROPUESTA_TECNICA_ITEMS_SUBSET';
    } else if (uniqueProp.length > 0 && (allDetalleCovered || opciones.legacyTreatPropItemsAsFull !== false)) {
      selectedKeys = uniqueProp;
      precedence = 'LEGACY_PROPUESTA_TECNICA_ITEMS_FULL';
    }
  }

  if (selectedKeys == null) {
    selectedKeys = detalleNorm.map((r) => r.item_key).filter(Boolean);
    precedence = 'LEGACY_ALL_DETALLE_ITEMS';
  }

  const items = orderKeysByScDetalle(selectedKeys, detalleNorm);

  return {
    items,
    item_keys: items.map((r) => r.item_key),
    precedence,
  };
}

/**
 * Matriz de configuración ítem × requisito (sin documentos presentados).
 * No asocia anexos.requisitos[] globales legacy a ningún ítem.
 *
 * @param {object[]} itemsCotizados — salida de listItemsCotizados().items
 * @param {object[]|object} requisitos — listRequisitosConfig(...) o SC
 */
export function buildItemRequirementMatrix(itemsCotizados, requisitos) {
  const items = Array.isArray(itemsCotizados) ? itemsCotizados : [];
  const reqs = Array.isArray(requisitos) && requisitos[0]?.req_key
    ? requisitos
    : listRequisitosConfig(requisitos);

  return items.map((row) => ({
    item_key: row.item_key,
    sc_ordinal: row.sc_ordinal,
    requerimiento_id: readReqId(row),
    requerimiento_codigo: row.requerimiento_codigo ?? '',
    item_index: row.item_index,
    pedido_sigamef: row.pedido_sigamef ?? '',
    codigo_sigamef: row.codigo_sigamef ?? '',
    descripcion: row.descripcion ?? row.denominacion ?? '',
    requisitos: reqs.map((r) => ({
      req_key: r.req_key,
      requisito: r.requisito,
      obligatorio: r.obligatorio,
      observacion: r.observacion,
      custom: r.custom,
      index: r.index,
    })),
  }));
}

/** Indica si la cotización usa contrato explícito (cotiza o items_cotizados). */
export function hasExplicitItemsCotizadosContract(cotizacion) {
  const { cot, propItems } = parseCotizacionFields(cotizacion);
  if (propItems.some((p) => typeof p?.cotiza === 'boolean')) return true;
  const raw = cot.items_cotizados
    ?? parseJson(cot.propuesta_tecnica, {}).items_cotizados
    ?? parseJson(cot.propuesta_economica, {}).items_cotizados;
  return Array.isArray(raw);
}

/** Alias B2 — snapshot SC listo para persistir (sin BD). */
export function persistDetalleItemsSnapshot(detalleItems) {
  return normalizeDetalleItemsSc(detalleItems);
}

/**
 * Restaura mapa item_key → cotizar (portal B3).
 * Cotización nueva sin borrador → todos true; explícito/legacy vía listItemsCotizados.
 */
export function resolveCotizaByKeyFromCotizacion(workspaceItems, cotizacionExistente = null) {
  const items = Array.isArray(workspaceItems) ? workspaceItems : [];
  const cot = cotizacionExistente && typeof cotizacionExistente === 'object'
    ? cotizacionExistente
    : {};
  const hasDraft = !!(cot.propuesta_tecnica || cot.propuesta_economica || cot.estado);
  const listed = listItemsCotizados(cot, items);
  const cotizaByKey = {};
  items.forEach((it) => {
    const key = normalizeItemKey(it);
    if (!hasDraft) {
      cotizaByKey[key] = true;
    } else {
      cotizaByKey[key] = listed.item_keys.includes(key);
    }
  });
  return { cotizaByKey, listed, hasDraft };
}

export function countItemsCotizadosSeleccionados(cotizaByKey = {}) {
  return Object.values(cotizaByKey).filter((v) => v === true).length;
}

/** @returns {{ ok: boolean, error?: string, count?: number }} */
export function validatePortalCotizacionSelection(cotizaByKey = {}) {
  const count = countItemsCotizadosSeleccionados(cotizaByKey);
  if (count < 1) {
    return { ok: false, error: 'Seleccione al menos un ítem para cotizar' };
  }
  return { ok: true, count };
}

export function sumPreciosItemKeys(precios = {}, itemKeys = []) {
  return (itemKeys || []).reduce((acc, k) => {
    const t = Number(precios?.[k]?.total ?? precios?.[k]?.precio_total ?? 0);
    return acc + (Number.isFinite(t) ? t : 0);
  }, 0);
}

/**
 * Payload parcial B3 — propuesta técnica/económica solo ítems cotizados.
 * items_cotizados en propuesta_tecnica y propuesta_economica (misma lista).
 */
export function buildPortalPartialCotizacionPayload({
  workspaceItems = [],
  formItems = [],
  cotizaByKey = {},
  precios = {},
  entregablesEco = {},
  tipo = 'Bienes',
  extraTecnica = {},
  unidadMedidaFn = null,
}) {
  const um = typeof unidadMedidaFn === 'function'
    ? unidadMedidaFn
    : (it) => it.unidad_medida || it.um || 'UND';

  const selectedPairs = [];
  workspaceItems.forEach((it, idx) => {
    const key = normalizeItemKey(it, idx);
    if (cotizaByKey[key] === true) {
      selectedPairs.push({ ws: { ...it, item_key: key }, form: formItems[idx] || {}, idx });
    }
  });

  const items_cotizados = selectedPairs.map((p) => p.ws.item_key);

  const preciosFiltered = {};
  items_cotizados.forEach((k) => {
    if (precios[k] != null) preciosFiltered[k] = precios[k];
  });

  const entregablesFiltered = {};
  items_cotizados.forEach((k) => {
    if (entregablesEco[k]) entregablesFiltered[k] = entregablesEco[k];
  });

  const propItemsBienes = selectedPairs.map(({ form, ws }) => ({
    ...form,
    item_key: ws.item_key,
    cotiza: true,
  }));

  let propuesta_tecnica;
  if (String(tipo).toLowerCase() === 'bienes') {
    propuesta_tecnica = {
      items: propItemsBienes,
      items_cotizados,
    };
  } else {
    propuesta_tecnica = {
      ...extraTecnica,
      items: selectedPairs.map(({ ws }) => ({
        item_key: ws.item_key,
        cotiza: true,
        requerimiento_codigo: ws.requerimiento_codigo,
        descripcion: ws.descripcion,
        cantidad: ws.cantidad ?? 1,
        unidad_medida: um(ws, tipo),
      })),
      items_cotizados,
    };
  }

  const montoBienes = sumPreciosItemKeys(preciosFiltered, items_cotizados);

  return {
    items_cotizados,
    propuesta_tecnica,
    precios: preciosFiltered,
    entregablesEco: entregablesFiltered,
    montoBienes,
    selectedCount: items_cotizados.length,
  };
}
