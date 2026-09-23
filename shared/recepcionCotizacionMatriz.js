/**
 * RC8.17.8H6-C3-B6 — Contrato recepción: ítems cotizados × RTM (sin DOM/BD).
 */
import {
  normalizeDetalleItemsSc,
  listItemsCotizados,
  listRequisitosConfig,
  lookupRequisitoPorItemAdjunto,
  encodeReqitemManifiestoRef,
  isPortalCotizacionAdjuntoPresentado,
  hasExplicitItemsCotizadosContract,
} from './cotizacionItemRequisitos.js';

function parseJson(val, fallback) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

export function parseCotizacionAnexosRecepcion(val) {
  const parsed = parseJson(val, {});
  if (Array.isArray(parsed)) return {};
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/** Pedido SIGAMEF desde snapshot SC; no sustituir por codigo_sigamef. */
export function formatPedidoSigamefRecepcion(item) {
  const p = item?.pedido_sigamef;
  if (p == null || String(p).trim() === '') return '—';
  return String(p).trim();
}

/**
 * Contrato itemizado B3/B4: señales en cotización (items_cotizados / cotiza),
 * no por existencia de uploads en anexos.requisitos_por_item.
 */
export function usesRecepcionMatrizRtmPorItem(cotizacion) {
  const prepared = prepareCotizacionForListItemsRecepcion(cotizacion || {});
  return hasExplicitItemsCotizadosContract(prepared);
}

/** Misma forma que getCotizacionRecepcionDetalle antes de listItemsCotizados (B1). */
export function prepareCotizacionForListItemsRecepcion(cot) {
  const propTec = parseJson(cot?.propuesta_tecnica, {});
  const propEco = parseJson(cot?.propuesta_economica, {});
  const topItems = cot?.items_cotizados;
  const items_cotizados = topItems != null
    ? topItems
    : (propTec.items_cotizados ?? propEco.items_cotizados ?? undefined);
  return {
    ...cot,
    propuesta_tecnica: propTec,
    propuesta_economica: propEco,
    ...(items_cotizados !== undefined ? { items_cotizados } : {}),
  };
}

export function hasLegacyGlobalRtmRecepcion(cotizacion, anexosParsed = null) {
  const anexos = anexosParsed || parseCotizacionAnexosRecepcion(cotizacion?.anexos);
  const list = anexos.requisitos;
  if (!Array.isArray(list) || !list.length) return false;
  return !usesRecepcionMatrizRtmPorItem(cotizacion);
}

/**
 * @param {object} cot — fila cotizaciones_proveedor + campos enriquecidos opcionales
 * @param {object} [opts]
 * @param {object[]} [opts.requisitos_tecnicos_sc]
 */
export function buildRecepcionMatrizContract(cot, opts = {}) {
  const anexos = parseCotizacionAnexosRecepcion(cot?.anexos);
  const detalleNorm = normalizeDetalleItemsSc(cot?.detalle_items);
  const cotForList = prepareCotizacionForListItemsRecepcion(cot || {});
  const { items: cotizedRows, item_keys: items_cotizados, precedence } = listItemsCotizados(cotForList, detalleNorm);
  const scReqs = opts.requisitos_tecnicos_sc
    ?? cot?.requisitos_tecnicos_sc
    ?? parseJson(cot?.sc_requisitos_tecnicos, []);
  const requisitos_tecnicos_config = listRequisitosConfig(scReqs);

  const propTec = parseJson(cot?.propuesta_tecnica, {});
  const propByKey = {};
  (Array.isArray(propTec.items) ? propTec.items : []).forEach((p, idx) => {
    const k = p?.item_key;
    if (k) propByKey[String(k)] = p;
  });

  const items = cotizedRows.map((det) => {
    const prop = propByKey[String(det.item_key)] || {};
    return {
      item_key: det.item_key,
      sc_ordinal: det.sc_ordinal,
      requerimiento_codigo: det.requerimiento_codigo ?? prop.requerimiento_codigo ?? '',
      pedido_sigamef: formatPedidoSigamefRecepcion(det),
      descripcion: det.descripcion ?? det.denominacion ?? prop.descripcion ?? '',
      cantidad: prop.cantidad_ofertada ?? prop.cantidad ?? det.cantidad,
      marca: prop.marca ?? '',
      modelo: prop.modelo ?? '',
      pais: prop.pais ?? '',
      garantia: prop.garantia ?? '',
      plazo_entrega: prop.plazo_entrega ?? '',
      unidad_medida: det.unidad_medida ?? prop.unidad_medida ?? '',
    };
  });

  const contrato_rtm_por_item = usesRecepcionMatrizRtmPorItem(cotForList);
  const legacy_global_rtm = hasLegacyGlobalRtmRecepcion(cotForList, anexos);

  const requisitos_por_item = {};
  if (contrato_rtm_por_item) {
    items.forEach((row) => {
      requisitos_tecnicos_config.forEach((req) => {
        const entry = lookupRequisitoPorItemAdjunto(anexos, row.item_key, req.req_key);
        const presentado = isPortalCotizacionAdjuntoPresentado(entry);
        const ref = presentado ? encodeReqitemManifiestoRef(row.item_key, req.req_key) : null;
        if (!requisitos_por_item[row.item_key]) requisitos_por_item[row.item_key] = {};
        requisitos_por_item[row.item_key][req.req_key] = {
          presentado,
          ref,
          nombre: entry?.nombre || entry?.nombre_archivo || '',
          mime_type: entry?.mime_type || '',
          adjunto_id: entry?.adjunto_id || null,
          requisito: req.requisito,
          obligatorio: req.obligatorio,
        };
      });
    });
  }

  return {
    items_cotizados,
    items,
    requisitos_tecnicos_config,
    requisitos_por_item,
    contrato_rtm_por_item,
    legacy_global_rtm,
    list_items_precedence: precedence,
  };
}

/** Documentos pestaña: no duplicar RTM itemizado en bloque global. */
export function filterDocumentosRecepcionTab(documentos, recepcionMatriz) {
  const list = Array.isArray(documentos) ? documentos : [];
  if (!recepcionMatriz?.contrato_rtm_por_item) return list;
  return list.filter((d) => !d.rtm_por_item);
}
