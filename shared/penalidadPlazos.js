/**
 * Cálculos base de plazos para evaluación de penalidad (sin monto económico).
 */
import { toIsoDateString } from './diasPlazo.js';

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

export function addCalendarDays(isoDate, days) {
  const d = asDate(isoDate);
  const n = Number(days);
  if (!d || !Number.isFinite(n)) return null;
  d.setDate(d.getDate() + Math.trunc(n));
  return toIsoDate(d);
}

export function diffCalendarDays(fechaPosterior, fechaAnterior) {
  const a = asDate(fechaPosterior);
  const b = asDate(fechaAnterior);
  if (!a || !b) return 0;
  const ms = a.getTime() - b.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

export function calcularPenalidadPlazosBase({
  fechaMaximaContractual = null,
  ampliaciones = [],
  fechaPresentacion = null,
} = {}) {
  const totalDiasAmpliacion = (ampliaciones || []).reduce(
    (sum, row) => sum + Number(row.dias_ampliacion || 0),
    0,
  );
  const fechaMaximaAjustada = fechaMaximaContractual
    ? addCalendarDays(fechaMaximaContractual, totalDiasAmpliacion)
    : null;
  const diasAtraso = fechaPresentacion && fechaMaximaAjustada
    ? diffCalendarDays(fechaPresentacion, fechaMaximaAjustada)
    : 0;
  return {
    total_dias_ampliacion: totalDiasAmpliacion,
    fecha_maxima_contractual: toIsoDateString(fechaMaximaContractual),
    fecha_maxima_ajustada: fechaMaximaAjustada,
    fecha_presentacion: toIsoDateString(fechaPresentacion),
    dias_atraso: diasAtraso,
  };
}

export function validarCoherenciaPenalidad({
  correspondePenalidad,
  diasAtraso = 0,
  observacion = '',
} = {}) {
  const obs = String(observacion || '').trim();
  if (correspondePenalidad === true && Number(diasAtraso) <= 0 && !obs) {
    return {
      ok: false,
      code: 'PENALIDAD_SIN_ATRASO',
      message: 'Si corresponde penalidad debe existir atraso o registrar sustento en observación',
    };
  }
  if (correspondePenalidad === false && Number(diasAtraso) > 0 && !obs) {
    return {
      ok: false,
      code: 'PENALIDAD_ATRASO_SIN_SUSTENTO',
      message: 'Si no corresponde penalidad con días de atraso, la observación es obligatoria',
    };
  }
  return { ok: true };
}
