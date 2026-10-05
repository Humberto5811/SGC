/**
 * RC8.17.8H6-C3-D8-C3/D — Matriz documental Validaciones (lectura, anclada a cotizacion_id).
 */
import { query } from '../db.js';
import {
  buildManifiestoCotizacion,
  parseCotizacionAnexos,
} from './portalDocumentos.js';
import {
  listItemsCotizados,
  isPortalCotizacionAdjuntoPresentado,
} from '../../shared/cotizacionItemRequisitos.js';
import {
  buildRecepcionMatrizContract,
  prepareCotizacionForListItemsRecepcion,
  filterDocumentosRecepcionTab,
} from '../../shared/recepcionCotizacionMatriz.js';

function parseJson(val, fallback = {}) {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val;
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

function docSolicitadosFromManifiesto(cot) {
  const anexos = parseCotizacionAnexos(cot?.anexos);
  const manif = buildManifiestoCotizacion(cot);
  const docsRows = manif.filter((d) => {
    const ref = String(d.ref || '');
    const grupo = String(d.grupo || '');
    return ref.startsWith('docs-') || grupo === 'Documentos solicitados';
  });
  return docsRows.map((d) => ({
    ref: d.ref,
    nombre: d.nombre || 'Documento',
    disponible: d.disponible !== false && !!(d.adjunto_id || d.ref),
    mime_type: d.mime_type || '',
    grupo: 'Documentos solicitados',
    key: d.key || null,
    adjunto_id: d.adjunto_id || null,
  })).filter((d) => d.ref);
}

function matchItemKey(filaKey, rowKey, cotizacionId) {
  const a = String(filaKey || '');
  const b = String(rowKey || '');
  if (!a || !b) return false;
  if (a === b) return true;
  const pref = `${cotizacionId}:`;
  if (a === `${pref}${b}` || b === `${pref}${a}`) return true;
  if (a.startsWith(pref) && a.slice(pref.length) === b) return true;
  if (b.startsWith(pref) && b.slice(pref.length) === a) return true;
  return false;
}

function findFilaMatrizV2(filas, itemKey, cotizacionId) {
  return (filas || []).find((f) => matchItemKey(f.item_key, itemKey, cotizacionId)) || null;
}

function documentosTecnicosPorItem(recepcionMatriz, itemKey) {
  if (!recepcionMatriz?.contrato_rtm_por_item) {
    return {
      documentos: [],
      legacy_global_rtm: !!recepcionMatriz?.legacy_global_rtm,
    };
  }
  const byReq = recepcionMatriz.requisitos_por_item?.[itemKey] || {};
  const documentos = Object.entries(byReq).map(([reqKey, cell]) => {
    const presentado = !!(cell?.presentado && cell?.ref
      && isPortalCotizacionAdjuntoPresentado(cell));
    return {
      req_key: reqKey,
      requisito: cell?.requisito || reqKey,
      ref: presentado ? cell.ref : null,
      nombre: cell?.nombre || cell?.requisito || reqKey,
      presentado,
      disponible: presentado,
      obligatorio: cell?.obligatorio,
      adjunto_id: cell?.adjunto_id || null,
    };
  }).filter((d) => d.presentado && d.ref);
  return { documentos, legacy_global_rtm: false };
}

/**
 * @param {object} cot — fila cotizaciones_proveedor + join proveedor/SC mínimo
 * @param {object} [opts]
 * @param {object[]} [opts.matriz_v2_filas] — filas matriz validación para enriquecer REQ/descripción
 */
export async function buildMatrizDocumentalValidacion(cot, opts = {}) {
  const cotizacionId = cot.id;
  let scDocs = cot.sc_docs_solicitados;
  let scReqs = cot.sc_requisitos_tecnicos;
  let detalleItems = cot.detalle_items ?? cot.solicitud_detalle_items;
  if (scDocs == null || scReqs == null || detalleItems == null) {
    const { rows } = await query(`
      SELECT detalle_items, docs_solicitados, requisitos_tecnicos
      FROM solicitudes_cotizacion WHERE id = $1 LIMIT 1
    `, [cot.solicitud_id]);
    const sc = rows[0] || {};
    if (detalleItems == null) detalleItems = sc.detalle_items;
    if (scDocs == null) scDocs = sc.docs_solicitados;
    if (scReqs == null) scReqs = sc.requisitos_tecnicos;
  }
  const detalleNorm = parseJson(detalleItems, []);
  const scRequisitos = parseJson(scReqs, []);
  const anexos = parseCotizacionAnexos(cot.anexos);
  const cotInput = prepareCotizacionForListItemsRecepcion({
    ...cot,
    detalle_items: detalleNorm,
    propuesta_tecnica: parseJson(cot.propuesta_tecnica, {}),
    propuesta_economica: parseJson(cot.propuesta_economica, {}),
    anexos,
  });
  const { items, item_keys, precedence } = listItemsCotizados(cotInput, detalleNorm);
  const recepcion_matriz = buildRecepcionMatrizContract(cotInput, {
    requisitos_tecnicos_sc: scRequisitos,
  });
  const manifAll = buildManifiestoCotizacion(cotInput);
  const manifFiltrado = filterDocumentosRecepcionTab(manifAll, recepcion_matriz);
  void manifFiltrado;
  const docsSolicitadosCot = docSolicitadosFromManifiesto(cotInput);
  const matrizFilasV2 = opts.matriz_v2_filas || [];

  const filas = items.map((it) => {
    const itemKey = String(it.item_key || '');
    const recvRow = recepcion_matriz.items?.find((r) => String(r.item_key) === itemKey)
      || recepcion_matriz.items?.find((r) => matchItemKey(r.item_key, itemKey, cotizacionId));
    const filaV2 = findFilaMatrizV2(matrizFilasV2, itemKey, cotizacionId);
    const { documentos: documentos_tecnicos, legacy_global_rtm } = documentosTecnicosPorItem(
      recepcion_matriz,
      itemKey,
    );
    return {
      cotizacion_id: cotizacionId,
      proveedor_id: cot.proveedor_id,
      razon_social: cot.razon_social || '',
      ruc: cot.ruc || '',
      item_key: itemKey,
      requerimiento_id: it.requerimiento_id ?? filaV2?.requerimiento_id ?? cot.requerimiento_id ?? null,
      requerimiento_codigo: recvRow?.requerimiento_codigo
        || it.requerimiento_codigo
        || filaV2?.requerimiento_codigo
        || filaV2?.automaticos?.nro_req
        || '',
      descripcion: recvRow?.descripcion
        || it.descripcion
        || it.denominacion
        || filaV2?.automaticos?.descripcion
        || '',
      documentos_solicitados: docsSolicitadosCot,
      documentos_tecnicos,
      legacy_global_rtm,
    };
  });

  return {
    version: 1,
    cotizacion_id: cotizacionId,
    solicitud_id: cot.solicitud_id,
    proveedor_id: cot.proveedor_id,
    razon_social: cot.razon_social || '',
    list_items_precedence: precedence,
    contrato_rtm_por_item: !!recepcion_matriz.contrato_rtm_por_item,
    legacy_global_rtm: !!recepcion_matriz.legacy_global_rtm,
    item_keys,
    filas,
  };
}

/** Fila + documentos para modal D8-D (una item_key). */
export function sliceMatrizDocumentalFila(matrizDocumental, cotizacionId, itemKey) {
  const md = matrizDocumental || {};
  const fila = (md.filas || []).find((f) => Number(f.cotizacion_id) === Number(cotizacionId)
    && matchItemKey(f.item_key, itemKey, cotizacionId));
  return fila || null;
}
