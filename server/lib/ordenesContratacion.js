/**
 * Registro de Órdenes — Contrataciones (núcleo).
 * Independiente del catálogo `ordenes` y del placeholder Ejecución.
 */
import crypto from 'crypto';
import { query } from '../db.js';
import { resolveValidationCentro } from '../../shared/validacionCentro.js';
import {
  resolveEstadoActualExpediente,
  badgeVisualEstadoVigente,
  ESTADOS_ORDEN_LABEL,
  normalizeEstadoOrden,
} from '../../shared/estadoExpedienteVigente.js';
import { calcularFechaMaxima, calcularFechaMaximaEntrega, normalizeTipoDias, toIsoDateString, addOneDay } from './diasPlazo.js';
import { enrichEstadoResponsableForBandeja } from './enrichEstadoResponsable.js';

export const REGLAS_INICIO_PLAZO = Object.freeze({
  INICIO_PLAZO_FECHA_ORDEN: 'INICIO_PLAZO_FECHA_ORDEN',
  INICIO_PLAZO_ENVIO_PROVEEDOR: 'INICIO_PLAZO_ENVIO_PROVEEDOR',
  INICIO_PLAZO_CONFIRMACION_RECEPCION: 'INICIO_PLAZO_CONFIRMACION_RECEPCION',
  INICIO_PLAZO_FECHA_MANUAL: 'INICIO_PLAZO_FECHA_MANUAL',
  INICIO_PLAZO_OTRO_EVENTO: 'INICIO_PLAZO_OTRO_EVENTO',
});

export const ESTADOS_ORDEN = Object.freeze({
  REGISTRO_ORDENES: 'REGISTRO_ORDENES',
  ORDEN_BORRADOR: 'ORDEN_BORRADOR',
  ORDEN_REGISTRADA: 'ORDEN_REGISTRADA',
  CRONOGRAMA_DEFINIDO: 'CRONOGRAMA_DEFINIDO',
  ORDEN_FIRMADA: 'ORDEN_FIRMADA',
  ORDEN_LISTA_NOTIFICACION: 'ORDEN_LISTA_NOTIFICACION',
  ORDEN_ENVIADA: 'ORDEN_ENVIADA',
  ORDEN_ENVIADA_PENDIENTE_CONFIRMACION: 'ORDEN_ENVIADA_PENDIENTE_CONFIRMACION',
  ORDEN_NOTIFICADA: 'ORDEN_NOTIFICADA',
  ORDEN_RECEPCION_CONFIRMADA: 'ORDEN_RECEPCION_CONFIRMADA',
  ORDEN_EN_EJECUCION: 'ORDEN_EN_EJECUCION',
  EN_EJECUCION: 'EN_EJECUCION',
  ORDEN_OBSERVADA: 'ORDEN_OBSERVADA',
  ORDEN_ANULADA: 'ORDEN_ANULADA',
  DERIVADO_EJECUCION: 'DERIVADO_EJECUCION',
  // legacy aliases kept for transitions
  PENDIENTE_CCP_FIRMADO: 'REGISTRO_ORDENES',
  CCP_FIRMADO_RECIBIDO: 'REGISTRO_ORDENES',
  PENDIENTE_REGISTRO_ORDEN: 'REGISTRO_ORDENES',
});

export const CONDICIONES_INICIO = Object.freeze({
  EMISION_ORDEN: 'EMISION_ORDEN',
  DIA_SIGUIENTE_NOTIFICACION: 'DIA_SIGUIENTE_NOTIFICACION',
  SUSCRIPCION_ACTA_INICIO: 'SUSCRIPCION_ACTA_INICIO',
  DIA_SIGUIENTE_ACTA_INICIO: 'DIA_SIGUIENTE_ACTA_INICIO',
  SUSCRIPCION_CONTRATO: 'SUSCRIPCION_CONTRATO',
  DIA_SIGUIENTE_CONTRATO: 'DIA_SIGUIENTE_CONTRATO',
});

export const CONDICIONES_INICIO_LABEL = Object.freeze({
  EMISION_ORDEN: 'A partir de la emisión de la orden',
  DIA_SIGUIENTE_NOTIFICACION: 'Al día siguiente de la notificación de la orden',
  SUSCRIPCION_ACTA_INICIO: 'A partir de la suscripción del acta de inicio',
  DIA_SIGUIENTE_ACTA_INICIO: 'Al día siguiente de suscrita el acta de inicio',
  SUSCRIPCION_CONTRATO: 'A partir de la suscripción del contrato',
  DIA_SIGUIENTE_CONTRATO: 'Al día siguiente de suscrito el contrato',
});

const MONEY_TOL = 0.02;
const PDF_MIME = 'application/pdf';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

function parseJson(raw, fallback = {}) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || 'null') ?? fallback; } catch (_) { return fallback; }
}

export function httpError(message, status = 400, code = 'ORDEN_ERROR') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function moneyEq(a, b, tol = MONEY_TOL) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
}

function qtyEq(a, b, tol = 0.0001) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
}

function stripDataUrl(b64) {
  const s = String(b64 || '');
  const i = s.indexOf('base64,');
  return i >= 0 ? s.slice(i + 7) : s;
}

function assertPdfBase64(base64, nombre) {
  const raw = stripDataUrl(base64);
  if (!raw || raw.length < 20) throw httpError('Archivo PDF inválido o vacío', 400, 'PDF_VACIO');
  const name = String(nombre || '').toLowerCase();
  if (name && !name.endsWith('.pdf')) {
    throw httpError('Solo se aceptan archivos PDF', 400, 'PDF_EXTENSION');
  }
  const approxBytes = Math.floor((raw.length * 3) / 4);
  if (approxBytes > MAX_PDF_BYTES) {
    throw httpError('El PDF supera el tamaño máximo permitido (25 MB)', 400, 'PDF_TAMANO');
  }
  return { base64: raw, bytes: approxBytes };
}

export async function registrarEventoOrden({
  ordenId = null, requerimientoId = null, tipo,
  estadoAnterior = null, estadoNuevo = null,
  usuario = '', rol = '', observacion = '', datos = null,
}) {
  await query(`
    INSERT INTO orden_eventos (
      orden_id, requerimiento_id, tipo_evento, estado_anterior, estado_nuevo,
      usuario_id, rol, observacion, datos_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
  `, [
    ordenId,
    requerimientoId,
    tipo,
    estadoAnterior,
    estadoNuevo,
    String(usuario || '').slice(0, 150),
    String(rol || '').slice(0, 80),
    String(observacion || '').slice(0, 2000) || null,
    datos ? JSON.stringify(datos) : null,
  ]);
}

async function loadPedidos(requerimientoId) {
  const { rows } = await query(`
    SELECT p.id, p.centro, p.centro_costo, p.sec_func, p.fuente_fto, p.especifica,
      p.descripcion, p.codigo_sigamef, p.total_item, p.cant_solicitada,
      p.pedido_sigamef, p.nro_pedido, p.unidad_medida, p.precio_unitario
    FROM requerimiento_pedidos rp
    JOIN pedidos_sigamef p ON p.id = rp.pedido_sigamef_id
    WHERE rp.requerimiento_id = $1
    ORDER BY p.id ASC
  `, [requerimientoId]);
  return rows;
}

/** Enriquece ítems de orden con código / pedido / centro desde pedidos SIGAMEF. */
export async function enrichOrdenItemsConPedidos(items = [], pedidos = []) {
  const { resolveItemPedidoSigamef } = await import('../../shared/ordenCronogramaContractual.js');
  return (items || []).map((it, idx) => {
    const ped = resolveItemPedidoSigamef(it, pedidos, idx);
    return {
      ...it,
      codigo_sigamef: ped.codigo_sigamef,
      codigo: ped.codigo_sigamef,
      pedido_sigamef: ped.pedido_sigamef,
      centro: ped.centro,
      centro_costo: ped.centro_costo,
      especifica: ped.especifica || it.especifica_gasto || it.especifica || null,
      especifica_gasto: ped.especifica || it.especifica_gasto || null,
      unidad_medida: ped.unidad_medida || it.unidad_medida || null,
    };
  });
}


/**
 * Extrae ítems adjudicados del Cuadro Comparativo.
 * Fuente de PU: valor_adjudicado_unitario / oferta del proveedor ganador (NO SIGAMEF ni estimado).
 */
export function extractItemsAdjudicados(cuadroRow, proveedorId) {
  const datos = parseJson(cuadroRow?.datos_json, {});
  const rawItems = Array.isArray(datos.items) ? datos.items
    : (Array.isArray(datos.filas) ? datos.filas
      : (Array.isArray(datos.matriz?.items) ? datos.matriz.items : []));
  const ganadorId = proveedorId ?? cuadroRow?.proveedor_ganador_id ?? null;

  const items = [];
  for (let i = 0; i < rawItems.length; i += 1) {
    const it = rawItems[i] || {};
    const adjId = it.proveedor_adjudicado_id ?? it.adjudicado?.proveedor_id ?? ganadorId ?? null;
    if (proveedorId && adjId != null && Number(adjId) !== Number(proveedorId)) continue;

    const ofertaAdj = (Array.isArray(it.ofertas) ? it.ofertas : [])
      .find((o) => Number(o.proveedor_id) === Number(adjId)) || null;

    const cantidad = Number(
      it.cantidad_adjudicada ?? it.cantidad ?? it.cant
      ?? it.adjudicado?.cantidad ?? ofertaAdj?.cantidad ?? 0,
    );
    // OD37 — precio unitario adjudicado del Cuadro Comparativo
    const pu = Number(
      it.valor_adjudicado_unitario
      ?? it.precio_unitario_adjudicado
      ?? ofertaAdj?.precio_unitario
      ?? it.adjudicado?.precio_unitario
      ?? it.adjudicado?.precio_unitario_adjudicado
      ?? 0,
    );
    let total = Number(
      it.valor_adjudicado_item
      ?? ofertaAdj?.precio_total
      ?? it.adjudicado?.valor_total
      ?? it.precio_total ?? it.total
      ?? NaN,
    );
    if (!Number.isFinite(total) && cantidad > 0 && pu > 0) {
      total = Number((cantidad * pu).toFixed(2));
    }
    if (!(cantidad > 0) && !(total > 0)) continue;

    const plazoTexto = String(
      ofertaAdj?.plazo_entrega
      ?? it.plazo_entrega
      ?? it.plazo_ofertado
      ?? it.plazo
      ?? '',
    ).trim() || null;
    const plazoNumDirect = it.plazo_dias != null ? Number(it.plazo_dias) : NaN;
    const plazoMatch = plazoTexto ? /^(\d+(?:[.,]\d+)?)/.exec(plazoTexto) : null;
    const plazoDias = Number.isFinite(plazoNumDirect)
      ? plazoNumDirect
      : (plazoMatch ? Number(String(plazoMatch[1]).replace(',', '.')) : null);

    const cantFinal = cantidad > 0 ? cantidad : 1;
    const puFinal = pu > 0
      ? pu
      : (total > 0 && cantFinal > 0 ? Number((total / cantFinal).toFixed(4)) : 0);

    items.push({
      item_adjudicado_ref: String(it.item_key || it.id || it.item_id || i + 1),
      descripcion: String(it.descripcion || it.denominacion || it.bien || it.servicio || '').trim() || `Ítem ${i + 1}`,
      unidad_medida: String(it.unidad_medida || it.um || it.unidad || '').trim() || null,
      cantidad: cantFinal,
      precio_unitario: puFinal,
      precio_total: Number((Number.isFinite(total) ? total : cantFinal * puFinal).toFixed(2)),
      moneda: String(ofertaAdj?.moneda || it.moneda || 'PEN'),
      orden_item: i + 1,
      plazo_ofertado: plazoTexto,
      plazo_ofertado_dias: Number.isFinite(plazoDias) ? plazoDias : null,
      observaciones_propuesta: ofertaAdj?.observaciones || it.observaciones || it.obs_propuesta || null,
    });
  }

  if (!items.length && Number(cuadroRow?.valor_adjudicado) > 0) {
    items.push({
      item_adjudicado_ref: '1',
      descripcion: String(datos.objeto || datos.denominacion || 'Ítem adjudicado').trim(),
      unidad_medida: 'UND',
      cantidad: 1,
      precio_unitario: Number(Number(cuadroRow.valor_adjudicado).toFixed(4)),
      precio_total: Number(Number(cuadroRow.valor_adjudicado).toFixed(2)),
      moneda: 'PEN',
      orden_item: 1,
      plazo_ofertado: datos.plazo_ofertado != null ? String(datos.plazo_ofertado) : null,
      plazo_ofertado_dias: (() => {
        const n = Number(datos.plazo_ofertado);
        return Number.isFinite(n) ? n : null;
      })(),
      observaciones_propuesta: null,
    });
  }
  return items;
}

/**
 * Ítems para Locación/sin cuadro — desde propuesta económica de cotización.
 * Obs45: bandeja RO debe incluir Locadores derivados (EN_ORDEN) sin cuadro comparativo.
 */
export function extractItemsDesdePropuestaEconomica(propuestaEconomica, {
  denominacion = '',
  cantidadFallback = 1,
} = {}) {
  const eco = parseJson(propuestaEconomica, {});
  // ÍTEM ≠ ENTREGABLE (RC8.12 Obs.07 punto 4): solo `eco.items` representa ítems
  // contractuales reales. `entregables_cotizados`/`detalle` son hitos de pago/entrega
  // de UN mismo ítem — nunca se explotan en un ítem por entregable.
  const rawItems = Array.isArray(eco?.items) ? eco.items : [];
  const items = [];
  for (let i = 0; i < rawItems.length; i += 1) {
    const it = rawItems[i] || {};
    const cantidad = Number(it.cantidad ?? it.cant ?? cantidadFallback) || 1;
    const pu = Number(
      it.precio_unitario ?? it.pu ?? it.valor_unitario ?? it.precio ?? 0,
    );
    let total = Number(it.precio_total ?? it.total ?? it.monto ?? it.precio ?? NaN);
    if (!Number.isFinite(total) && cantidad > 0 && pu > 0) {
      total = Number((cantidad * pu).toFixed(2));
    }
    if (!(cantidad > 0) && !(total > 0)) continue;
    const cantFinal = cantidad > 0 ? cantidad : 1;
    const puFinal = pu > 0
      ? pu
      : (total > 0 ? Number((total / cantFinal).toFixed(4)) : 0);
    items.push({
      item_adjudicado_ref: String(it.item_key || it.id || it.id_fuente || i + 1),
      descripcion: String(
        it.descripcion || it.nombre || it.denominacion || denominacion || `Ítem ${i + 1}`,
      ).trim(),
      unidad_medida: String(it.unidad_medida || it.um || 'UND').trim() || 'UND',
      cantidad: cantFinal,
      precio_unitario: puFinal,
      precio_total: Number((Number.isFinite(total) ? total : cantFinal * puFinal).toFixed(2)),
      moneda: String(it.moneda || eco.moneda || 'PEN'),
      orden_item: i + 1,
      plazo_ofertado: it.plazo_entrega != null
        ? String(it.plazo_entrega)
        : (it.plazo_texto != null ? String(it.plazo_texto) : null),
      plazo_ofertado_dias: Number.isFinite(Number(it.plazo_dias)) ? Number(it.plazo_dias) : null,
      observaciones_propuesta: it.observaciones || null,
    });
  }
  if (!items.length) {
    // Sin `eco.items`: el portal de cotización de Servicios/Locadores solo captura
    // entregables (ver src/utils/entregablesCotizacion.js), nunca una lista de ítems
    // distinta. Se agrega UN solo ítem contractual con el monto total — nunca uno
    // por entregable — para cualquier N de entregables cotizados.
    const entregables = Array.isArray(eco?.entregables_cotizados) ? eco.entregables_cotizados
      : (Array.isArray(eco?.detalle) ? eco.detalle : []);
    const sumaEntregables = entregables.reduce((acc, it) => {
      const t = Number(it?.precio_total ?? it?.total ?? it?.monto ?? NaN);
      if (Number.isFinite(t)) return acc + t;
      const c = Number(it?.cantidad ?? it?.cant ?? 1) || 1;
      const pu = Number(it?.precio_unitario ?? it?.pu ?? it?.valor_unitario ?? it?.precio ?? 0);
      return acc + (c * pu);
    }, 0);
    const montoDirecto = Number(eco?.monto ?? eco?.total ?? eco?.precio_total ?? NaN);
    const monto = Number.isFinite(montoDirecto) && montoDirecto > 0 ? montoDirecto : sumaEntregables;
    if (Number.isFinite(monto) && monto > 0) {
      const plazoMaxEntregables = entregables.reduce((max, it) => {
        const d = Number(it?.plazo_dias ?? NaN);
        return Number.isFinite(d) && d > max ? d : max;
      }, 0);
      items.push({
        item_adjudicado_ref: '1',
        descripcion: String(eco.descripcion || eco.objeto || denominacion || 'Locación').trim(),
        unidad_medida: 'UND',
        cantidad: 1,
        precio_unitario: Number(monto.toFixed(4)),
        precio_total: Number(monto.toFixed(2)),
        moneda: String(eco.moneda || 'PEN'),
        orden_item: 1,
        plazo_ofertado: eco.plazo_entrega != null ? String(eco.plazo_entrega) : null,
        plazo_ofertado_dias: plazoMaxEntregables > 0
          ? plazoMaxEntregables
          : (Number.isFinite(Number(eco.plazo_dias)) ? Number(eco.plazo_dias) : null),
        observaciones_propuesta: null,
      });
    }
  }
  return items;
}

async function loadProveedor(proveedorId) {
  if (!proveedorId) return null;
  const { rows } = await query(`
    SELECT id, ruc, razon_social, emails, telefono, activo
    FROM proveedores WHERE id = $1
  `, [proveedorId]);
  return rows[0] || null;
}

async function buildContextoFromRow(row, {
  origen = 'CUADRO_COMPARATIVO',
  items = [],
  proveedorId = null,
  montoFallback = 0,
  moneda = 'PEN',
} = {}) {
  const id = row.requerimiento_id;
  const pedidos = await loadPedidos(id);
  const proveedor = await loadProveedor(proveedorId);
  const monto = items.reduce((a, it) => a + Number(it.precio_total || 0), 0)
    || Number(montoFallback || 0);

  const { resolveAreaUsuaria } = await import('../../shared/ordenCronogramaContractual.js');
  const { normalizarTipo, TIPOS_CONTRATACION } = await import('../../shared/workflow/tiposContratacion.js');
  const pl = parseJson(row.payload, {});
  let payloadArea = '';
  if (pl.area && typeof pl.area === 'object') {
    payloadArea = pl.area.nombre || pl.area.label || pl.area.descripcion || '';
  } else {
    payloadArea = pl.area || pl.area_usuaria || pl.area_nombre || '';
  }

  let reqArea = '';
  let solicitudArea = '';
  try {
    const { rows: ra } = await query(`SELECT area FROM requerimientos WHERE id = $1`, [id]);
    reqArea = ra[0]?.area || '';
  } catch (_) { /* ok */ }
  try {
    const { rows: sa } = await query(`
      SELECT sc.area_usuaria
      FROM solicitudes_cotizacion sc
      JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
      WHERE sr.requerimiento_id = $1
      ORDER BY sc.id DESC LIMIT 1
    `, [id]);
    solicitudArea = sa[0]?.area_usuaria || '';
  } catch (_) { /* ok */ }

  const centroRes = resolveValidationCentro({
    pedidoCentro: pedidos[0]?.centro || '',
    requerimientoCentro: pl.centro_display || pl.centro_nombre || pl.centro || '',
    centroCosto: pedidos[0]?.centro_costo || '',
  });

  const areaUsuaria = resolveAreaUsuaria({
    requerimientoArea: reqArea,
    solicitudAreaUsuaria: solicitudArea,
    payloadArea,
    centroCosto: pedidos[0]?.centro_costo || '',
    centro: centroRes.centro || pedidos[0]?.centro || '',
  });

  const tipoCanon = normalizarTipo(row.tipo || row.cuadro_tipo || row.solicitud_tipo || '');
  const esServicio = tipoCanon === TIPOS_CONTRATACION.SERVICIO
    || tipoCanon === TIPOS_CONTRATACION.LOCACION;
  const tipoOrdenSugerido = esServicio ? 'OS' : 'OC';
  const tipoContratacionLabel = tipoCanon === TIPOS_CONTRATACION.LOCACION
    ? 'Locación'
    : (tipoCanon === TIPOS_CONTRATACION.SERVICIO ? 'Servicio' : 'Bien');

  const pedidosNorm = pedidos.map((p) => ({
    id: p.id,
    pedido_sigamef: p.pedido_sigamef || p.nro_pedido || '',
    nro_pedido: p.nro_pedido || '',
    codigo_sigamef: p.codigo_sigamef || '',
    descripcion: p.descripcion || '',
    centro: p.centro || '',
    centro_costo: p.centro_costo || '',
    meta: p.sec_func || '',
    fuente_financiamiento: p.fuente_fto || '',
    especifica_gasto: p.especifica || '',
    especifica: p.especifica || '',
    cantidad: p.cant_solicitada,
    precio_unitario: p.precio_unitario,
    total: p.total_item,
    unidad_medida: p.unidad_medida || '',
  }));
  const pedidosTexto = [...new Set(pedidosNorm.map((p) => p.pedido_sigamef).filter(Boolean))].join(', ');

  const { rows: ordRows } = await query(`
    SELECT id FROM ordenes_contratacion
    WHERE requerimiento_id = $1 AND estado <> 'ORDEN_ANULADA'
    ORDER BY id DESC LIMIT 1
  `, [id]);

  return {
    requerimiento_id: row.requerimiento_id,
    requerimiento_codigo: row.requerimiento_codigo,
    denominacion: row.denominacion || row.objeto || '',
    tipo: row.tipo || '',
    tipo_proceso: tipoCanon,
    tipo_contratacion: tipoContratacionLabel,
    origen_orden: origen,
    solicitud_id: row.solicitud_id,
    solicitud_codigo: row.solicitud_codigo,
    solicitud_estado: row.solicitud_estado,
    cuadro_id: row.cuadro_id || null,
    cuadro_estado: row.cuadro_estado || null,
    monto_adjudicado: Number(Number(monto).toFixed(2)),
    moneda: String(moneda || 'PEN').toUpperCase() || 'PEN',
    proveedor_id: proveedorId || null,
    proveedor_ruc: proveedor?.ruc || '',
    proveedor_razon_social: proveedor?.razon_social || '',
    proveedor_emails: Array.isArray(proveedor?.emails) ? proveedor.emails : [],
    codigo_ccp: row.codigo_ccp || '',
    codigo_id: row.codigo_id || null,
    ccp_activo: !!row.codigo_ccp,
    ccp_firmado_id: row.ccp_firmado_id || null,
    ccp_firmado: !!row.ccp_firmado_id,
    ccp_firmado_nombre: row.ccp_firmado_nombre || '',
    ccp_firmado_version: row.ccp_firmado_version || null,
    ccp_firmado_at: row.ccp_firmado_at || null,
    orden_id: ordRows[0]?.id || null,
    centro: centroRes.centro || '',
    area_usuaria: areaUsuaria,
    pedido_sigamef: pedidosTexto || null,
    pedidos_texto: pedidosTexto || null,
    pedidos: pedidosNorm,
    items_adjudicados: items,
    tipo_orden_sugerido: tipoOrdenSugerido,
    plazo_ofertado_dias: items[0]?.plazo_ofertado_dias ?? null,
    plazo_ofertado: items[0]?.plazo_ofertado ?? null,
  };
}

/**
 * RC8.10.4 — Contexto RO tipo-aware.
 * BIEN/SERVICIO: cuadro DERIVADO_CCP.
 * LOCACION: sin cuadro; evidencia ccp_codigos + cotización presentada.
 */
export async function loadContextoExpediente(requerimientoId) {
  const id = parseInt(requerimientoId, 10);
  if (!Number.isFinite(id)) throw httpError('Requerimiento inválido');

  const { rows: cuadroRows } = await query(`
    SELECT
      r.id AS requerimiento_id, r.codigo AS requerimiento_codigo, r.denominacion,
      r.tipo, r.estado_actual, r.payload,
      sc.id AS solicitud_id, sc.codigo AS solicitud_codigo, sc.estado AS solicitud_estado,
      sc.objeto,
      cc.id AS cuadro_id, cc.estado AS cuadro_estado, cc.valor_adjudicado,
      cc.proveedor_ganador_id, cc.datos_json, cc.tipo AS cuadro_tipo,
      cod.id AS codigo_id, cod.codigo_ccp, cod.estado AS codigo_estado,
      cf.id AS ccp_firmado_id, cf.nombre_archivo AS ccp_firmado_nombre,
      cf.version AS ccp_firmado_version, cf.subido_at AS ccp_firmado_at,
      cf.activo AS ccp_firmado_activo
    FROM requerimientos r
    JOIN solicitud_requerimientos sr ON sr.requerimiento_id = r.id
    JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
    JOIN cuadros_comparativos cc ON cc.solicitud_id = sc.id
      AND UPPER(COALESCE(cc.estado, '')) = 'DERIVADO_CCP'
      AND UPPER(COALESCE(cc.tipo, '')) IN ('BIENES', 'SERVICIOS')
    LEFT JOIN LATERAL (
      SELECT c.* FROM ccp_codigos c
      WHERE c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
      ORDER BY c.id DESC LIMIT 1
    ) cod ON TRUE
    LEFT JOIN LATERAL (
      SELECT f.* FROM ccp_firmados f
      WHERE f.requerimiento_id = r.id AND f.activo = TRUE
      ORDER BY f.version DESC, f.id DESC LIMIT 1
    ) cf ON TRUE
    WHERE r.id = $1
    ORDER BY cc.version DESC NULLS LAST, cc.id DESC
    LIMIT 1
  `, [id]);

  let row = cuadroRows[0] || null;
  let origen = 'CUADRO_COMPARATIVO';
  let items = [];
  let proveedorId = null;
  let montoFallback = 0;
  let moneda = 'PEN';

  if (row) {
    const estadoAct = String(row.estado_actual || '').toUpperCase();
    if (estadoAct === 'ANULADO' || estadoAct.includes('ANUL')) {
      throw httpError('Expediente anulado', 409, 'EXPEDIENTE_ANULADO');
    }
    proveedorId = row.proveedor_ganador_id;
    items = extractItemsAdjudicados(row, proveedorId);
    montoFallback = Number(row.valor_adjudicado || 0);
  } else {
    // LOCACION / sin cuadro — pertenencia por ccp_codigos + cotización
    const { rows: locRows } = await query(`
      SELECT
        r.id AS requerimiento_id, r.codigo AS requerimiento_codigo, r.denominacion,
        r.tipo, r.estado_actual, r.payload,
        sc.id AS solicitud_id, sc.codigo AS solicitud_codigo, sc.estado AS solicitud_estado,
        sc.objeto, sc.tipo AS solicitud_tipo,
        NULL::int AS cuadro_id, NULL::text AS cuadro_estado,
        cot.id AS cotizacion_id, cot.propuesta_economica, cot.proveedor_id AS proveedor_ganador_id,
        cod.id AS codigo_id, cod.codigo_ccp, cod.estado AS codigo_estado,
        cf.id AS ccp_firmado_id, cf.nombre_archivo AS ccp_firmado_nombre,
        cf.version AS ccp_firmado_version, cf.subido_at AS ccp_firmado_at,
        cf.activo AS ccp_firmado_activo
      FROM requerimientos r
      JOIN solicitud_requerimientos sr ON sr.requerimiento_id = r.id
      JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
      LEFT JOIN LATERAL (
        SELECT c.* FROM cotizaciones_proveedor c
        WHERE c.solicitud_id = sc.id AND c.estado = 'COTIZACION_PRESENTADA'
        ORDER BY
          CASE WHEN COALESCE(c.validacion_informe, '{}'::jsonb) ? 'derivacion_ccp' THEN 0 ELSE 1 END,
          c.fecha_presentacion DESC NULLS LAST,
          c.id DESC
        LIMIT 1
      ) cot ON TRUE
      LEFT JOIN LATERAL (
        SELECT c.* FROM ccp_codigos c
        WHERE c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
        ORDER BY c.id DESC LIMIT 1
      ) cod ON TRUE
      LEFT JOIN LATERAL (
        SELECT f.* FROM ccp_firmados f
        WHERE f.requerimiento_id = r.id AND f.activo = TRUE
        ORDER BY f.version DESC, f.id DESC LIMIT 1
      ) cf ON TRUE
      WHERE r.id = $1
        AND cot.id IS NOT NULL
        AND cod.codigo_ccp IS NOT NULL
        AND UPPER(COALESCE(sc.estado, '')) IN ('EN_CCP', 'EN_ORDEN', 'EN_EJECUCION')
      ORDER BY sc.id DESC
      LIMIT 1
    `, [id]);

    if (!locRows.length) {
      throw httpError('Expediente no encontrado o sin pertenencia CCP para Registro de Órdenes', 404);
    }
    row = locRows[0];
    const estadoAct = String(row.estado_actual || '').toUpperCase();
    if (estadoAct === 'ANULADO' || estadoAct.includes('ANUL')) {
      throw httpError('Expediente anulado', 409, 'EXPEDIENTE_ANULADO');
    }
    const { normalizarTipo, TIPOS_CONTRATACION } = await import('../../shared/workflow/tiposContratacion.js');
    const tipoCanon = normalizarTipo(row.tipo || row.solicitud_tipo || '');
    if (tipoCanon !== TIPOS_CONTRATACION.LOCACION) {
      // Sin cuadro y no locación → no hay fuente válida
      throw httpError('Expediente no encontrado o sin cuadro derivado a CCP', 404);
    }
    origen = 'RECEPCION_COTIZACION_LOCACION';
    proveedorId = row.proveedor_ganador_id;
    items = extractItemsDesdePropuestaEconomica(row.propuesta_economica, {
      denominacion: row.denominacion || row.objeto || '',
    });
    const eco = parseJson(row.propuesta_economica, {});
    moneda = String(eco?.moneda || 'PEN').toUpperCase() || 'PEN';
    montoFallback = items.reduce((a, it) => a + Number(it.precio_total || 0), 0);
  }

  return buildContextoFromRow(row, {
    origen,
    items,
    proveedorId,
    montoFallback,
    moneda,
  });
}

/**
 * RC8.10.4 — Resolvedor único de contexto RO (shape canónico).
 */
export async function resolveRegistroOrdenContext(requerimientoId) {
  const ctx = await loadContextoExpediente(requerimientoId);
  let etapaCanonica = '';
  let responsableCanonico = '';
  let estadoCanonico = '';
  try {
    const { getEstadoResponsableCanonico } = await import('./estadoResponsableCanonico.js');
    const map = await getEstadoResponsableCanonico({ requerimientoIds: [ctx.requerimiento_id] });
    const erv = map.get(Number(ctx.requerimiento_id));
    etapaCanonica = erv?.etapaLabel || erv?.etapaCodigo || '';
    estadoCanonico = erv?.estadoLabel || erv?.estadoCodigo || '';
    responsableCanonico = erv?.responsableNombre || erv?.responsableUnidad || '';
  } catch (_) { /* ok */ }

  return {
    requerimientoId: ctx.requerimiento_id,
    tipoProceso: ctx.tipo_proceso || ctx.tipo || '',
    solicitudCotizacionId: ctx.solicitud_id || null,
    cuadroId: ctx.cuadro_id || null,
    codigoCcp: ctx.codigo_ccp || '',
    ccpCodigoId: ctx.codigo_id || null,
    ccpFirmadoId: ctx.ccp_firmado_id || null,
    ordenId: ctx.orden_id || null,
    etapaCanonica,
    estadoCanonico,
    responsableCanonico,
    contexto: ctx,
  };
}

function mapOrdenRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    requerimiento_id: row.requerimiento_id,
    solicitud_cotizacion_id: row.solicitud_cotizacion_id,
    cuadro_comparativo_id: row.cuadro_comparativo_id,
    ccp_codigo_id: row.ccp_codigo_id,
    ccp_firmado_id: row.ccp_firmado_id,
    proveedor_id: row.proveedor_id,
    tipo_orden: row.tipo_orden,
    numero_orden: row.numero_orden,
    anio_orden: row.anio_orden,
    fecha_orden: row.fecha_orden ? (toIsoDateString(row.fecha_orden) || row.fecha_orden) : null,
    moneda: row.moneda,
    monto_total: Number(row.monto_total || 0),
    tipo_contratacion: row.tipo_contratacion,
    regla_inicio_plazo: row.regla_inicio_plazo,
    fecha_base_manual: row.fecha_base_manual,
    observaciones: row.observaciones || '',
    estado: row.estado,
    estado_label: ESTADOS_ORDEN_LABEL[normalizeEstadoOrden(row.estado)]
      || ESTADOS_ORDEN_LABEL[row.estado]
      || row.estado,
    version: row.version,
    cronograma_version: row.cronograma_version,
    creado_por: row.creado_por,
    creado_at: row.creado_at,
    actualizado_por: row.actualizado_por,
    actualizado_at: row.actualizado_at,
    enviado_proveedor_por: row.enviado_proveedor_por,
    enviado_proveedor_at: row.enviado_proveedor_at,
    recibido_proveedor_at: row.recibido_proveedor_at,
    derivado_ejecucion_por: row.derivado_ejecucion_por,
    derivado_ejecucion_at: row.derivado_ejecucion_at,
    anulado_por: row.anulado_por,
    anulado_at: row.anulado_at,
    motivo_anulacion: row.motivo_anulacion,
  };
}

export async function getOrdenById(ordenId) {
  const id = parseInt(ordenId, 10);
  if (!Number.isFinite(id)) throw httpError('Orden inválida');
  const { rows } = await query('SELECT * FROM ordenes_contratacion WHERE id = $1', [id]);
  if (!rows.length) throw httpError('Orden no encontrada', 404);
  return mapOrdenRow(rows[0]);
}

export async function getOrdenItems(ordenId) {
  const { rows } = await query(`
    SELECT * FROM orden_items WHERE orden_id = $1 ORDER BY orden_item ASC, id ASC
  `, [ordenId]);
  return rows.map((r) => ({
    id: r.id,
    orden_id: r.orden_id,
    item_adjudicado_ref: r.item_adjudicado_ref,
    descripcion: r.descripcion,
    unidad_medida: r.unidad_medida,
    cantidad: Number(r.cantidad),
    precio_unitario: Number(r.precio_unitario),
    precio_total: Number(r.precio_total),
    moneda: r.moneda,
    orden_item: r.orden_item,
    meta: r.meta,
    fuente_financiamiento: r.fuente_financiamiento,
    especifica_gasto: r.especifica_gasto,
    plazo_ofertado_dias: r.plazo_ofertado_dias,
    plazo_ofertado: r.plazo_ofertado || null,
    observaciones_propuesta: r.observaciones_propuesta,
  }));
}

export async function listarBandejaOrdenes() {
  // Fuente A — Bienes/Servicios vía Cuadro Comparativo (DERIVADO_CCP).
  const { rows: rowsCuadro } = await query(`
    SELECT
      r.id AS requerimiento_id, r.codigo AS requerimiento_codigo, r.denominacion,
      r.tipo, r.estado_actual, r.payload,
      sc.id AS solicitud_id, sc.codigo AS solicitud_codigo, sc.estado AS solicitud_estado,
      cc.id AS cuadro_id, cc.estado AS cuadro_estado, cc.valor_adjudicado,
      cc.proveedor_ganador_id, cc.datos_json, cc.tipo AS cuadro_tipo,
      NULL::jsonb AS propuesta_economica,
      NULL::int AS cotizacion_id,
      'CUADRO_COMPARATIVO'::text AS origen_orden,
      cod.id AS codigo_id, cod.codigo_ccp,
      cf.id AS ccp_firmado_id, cf.nombre_archivo AS ccp_firmado_nombre,
      cf.version AS ccp_firmado_version, cf.subido_at AS ccp_firmado_at,
      oc.id AS orden_id, oc.tipo_orden, oc.numero_orden, oc.anio_orden,
      oc.fecha_orden, oc.monto_total AS orden_monto, oc.estado AS orden_estado,
      oc.version AS orden_version, oc.enviado_proveedor_at, oc.recibido_proveedor_at,
      oc.derivado_ejecucion_at, oc.regla_inicio_plazo, oc.tipo_contratacion,
      rbe.id AS recepcion_bienes_expediente_id,
      rbe.estado_global AS recepcion_estado_global,
      rbe.estado_interno AS recepcion_estado_interno
    FROM cuadros_comparativos cc
    JOIN solicitudes_cotizacion sc ON sc.id = cc.solicitud_id
    JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    LEFT JOIN LATERAL (
      SELECT c.* FROM ccp_codigos c
      WHERE c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
      ORDER BY c.id DESC LIMIT 1
    ) cod ON TRUE
    LEFT JOIN LATERAL (
      SELECT f.* FROM ccp_firmados f
      WHERE f.requerimiento_id = r.id AND f.activo = TRUE
      ORDER BY f.version DESC, f.id DESC LIMIT 1
    ) cf ON TRUE
    LEFT JOIN LATERAL (
      SELECT o.* FROM ordenes_contratacion o
      WHERE o.requerimiento_id = r.id AND o.estado <> 'ORDEN_ANULADA'
      ORDER BY o.id DESC LIMIT 1
    ) oc ON TRUE
    LEFT JOIN LATERAL (
      SELECT e.id, e.estado_global, e.estado_interno
      FROM recepcion_bienes_expedientes e
      WHERE (oc.id IS NOT NULL AND e.orden_id = oc.id)
         OR e.requerimiento_id = r.id
      ORDER BY e.id DESC
      LIMIT 1
    ) rbe ON TRUE
    WHERE UPPER(COALESCE(cc.estado, '')) = 'DERIVADO_CCP'
      AND UPPER(COALESCE(sc.estado, '')) IN ('EN_CCP', 'EN_CUADRO_COMPARATIVO', 'EN_ORDEN', 'EN_EJECUCION')
      AND cod.codigo_ccp IS NOT NULL
      AND UPPER(COALESCE(r.estado_actual, '')) NOT LIKE '%ANUL%'
    ORDER BY COALESCE(oc.actualizado_at, cf.subido_at, cod.registrado_at) DESC NULLS LAST, r.codigo ASC
  `);

  // Fuente B — Locación (sin cuadro) ya derivada a Registro de Órdenes.
  const { rows: rowsLocacion } = await query(`
    SELECT
      r.id AS requerimiento_id, r.codigo AS requerimiento_codigo, r.denominacion,
      r.tipo, r.estado_actual, r.payload,
      sc.id AS solicitud_id, sc.codigo AS solicitud_codigo, sc.estado AS solicitud_estado,
      NULL::int AS cuadro_id, NULL::text AS cuadro_estado,
      NULL::numeric AS valor_adjudicado,
      cot.proveedor_id AS proveedor_ganador_id,
      NULL::jsonb AS datos_json,
      sc.tipo AS cuadro_tipo,
      cot.propuesta_economica,
      cot.id AS cotizacion_id,
      'RECEPCION_COTIZACION_LOCACION'::text AS origen_orden,
      cod.id AS codigo_id, cod.codigo_ccp,
      cf.id AS ccp_firmado_id, cf.nombre_archivo AS ccp_firmado_nombre,
      cf.version AS ccp_firmado_version, cf.subido_at AS ccp_firmado_at,
      oc.id AS orden_id, oc.tipo_orden, oc.numero_orden, oc.anio_orden,
      oc.fecha_orden, oc.monto_total AS orden_monto, oc.estado AS orden_estado,
      oc.version AS orden_version, oc.enviado_proveedor_at, oc.recibido_proveedor_at,
      oc.derivado_ejecucion_at, oc.regla_inicio_plazo, oc.tipo_contratacion,
      rbe.id AS recepcion_bienes_expediente_id,
      rbe.estado_global AS recepcion_estado_global,
      rbe.estado_interno AS recepcion_estado_interno
    FROM requerimientos r
    JOIN solicitud_requerimientos sr ON sr.requerimiento_id = r.id
    JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
    LEFT JOIN LATERAL (
      SELECT c.* FROM cotizaciones_proveedor c
      WHERE c.solicitud_id = sc.id AND c.estado = 'COTIZACION_PRESENTADA'
      ORDER BY
        CASE WHEN COALESCE(c.validacion_informe, '{}'::jsonb) ? 'derivacion_ccp' THEN 0 ELSE 1 END,
        c.fecha_presentacion DESC NULLS LAST,
        c.id DESC
      LIMIT 1
    ) cot ON TRUE
    LEFT JOIN LATERAL (
      SELECT c.* FROM ccp_codigos c
      WHERE c.requerimiento_id = r.id AND c.estado = 'ACTIVO'
      ORDER BY c.id DESC LIMIT 1
    ) cod ON TRUE
    LEFT JOIN LATERAL (
      SELECT f.* FROM ccp_firmados f
      WHERE f.requerimiento_id = r.id AND f.activo = TRUE
      ORDER BY f.version DESC, f.id DESC LIMIT 1
    ) cf ON TRUE
    LEFT JOIN LATERAL (
      SELECT o.* FROM ordenes_contratacion o
      WHERE o.requerimiento_id = r.id AND o.estado <> 'ORDEN_ANULADA'
      ORDER BY o.id DESC LIMIT 1
    ) oc ON TRUE
    LEFT JOIN LATERAL (
      SELECT e.id, e.estado_global, e.estado_interno
      FROM recepcion_bienes_expedientes e
      WHERE (oc.id IS NOT NULL AND e.orden_id = oc.id)
         OR e.requerimiento_id = r.id
      ORDER BY e.id DESC
      LIMIT 1
    ) rbe ON TRUE
    WHERE UPPER(COALESCE(sc.estado, '')) IN ('EN_ORDEN', 'EN_EJECUCION')
      AND cod.codigo_ccp IS NOT NULL
      AND cot.id IS NOT NULL
      AND UPPER(COALESCE(r.estado_actual, '')) NOT LIKE '%ANUL%'
      AND NOT EXISTS (
        SELECT 1 FROM cuadros_comparativos cc
        WHERE cc.solicitud_id = sc.id
          AND UPPER(COALESCE(cc.estado, '')) = 'DERIVADO_CCP'
          AND UPPER(COALESCE(cc.tipo, '')) IN ('BIENES', 'SERVICIOS')
      )
    ORDER BY COALESCE(oc.actualizado_at, cf.subido_at, cod.registrado_at) DESC NULLS LAST, r.codigo ASC
  `);

  const { normalizarTipo, TIPOS_CONTRATACION } = await import('../../shared/workflow/tiposContratacion.js');
  const rows = [
    ...rowsCuadro,
    ...rowsLocacion.filter((r) => normalizarTipo(r.tipo || r.cuadro_tipo || '') === TIPOS_CONTRATACION.LOCACION),
  ];

  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const key = String(row.requerimiento_id);
    if (seen.has(key)) continue;
    seen.add(key);

    const esLocacion = row.origen_orden === 'RECEPCION_COTIZACION_LOCACION';
    if (!row.proveedor_ganador_id) continue;

    let items = esLocacion
      ? extractItemsDesdePropuestaEconomica(row.propuesta_economica, {
        denominacion: row.denominacion || '',
      })
      : extractItemsAdjudicados(row, row.proveedor_ganador_id);

    const montoAdjSeed = items.reduce((a, it) => a + Number(it.precio_total || 0), 0)
      || Number(row.valor_adjudicado || 0);
    if (!(montoAdjSeed > 0) && !row.orden_id) continue;

    // Incluir pendientes de firmado para poder adjuntar; registrar orden exige firmado
    const pedidos = await loadPedidos(row.requerimiento_id);
    const proveedor = await loadProveedor(row.proveedor_ganador_id);
    if (!esLocacion) {
      items = extractItemsAdjudicados(row, row.proveedor_ganador_id);
    }
    const montoAdj = items.reduce((a, it) => a + Number(it.precio_total || 0), 0)
      || Number(row.valor_adjudicado || 0);

    let nEntregas = 0;
    let fechaMax = null;
    let entregaLabel = null;
    let entregaTooltip = null;
    let entregasResumen = [];
    if (row.orden_id) {
      // placeholder — se completa en batch abajo
    }

    const tipoRaw = String(row.tipo || row.cuadro_tipo || '').toUpperCase();
    const esServicio = esLocacion || /SERVIC/.test(tipoRaw) || /LOCADOR/.test(tipoRaw);

    let estadoCode = ESTADOS_ORDEN.REGISTRO_ORDENES;
    if (row.orden_estado) {
      estadoCode = normalizeEstadoOrden(row.orden_estado) || row.orden_estado;
    }
    // Refinar a lista para notificación solo si checklist completo
    let checklistResumen = null;
    if (row.orden_id && !row.enviado_proveedor_at && !row.recibido_proveedor_at && !row.derivado_ejecucion_at) {
      const { obtenerChecklistOrden } = await import('./ordenesChecklist.js');
      const { checklist } = await obtenerChecklistOrden(row.orden_id);
      checklistResumen = {
        completo: checklist.completo,
        pendientes: checklist.pendientes.map((x) => x.id),
        resumen: checklist.resumen,
      };
      if (checklist.completo
        && !['ORDEN_NOTIFICADA', 'ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION'].includes(estadoCode)) {
        estadoCode = ESTADOS_ORDEN.ORDEN_LISTA_NOTIFICACION;
      } else if (!checklist.completo
        && estadoCode === ESTADOS_ORDEN.ORDEN_LISTA_NOTIFICACION) {
        estadoCode = ESTADOS_ORDEN.ORDEN_REGISTRADA;
      }
    } else if (row.orden_id) {
      checklistResumen = { completo: true, pendientes: [], resumen: 'Etapa posterior a notificación' };
    } else {
      const { obtenerChecklistRequerimiento } = await import('./ordenesChecklist.js');
      const { checklist } = await obtenerChecklistRequerimiento(row.requerimiento_id);
      checklistResumen = {
        completo: checklist.completo,
        pendientes: checklist.pendientes.map((x) => x.id),
        resumen: checklist.resumen,
      };
    }

    const seed = {
      codigo_ccp: row.codigo_ccp,
      ccp_activo: true,
      ccp_firmado: !!row.ccp_firmado_id,
      en_registro_ordenes: true,
      orden_id: row.orden_id || null,
      orden_estado: estadoCode,
      estado_orden: estadoCode,
      derivado_ejecucion_at: row.derivado_ejecucion_at,
      enviado_proveedor_at: row.enviado_proveedor_at,
      recibido_proveedor_at: row.recibido_proveedor_at,
      solicitud_estado: row.solicitud_estado,
      estado_cuadro: row.cuadro_estado,
      // Evidencia Recepción de Bienes (misma fuente que el resto del SGC)
      recepcion_bienes_expediente_id: row.recepcion_bienes_expediente_id || null,
      recepcion_estado_global: row.recepcion_estado_global || null,
      recepcion_estado_interno: row.recepcion_estado_interno || null,
    };
    const vigente = resolveEstadoActualExpediente(seed);
    const badge = badgeVisualEstadoVigente(seed);

    const multi = items.length > 1;
    const cantTotal = items.reduce((a, it) => a + Number(it.cantidad || 0), 0);
    const pu = multi ? null : (items[0]?.precio_unitario ?? null);
    const pt = Number(Number(montoAdj).toFixed(2));

    const pedidosTexto = pedidos.map((p) => p.pedido_sigamef || p.nro_pedido || '').filter(Boolean).join(', ') || '—';
    const codigos = [...new Set(pedidos.map((p) => p.codigo_sigamef).filter(Boolean))];
    const descs = pedidos.map((p) => p.descripcion).filter(Boolean);
    const itemDescs = items.map((it) => it.descripcion).filter(Boolean);

    out.push({
      requerimiento_id: row.requerimiento_id,
      requerimiento_codigo: row.requerimiento_codigo,
      denominacion: row.denominacion || '',
      pedido_sigamef: pedidosTexto,
      codigo_ccp: row.codigo_ccp || '',
      ccp_firmado: !!row.ccp_firmado_id,
      ccp_firmado_id: row.ccp_firmado_id || null,
      ccp_firmado_nombre: row.ccp_firmado_nombre || '',
      proveedor_id: row.proveedor_ganador_id,
      proveedor_ruc: proveedor?.ruc || '',
      proveedor_razon_social: proveedor?.razon_social || '',
      codigo_sigamef: multi
        ? (codigos.length ? `${items.length} ítems` : `${items.length} ítems`)
        : (codigos[0] || pedidos[0]?.codigo_sigamef || '—'),
      codigo_sigamef_tooltip: multi
        ? (codigos.join(' / ') || itemDescs.join(' / '))
        : (codigos[0] || ''),
      item_descripcion: multi
        ? 'Ver detalle'
        : (itemDescs[0] || descs[0] || '—'),
      item_descripcion_tooltip: multi
        ? itemDescs.join('\n')
        : (itemDescs[0] || descs[0] || ''),
      items_detalle: items.map((it, idx) => ({
        descripcion: it.descripcion,
        codigo_sigamef: pedidos[idx]?.codigo_sigamef || pedidos[0]?.codigo_sigamef || null,
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        precio_total: it.precio_total,
      })),
      tipo: esServicio ? 'Servicio' : 'Bien',
      tipo_contratacion: esServicio ? 'Servicio' : 'Bien',
      origen_orden: row.origen_orden || 'CUADRO_COMPARATIVO',
      items_count: items.length,
      items_label: multi ? 'Varios ítems' : (items[0]?.descripcion || '—'),
      cantidad_total: multi ? null : cantTotal,
      cantidad_display: multi ? 'Varios ítems' : String(cantTotal),
      precio_unitario: pu,
      precio_unitario_display: multi ? 'Ver detalle' : null,
      precio_total: pt,
      checklist: checklistResumen,
      checklist_completo: checklistResumen ? !!checklistResumen.completo : false,
      moneda: 'PEN',
      orden_id: row.orden_id || null,
      tipo_orden: row.tipo_orden || null,
      numero_orden: row.numero_orden || '',
      fecha_orden: row.fecha_orden || null,
      entregas_count: nEntregas,
      entrega_label: entregaLabel,
      entrega_tooltip: entregaTooltip,
      entregas_resumen: entregasResumen,
      fecha_envio_proveedor: row.enviado_proveedor_at || null,
      fecha_notificacion: null, // se completa en batch con fuente canónica
      fecha_recepcion_confirmada: row.recibido_proveedor_at || null,
      plazo_entrega: null,
      plazo_entrega_label: null,
      fecha_maxima_entrega: fechaMax,
      estado: vigente.code || estadoCode,
      estado_label: vigente.label || ESTADOS_ORDEN_LABEL[estadoCode] || estadoCode,
      orden_estado: estadoCode,
      recepcion_bienes_expediente_id: row.recepcion_bienes_expediente_id || null,
      recepcion_estado_global: row.recepcion_estado_global || null,
      recepcion_estado_interno: row.recepcion_estado_interno || null,
      estadoVigente: vigente.estadoVigente || {
        codigo: vigente.codigo || vigente.code,
        label: vigente.label,
        etapa: vigente.etapa || vigente.workflowEtapa,
        prioridad: vigente.prioridad,
      },
      situacion: vigente.situacion
        ? { codigo: vigente.situacion.codigo, label: vigente.situacion.label }
        : null,
      estadoInterno: vigente.estadoInterno || null,
      estado_vigente: vigente.codigo || vigente.code,
      estado_vigente_label: vigente.label,
      badge_color: badge.color,
      badge_style: badge.style,
      en_registro_ordenes: true,
      solicitud_id: row.solicitud_id,
      solicitud_codigo: row.solicitud_codigo,
      cuadro_id: row.cuadro_id,
      centro: resolveValidationCentro({
        pedidoCentro: pedidos[0]?.centro || '',
        requerimientoCentro: (() => {
          const pl = parseJson(row.payload, {});
          return pl.centro_display || pl.centro_nombre || pl.centro || '';
        })(),
        centroCosto: pedidos[0]?.centro_costo || '',
      }).centro || '',
    });
  }

  // Batch entregas contractuales + notificación canónica (evita N+1)
  const ordenIds = [...new Set(out.map((r) => r.orden_id).filter(Boolean))];
  if (ordenIds.length) {
    const {
      formatEntregasBandejaLabel,
      buildEntregaContract,
    } = await import('../../shared/entregaContractual.js');
    const {
      resolveOrdenFechaNotificacion,
      resolveOrdenCronogramaContractual,
      resolveOrdenPlazoContractual,
      formatPlazoLabel,
    } = await import('../../shared/ordenCronogramaContractual.js');

    let entRows = [];
    try {
      const r = await query(`
        SELECT id, orden_id, numero_entrega, tipo_entrega, descripcion,
          etiqueta_entrega, codigo_entrega, dias_plazo, fecha_maxima, fecha_base,
          importe, lugar_entrega, evento_inicio_plazo
        FROM orden_entregas
        WHERE orden_id = ANY($1::int[]) AND estado <> 'ANULADO'
        ORDER BY orden_id, numero_entrega, id
      `, [ordenIds]);
      entRows = r.rows;
    } catch (_) {
      const r = await query(`
        SELECT id, orden_id, numero_entrega, tipo_entrega, descripcion,
          NULL::text AS etiqueta_entrega, NULL::text AS codigo_entrega,
          dias_plazo, fecha_maxima, fecha_base, importe, lugar_entrega, evento_inicio_plazo
        FROM orden_entregas
        WHERE orden_id = ANY($1::int[]) AND estado <> 'ANULADO'
        ORDER BY orden_id, numero_entrega, id
      `, [ordenIds]);
      entRows = r.rows;
    }

    const { rows: envRows } = await query(`
      SELECT id, orden_id, enviado_at, estado, intento, correo_destino
      FROM orden_envios_proveedor
      WHERE orden_id = ANY($1::int[])
      ORDER BY orden_id, enviado_at ASC NULLS LAST, id ASC
    `, [ordenIds]).catch(() => ({ rows: [] }));

    const { rows: ordExtra } = await query(`
      SELECT id, fecha_orden, enviado_proveedor_at, condicion_inicio, fecha_evento_inicio
      FROM ordenes_contratacion WHERE id = ANY($1::int[])
    `, [ordenIds]);

    const byOrden = new Map();
    for (const e of entRows) {
      const oid = Number(e.orden_id);
      if (!byOrden.has(oid)) byOrden.set(oid, []);
      byOrden.get(oid).push(e);
    }
    const envByOrden = new Map();
    for (const e of envRows) {
      const oid = Number(e.orden_id);
      if (!envByOrden.has(oid)) envByOrden.set(oid, []);
      envByOrden.get(oid).push(e);
    }
    const ordMap = new Map(ordExtra.map((o) => [Number(o.id), o]));

    for (const row of out) {
      if (!row.orden_id) continue;
      const oid = Number(row.orden_id);
      const list = byOrden.get(oid) || [];
      const fmt = formatEntregasBandejaLabel(list);
      row.entregas_count = fmt.count;
      row.entrega_label = fmt.label;
      row.entrega_tooltip = fmt.tooltip;
      row.entregas_resumen = list.map((e) => buildEntregaContract(e, { totalEntregas: list.length }));
      // RC8.13.1 Obs.49 — plazo total de la orden = máximo contractual entre entregables
      // (regla RC8.12: resolveOrdenPlazoContractual), no la suma ni el de la primera entrega.
      row.plazo_total_orden = resolveOrdenPlazoContractual(list);
      row.plazo_total_orden_label = formatPlazoLabel(row.plazo_total_orden);

      const oc = ordMap.get(oid) || {};
      const envios = envByOrden.get(oid) || [];
      const notif = resolveOrdenFechaNotificacion({
        ...oc,
        enviado_proveedor_at: oc.enviado_proveedor_at || row.fecha_envio_proveedor,
      }, envios);
      row.fecha_notificacion = notif.fechaNotificacion;
      row.fecha_notificacion_fuente = notif.fuente;
      row.fecha_envio_proveedor = notif.fechaNotificacionAt || row.fecha_envio_proveedor;

      const first = list[0] || {};
      const cron = resolveOrdenCronogramaContractual({
        fecha_orden: oc.fecha_orden || row.fecha_orden,
        enviado_proveedor_at: notif.fechaNotificacionAt || oc.enviado_proveedor_at,
        condicion_inicio: oc.condicion_inicio,
        fecha_evento_inicio: oc.fecha_evento_inicio,
      }, first, { envios, totalEntregas: list.length });

      row.plazo_entrega = cron.plazoEntrega ?? first.dias_plazo ?? null;
      row.plazo_entrega_label = formatPlazoLabel(row.plazo_entrega);
      row.condicion_inicio = cron.condicionInicio;
      row.condicion_inicio_label = cron.condicionLabel;
      row.fecha_efectiva_inicio = cron.fechaEfectiva;
      row.fecha_maxima_entrega = cron.fechaMaxima
        || (list.map((e) => e.fecha_maxima).filter(Boolean).map((d) => String(d).slice(0, 10)).sort().pop() || null);
    }
  }

  // RC8.4E — anexar estado_responsable_vigente en batch
  await enrichEstadoResponsableForBandeja(out, 'requerimiento_id');

  return out;
}

export async function adjuntarCcpFirmado(requerimientoId, payload, usuario, rol) {
  const ctx = await loadContextoExpediente(requerimientoId);
  if (!ctx.ccp_activo || !ctx.codigo_ccp) {
    throw httpError('Debe existir un CCP activo antes de adjuntar el firmado', 409, 'CCP_REQUERIDO');
  }
  const pdf = assertPdfBase64(payload.base64 || payload.contenido_base64 || payload.contenido, payload.nombre_archivo || payload.nombre);
  const nombre = String(payload.nombre_archivo || payload.nombre || 'CCP-firmado.pdf').slice(0, 300);

  const { rows: prev } = await query(`
    SELECT id, version FROM ccp_firmados
    WHERE requerimiento_id = $1 AND activo = TRUE
    ORDER BY version DESC LIMIT 1
  `, [ctx.requerimiento_id]);

  if (prev.length) {
    await query(`UPDATE ccp_firmados SET activo = FALSE, updated_at = NOW() WHERE id = $1`, [prev[0].id]);
  }
  const version = (prev[0]?.version || 0) + 1;

  const { rows } = await query(`
    INSERT INTO ccp_firmados (
      requerimiento_id, ccp_codigo_id, codigo_ccp,
      expediente_sgd_envio, fecha_envio_oppm, expediente_sgd_retorno, fecha_retorno,
      nombre_archivo, mime_type, contenido_base64, version, activo, subido_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12)
    RETURNING id, version, nombre_archivo, subido_at, codigo_ccp
  `, [
    ctx.requerimiento_id,
    ctx.codigo_id,
    ctx.codigo_ccp,
    String(payload.expediente_sgd_envio || '').slice(0, 120) || null,
    payload.fecha_envio_oppm || null,
    String(payload.expediente_sgd_retorno || '').slice(0, 120) || null,
    payload.fecha_retorno || null,
    nombre,
    PDF_MIME,
    pdf.base64,
    version,
    String(usuario || '').slice(0, 150),
  ]);

  await registrarEventoOrden({
    requerimientoId: ctx.requerimiento_id,
    tipo: 'CCP_FIRMADO_ADJUNTADO',
    estadoAnterior: prev.length ? 'REGISTRO_ORDENES' : 'REGISTRO_ORDENES',
    estadoNuevo: 'REGISTRO_ORDENES',
    usuario,
    rol,
    observacion: `Versión ${version}: ${nombre}`,
    datos: {
      ccp_firmado_id: rows[0].id,
      expediente_sgd_envio: payload.expediente_sgd_envio || null,
      expediente_sgd_retorno: payload.expediente_sgd_retorno || null,
    },
  });

  return {
    id: rows[0].id,
    version: rows[0].version,
    nombre_archivo: rows[0].nombre_archivo,
    subido_at: rows[0].subido_at,
    codigo_ccp: rows[0].codigo_ccp,
    estado: ESTADOS_ORDEN.REGISTRO_ORDENES,
  };
}

export async function eliminarCcpFirmado(requerimientoId, { motivo = '', usuario = '', rol = '' } = {}) {
  const reqId = parseInt(requerimientoId, 10);
  if (!Number.isFinite(reqId)) throw httpError('Requerimiento inválido');

  const { rows: ordenes } = await query(`
    SELECT id, estado, enviado_proveedor_at FROM ordenes_contratacion
    WHERE requerimiento_id = $1 AND estado <> 'ORDEN_ANULADA'
    LIMIT 1
  `, [reqId]);
  if (ordenes.length && ordenes[0].enviado_proveedor_at) {
    throw httpError(
      'No se puede eliminar el CCP firmado: ya fue usado en una notificación. Requiere reapertura formal.',
      409,
      'CCP_EN_USO',
    );
  }
  if (ordenes.length) {
    throw httpError('No se puede eliminar el CCP firmado mientras exista una orden activa', 409, 'ORDEN_EXISTENTE');
  }

  const activo = await getCcpFirmadoActivo(reqId);
  if (!activo) throw httpError('No hay CCP firmado activo', 404);

  const m = String(motivo || '').trim();
  if (!m) throw httpError('Indique el motivo de eliminación', 400, 'MOTIVO_REQUERIDO');

  await query(`
    UPDATE ccp_firmados SET activo = FALSE, updated_at = NOW() WHERE id = $1
  `, [activo.id]);

  await registrarEventoOrden({
    requerimientoId: reqId,
    tipo: 'CCP_FIRMADO_ELIMINADO',
    estadoAnterior: 'REGISTRO_ORDENES',
    estadoNuevo: 'REGISTRO_ORDENES',
    usuario,
    rol,
    observacion: m,
    datos: { ccp_firmado_id: activo.id, version: activo.version },
  });

  return { ok: true, id: activo.id };
}

function addOneDayLocal(isoDate) {
  return addOneDay(isoDate);
}

export function calcularFechasInicioActividad(input = {}) {
  const condicion = input.condicion || input.condicion_inicio;
  const fechaOrden = input.fechaOrden || input.fecha_orden;
  const fechaNotificacion = input.fechaNotificacion || input.fecha_notificacion;
  const fechaManual = input.fechaManual || input.fecha_manual || input.fecha_evento;
  const tipoDias = input.tipoDias || input.tipo_dias || 'calendario';
  const diasPlazo = input.diasPlazo != null ? input.diasPlazo : (input.dias_plazo || 0);
  // allowPending: permite registrar la condición antes de que exista la fecha (p.ej. notificación)
  const allowPending = input.allowPending === true || input.allow_pending === true;

  const cond = String(condicion || '').toUpperCase();
  if (!CONDICIONES_INICIO[cond]) {
    throw httpError('Condición de inicio de actividad inválida', 400, 'CONDICION_INVALIDA');
  }
  let fechaEvento = null;
  let fechaEfectiva = null;
  let pendiente = false;
  let pendienteMotivo = null;

  if (cond === CONDICIONES_INICIO.EMISION_ORDEN) {
    fechaEvento = toIsoDateString(fechaOrden);
    if (!fechaEvento) throw httpError('Se requiere la fecha de la orden', 400);
    fechaEfectiva = fechaEvento;
  } else if (cond === CONDICIONES_INICIO.DIA_SIGUIENTE_NOTIFICACION) {
    fechaEvento = toIsoDateString(fechaNotificacion);
    if (!fechaEvento) {
      if (!allowPending) throw httpError('Se requiere la fecha de notificación', 400);
      pendiente = true;
      pendienteMotivo = 'Las fechas se calcularán automáticamente al notificar la orden al proveedor.';
    } else {
      fechaEfectiva = addOneDayLocal(fechaEvento);
    }
  } else if (cond === CONDICIONES_INICIO.SUSCRIPCION_ACTA_INICIO
    || cond === CONDICIONES_INICIO.SUSCRIPCION_CONTRATO) {
    fechaEvento = toIsoDateString(fechaManual);
    if (!fechaEvento) throw httpError('Indique la fecha del acta o contrato', 400);
    fechaEfectiva = fechaEvento;
  } else if (cond === CONDICIONES_INICIO.DIA_SIGUIENTE_ACTA_INICIO
    || cond === CONDICIONES_INICIO.DIA_SIGUIENTE_CONTRATO) {
    fechaEvento = toIsoDateString(fechaManual);
    if (!fechaEvento) throw httpError('Indique la fecha del acta o contrato', 400);
    fechaEfectiva = addOneDayLocal(fechaEvento);
  }

  const fechaMaxima = fechaEfectiva
    ? calcularFechaMaxima(fechaEfectiva, diasPlazo, normalizeTipoDias(tipoDias))
    : null;

  return {
    condicion_inicio: cond,
    condicion_label: CONDICIONES_INICIO_LABEL[cond],
    fecha_evento: fechaEvento,
    fecha_efectiva_inicio: fechaEfectiva,
    tipo_dias: normalizeTipoDias(tipoDias),
    dias_plazo: Number(diasPlazo) || 0,
    fecha_maxima: fechaMaxima,
    pendiente,
    pendiente_motivo: pendienteMotivo,
  };
}

export async function guardarInicioActividad(payload, usuario, rol) {
  const reqId = parseInt(payload.requerimiento_id, 10);
  const ordenId = payload.orden_id != null ? parseInt(payload.orden_id, 10) : null;
  if (!Number.isFinite(reqId)) throw httpError('Requerimiento inválido');

  let orden = null;
  if (Number.isFinite(ordenId)) orden = await getOrdenById(ordenId);

  const calc = calcularFechasInicioActividad({
    condicion: payload.condicion_inicio,
    fechaOrden: orden?.fecha_orden || payload.fecha_orden,
    fechaNotificacion: orden?.enviado_proveedor_at || payload.fecha_notificacion,
    fechaManual: payload.fecha_manual || payload.fecha_evento,
    tipoDias: payload.tipo_dias || 'calendario',
    diasPlazo: payload.dias_plazo || 0,
    // La notificación ocurre después; se puede configurar la condición sin fecha aún
    allowPending: true,
  });

  const { rows: existing } = await query(`
    SELECT id FROM orden_inicio_actividad
    WHERE (${Number.isFinite(ordenId) ? 'orden_id = $1' : 'requerimiento_id = $1 AND orden_id IS NULL'})
    LIMIT 1
  `, [Number.isFinite(ordenId) ? ordenId : reqId]);

  let row;
  if (existing.length) {
    const { rows } = await query(`
      UPDATE orden_inicio_actividad SET
        condicion_inicio = $2, fecha_evento = $3, fecha_efectiva_inicio = $4,
        tipo_dias = $5, sustento = $6, actualizado_por = $7, actualizado_at = NOW(),
        orden_id = COALESCE($8, orden_id)
      WHERE id = $1
      RETURNING *
    `, [
      existing[0].id, calc.condicion_inicio, calc.fecha_evento, calc.fecha_efectiva_inicio,
      calc.tipo_dias, String(payload.sustento || '').slice(0, 2000) || null,
      String(usuario || '').slice(0, 150),
      Number.isFinite(ordenId) ? ordenId : null,
    ]);
    row = rows[0];
  } else {
    const { rows } = await query(`
      INSERT INTO orden_inicio_actividad (
        orden_id, requerimiento_id, condicion_inicio, fecha_evento, fecha_efectiva_inicio,
        tipo_dias, sustento, creado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      Number.isFinite(ordenId) ? ordenId : null,
      reqId,
      calc.condicion_inicio,
      calc.fecha_evento,
      calc.fecha_efectiva_inicio,
      calc.tipo_dias,
      String(payload.sustento || '').slice(0, 2000) || null,
      String(usuario || '').slice(0, 150),
    ]);
    row = rows[0];
  }

  if (Number.isFinite(ordenId)) {
    await query(`
      UPDATE ordenes_contratacion SET
        condicion_inicio = $2, fecha_evento_inicio = $3, fecha_efectiva_inicio = $4,
        actualizado_por = $5, actualizado_at = NOW()
      WHERE id = $1
    `, [ordenId, calc.condicion_inicio, calc.fecha_evento, calc.fecha_efectiva_inicio, String(usuario || '').slice(0, 150)]);

    // Recalcular fechas máximas solo cuando ya existe fecha efectiva (p.ej. no pendiente de notificación)
    if (calc.fecha_efectiva_inicio) {
      const { rows: entregas } = await query(`
        SELECT id, dias_plazo, tipo_dias FROM orden_entregas
        WHERE orden_id = $1 AND estado <> 'ANULADO'
      `, [ordenId]);
      for (const e of entregas) {
        const fm = calcularFechaMaxima(calc.fecha_efectiva_inicio, e.dias_plazo, normalizeTipoDias(e.tipo_dias));
        await query(`
          UPDATE orden_entregas SET fecha_base = $2, fecha_maxima = $3, updated_at = NOW() WHERE id = $1
        `, [e.id, calc.fecha_efectiva_inicio, fm]);
      }
    }
  }

  await registrarEventoOrden({
    ordenId: Number.isFinite(ordenId) ? ordenId : null,
    requerimientoId: reqId,
    tipo: 'INICIO_ACTIVIDAD_DEFINIDO',
    usuario,
    rol,
    observacion: calc.condicion_label,
    datos: calc,
  });

    if (Number.isFinite(ordenId)) {
    const { sincronizarEstadoSegunChecklist } = await import('./ordenesChecklist.js');
    await sincronizarEstadoSegunChecklist(ordenId, usuario);
  }
  return { ...calc, id: row.id };
}


/** Completa fechas de inicio de actividad cuando ya existe la notificación. */
export async function aplicarFechasInicioTrasNotificacion(ordenId, usuario = '') {
  const orden = await getOrdenById(ordenId);
  if (!orden.enviado_proveedor_at) return null;
  const { rows: ini } = await query(`
    SELECT * FROM orden_inicio_actividad
    WHERE orden_id = $1
    ORDER BY id DESC LIMIT 1
  `, [ordenId]);
  if (!ini.length) return null;
  const row = ini[0];
  if (String(row.condicion_inicio || '').toUpperCase() !== CONDICIONES_INICIO.DIA_SIGUIENTE_NOTIFICACION) {
    return row;
  }
  const calc = calcularFechasInicioActividad({
    condicion: row.condicion_inicio,
    fechaOrden: orden.fecha_orden,
    fechaNotificacion: orden.enviado_proveedor_at,
    tipoDias: row.tipo_dias || 'calendario',
    diasPlazo: 0,
    allowPending: false,
  });
  await query(`
    UPDATE orden_inicio_actividad SET
      fecha_evento = $2, fecha_efectiva_inicio = $3,
      actualizado_por = $4, actualizado_at = NOW()
    WHERE id = $1
  `, [row.id, calc.fecha_evento, calc.fecha_efectiva_inicio, String(usuario || '').slice(0, 150)]);
  await query(`
    UPDATE ordenes_contratacion SET
      fecha_evento_inicio = $2, fecha_efectiva_inicio = $3,
      actualizado_por = $4, actualizado_at = NOW()
    WHERE id = $1
  `, [ordenId, calc.fecha_evento, calc.fecha_efectiva_inicio, String(usuario || '').slice(0, 150)]);

  const { rows: entregas } = await query(`
    SELECT id, dias_plazo, tipo_dias FROM orden_entregas
    WHERE orden_id = $1 AND estado <> 'ANULADO'
  `, [ordenId]);
  for (const e of entregas) {
    const fm = calcularFechaMaxima(calc.fecha_efectiva_inicio, e.dias_plazo, normalizeTipoDias(e.tipo_dias));
    await query(`
      UPDATE orden_entregas SET
        fecha_base = $2, fecha_maxima = $3,
        evento_inicio_plazo = COALESCE(evento_inicio_plazo, $4),
        updated_at = NOW()
      WHERE id = $1
    `, [e.id, calc.fecha_efectiva_inicio, fm, calc.condicion_inicio]);
  }
  return calc;
}

export async function getInicioActividad({ ordenId = null, requerimientoId = null } = {}) {
  if (ordenId) {
    const { rows } = await query(`
      SELECT * FROM orden_inicio_actividad WHERE orden_id = $1 ORDER BY id DESC LIMIT 1
    `, [ordenId]);
    return rows[0] || null;
  }
  if (requerimientoId) {
    const { rows } = await query(`
      SELECT * FROM orden_inicio_actividad
      WHERE requerimiento_id = $1
      ORDER BY id DESC LIMIT 1
    `, [requerimientoId]);
    return rows[0] || null;
  }
  return null;
}

export async function getCcpFirmadoActivo(requerimientoId, { includeContent = false } = {}) {
  const { rows } = await query(`
    SELECT id, requerimiento_id, ccp_codigo_id, codigo_ccp,
      expediente_sgd_envio, fecha_envio_oppm, expediente_sgd_retorno, fecha_retorno,
      nombre_archivo, mime_type, version, activo, subido_por, subido_at
      ${includeContent ? ', contenido_base64' : ''}
    FROM ccp_firmados
    WHERE requerimiento_id = $1 AND activo = TRUE
    ORDER BY version DESC, id DESC
    LIMIT 1
  `, [requerimientoId]);
  return rows[0] || null;
}

export async function listarHistorialCcpFirmado(requerimientoId) {
  const { rows } = await query(`
    SELECT id, version, nombre_archivo, mime_type, activo, subido_por, subido_at,
      expediente_sgd_envio, fecha_envio_oppm, expediente_sgd_retorno, fecha_retorno, codigo_ccp
    FROM ccp_firmados
    WHERE requerimiento_id = $1
    ORDER BY version DESC, id DESC
  `, [requerimientoId]);
  return rows;
}

export async function registrarOrden(payload, usuario, rol) {
  const reqId = parseInt(payload.requerimiento_id, 10);
  const ctx = await loadContextoExpediente(reqId);
  if (!ctx.ccp_firmado) {
    throw httpError('Debe adjuntar el CCP firmado antes de registrar la orden', 409, 'CCP_FIRMADO_REQUERIDO');
  }
  if (!ctx.proveedor_id) {
    throw httpError('No hay proveedor adjudicado', 409, 'PROVEEDOR_REQUERIDO');
  }
  if (!(ctx.monto_adjudicado > 0)) {
    throw httpError('Monto adjudicado inválido', 409, 'MONTO_INVALIDO');
  }

  const { rows: existOrden } = await query(`
    SELECT id FROM ordenes_contratacion
    WHERE requerimiento_id = $1 AND estado <> 'ORDEN_ANULADA'
    LIMIT 1
  `, [reqId]);
  if (existOrden.length) {
    throw httpError('Ya existe una orden activa para este expediente', 409, 'ORDEN_EXISTENTE');
  }

  const tipoOrden = String(payload.tipo_orden || ctx.tipo_orden_sugerido || 'OC').toUpperCase();
  if (!['OC', 'OS'].includes(tipoOrden)) {
    throw httpError('Tipo de orden inválido (OC/OS)', 400, 'TIPO_ORDEN');
  }
  const numero = String(payload.numero_orden || '').trim();
  if (!numero) throw httpError('El número de orden es obligatorio', 400, 'NUMERO_VACIO');
  const fechaOrden = payload.fecha_orden;
  if (!fechaOrden) throw httpError('La fecha de orden es obligatoria', 400, 'FECHA_VACIA');
  const anio = Number(payload.anio_orden) || new Date(String(fechaOrden).slice(0, 10)).getFullYear();

  const { rows: dup } = await query(`
    SELECT id FROM ordenes_contratacion
    WHERE tipo_orden = $1 AND numero_orden = $2 AND anio_orden = $3 AND estado <> 'ORDEN_ANULADA'
    LIMIT 1
  `, [tipoOrden, numero, anio]);
  if (dup.length) {
    throw httpError(`Ya existe ${tipoOrden} N° ${numero}/${anio}`, 409, 'NUMERO_DUPLICADO');
  }

  const regla = String(payload.regla_inicio_plazo || REGLAS_INICIO_PLAZO.INICIO_PLAZO_CONFIRMACION_RECEPCION);
  if (!Object.values(REGLAS_INICIO_PLAZO).includes(regla)) {
    throw httpError('Regla de inicio de plazo inválida', 400, 'REGLA_PLAZO');
  }

  const { rows } = await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, solicitud_cotizacion_id, cuadro_comparativo_id,
      ccp_codigo_id, ccp_firmado_id, proveedor_id,
      tipo_orden, numero_orden, anio_orden, fecha_orden,
      moneda, monto_total, tipo_contratacion, regla_inicio_plazo,
      fecha_base_manual, observaciones, estado, version, creado_por
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,1,$18)
    RETURNING *
  `, [
    ctx.requerimiento_id,
    ctx.solicitud_id,
    ctx.cuadro_id,
    ctx.codigo_id,
    ctx.ccp_firmado_id,
    ctx.proveedor_id,
    tipoOrden,
    numero,
    anio,
    fechaOrden,
    ctx.moneda || 'PEN',
    ctx.monto_adjudicado,
    ctx.tipo_contratacion,
    regla,
    payload.fecha_base_manual || null,
    String(payload.observaciones || '').slice(0, 4000) || null,
    ESTADOS_ORDEN.ORDEN_REGISTRADA,
    String(usuario || '').slice(0, 150),
  ]);

  const orden = rows[0];
  const pedido0 = ctx.pedidos[0] || {};
  for (const it of ctx.items_adjudicados) {
    await query(`
      INSERT INTO orden_items (
        orden_id, item_adjudicado_ref, descripcion, unidad_medida,
        cantidad, precio_unitario, precio_total, moneda, orden_item,
        meta, fuente_financiamiento, especifica_gasto,
        plazo_ofertado_dias, plazo_ofertado, observaciones_propuesta
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `, [
      orden.id,
      it.item_adjudicado_ref,
      it.descripcion,
      it.unidad_medida,
      it.cantidad,
      it.precio_unitario,
      it.precio_total,
      it.moneda || 'PEN',
      it.orden_item,
      pedido0.meta || null,
      pedido0.fuente_financiamiento || null,
      pedido0.especifica_gasto || null,
      it.plazo_ofertado_dias,
      it.plazo_ofertado || null,
      it.observaciones_propuesta,
    ]);
  }

  // Entrega inicial desde datos reales del requerimiento (RC8.10.5)
  const itemsDb = await getOrdenItems(orden.id);
  const tipoEntrega = /servic/i.test(ctx.tipo_contratacion) ? 'ENTREGABLE' : 'ENTREGA';
  const esServicioOLocacion = /servic|locac|locador/i.test(ctx.tipo_contratacion || '');

  // RC8.10.5 — Leer entregables reales del payload del requerimiento
  let entregablesRequerimiento = [];
  if (esServicioOLocacion) {
    const { rows: reqRows } = await query(
      `SELECT payload FROM requerimientos WHERE id = $1`,
      [ctx.requerimiento_id],
    );
    const pl = reqRows[0]?.payload;
    const payloadObj = typeof pl === 'string' ? JSON.parse(pl || '{}') : (pl || {});
    const rawInfos = payloadObj.locadorInformacion || payloadObj.servicioInformacion || [];
    const rawEntregas = payloadObj.locadorEntregas || payloadObj.servicioEntregas || [];
    entregablesRequerimiento = rawInfos.map((info, i) => {
      const entMatch = rawEntregas[i] || rawEntregas[0] || {};
      const nombre = String(info.entregable || '').trim();
      const plazoRaw = String(info.plazo || '').trim();
      // RC8.10.5 — soporta formatos: "30 días", "(30) días", "treinta (30) días calendario"
      const diasMatch = plazoRaw.match(/\((\d+)\)\s*d[ií]a/) || plazoRaw.match(/(\d+)\s*d[ií]a/);
      const diasPlazo = diasMatch ? parseInt(diasMatch[1], 10) : 0;
      const descripcionRaw = String(entMatch.condicion || entMatch.plazo || '').trim();
      // Limpiar prefijos tipo "PRIMER ENTREGABLE:" del campo condicion
      const descripcion = descripcionRaw.replace(/^(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO)\s+ENTREGABLE:\s*/i, '').trim();
      return {
        nombre: nombre || `Entregable ${i + 1}`,
        diasPlazo,
        plazoTexto: plazoRaw,
        descripcion,
        numeroEntrega: i + 1,
      };
    });
    // Si no se pudo extraer del payload, fallback a un solo entregable con datos del contexto
    if (!entregablesRequerimiento.length) {
      const plazo = itemsDb[0]?.plazo_ofertado_dias ?? 0;
      entregablesRequerimiento = [{
        nombre: 'ÚNICO',
        diasPlazo: Number(plazo) || 0,
        plazoTexto: plazo ? `${plazo} días` : '',
        descripcion: '',
        numeroEntrega: 1,
      }];
    }
  } else {
    // BIEN: mantener lógica de entrega única física
    const plazo = itemsDb[0]?.plazo_ofertado_dias ?? 0;
    entregablesRequerimiento = [{
      nombre: 'ÚNICO',
      diasPlazo: Number(plazo) || 0,
      plazoTexto: plazo ? `${plazo} días` : '',
      descripcion: '',
      numeroEntrega: 1,
    }];
  }

  // Resolver lugar de entrega desde el requerimiento (RC8.10.5)
  let lugarEntrega = null;
  try {
    const lugarRes = await resolverLugarEntrega({
      solicitudId: ctx.solicitud_id,
      proveedorId: ctx.proveedor_id,
      requerimientoId: ctx.requerimiento_id,
    });
    lugarEntrega = lugarRes.lugar || null;
  } catch (_) { /* ok */ }

  const entRows = [];
  for (const ent of entregablesRequerimiento) {
    const total = entregablesRequerimiento.length;
    const codigo = total === 1 ? 'UNICO' : `E${ent.numeroEntrega}`;
    const etiqueta = total === 1 && ent.nombre === 'ÚNICO'
      ? 'ÚNICO'
      : String(ent.nombre || `Entregable ${ent.numeroEntrega}`);
    const { rows: inserted } = await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        etiqueta_entrega, codigo_entrega,
        dias_plazo, tipo_dias, evento_inicio_plazo, lugar_entrega, importe, estado
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'calendario',$8,$9,$10,'ACTIVO')
      RETURNING id
    `, [
      orden.id,
      ent.numeroEntrega,
      tipoEntrega,
      ent.descripcion || etiqueta,
      etiqueta,
      codigo,
      ent.diasPlazo || 0,
      regla,
      lugarEntrega,
      // distribuir monto equitativamente entre entregables
      ctx.monto_adjudicado / total,
    ]);
    entRows.push(inserted[0]);
  }

  // Asociar todos los items a todos los entregables (servicio/locacion).
  // PU y Total se dividen ambos entre el N.° de entregables para que cada línea
  // quede internamente consistente (cantidad × PU = Total) y la suma de Total
  // entre entregables vuelva a coincidir con el total real del ítem.
  const { resolveOrdenEntregaItemLinea } = await import('../../shared/ordenCronogramaContractual.js');
  for (const entRow of entRows) {
    for (const it of itemsDb) {
      const linea = resolveOrdenEntregaItemLinea(it, entRows.length);
      await query(`
        INSERT INTO orden_entrega_items (
          orden_entrega_id, orden_item_id, cantidad, precio_unitario, precio_total
        ) VALUES ($1,$2,$3,$4,$5)
      `, [
        entRow.id,
        it.id,
        it.cantidad,
        linea.precio_unitario,
        linea.precio_total,
      ]);
    }
  }

  await registrarEventoOrden({
    ordenId: orden.id,
    requerimientoId: ctx.requerimiento_id,
    tipo: 'ORDEN_REGISTRADA',
    estadoAnterior: ESTADOS_ORDEN.PENDIENTE_REGISTRO_ORDEN,
    estadoNuevo: ESTADOS_ORDEN.ORDEN_REGISTRADA,
    usuario,
    rol,
    observacion: `${tipoOrden} ${numero}/${anio}`,
  });

  const { sincronizarEstadoSegunChecklist } = await import('./ordenesChecklist.js');
  await sincronizarEstadoSegunChecklist(orden.id, usuario);
  return getDetalleOrden(orden.id);
}

export async function actualizarOrden(ordenId, payload, usuario, rol) {
  const orden = await getOrdenById(ordenId);
  const bloqueados = [
    ESTADOS_ORDEN.ORDEN_ENVIADA,
    ESTADOS_ORDEN.ORDEN_ENVIADA_PENDIENTE_CONFIRMACION,
    ESTADOS_ORDEN.ORDEN_RECEPCION_CONFIRMADA,
    ESTADOS_ORDEN.ORDEN_EN_EJECUCION,
    ESTADOS_ORDEN.DERIVADO_EJECUCION,
    ESTADOS_ORDEN.ORDEN_ANULADA,
  ];
  if (bloqueados.includes(orden.estado)) {
    throw httpError('La orden no admite edición directa en este estado; genere nueva versión si corresponde', 409, 'ORDEN_BLOQUEADA');
  }

  const numero = payload.numero_orden != null ? String(payload.numero_orden).trim() : orden.numero_orden;
  if (!numero) throw httpError('El número de orden es obligatorio', 400, 'NUMERO_VACIO');
  const fechaOrden = payload.fecha_orden || orden.fecha_orden;
  if (!fechaOrden) throw httpError('La fecha de orden es obligatoria', 400, 'FECHA_VACIA');
  const tipoOrden = String(payload.tipo_orden || orden.tipo_orden).toUpperCase();
  const anio = Number(payload.anio_orden) || orden.anio_orden;

  const { rows: dup } = await query(`
    SELECT id FROM ordenes_contratacion
    WHERE tipo_orden = $1 AND numero_orden = $2 AND anio_orden = $3
      AND estado <> 'ORDEN_ANULADA' AND id <> $4
    LIMIT 1
  `, [tipoOrden, numero, anio, orden.id]);
  if (dup.length) throw httpError(`Ya existe ${tipoOrden} N° ${numero}/${anio}`, 409, 'NUMERO_DUPLICADO');

  const regla = payload.regla_inicio_plazo
    ? String(payload.regla_inicio_plazo)
    : orden.regla_inicio_plazo;

  await query(`
    UPDATE ordenes_contratacion SET
      tipo_orden = $2, numero_orden = $3, anio_orden = $4, fecha_orden = $5,
      regla_inicio_plazo = $6, fecha_base_manual = $7, observaciones = $8,
      actualizado_por = $9, actualizado_at = NOW()
    WHERE id = $1
  `, [
    orden.id, tipoOrden, numero, anio, fechaOrden, regla,
    payload.fecha_base_manual !== undefined ? payload.fecha_base_manual : orden.fecha_base_manual,
    payload.observaciones !== undefined ? String(payload.observaciones).slice(0, 4000) : orden.observaciones,
    String(usuario || '').slice(0, 150),
  ]);

  await registrarEventoOrden({
    ordenId: orden.id,
    requerimientoId: orden.requerimiento_id,
    tipo: 'ORDEN_ACTUALIZADA',
    estadoAnterior: orden.estado,
    estadoNuevo: orden.estado,
    usuario,
    rol,
  });

  const { sincronizarEstadoSegunChecklist } = await import('./ordenesChecklist.js');
  await sincronizarEstadoSegunChecklist(orden.id, usuario);
  return getDetalleOrden(orden.id);
}

export async function anularOrden(ordenId, motivo, usuario, rol) {
  const orden = await getOrdenById(ordenId);
  if (orden.estado === ESTADOS_ORDEN.ORDEN_ANULADA) {
    return { ok: true, idempotent: true, orden };
  }
  if (orden.estado === ESTADOS_ORDEN.DERIVADO_EJECUCION) {
    throw httpError('No se puede anular una orden ya derivada a Ejecución', 409);
  }
  const m = String(motivo || '').trim();
  if (!m) throw httpError('El motivo de anulación es obligatorio', 400, 'MOTIVO_REQUERIDO');

  await query(`
    UPDATE ordenes_contratacion SET
      estado = $2, anulado_por = $3, anulado_at = NOW(), motivo_anulacion = $4,
      actualizado_por = $3, actualizado_at = NOW()
    WHERE id = $1
  `, [orden.id, ESTADOS_ORDEN.ORDEN_ANULADA, String(usuario || '').slice(0, 150), m.slice(0, 2000)]);

  await registrarEventoOrden({
    ordenId: orden.id,
    requerimientoId: orden.requerimiento_id,
    tipo: 'ORDEN_ANULADA',
    estadoAnterior: orden.estado,
    estadoNuevo: ESTADOS_ORDEN.ORDEN_ANULADA,
    usuario,
    rol,
    observacion: m,
  });
  return getDetalleOrden(orden.id);
}


/** OD37 — repara PU=0 en orden_items desde el Cuadro Comparativo adjudicado. */
export async function sincronizarPreciosItemsDesdeCuadro(ordenId) {
  const orden = await getOrdenById(ordenId);
  let items = await getOrdenItems(ordenId);
  const needs = items.some((it) => !(Number(it.precio_unitario) > 0));
  if (!needs) return items;

  const ctx = await loadContextoExpediente(orden.requerimiento_id);
  const srcItems = ctx.items_adjudicados || [];
  for (const dbItem of items) {
    const src = srcItems.find((a) => String(a.item_adjudicado_ref) === String(dbItem.item_adjudicado_ref))
      || srcItems.find((a) => Number(a.orden_item) === Number(dbItem.orden_item))
      || (items.length === 1 && srcItems.length === 1 ? srcItems[0] : null);
    if (!src || !(Number(src.precio_unitario) > 0)) continue;
    const pu = Number(src.precio_unitario);
    const puAnterior = Number(dbItem.precio_unitario) || 0;
    const tot = Number((Number(dbItem.cantidad) * pu).toFixed(2));
    await query(`
      UPDATE orden_items SET
        precio_unitario = $2,
        precio_total = $3,
        plazo_ofertado = COALESCE($4, plazo_ofertado),
        plazo_ofertado_dias = COALESCE($5, plazo_ofertado_dias)
      WHERE id = $1
    `, [dbItem.id, pu, tot, src.plazo_ofertado || null, src.plazo_ofertado_dias]);
    // RC8.13.2 Obs.50 — causa exacta de "Importes validados — Pendiente" en órdenes
    // donde el PU del ítem quedó en 0 al crearse (needs=true arriba): este sync corría
    // en CADA lectura de la orden (Ver expediente / Configurar entregables) y
    // recalculaba precio_total = ei.cantidad(completa, tal como quedó repetida en cada
    // una de las N entregas al crear la orden) × PU NUEVO completo — descartando la
    // proporción ya dividida entre entregables (resolveOrdenEntregaItemLinea, RC8.12).
    // Con N>1 eso multiplicaba el monto distribuido por N frente al monto adjudicado
    // real. Ahora se REESCALA proporcionalmente el precio_total/PU que ya tenía cada
    // línea (× nuevo_pu / pu_anterior) en vez de recalcularlo desde cantidad × PU
    // completo, preservando la distribución/redistribución vigente (de creación o de
    // una edición manual previa) tal como estaba.
    if (puAnterior > 0) {
      await query(`
        UPDATE orden_entrega_items ei
        SET precio_unitario = ROUND((ei.precio_unitario * $2::numeric / $3::numeric), 4),
            precio_total = ROUND((ei.precio_total * $2::numeric / $3::numeric), 2)
        FROM orden_entregas e
        WHERE ei.orden_entrega_id = e.id
          AND e.orden_id = $4
          AND ei.orden_item_id = $1
          AND e.estado <> 'ANULADO'
      `, [dbItem.id, pu, puAnterior, ordenId]);
    } else {
      // Sin PU anterior para calcular una proporción (línea nunca tuvo precio):
      // única entrega (N=1, caso típico BIEN) es el único caso seguro para asumir
      // cantidad × PU completo sin distorsionar una distribución previa.
      await query(`
        UPDATE orden_entrega_items ei
        SET precio_unitario = $2,
            precio_total = ROUND((ei.cantidad * $2::numeric), 2)
        FROM orden_entregas e
        WHERE ei.orden_entrega_id = e.id
          AND e.orden_id = $3
          AND ei.orden_item_id = $1
          AND e.estado <> 'ANULADO'
          AND (SELECT COUNT(*) FROM orden_entregas e2 WHERE e2.orden_id = $3 AND e2.estado <> 'ANULADO') = 1
      `, [dbItem.id, pu, ordenId]);
    }
  }

  const { rows: ents } = await query(`
    SELECT id FROM orden_entregas WHERE orden_id = $1 AND estado <> 'ANULADO'
  `, [ordenId]);
  for (const e of ents) {
    await query(`
      UPDATE orden_entregas SET
        importe = COALESCE((
          SELECT ROUND(SUM(precio_total)::numeric, 2)
          FROM orden_entrega_items WHERE orden_entrega_id = $1
        ), importe),
        updated_at = NOW()
      WHERE id = $1
    `, [e.id]);
  }

  const monto = srcItems.reduce((a, it) => a + Number(it.precio_total || 0), 0);
  if (monto > 0) {
    await query(`UPDATE ordenes_contratacion SET monto_total = $2, actualizado_at = NOW() WHERE id = $1`,
      [ordenId, Number(monto.toFixed(2))]);
  }
  return getOrdenItems(ordenId);
}


/** Formatea un ítem de lugares_entrega_item (región/provincia/distrito). */
function formatLugarDesdeItem(it = {}) {
  if (!it || typeof it !== 'object') return '';
  if (String(it.lugar_rapido || '').trim()) return String(it.lugar_rapido).trim();
  const parts = [it.region, it.provincia, it.distrito, it.lugar, it.direccion, it.lugar_entrega]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  return parts.join(' / ');
}

/**
 * RC8.13.2 Obs.50 — Resuelve lugar de entrega con prioridad:
 *   1. ubicación contractual explícita de la solicitud/cotización (solicitud, ítems SC
 *      con región/provincia/distrito, propuesta técnica/anexos del proveedor adjudicado);
 *   2. ubicación del requerimiento/TDR;
 *   3. fallback documentado — centro organizacional (p. ej. "CNCC") — SOLO si ninguna de
 *      las fuentes anteriores tiene una ubicación geográfica real.
 * Antes de esta corrección, el centro organizacional (centro_nombre) se usaba como
 * fallback apenas los ítems de la solicitud carecían de región/provincia/distrito,
 * incluso cuando la cotización del proveedor o el TDR del requerimiento sí tenían una
 * ubicación geográfica real (p. ej. "Lima / Lima / Chorrillos") — esa era la causa
 * exacta de que apareciera el centro organizacional en vez de la ubicación contractual.
 * El centro organizacional nunca debe ganarle a una ubicación geográfica contractual.
 */
export async function resolverLugarEntrega({ solicitudId, proveedorId, requerimientoId } = {}) {
  let sid = solicitudId != null ? parseInt(solicitudId, 10) : null;
  if (!Number.isFinite(sid) && requerimientoId) {
    const { rows: link } = await query(`
      SELECT solicitud_id FROM solicitud_requerimientos
      WHERE requerimiento_id = $1
      ORDER BY solicitud_id DESC LIMIT 1
    `, [requerimientoId]);
    sid = link[0]?.solicitud_id != null ? Number(link[0].solicitud_id) : null;
  }

  let centroFallback = null;

  if (Number.isFinite(sid)) {
    const { rows: sc } = await query(`
      SELECT lugar_entrega, lugares_entrega_item FROM solicitudes_cotizacion WHERE id = $1
    `, [sid]);
    const lugarSc = String(sc[0]?.lugar_entrega || '').trim();
    if (lugarSc) return { lugar: lugarSc, fuente: 'solicitud' };

    const itemsLugar = parseJson(sc[0]?.lugares_entrega_item, []);
    if (Array.isArray(itemsLugar) && itemsLugar.length) {
      const unicos = [...new Set(itemsLugar.map((it) => formatLugarDesdeItem(it)).filter(Boolean))];
      if (unicos.length) return { lugar: unicos.join('; '), fuente: 'solicitud_items' };

      // Guarda el centro organizacional como último recurso documentado (paso 3),
      // pero NO retorna aún: primero deben intentarse cotización y requerimiento/TDR.
      const centros = [...new Set(
        itemsLugar.map((it) => String(it?.centro_nombre || it?.centro || '').trim()).filter(Boolean),
      )];
      if (centros.length) centroFallback = { lugar: centros.join('; '), fuente: 'solicitud_items_centro' };
    }

    if (proveedorId) {
      const { rows: cots } = await query(`
        SELECT propuesta_tecnica, anexos FROM cotizaciones_proveedor
        WHERE solicitud_id = $1 AND proveedor_id = $2
        ORDER BY id DESC LIMIT 1
      `, [sid, proveedorId]);
      if (cots.length) {
        const tec = parseJson(cots[0].propuesta_tecnica, {});
        const anex = parseJson(cots[0].anexos, {});
        const cand = [
          tec.lugar_entrega, tec.lugar, tec.direccion_entrega, tec.direccion,
          tec.datos_proveedor?.lugar_entrega,
          anex.lugar_entrega, anex.datos_proveedor?.lugar_entrega,
          // RC8.10.5 — fallback a domicilio_fiscal del proveedor
          anex.datos_proveedor?.domicilio_fiscal,
        ].map((x) => String(x || '').trim()).find(Boolean);
        if (cand) return { lugar: cand, fuente: 'cotizacion' };
      }
    }
  }
  if (requerimientoId) {
    const { rows: reqs } = await query(`
      SELECT payload FROM requerimientos WHERE id = $1
    `, [requerimientoId]);
    const pl = parseJson(reqs[0]?.payload, {});
    const cand = [
      pl.lugar_entrega, pl.lugarEntrega, pl.lugarEntregaBienes, pl.lugar, pl.direccion_entrega, pl.direccion,
      pl.especificaciones?.lugar_entrega, pl.tdr?.lugar_entrega,
      // RC8.10.5 — buscar en objetivo/finalidad menciones de lugar (ej: "Chorrillos, Lima, Lima")
      pl.locadorPerfil?.lugar, pl.locadorPerfil?.lugar_entrega,
      pl.locadorInformacion?.[0]?.lugar,
    ].map((x) => String(x || '').trim()).find(Boolean);
    if (cand) return { lugar: cand, fuente: 'requerimiento' };
  }
  // Paso 3 — fallback documentado: centro organizacional, solo si nada geográfico existe.
  if (centroFallback) return centroFallback;
  return { lugar: null, fuente: null };
}

export async function getDetalleOrden(ordenId) {
  const orden = await getOrdenById(ordenId);
  const ctx = await loadContextoExpediente(orden.requerimiento_id);
  let items = await sincronizarPreciosItemsDesdeCuadro(ordenId);
  items = await enrichOrdenItemsConPedidos(items, ctx.pedidos || []);
  const { listarEntregas } = await import('./ordenesEntregas.js');
  const entregasRaw = await listarEntregas(ordenId);

  // RC8.10.5 — Enriquecer entregables placeholder desde payload del requerimiento (SERVICIO/LOCACION)
  let entregas = entregasRaw;
  const esServicioOLocacion = /servic|locac|locador/i.test(ctx.tipo_contratacion || '');
  const esPlaceholder = entregasRaw.length === 1
    && String(entregasRaw[0]?.codigo_entrega || '').toUpperCase() === 'UNICO'
    && Number(entregasRaw[0]?.dias_plazo || 0) === 0
    && !entregasRaw[0]?.lugar_entrega;
  if (esServicioOLocacion && esPlaceholder) {
    try {
      const { rows: reqRows } = await query(
        `SELECT payload FROM requerimientos WHERE id = $1`,
        [orden.requerimiento_id],
      );
      const pl = reqRows[0]?.payload;
      const payloadObj = typeof pl === 'string' ? JSON.parse(pl || '{}') : (pl || {});
      const rawInfos = payloadObj.locadorInformacion || payloadObj.servicioInformacion || [];
      const rawEntregas = payloadObj.locadorEntregas || payloadObj.servicioEntregas || [];
      if (rawInfos.length > 0) {
        const nuevosEntregables = rawInfos.map((info, i) => {
          const entMatch = rawEntregas[i] || rawEntregas[0] || {};
          const nombre = String(info.entregable || '').trim();
          const plazoRaw = String(info.plazo || '').trim();
          const diasMatch = plazoRaw.match(/(\d+)\s*d[ií]a/);
          const diasPlazo = diasMatch ? parseInt(diasMatch[1], 10) : 0;
          const descripcionRaw = String(entMatch.condicion || entMatch.plazo || '').trim();
          const descripcion = descripcionRaw
            .replace(/^(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO)\s+ENTREGABLE:\s*/i, '')
            .trim();
          const total = rawInfos.length;
          const codigo = total === 1 ? 'UNICO' : `E${i + 1}`;
          const etiqueta = String(nombre || `Entregable ${i + 1}`);
          return {
            id: entregasRaw[0].id + i, // virtual id para evitar colisiones en el front
            orden_id: ordenId,
            numero_entrega: i + 1,
            tipo_entrega: entregasRaw[0].tipo_entrega || 'ENTREGABLE',
            descripcion: descripcion || etiqueta,
            etiqueta_entrega: etiqueta,
            codigo_entrega: codigo,
            correlativo: codigo,
            dias_plazo: diasPlazo,
            tipo_dias: 'calendario',
            // Sin valor propio conocido: dejar null (no un placeholder no-canónico) para
            // que la condición de inicio real de la orden (orden.condicion_inicio) no
            // quede enmascarada en resolveOrdenCronogramaContractual / COALESCE posterior.
            evento_inicio_plazo: entregasRaw[0].evento_inicio_plazo || null,
            lugar_entrega: null, // se completa con resolverLugarEntrega abajo
            importe: Number(orden.monto_total / total) || 0,
            estado: 'ACTIVO',
            _enriquecido: true,
          };
        });
        // También actualizar la BD para futuras consultas
        for (const ne of nuevosEntregables) {
          try {
            await query(`
              INSERT INTO orden_entregas (
                orden_id, numero_entrega, tipo_entrega, descripcion,
                etiqueta_entrega, codigo_entrega,
                dias_plazo, tipo_dias, evento_inicio_plazo, lugar_entrega, importe, estado
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ACTIVO')
              ON CONFLICT (orden_id, numero_entrega) WHERE estado <> 'ANULADO'
              DO UPDATE SET
                descripcion = EXCLUDED.descripcion,
                etiqueta_entrega = EXCLUDED.etiqueta_entrega,
                codigo_entrega = EXCLUDED.codigo_entrega,
                dias_plazo = EXCLUDED.dias_plazo,
                importe = EXCLUDED.importe,
                updated_at = NOW()
            `, [
              ordenId,
              ne.numero_entrega,
              ne.tipo_entrega,
              ne.descripcion,
              ne.etiqueta_entrega,
              ne.codigo_entrega,
              ne.dias_plazo,
              ne.evento_inicio_plazo,
              ne.lugar_entrega,
              ne.importe / nuevosEntregables.length,
            ]);
          } catch (_) { /* ok, fallback a datos en memoria */ }
        }
        entregas = nuevosEntregables;
      }
    } catch (_) { /* ok, mantener entregas originales */ }
  }

  const { rows: docs } = await query(`
    SELECT id, tipo_documento, nombre_archivo, mime_type, version, firmado, activo,
      subido_por, subido_at, tamanio
    FROM orden_documentos WHERE orden_id = $1
    ORDER BY version DESC, id DESC
  `, [ordenId]);
  const { rows: envios } = await query(`
    SELECT id, documento_version, cronograma_version, correo_destino, enviado_por,
      enviado_at, estado, intento, error, confirmado_at, url_acceso
    FROM orden_envios_proveedor WHERE orden_id = $1
    ORDER BY id DESC
  `, [ordenId]);

    const { obtenerChecklistOrden } = await import('./ordenesChecklist.js');
  const { checklist } = await obtenerChecklistOrden(ordenId);
  const lugarRes = await resolverLugarEntrega({
    solicitudId: orden.solicitud_cotizacion_id || ctx.solicitud_id,
    proveedorId: orden.proveedor_id || ctx.proveedor_id,
    requerimientoId: orden.requerimiento_id,
  });

  const {
    resolveOrdenFechaNotificacion,
    normalizeCondicionInicio,
    labelCondicionInicio,
    resolveOrdenCronogramaContractual,
  } = await import('../../shared/ordenCronogramaContractual.js');

  const notif = resolveOrdenFechaNotificacion(orden, envios);
  const condicion = normalizeCondicionInicio(
    orden.condicion_inicio
    || entregas[0]?.evento_inicio_plazo
    || null,
  ) || 'EMISION_ORDEN';

  // Normalizar fechas de orden a YYYY-MM-DD (evitar "Fri Jul 24" al persistir)
  const ordenNorm = {
    ...orden,
    fecha_orden: toIsoDateString(orden.fecha_orden) || orden.fecha_orden,
    enviado_proveedor_at: orden.enviado_proveedor_at
      ? (toIsoDateString(orden.enviado_proveedor_at) || orden.enviado_proveedor_at)
      : null,
    fecha_evento_inicio: toIsoDateString(orden.fecha_evento_inicio) || orden.fecha_evento_inicio,
    fecha_efectiva_inicio: toIsoDateString(orden.fecha_efectiva_inicio) || orden.fecha_efectiva_inicio,
    condicion_inicio: condicion,
    condicion_inicio_label: labelCondicionInicio(condicion),
    fecha_notificacion: notif.fechaNotificacion,
    fecha_notificacion_at: notif.fechaNotificacionAt,
  };

  // RC8.13.2 Obs.50 — corrección de PRESENTACIÓN (no repara BD): el lugar_entrega de
  // cada orden_entregas se guardó una sola vez, al crear la orden, con la prioridad que
  // regía en ese momento (podía caer en el fallback de centro organizacional antes de
  // intentar cotización/requerimiento). Si el valor guardado está vacío o es idéntico al
  // centro organizacional del expediente, se muestra en su lugar el resultado ya
  // recalculado por resolverLugarEntrega con la prioridad corregida (lugarRes, arriba).
  // Un lugar_entrega distinto al centro (p. ej. editado manualmente en Configurar
  // entregables) nunca se sobrescribe.
  const centroExpediente = String(ctx.centro || '').trim().toLowerCase();
  const entregasEnriquecidas = entregas.map((e) => {
    const cron = resolveOrdenCronogramaContractual(ordenNorm, e, {
      envios,
      totalEntregas: entregas.length,
      fechaActaInicio: orden.fecha_evento_inicio,
    });
    const lugarPropio = String(e.lugar_entrega || '').trim();
    const esFallbackCentro = !!centroExpediente && lugarPropio.toLowerCase() === centroExpediente;
    const lugarMostrado = (!lugarPropio || esFallbackCentro) && lugarRes.lugar
      ? lugarRes.lugar
      : (lugarPropio || null);
    return {
      ...e,
      lugar_entrega: lugarMostrado,
      lugar_entrega_fuente: (!lugarPropio || esFallbackCentro) ? lugarRes.fuente : 'orden_entrega',
      evento_inicio_plazo: cron.condicionInicio,
      condicion_inicio_label: cron.condicionLabel,
      fecha_base_calc: cron.fechaEfectiva,
      fecha_maxima_calc: cron.fechaMaxima,
      plazo_label: cron.plazoEntregaLabel,
      cronogramaContractual: cron,
    };
  });

  return {
    orden: ordenNorm,
    contexto: { ...ctx, lugar_entrega: lugarRes.lugar, lugar_entrega_fuente: lugarRes.fuente },
    items,
    entregas: entregasEnriquecidas,
    documentos: docs,
    envios,
    checklist,
    lugar_entrega: lugarRes.lugar,
    lugar_entrega_fuente: lugarRes.fuente,
    notificacionCanon: notif,
  };
}

/**
 * Expediente consolidado para "Ver expediente" (sin blobs).
 * Una sola respuesta: resumen, ítems, entregas (combinaciones), documentos, notificación, recepciones, historial.
 */
export async function getExpedienteOrdenCompleto(ordenId) {
  const detalle = await getDetalleOrden(ordenId);
  const historialOrden = await listarHistorialOrden(ordenId);
  const { orden, contexto, items, entregas, documentos, envios, checklist, notificacionCanon } = detalle;

  const {
    expandItemEntregaCombinaciones,
    resolveOrdenCronogramaContractual,
    resolveOrdenPlazoContractual,
    labelCondicionInicio,
    formatPlazoLabel,
  } = await import('../../shared/ordenCronogramaContractual.js');

  const primera = entregas[0] || {};
  const cronOrden = resolveOrdenCronogramaContractual(orden, primera, {
    envios,
    totalEntregas: entregas.length || 1,
    fechaActaInicio: orden.fecha_evento_inicio,
  });

  const combinaciones = expandItemEntregaCombinaciones(items, entregas).map((c) => {
    const ent = entregas.find((e) => Number(e.id) === Number(c.orden_entrega_id)) || primera;
    const cron = resolveOrdenCronogramaContractual(orden, ent, {
      envios,
      totalEntregas: entregas.length,
      plazoDias: c.dias_plazo,
      fechaActaInicio: orden.fecha_evento_inicio,
    });
    return {
      ...c,
      condicion_inicio: cron.condicionInicio,
      condicion_inicio_label: cron.condicionLabel,
      fecha_efectiva: cron.fechaEfectiva,
      fecha_maxima: cron.fechaMaxima || toIsoDateString(c.fecha_maxima),
      plazo_label: cron.plazoEntregaLabel,
      pendiente_motivo: cron.pendienteMotivo,
    };
  });

  let adjuntosReq = [];
  try {
    const { rows } = await query(`
      SELECT id, nombre_archivo, mime_type, created_at, tamaño_bytes
      FROM requerimientos_adjuntos
      WHERE requerimiento_id = $1
      ORDER BY id DESC
    `, [orden.requerimiento_id]);
    adjuntosReq = rows;
  } catch (_) { /* ok */ }

  // RC8.12 Obs.07 punto 7 — Excluir del expediente los adjuntos que son
  // plantillas/modelos que el analista adjuntó en Invitaciones para que el
  // proveedor las descargue (docs_solicitados / docs_convocatoria / requisitos_tecnicos
  // de la solicitud de cotización). Se reutiliza la misma relación que ya arma el
  // portal del proveedor (buildDocumentosConvocatoria) — no se filtra por nombre.
  try {
    const solicitudIdPlantillas = orden.solicitud_cotizacion_id || contexto.solicitud_id;
    if (solicitudIdPlantillas && adjuntosReq.length) {
      const { rows: scRows } = await query(`
        SELECT docs_solicitados, docs_convocatoria, requisitos_tecnicos
        FROM solicitudes_cotizacion WHERE id = $1
      `, [solicitudIdPlantillas]);
      if (scRows[0]) {
        const { resolveAdjuntosPlantillaInvitacion } = await import('./portalDocumentos.js');
        const adjuntosMap = { [orden.requerimiento_id]: adjuntosReq };
        const plantillaAdjuntoIds = new Set(
          resolveAdjuntosPlantillaInvitacion(scRows[0], [orden.requerimiento_id], adjuntosMap),
        );
        if (plantillaAdjuntoIds.size) {
          adjuntosReq = adjuntosReq.filter((a) => !plantillaAdjuntoIds.has(Number(a.id)));
        }
      }
    }
  } catch (_) { /* tabla/función opcional */ }

  // Cotizaciones 5-A / 5-B y adjuntos — solo proveedor adjudicado, sin duplicados
  let docsCotiz = [];
  try {
    const { buildDocsCotizacionAdjudicada } = await import('../../shared/expedienteDocumentos.js');
    const { rows: cots } = await query(`
      SELECT cp.id, cp.proveedor_id, cp.anexos, cp.updated_at, cp.created_at,
        p.razon_social, p.ruc
      FROM cotizaciones_proveedor cp
      LEFT JOIN proveedores p ON p.id = cp.proveedor_id
      WHERE cp.solicitud_id = $1
        AND ($2::int IS NULL OR cp.proveedor_id = $2)
      ORDER BY cp.id DESC
    `, [
      orden.solicitud_cotizacion_id || contexto.solicitud_id,
      orden.proveedor_id || contexto.proveedor_id || null,
    ]);
    docsCotiz = buildDocsCotizacionAdjudicada(
      cots,
      orden.proveedor_id || contexto.proveedor_id,
    );
  } catch (_) { /* tabla/columna opcional */ }

  let docsCcp = [];
  if (contexto.ccp_firmado_id) {
    docsCcp.push({
      documentoId: contexto.ccp_firmado_id,
      id: contexto.ccp_firmado_id,
      origen: 'CCP',
      tipo: 'CCP firmado',
      nombre: contexto.ccp_firmado_nombre || 'CCP-firmado.pdf',
      created_at: contexto.ccp_firmado_at,
      fecha: contexto.ccp_firmado_at,
      kind: 'ccp',
      version: contexto.ccp_firmado_version,
      previewDisponible: true,
      registro_origen_id: contexto.ccp_firmado_id,
    });
  }

  let docsRecepcion = [];
  try {
    const { rows } = await query(`
      SELECT d.id, d.tipo, d.nombre, d.mime_type, d.version, d.created_at, d.expediente_recepcion_id
      FROM recepcion_bienes_documentos d
      JOIN recepcion_bienes_expedientes e ON e.id = d.expediente_recepcion_id
      WHERE e.orden_id = $1 AND d.vigente = TRUE
      ORDER BY d.id DESC
    `, [orden.id]);
    docsRecepcion = rows.map((d) => ({
      documentoId: d.id,
      id: d.id,
      origen: 'RECEPCION_BIENES',
      tipo: d.tipo || 'Documento recepción',
      nombre: d.nombre,
      mime_type: d.mime_type,
      version: d.version,
      created_at: d.created_at,
      fecha: d.created_at,
      kind: 'recepcion_bien',
      expediente_recepcion_id: d.expediente_recepcion_id,
      previewDisponible: true,
      registro_origen_id: d.id,
    }));
  } catch (_) { /* ok */ }

  let recepciones = [];
  try {
    const { rows } = await query(`
      SELECT rb.id, rb.fecha_recepcion_guia, rb.fecha_entrega_almacen, rb.monto_liquidar,
        rb.estado_fisico, rb.estado_interno, rb.responsable, rb.numero_entrega,
        rb.entrega_programada_id, rb.observaciones, rbe.estado_global, rbe.id AS expediente_recepcion_id,
        oe.etiqueta_entrega, oe.codigo_entrega, oe.descripcion AS entrega_descripcion
      FROM recepciones_bienes rb
      JOIN recepcion_bienes_expedientes rbe ON rbe.id = rb.expediente_recepcion_id
      LEFT JOIN orden_entregas oe ON oe.id = rb.entrega_programada_id
      WHERE rb.orden_id = $1
      ORDER BY rb.id DESC
    `, [orden.id]);
    const { resolveEtiquetaEntrega } = await import('../../shared/entregaContractual.js');
    const totalEnt = entregas.length;
    recepciones = rows.map((x) => ({
      ...x,
      etiqueta_entrega: resolveEtiquetaEntrega({
        etiqueta_entrega: x.etiqueta_entrega,
        codigo_entrega: x.codigo_entrega,
        descripcion: x.entrega_descripcion,
        numero_entrega: x.numero_entrega,
      }, { totalEntregas: totalEnt }) || (totalEnt === 1 ? resolveEtiquetaEntrega(entregas[0] || {}, { totalEntregas: 1 }) : null),
    }));
  } catch (_) { /* migración recepción pendiente */ }

  const { dedupeDocumentos, consolidateOrdenDocumentos } = await import('../../shared/expedienteDocumentos.js');

  const docs = dedupeDocumentos([
    ...adjuntosReq.map((a) => ({
      documentoId: a.id,
      id: a.id,
      origen: 'REQUERIMIENTO',
      tipo: 'Requerimiento / adjunto',
      nombre: a.nombre_archivo,
      mime_type: a.mime_type,
      created_at: a.created_at,
      fecha: a.created_at,
      kind: 'adjunto',
      previewDisponible: true,
      registro_origen_id: a.id,
    })),
    ...docsCotiz,
    ...docsCcp,
    ...consolidateOrdenDocumentos(documentos),
    ...docsRecepcion,
  ]);

  const ultimoEnvio = envios?.[0] || null;
  // Con N entregables, el plazo del resumen es el máximo entre ellos (hito final),
  // no el de la primera entrega ni la suma — ver RC8.12 Obs.07 punto 2.
  const plazoDias = resolveOrdenPlazoContractual(entregas)
    ?? cronOrden.plazoEntrega
    ?? primera.dias_plazo
    ?? items[0]?.plazo_ofertado_dias
    ?? null;

  return {
    resumen: {
      requerimiento_id: orden.requerimiento_id,
      requerimiento_codigo: contexto.requerimiento_codigo,
      pedido_sigamef: contexto.pedido_sigamef || contexto.pedidos_texto
        || [...new Set(items.map((i) => i.pedido_sigamef).filter(Boolean))].join(', ')
        || null,
      codigo_ccp: contexto.codigo_ccp,
      orden_id: orden.id,
      tipo_orden: orden.tipo_orden,
      numero_orden: orden.numero_orden,
      anio_orden: orden.anio_orden,
      fecha_orden: orden.fecha_orden,
      fecha_emision: orden.fecha_orden,
      proveedor_ruc: contexto.proveedor_ruc,
      proveedor_razon_social: contexto.proveedor_razon_social,
      monto_total: orden.monto_total,
      moneda: orden.moneda || 'PEN',
      estado: orden.estado,
      estado_global: orden.estado,
      fecha_notificacion: notificacionCanon?.fechaNotificacion || cronOrden.fechaNotificacion,
      fecha_notificacion_at: notificacionCanon?.fechaNotificacionAt || null,
      fecha_notificacion_fuente: notificacionCanon?.fuente || cronOrden.fechaNotificacionFuente,
      fecha_confirmacion: orden.recibido_proveedor_at,
      condicion_inicio: cronOrden.condicionInicio,
      condicion_inicio_label: cronOrden.condicionLabel,
      fecha_efectiva_inicio: cronOrden.fechaEfectiva,
      plazo_entrega: plazoDias,
      plazo_entrega_label: formatPlazoLabel(plazoDias),
      fecha_maxima: cronOrden.fechaMaxima,
      centro: contexto.centro || null,
      area_usuaria: contexto.area_usuaria || null,
      tipo_proceso: orden.tipo_contratacion,
      numero_contrato: orden.numero_contrato || null,
      lugar_entrega: detalle.lugar_entrega,
    },
    items,
    entregas,
    item_entregas: combinaciones,
    documentos: docs,
    notificacion: {
      envios,
      ultimo: ultimoEnvio,
      correo_destino: ultimoEnvio?.correo_destino || null,
      enviado_at: notificacionCanon?.fechaNotificacionAt || cronOrden.fechaNotificacionAt,
      fecha_notificacion: notificacionCanon?.fechaNotificacion || cronOrden.fechaNotificacion,
      fecha_notificacion_fuente: notificacionCanon?.fuente || null,
      confirmado_at: ultimoEnvio?.confirmado_at || orden.recibido_proveedor_at,
      estado: ultimoEnvio?.estado || null,
    },
    recepciones,
    historial: historialOrden,
    historial_orden: historialOrden,
    requerimiento_id: orden.requerimiento_id,
    checklist,
  };
}

export async function adjuntarOrdenFirmada(ordenId, payload, usuario, rol) {
  const orden = await getOrdenById(ordenId);
  if ([ESTADOS_ORDEN.ORDEN_ANULADA, ESTADOS_ORDEN.DERIVADO_EJECUCION].includes(orden.estado)) {
    throw httpError('Estado no permite adjuntar', 409);
  }
  if (!orden.numero_orden || !orden.fecha_orden || !orden.tipo_orden) {
    throw httpError('La orden debe estar registrada con tipo, número y fecha', 409);
  }
  const pdf = assertPdfBase64(payload.base64 || payload.contenido_base64, payload.nombre_archivo || payload.nombre);
  const nombre = String(payload.nombre_archivo || payload.nombre || 'orden-firmada.pdf').slice(0, 300);

  const { rows: prev } = await query(`
    SELECT id, version FROM orden_documentos
    WHERE orden_id = $1 AND tipo_documento = 'ORDEN_FIRMADA' AND activo = TRUE
    ORDER BY version DESC LIMIT 1
  `, [ordenId]);
  if (prev.length) {
    await query(`UPDATE orden_documentos SET activo = FALSE WHERE id = $1`, [prev[0].id]);
  }
  const version = (prev[0]?.version || 0) + 1;

  const { rows } = await query(`
    INSERT INTO orden_documentos (
      orden_id, tipo_documento, nombre_archivo, mime_type, contenido_base64,
      tamanio, version, firmado, activo, subido_por
    ) VALUES ($1,'ORDEN_FIRMADA',$2,$3,$4,$5,$6,TRUE,TRUE,$7)
    RETURNING id, version, nombre_archivo, subido_at
  `, [ordenId, nombre, PDF_MIME, pdf.base64, pdf.bytes, version, String(usuario || '').slice(0, 150)]);

  if ([
    ESTADOS_ORDEN.ORDEN_NOTIFICADA,
    ESTADOS_ORDEN.ORDEN_ENVIADA,
    ESTADOS_ORDEN.ORDEN_ENVIADA_PENDIENTE_CONFIRMACION,
  ].includes(orden.estado) || normalizeEstadoOrden(orden.estado) === 'ORDEN_NOTIFICADA') {
    await query(`
      UPDATE ordenes_contratacion SET
        version = version + 1,
        actualizado_por = $2, actualizado_at = NOW(),
        enviado_proveedor_at = NULL, enviado_proveedor_por = NULL,
        recibido_proveedor_at = NULL
      WHERE id = $1
    `, [ordenId, String(usuario || '').slice(0, 150)]);
  } else {
    await query(`
      UPDATE ordenes_contratacion SET
        actualizado_por = $2, actualizado_at = NOW()
      WHERE id = $1
    `, [ordenId, String(usuario || '').slice(0, 150)]);
  }

  const { sincronizarEstadoSegunChecklist } = await import('./ordenesChecklist.js');
  const sync = await sincronizarEstadoSegunChecklist(ordenId, usuario);
  const nuevoEstado = sync.estado;

  await registrarEventoOrden({
    ordenId,
    requerimientoId: orden.requerimiento_id,
    tipo: 'ORDEN_FIRMADA_ADJUNTADA',
    estadoAnterior: orden.estado,
    estadoNuevo: nuevoEstado,
    usuario,
    rol,
    observacion: `v${version}: ${nombre}`,
  });

  return { documento: rows[0], estado: nuevoEstado };
}

export async function getDocumentoOrden(ordenId, documentoId, { includeContent = false } = {}) {
  const { rows } = await query(`
    SELECT id, orden_id, tipo_documento, nombre_archivo, mime_type, version,
      firmado, activo, subido_por, subido_at, tamanio
      ${includeContent ? ', contenido_base64' : ''}
    FROM orden_documentos
    WHERE orden_id = $1 AND id = $2
  `, [ordenId, documentoId]);
  if (!rows.length) throw httpError('Documento no encontrado', 404);
  return rows[0];
}

export async function getDocumentoActivo(ordenId, tipo = 'ORDEN_FIRMADA') {
  const { rows } = await query(`
    SELECT * FROM orden_documentos
    WHERE orden_id = $1 AND tipo_documento = $2 AND activo = TRUE
    ORDER BY version DESC LIMIT 1
  `, [ordenId, tipo]);
  return rows[0] || null;
}

export async function listarHistorialOrden(ordenId) {
  const { rows } = await query(`
    SELECT * FROM orden_eventos
    WHERE orden_id = $1
    ORDER BY creado_at DESC, id DESC
  `, [ordenId]);
  return rows;
}

export async function derivarAEjecucion(ordenId, usuario, rol) {
  const detalle = await getDetalleOrden(ordenId);
  const { orden, contexto, entregas, documentos } = detalle;

  if (orden.estado === ESTADOS_ORDEN.DERIVADO_EJECUCION
    || orden.estado === ESTADOS_ORDEN.EN_EJECUCION
    || normalizeEstadoOrden(orden.estado) === 'EN_EJECUCION') {
    const { rows: existing } = await query(
      'SELECT * FROM orden_ejecucion_derivaciones WHERE orden_id = $1',
      [ordenId],
    );
    return { ok: true, idempotent: true, orden, derivacion: existing[0] || null };
  }

  if (!contexto.ccp_firmado) throw httpError('Falta CCP firmado', 409);
  if (!orden.numero_orden) throw httpError('Orden no registrada', 409);
  const firmada = documentos.find((d) => d.tipo_documento === 'ORDEN_FIRMADA' && d.activo);
  if (!firmada) throw httpError('Falta orden firmada activa', 409);
  if (!entregas.length) throw httpError('Falta cronograma de entregas', 409);
  if (!orden.recibido_proveedor_at) {
    throw httpError('El proveedor aún no confirmó recepción', 409, 'SIN_CONFIRMACION');
  }
  const sinFecha = entregas.some((e) => !e.fecha_maxima);
  if (sinFecha) throw httpError('Hay entregas sin fecha máxima calculada', 409);

  const payload = {
    orden_id: orden.id,
    tipo_orden: orden.tipo_orden,
    numero_orden: orden.numero_orden,
    anio_orden: orden.anio_orden,
    fecha_orden: orden.fecha_orden,
    monto_total: orden.monto_total,
    moneda: orden.moneda,
    proveedor_id: orden.proveedor_id,
    proveedor_ruc: contexto.proveedor_ruc,
    proveedor_razon_social: contexto.proveedor_razon_social,
    requerimiento_id: orden.requerimiento_id,
    requerimiento_codigo: contexto.requerimiento_codigo,
    solicitud_id: contexto.solicitud_id,
    pedido_sigamef: contexto.pedidos,
    centro: contexto.centro,
    codigo_ccp: contexto.codigo_ccp,
    ccp_firmado_id: contexto.ccp_firmado_id,
    documento_firmado_id: firmada.id,
    documento_version: firmada.version,
    cronograma: entregas,
    fechas_maximas: entregas.map((e) => ({
      numero: e.numero_entrega,
      fecha_maxima: e.fecha_maxima,
    })),
    recibido_proveedor_at: orden.recibido_proveedor_at,
  };

  const { withTransaction } = await import('./workflow/workflowTransaction.js');
  const { transicionarExpediente } = await import('./expedienteTransicion.js');

  const { rows } = await withTransaction(async (tx) => {
    const ins = await tx.query(`
      INSERT INTO orden_ejecucion_derivaciones (orden_id, requerimiento_id, payload_json, derivado_por)
      VALUES ($1,$2,$3::jsonb,$4)
      ON CONFLICT (orden_id) DO UPDATE SET
        payload_json = EXCLUDED.payload_json,
        derivado_por = EXCLUDED.derivado_por,
        derivado_at = NOW()
      RETURNING *
    `, [orden.id, orden.requerimiento_id, JSON.stringify(payload), String(usuario || '').slice(0, 150)]);

    await tx.query(`
      UPDATE ordenes_contratacion SET
        estado = $2,
        derivado_ejecucion_por = $3,
        derivado_ejecucion_at = NOW(),
        actualizado_por = $3,
        actualizado_at = NOW()
      WHERE id = $1
    `, [orden.id, ESTADOS_ORDEN.EN_EJECUCION, String(usuario || '').slice(0, 150)]);

    if (orden.requerimiento_id) {
      await transicionarExpediente({
        requerimientoId: orden.requerimiento_id,
        evento: 'ORDEN_DERIVADA_EJECUCION',
        usuarioOrigenId: null,
        unidadDestino: orden.tipo_orden === 'BIEN' || String(orden.tipo_orden || '').toUpperCase() === 'BIEN'
          ? 'Almacén'
          : 'Área Usuaria',
        motivo: `Orden ${orden.numero_orden || orden.id} derivada a ejecución`,
        metadata: {
          client_request_id: `orden-ejecucion:${orden.id}`,
          orden_id: orden.id,
          via: 'derivarAEjecucion',
        },
        actorRol: String(usuario || rol || 'SISTEMA'),
        client: tx,
      });
    }
    return ins;
  });

  await registrarEventoOrden({
    ordenId: orden.id,
    requerimientoId: orden.requerimiento_id,
    tipo: 'DERIVADO_EJECUCION',
    estadoAnterior: orden.estado,
    estadoNuevo: ESTADOS_ORDEN.EN_EJECUCION,
    usuario,
    rol,
  });

  return { ok: true, idempotent: false, orden: await getOrdenById(ordenId), derivacion: rows[0] };
}

export async function getPayloadEjecucion(ordenId) {
  const { rows } = await query(
    'SELECT * FROM orden_ejecucion_derivaciones WHERE orden_id = $1',
    [ordenId],
  );
  if (!rows.length) throw httpError('Orden no derivada a Ejecución', 404);
  return {
    ...rows[0],
    payload_json: parseJson(rows[0].payload_json, {}),
  };
}

export { calcularFechaMaxima, normalizeTipoDias, crypto };


/** OD37 — Documentos obligatorios previos a notificar al proveedor. */
export async function listarDocsNotificacion(ordenId) {
  const detalle = await getDetalleOrden(ordenId);
  const { orden, contexto, entregas, documentos } = detalle;
  const firmada = documentos.find((d) => d.tipo_documento === 'ORDEN_FIRMADA' && d.activo);

  const { rows: adj } = await query(`
    SELECT id, nombre_archivo, mime_type, usuario_carga, created_at
    FROM requerimientos_adjuntos
    WHERE requerimiento_id = $1
    ORDER BY id DESC LIMIT 1
  `, [orden.requerimiento_id]);

  const { rows: cots } = await query(`
    SELECT id, estado, fecha_presentacion
    FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND proveedor_id = $2
    ORDER BY id DESC LIMIT 1
  `, [orden.solicitud_cotizacion_id, orden.proveedor_id]);

  let cotDoc = null;
  if (cots.length) {
    try {
      const { buildManifiestoCotizacion } = await import('./portalDocumentos.js');
      const { rows: full } = await query('SELECT * FROM cotizaciones_proveedor WHERE id = $1', [cots[0].id]);
      const manif = buildManifiestoCotizacion(full[0] || {});
      cotDoc = manif.find((d) => d.ref === 'anexo05b') || manif.find((d) => d.economico) || manif[0] || null;
    } catch (_) {
      cotDoc = { nombre: 'Cotización del proveedor adjudicado', ref: 'meta' };
    }
  }

  const docs = [
    {
      tipo: 'ORDEN_FIRMADA',
      nombre: firmada?.nombre_archivo || 'Orden firmada',
      version: firmada?.version || null,
      estado: firmada ? 'Disponible' : 'Falta',
      disponible: !!firmada,
      documento_id: firmada?.id || null,
      mime_type: firmada?.mime_type || 'application/pdf',
    },
    {
      tipo: 'REQUERIMIENTO',
      nombre: adj[0]?.nombre_archivo || `Requerimiento ${contexto.requerimiento_codigo}`,
      version: adj[0] ? 1 : null,
      estado: adj[0] ? 'Disponible' : 'Resumen disponible',
      disponible: true,
      documento_id: adj[0]?.id || null,
      mime_type: adj[0]?.mime_type || 'text/html',
    },
    {
      tipo: 'COTIZACION',
      nombre: cotDoc?.nombre || 'Cotización del proveedor adjudicado',
      version: cots[0]?.id || null,
      estado: cots.length ? 'Disponible' : 'Falta',
      disponible: !!cots.length,
      documento_id: cots[0]?.id || null,
      ref: cotDoc?.ref || null,
      mime_type: 'application/pdf',
    },
    {
      tipo: 'CRONOGRAMA',
      nombre: `Cronograma ${orden.tipo_orden || ''} ${orden.numero_orden || ''}`.trim(),
      version: orden.cronograma_version || entregas.length || 1,
      estado: entregas.length ? 'Disponible' : 'Falta',
      disponible: entregas.length > 0,
      documento_id: null,
      mime_type: 'text/html',
    },
  ];
  return { documentos: docs, faltantes: docs.filter((d) => !d.disponible).map((d) => d.tipo) };
}

export async function getDocNotificacion(ordenId, tipo, { includeContent = false } = {}) {
  const t = String(tipo || '').toUpperCase();
  const detalle = await getDetalleOrden(ordenId);
  const { orden, contexto, entregas, items, documentos } = detalle;

  if (t === 'ORDEN_FIRMADA') {
    const firmada = documentos.find((d) => d.tipo_documento === 'ORDEN_FIRMADA' && d.activo);
    if (!firmada) throw httpError('Falta la orden firmada.', 409, 'SIN_ORDEN_FIRMADA');
    return getDocumentoOrden(ordenId, firmada.id, { includeContent });
  }

  if (t === 'REQUERIMIENTO') {
    const { rows: adj } = await query(`
      SELECT id, nombre_archivo, mime_type, contenido_base64, created_at
      FROM requerimientos_adjuntos
      WHERE requerimiento_id = $1
      ORDER BY id DESC LIMIT 1
    `, [orden.requerimiento_id]);
    if (adj.length && includeContent) {
      return {
        tipo: 'REQUERIMIENTO',
        nombre_archivo: adj[0].nombre_archivo,
        mime_type: adj[0].mime_type || 'application/pdf',
        version: 1,
        estado: 'Disponible',
        contenido_base64: adj[0].contenido_base64,
      };
    }
    if (adj.length) {
      return {
        tipo: 'REQUERIMIENTO',
        nombre_archivo: adj[0].nombre_archivo,
        mime_type: adj[0].mime_type || 'application/pdf',
        version: 1,
        estado: 'Disponible',
      };
    }
    // Resumen HTML del requerimiento
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Requerimiento</title></head><body>
      <h1>Requerimiento ${escapeHtml(contexto.requerimiento_codigo)}</h1>
      <p><strong>Denominación:</strong> ${escapeHtml(contexto.denominacion)}</p>
      <p><strong>Tipo:</strong> ${escapeHtml(contexto.tipo_contratacion)}</p>
      <p><strong>Centro:</strong> ${escapeHtml(contexto.centro)}</p>
      <p><strong>Monto adjudicado:</strong> ${Number(contexto.monto_adjudicado || 0).toFixed(2)}</p>
    </body></html>`;
    const b64 = Buffer.from(html, 'utf8').toString('base64');
    return {
      tipo: 'REQUERIMIENTO',
      nombre_archivo: `${contexto.requerimiento_codigo || 'requerimiento'}.html`,
      mime_type: 'text/html',
      version: 1,
      estado: 'Resumen',
      contenido_base64: includeContent ? b64 : undefined,
    };
  }

  if (t === 'COTIZACION') {
    const { rows: cots } = await query(`
      SELECT * FROM cotizaciones_proveedor
      WHERE solicitud_id = $1 AND proveedor_id = $2
      ORDER BY id DESC LIMIT 1
    `, [orden.solicitud_cotizacion_id, orden.proveedor_id]);
    if (!cots.length) throw httpError('No existe la cotización del proveedor adjudicado.', 409, 'SIN_COTIZACION');
    const { buildManifiestoCotizacion, resolverDocumentoCotizacionAnalista } = await import('./portalDocumentos.js');
    const manif = buildManifiestoCotizacion(cots[0]);
    const pref = manif.find((d) => d.ref === 'anexo05b') || manif.find((d) => d.economico) || manif[0];
    if (!pref) throw httpError('No existe la cotización del proveedor adjudicado.', 409, 'SIN_COTIZACION');
    if (!includeContent) {
      return {
        tipo: 'COTIZACION',
        nombre_archivo: pref.nombre || 'cotizacion.pdf',
        mime_type: pref.mime_type || 'application/pdf',
        version: cots[0].id,
        estado: 'Disponible',
        ref: pref.ref,
      };
    }
    const file = await resolverDocumentoCotizacionAnalista(cots[0].id, pref.ref);
    return {
      tipo: 'COTIZACION',
      nombre_archivo: file.nombre || pref.nombre || 'cotizacion.pdf',
      mime_type: file.mime_type || 'application/pdf',
      version: cots[0].id,
      estado: 'Disponible',
      contenido_base64: file.base64 || file.contenido_base64,
    };
  }

  if (t === 'CRONOGRAMA') {
    if (!entregas.length) throw httpError('Falta el cronograma de entregas/entregables.', 409, 'SIN_CRONOGRAMA');
    const rowsHtml = entregas.map((e) => `
      <tr>
        <td>${e.numero_entrega}</td>
        <td>${escapeHtml(e.tipo_entrega)}</td>
        <td>${escapeHtml(e.descripcion)}</td>
        <td>${e.dias_plazo}</td>
        <td>${escapeHtml(e.tipo_dias)}</td>
        <td>${Number(e.importe || 0).toFixed(2)}</td>
        <td>${e.fecha_maxima || '—'}</td>
      </tr>`).join('');
    const itemsHtml = items.map((it) => `
      <tr>
        <td>${escapeHtml(it.descripcion)}</td>
        <td>${escapeHtml(it.unidad_medida || '')}</td>
        <td>${it.cantidad}</td>
        <td>${Number(it.precio_unitario).toFixed(4)}</td>
        <td>${Number(it.precio_total).toFixed(2)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cronograma</title>
      <style>table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;font-size:12px}</style>
      </head><body>
      <h1>Cronograma de entregas / entregables</h1>
      <p>Orden ${escapeHtml(orden.tipo_orden)} ${escapeHtml(orden.numero_orden)} · ${escapeHtml(contexto.proveedor_razon_social)}</p>
      <h2>Ítems adjudicados</h2>
      <table><thead><tr><th>Descripción</th><th>UM</th><th>Cant.</th><th>P.U.</th><th>Total</th></tr></thead>
      <tbody>${itemsHtml}</tbody></table>
      <h2>Entregas</h2>
      <table><thead><tr><th>N°</th><th>Tipo</th><th>Descripción</th><th>Días</th><th>Tipo días</th><th>Importe</th><th>Fecha máx.</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
    </body></html>`;
    const b64 = Buffer.from(html, 'utf8').toString('base64');
    return {
      tipo: 'CRONOGRAMA',
      nombre_archivo: `cronograma-${orden.tipo_orden || 'ORD'}-${orden.numero_orden || orden.id}.html`,
      mime_type: 'text/html',
      version: orden.cronograma_version || 1,
      estado: 'Disponible',
      contenido_base64: includeContent ? b64 : undefined,
    };
  }

  throw httpError('Tipo de documento no reconocido', 400);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

