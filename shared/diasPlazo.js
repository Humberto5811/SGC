/**
 * Utilidad de plazos (calendario / hábiles).
 * Conteo INCLUSIVO: el día efectivo de inicio cuenta como día 1.
 * fecha_maxima = fecha_efectiva + (plazo_dias - 1)
 *
 * PENDIENTE: no hay catálogo de feriados; días hábiles = lun–vie.
 */

export const TIPO_DIAS = Object.freeze({
  CALENDARIO: 'calendario',
  HABILES: 'habiles',
});

/** Normaliza cualquier fecha (Date, ISO, timestamp) a YYYY-MM-DD. */
export function toIsoDateString(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Evitar String(Date).slice(0,10) → "Fri Jul 24"
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(s)) {
    return toIsoDateString(parsed);
  }
  return null;
}

function asDate(value) {
  const iso = toIsoDateString(value);
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toIsoDate(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function addOneDay(isoDate) {
  const d = asDate(isoDate);
  if (!d) return null;
  d.setDate(d.getDate() + 1);
  return toIsoDate(d);
}

/**
 * @param {string|Date} fechaBase — día 1 del plazo (inclusivo)
 * @param {number} dias — plazo aplicable (≥ 1; 0 o 1 = misma fecha)
 * @param {'calendario'|'habiles'} tipoDias
 * @returns {string|null} YYYY-MM-DD
 */
export function calcularFechaMaxima(fechaBase, dias, tipoDias = TIPO_DIAS.CALENDARIO) {
  const base = asDate(fechaBase);
  const n = Number(dias);
  if (!base || !Number.isFinite(n) || n < 0) return null;
  // Inclusivo: plazo 0 o 1 → mismo día de inicio
  if (n <= 1) return toIsoDate(base);

  const tipo = String(tipoDias || TIPO_DIAS.CALENDARIO).toLowerCase();
  const toAdd = Math.trunc(n) - 1; // resto de días después del día 1

  if (tipo === TIPO_DIAS.HABILES || tipo === 'hábil' || tipo === 'habil') {
    let remaining = toAdd;
    const cur = new Date(base.getTime());
    while (isWeekend(cur)) cur.setDate(cur.getDate() + 1);
    while (remaining > 0) {
      cur.setDate(cur.getDate() + 1);
      if (!isWeekend(cur)) remaining -= 1;
    }
    return toIsoDate(cur);
  }

  const cur = new Date(base.getTime());
  cur.setDate(cur.getDate() + toAdd);
  return toIsoDate(cur);
}

export function normalizeTipoDias(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'habiles' || s === 'hábil' || s === 'habil' || s === 'business') return TIPO_DIAS.HABILES;
  return TIPO_DIAS.CALENDARIO;
}

const COND = Object.freeze({
  EMISION_ORDEN: 'EMISION_ORDEN',
  DIA_SIGUIENTE_NOTIFICACION: 'DIA_SIGUIENTE_NOTIFICACION',
  SUSCRIPCION_ACTA_INICIO: 'SUSCRIPCION_ACTA_INICIO',
  DIA_SIGUIENTE_ACTA_INICIO: 'DIA_SIGUIENTE_ACTA_INICIO',
  SUSCRIPCION_CONTRATO: 'SUSCRIPCION_CONTRATO',
  DIA_SIGUIENTE_CONTRATO: 'DIA_SIGUIENTE_CONTRATO',
});

/**
 * Cálculo central de fechas de entrega (fuente única BE/FE).
 * @returns {{ fechaEvento, fechaEfectivaInicio, fechaMaxima, pendienteNotificacion, pendienteMotivo }}
 */
export function calcularFechaMaximaEntrega({
  condicionInicio,
  fechaOrden,
  fechaNotificacion,
  fechaActa,
  fechaContrato,
  plazoDias,
  tipoDias = TIPO_DIAS.CALENDARIO,
} = {}) {
  const cond = String(condicionInicio || '').toUpperCase();
  const plazo = Number(plazoDias);
  let fechaEvento = null;
  let fechaEfectivaInicio = null;
  let pendienteNotificacion = false;
  let pendienteMotivo = null;

  if (cond === COND.EMISION_ORDEN) {
    fechaEvento = toIsoDateString(fechaOrden);
    fechaEfectivaInicio = fechaEvento;
  } else if (cond === COND.DIA_SIGUIENTE_NOTIFICACION) {
    fechaEvento = toIsoDateString(fechaNotificacion);
    if (!fechaEvento) {
      pendienteNotificacion = true;
      pendienteMotivo = 'Pendiente de notificación';
    } else {
      fechaEfectivaInicio = addOneDay(fechaEvento);
    }
  } else if (cond === COND.SUSCRIPCION_ACTA_INICIO) {
    fechaEvento = toIsoDateString(fechaActa);
    fechaEfectivaInicio = fechaEvento;
  } else if (cond === COND.DIA_SIGUIENTE_ACTA_INICIO) {
    fechaEvento = toIsoDateString(fechaActa);
    fechaEfectivaInicio = fechaEvento ? addOneDay(fechaEvento) : null;
  } else if (cond === COND.SUSCRIPCION_CONTRATO) {
    fechaEvento = toIsoDateString(fechaContrato);
    fechaEfectivaInicio = fechaEvento;
  } else if (cond === COND.DIA_SIGUIENTE_CONTRATO) {
    fechaEvento = toIsoDateString(fechaContrato);
    fechaEfectivaInicio = fechaEvento ? addOneDay(fechaEvento) : null;
  }

  const fechaMaxima = (fechaEfectivaInicio && Number.isFinite(plazo) && plazo > 0)
    ? calcularFechaMaxima(fechaEfectivaInicio, plazo, tipoDias)
    : null;

  return {
    fechaEvento,
    fechaEfectivaInicio,
    fechaMaxima,
    pendienteNotificacion,
    pendienteMotivo,
  };
}

export { addOneDay, COND as CONDICIONES_INICIO_FECHA };
