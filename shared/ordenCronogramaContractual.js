/**
 * Contrato canónico de fechas / condición / ítem–SIGAMEF para Órdenes.
 * Fuente única: Registro de Órdenes → Expediente → Recepción de Bienes → Acta → Pago.
 *
 * Criterio fechaNotificacion:
 *   1) Primer envío exitoso en orden_envios_proveedor (estado ENVIADO/OK/CONFIRMADO/…)
 *   2) orden.enviado_proveedor_at
 *   No usar fechas de intentos fallidos como fecha contractual.
 */
import {
  calcularFechaMaximaEntrega,
  toIsoDateString,
  CONDICIONES_INICIO_FECHA,
} from './diasPlazo.js';
import { resolveEtiquetaEntrega, buildEntregaContract } from './entregaContractual.js';

export const CONDICIONES_INICIO_CANON = Object.freeze({
  EMISION_ORDEN: 'EMISION_ORDEN',
  DIA_SIGUIENTE_NOTIFICACION: 'DIA_SIGUIENTE_NOTIFICACION',
  /** Alias funcional del documento OD40 */
  DIA_SIGUIENTE_NOTIFICACION_ORDEN: 'DIA_SIGUIENTE_NOTIFICACION',
  SUSCRIPCION_ACTA_INICIO: 'SUSCRIPCION_ACTA_INICIO',
  DIA_SIGUIENTE_ACTA_INICIO: 'DIA_SIGUIENTE_ACTA_INICIO',
  SUSCRIPCION_CONTRATO: 'SUSCRIPCION_CONTRATO',
  DIA_SIGUIENTE_CONTRATO: 'DIA_SIGUIENTE_CONTRATO',
});

export const CONDICIONES_INICIO_LABEL_CANON = Object.freeze({
  EMISION_ORDEN: 'A PARTIR DE EMISIÓN ORDEN',
  DIA_SIGUIENTE_NOTIFICACION: 'AL DÍA SIGUIENTE DE NOTIFICACIÓN ORDEN',
  SUSCRIPCION_ACTA_INICIO: 'A PARTIR DE SUSCRITA EL ACTA INICIO',
  DIA_SIGUIENTE_ACTA_INICIO: 'AL DÍA SIGUIENTE DE SUSCRITA EL ACTA INICIO',
  SUSCRIPCION_CONTRATO: 'A PARTIR DE SUSCRIPCIÓN CONTRATO',
  DIA_SIGUIENTE_CONTRATO: 'AL DÍA SIGUIENTE DE SUSCRITO CONTRATO',
});

/** Labels amigables (UI con mayúscula inicial). */
export const CONDICIONES_INICIO_LABEL_UI = Object.freeze({
  EMISION_ORDEN: 'A partir de la emisión de la orden',
  DIA_SIGUIENTE_NOTIFICACION: 'Al día siguiente de la notificación de la orden',
  SUSCRIPCION_ACTA_INICIO: 'A partir de la suscripción del acta de inicio',
  DIA_SIGUIENTE_ACTA_INICIO: 'Al día siguiente de suscrita el acta de inicio',
  SUSCRIPCION_CONTRATO: 'A partir de la suscripción del contrato',
  DIA_SIGUIENTE_CONTRATO: 'Al día siguiente de suscrito el contrato',
});

const LEGACY_COND_MAP = Object.freeze({
  INICIO_PLAZO_ENVIO_PROVEEDOR: 'DIA_SIGUIENTE_NOTIFICACION',
  INICIO_PLAZO_CONFIRMACION_RECEPCION: 'DIA_SIGUIENTE_NOTIFICACION',
  NOTIFICACION: 'DIA_SIGUIENTE_NOTIFICACION',
  NOTIFICACION_ORDEN: 'DIA_SIGUIENTE_NOTIFICACION',
  EMISION: 'EMISION_ORDEN',
  ACTA: 'SUSCRIPCION_ACTA_INICIO',
  CONTRATO: 'SUSCRIPCION_CONTRATO',
});

export function formatDateEs(value) {
  const iso = toIsoDateString(value);
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatDateTimeEs(value) {
  if (value == null || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const iso = toIsoDateString(value);
    return iso ? formatDateEs(iso) : '—';
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Normaliza condición de inicio a código canónico.
 * Nunca deja códigos legacy visibles en UI.
 */
export function normalizeCondicionInicio(raw) {
  const s = String(raw || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  if (!s) return null;
  if (LEGACY_COND_MAP[s]) return LEGACY_COND_MAP[s];
  if (s === 'DIA_SIGUIENTE_NOTIFICACION_ORDEN') return 'DIA_SIGUIENTE_NOTIFICACION';
  if (CONDICIONES_INICIO_FECHA[s] || CONDICIONES_INICIO_CANON[s]) {
    return CONDICIONES_INICIO_CANON[s] || s;
  }
  if (Object.values(CONDICIONES_INICIO_CANON).includes(s)) return s;
  return null;
}

export function labelCondicionInicio(raw, { formal = false } = {}) {
  const code = normalizeCondicionInicio(raw);
  if (!code) return 'Pendiente';
  return formal
    ? (CONDICIONES_INICIO_LABEL_CANON[code] || code)
    : (CONDICIONES_INICIO_LABEL_UI[code] || code);
}

function isEnvioExitoso(estado) {
  const s = String(estado || '').toUpperCase();
  if (!s) return false;
  if (/FAIL|ERROR|RECHAZ|BOUNCE|INVALID/.test(s)) return false;
  return /ENVIAD|OK|EXITO|SUCCESS|CONFIRM|ENTREG|NOTIFIC/.test(s) || s === 'SENT';
}

/**
 * Fecha canónica de notificación al proveedor (YYYY-MM-DD + raw datetime).
 * Preferencia: primer envío exitoso; fallback: enviado_proveedor_at.
 */
export function resolveOrdenFechaNotificacion(orden = {}, envios = []) {
  const list = Array.isArray(envios) ? [...envios] : [];
  list.sort((a, b) => {
    const ta = new Date(a.enviado_at || a.created_at || 0).getTime();
    const tb = new Date(b.enviado_at || b.created_at || 0).getTime();
    return ta - tb;
  });
  const exitoso = list.find((e) => isEnvioExitoso(e.estado) && (e.enviado_at || e.created_at));
  const raw = exitoso?.enviado_at
    || exitoso?.created_at
    || orden.enviado_proveedor_at
    || orden.fecha_notificacion
    || orden.notificado_at
    || orden.fecha_envio
    || null;
  return {
    fechaNotificacion: toIsoDateString(raw),
    fechaNotificacionAt: raw || null,
    fuente: exitoso ? 'orden_envios_proveedor.primer_exitoso' : (orden.enviado_proveedor_at ? 'orden.enviado_proveedor_at' : null),
    intento: exitoso?.intento ?? exitoso?.id ?? null,
  };
}

export function resolveFechaEfectivaInicio({
  condicionInicio,
  fechaEmision,
  fechaNotificacion,
  fechaActaInicio,
  fechaContrato,
  plazoDias = null,
  tipoDias = 'calendario',
} = {}) {
  const cond = normalizeCondicionInicio(condicionInicio) || 'EMISION_ORDEN';
  const calc = calcularFechaMaximaEntrega({
    condicionInicio: cond,
    fechaOrden: fechaEmision,
    fechaNotificacion,
    fechaActa: fechaActaInicio,
    fechaContrato,
    plazoDias: plazoDias != null ? plazoDias : 1,
    tipoDias,
  });
  let pendienteMotivo = calc.pendienteMotivo || null;
  if (!calc.fechaEfectivaInicio) {
    if (cond === 'EMISION_ORDEN') pendienteMotivo = pendienteMotivo || 'Falta fecha de emisión';
    if (cond === 'DIA_SIGUIENTE_NOTIFICACION') pendienteMotivo = pendienteMotivo || 'Pendiente de notificación';
    if (cond.includes('ACTA')) pendienteMotivo = pendienteMotivo || 'Falta fecha del acta de inicio';
    if (cond.includes('CONTRATO')) pendienteMotivo = pendienteMotivo || 'Falta fecha de contrato';
  }
  return {
    condicionInicio: cond,
    condicionLabel: labelCondicionInicio(cond),
    condicionLabelFormal: labelCondicionInicio(cond, { formal: true }),
    fechaEmision: toIsoDateString(fechaEmision),
    fechaNotificacion: toIsoDateString(fechaNotificacion),
    fechaBase: calc.fechaEvento,
    fechaEfectiva: calc.fechaEfectivaInicio,
    fechaMaxima: (plazoDias != null && Number(plazoDias) > 0)
      ? calc.fechaMaxima
      : null,
    pendiente: !calc.fechaEfectivaInicio,
    pendienteMotivo,
  };
}

/**
 * Contrato completo por entrega (o por orden si no hay entrega).
 */
export function resolveOrdenCronogramaContractual(orden = {}, entrega = {}, extras = {}) {
  const notif = resolveOrdenFechaNotificacion(orden, extras.envios || []);
  // Normaliza cada candidato por separado (no un OR crudo) para que un valor
  // legacy/no-canónico en la entrega (p.ej. placeholder de enriquecimiento)
  // no enmascare la condición realmente vigente a nivel de orden.
  const condicion = normalizeCondicionInicio(entrega.evento_inicio_plazo)
    || normalizeCondicionInicio(entrega.condicion_inicio)
    || normalizeCondicionInicio(orden.condicion_inicio)
    || normalizeCondicionInicio(extras.condicionInicio)
    || 'EMISION_ORDEN';

  const plazo = Number(
    entrega.dias_plazo
    ?? extras.plazoDias
    ?? orden.plazo_entrega_dias
    ?? null,
  );

  const fechas = resolveFechaEfectivaInicio({
    condicionInicio: condicion,
    fechaEmision: orden.fecha_orden || orden.fecha_emision || extras.fechaEmision,
    fechaNotificacion: notif.fechaNotificacion,
    fechaActaInicio: extras.fechaActaInicio || orden.fecha_evento_inicio || entrega.fecha_manual,
    fechaContrato: extras.fechaContrato || entrega.fecha_manual,
    plazoDias: Number.isFinite(plazo) ? plazo : null,
    tipoDias: entrega.tipo_dias || 'calendario',
  });

  const etiqueta = resolveEtiquetaEntrega(entrega, {
    totalEntregas: extras.totalEntregas || 1,
  });

  return {
    ...fechas,
    fechaNotificacionAt: notif.fechaNotificacionAt,
    fechaNotificacionFuente: notif.fuente,
    plazoEntrega: Number.isFinite(plazo) ? plazo : null,
    plazoEntregaLabel: Number.isFinite(plazo) && plazo > 0 ? `${plazo} días` : '—',
    etiquetaEntrega: etiqueta,
    entregaContract: buildEntregaContract(entrega, { totalEntregas: extras.totalEntregas || 1 }),
  };
}

/**
 * Distribuye PU y Total de un ítem entre N entregables contractuales, manteniendo
 * cantidad × PU = Total en cada línea (RC8.12 Obs.07 punto 6). Con N=1 (caso típico
 * BIEN) es un no-op: devuelve el PU/Total del ítem sin cambios.
 */
export function resolveOrdenEntregaItemLinea(item = {}, totalEntregas = 1) {
  const n = Number(totalEntregas) > 0 ? Number(totalEntregas) : 1;
  return {
    precio_unitario: Number((Number(item?.precio_unitario || 0) / n).toFixed(4)),
    precio_total: Number((Number(item?.precio_total || 0) / n).toFixed(2)),
  };
}

/**
 * Plazo de entrega contractual a nivel de orden (resumen del expediente).
 * Con N entregables, el plazo final es el MÁXIMO entre ellos (no el del primer
 * registro, no la suma) — el último hito contractual acota el plazo total.
 * Funciona igual para 1 entrega (BIEN típico): devuelve su propio plazo.
 */
export function resolveOrdenPlazoContractual(entregas = []) {
  const dias = (Array.isArray(entregas) ? entregas : [])
    .map((e) => Number(e?.dias_plazo))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!dias.length) return null;
  return Math.max(...dias);
}

/**
 * Empareja ítem de orden con pedido SIGAMEF (por índice / descripción / código en meta).
 */
export function resolveItemPedidoSigamef(item = {}, pedidos = [], index = 0) {
  const list = Array.isArray(pedidos) ? pedidos : [];
  if (!list.length) {
    return {
      codigo_sigamef: item.codigo_sigamef || item.codigo || null,
      pedido_sigamef: item.pedido_sigamef || null,
      centro: item.centro || null,
      centro_costo: item.centro_costo || null,
      especifica: item.especifica_gasto || item.especifica || null,
      unidad_medida: item.unidad_medida || null,
      descripcion_pedido: null,
    };
  }
  const desc = String(item.descripcion || '').trim().toUpperCase();
  let ped = list.find((p) => {
    const pd = String(p.descripcion || '').trim().toUpperCase();
    return pd && desc && (pd === desc || pd.includes(desc) || desc.includes(pd));
  });
  if (!ped && item.codigo_sigamef) {
    ped = list.find((p) => String(p.codigo_sigamef || '') === String(item.codigo_sigamef));
  }
  if (!ped && list.length === 1) ped = list[0];
  if (!ped) ped = list[Math.min(index, list.length - 1)] || list[0];

  return {
    codigo_sigamef: ped?.codigo_sigamef || item.codigo_sigamef || item.codigo || null,
    pedido_sigamef: ped?.pedido_sigamef || ped?.nro_pedido || item.pedido_sigamef || null,
    centro: ped?.centro || item.centro || null,
    centro_costo: ped?.centro_costo || item.centro_costo || null,
    especifica: ped?.especifica || ped?.especifica_gasto || item.especifica_gasto || item.especifica || null,
    unidad_medida: item.unidad_medida || ped?.unidad_medida || null,
    descripcion_pedido: ped?.descripcion || null,
    pedido_id: ped?.id || null,
  };
}

/**
 * Área Usuaria: requerimiento.area → solicitud.area_usuaria → payload.area → centro_costo.
 * Nunca usar centro organizacional (CNSP) como fallback de AU.
 */
export function resolveAreaUsuaria({
  requerimientoArea = '',
  solicitudAreaUsuaria = '',
  payloadArea = '',
  centroCosto = '',
  centro = '',
} = {}) {
  const pick = (...vals) => {
    for (const v of vals) {
      const s = String(v || '').trim();
      if (!s) continue;
      if (typeof v === 'object' && v !== null) {
        const nested = v.nombre || v.label || v.descripcion || v.area || '';
        if (String(nested).trim()) return String(nested).trim();
        continue;
      }
      // Evitar siglas de centro como AU
      if (/^[A-Z]{2,6}$/.test(s) && s === String(centro || '').trim()) continue;
      return s;
    }
    return '';
  };
  return pick(requerimientoArea, solicitudAreaUsuaria, payloadArea, centroCosto) || null;
}

/**
 * Expande entregas × ítems (combinaciones contractuales).
 */
export function expandItemEntregaCombinaciones(items = [], entregas = []) {
  const out = [];
  const totalEnt = entregas.length;
  for (const ent of entregas) {
    const lineas = Array.isArray(ent.items) && ent.items.length
      ? ent.items
      : items.map((it) => ({
        orden_item_id: it.id,
        cantidad: Number(it.cantidad || 0),
        precio_unitario: Number(it.precio_unitario || 0),
        precio_total: Number(it.precio_total || 0),
        item_descripcion: it.descripcion,
        orden_item: it.orden_item,
      }));
    for (const li of lineas) {
      if (!(Number(li.cantidad) > 0)) continue;
      const item = items.find((it) => Number(it.id) === Number(li.orden_item_id)) || null;
      out.push({
        orden_item_id: li.orden_item_id || item?.id || null,
        orden_entrega_id: ent.id || ent.entrega_id || null,
        codigo_sigamef: item?.codigo_sigamef || null,
        descripcion: item?.descripcion || li.item_descripcion || '—',
        cantidad: Number(li.cantidad),
        precio_unitario: Number(li.precio_unitario ?? item?.precio_unitario ?? 0),
        precio_total: Number(li.precio_total ?? (Number(li.cantidad) * Number(li.precio_unitario || 0))),
        etiqueta_entrega: ent.etiqueta_entrega || resolveEtiquetaEntrega(ent, { totalEntregas: totalEnt }),
        numero_entrega: ent.numero_entrega,
        tipo_entrega: ent.tipo_entrega,
        evento_inicio_plazo: ent.evento_inicio_plazo,
        dias_plazo: ent.dias_plazo,
        fecha_base: ent.fecha_base,
        fecha_maxima: ent.fecha_maxima,
        lugar_entrega: ent.lugar_entrega,
        unidad_medida: item?.unidad_medida || null,
        pedido_sigamef: item?.pedido_sigamef || null,
        centro: item?.centro || null,
        centro_costo: item?.centro_costo || null,
      });
    }
  }
  // Si no hay líneas en entregas pero hay ítems, una fila por ítem con primera entrega
  if (!out.length && items.length && entregas.length) {
    const ent = entregas[0];
    for (const item of items) {
      out.push({
        orden_item_id: item.id,
        orden_entrega_id: ent.id,
        codigo_sigamef: item.codigo_sigamef,
        descripcion: item.descripcion,
        cantidad: Number(item.cantidad),
        precio_unitario: Number(item.precio_unitario),
        precio_total: Number(item.precio_total),
        etiqueta_entrega: ent.etiqueta_entrega || resolveEtiquetaEntrega(ent, { totalEntregas: totalEnt }),
        numero_entrega: ent.numero_entrega,
        tipo_entrega: ent.tipo_entrega,
        evento_inicio_plazo: ent.evento_inicio_plazo,
        dias_plazo: ent.dias_plazo,
        fecha_base: ent.fecha_base,
        fecha_maxima: ent.fecha_maxima,
        lugar_entrega: ent.lugar_entrega,
        unidad_medida: item.unidad_medida,
        pedido_sigamef: item.pedido_sigamef,
        centro: item.centro,
        centro_costo: item.centro_costo,
      });
    }
  }
  return out;
}

export function formatPlazoLabel(dias) {
  const n = Number(dias);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${n} día${n === 1 ? '' : 's'}`;
}
