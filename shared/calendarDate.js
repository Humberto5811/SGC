/**
 * Fechas de calendario sin desfase de zona horaria.
 * No usar new Date('dd/mm/yyyy') ni comparar textos crudos.
 */

/**
 * @typedef {{ y: number, m: number, d: number }} CalendarParts
 */

/**
 * Admite:
 * - 30/07/2026
 * - 2026-07-30
 * - 2026-07-30T00:00:00.000Z
 * - Date
 * @returns {CalendarParts|null}
 */
export function parseCalendarDate(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      y: value.getFullYear(),
      m: value.getMonth() + 1,
      d: value.getDate(),
    };
  }

  const s = String(value).trim();
  if (!s) return null;

  // dd/mm/yyyy o dd-mm-yyyy
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (!isValidParts(y, m, d)) return null;
    return { y, m, d };
  }

  // yyyy-mm-dd… (incluye ISO con hora / Z)
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    // Si viene con Z a medianoche UTC, preferir componentes del string (calendario contractual)
    if (!isValidParts(y, m, d)) return null;
    return { y, m, d };
  }

  return null;
}

function isValidParts(y, m, d) {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** YYYY-MM-DD comparable / persistible */
export function toCalendarIso(value) {
  const p = parseCalendarDate(value);
  if (!p) return null;
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** dd/mm/yyyy */
export function formatCalendarDdMmYyyy(value) {
  const p = parseCalendarDate(value);
  if (!p) return '—';
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
}

const TZ_LIMA = 'America/Lima';

function formatPartsDdMmYyyy(y, m, d) {
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function formatInstantLima(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: TZ_LIMA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/**
 * Fecha calendario en America/Lima (DD/MM/YYYY), sin desfase por TZ del runtime.
 * Orden: instant ISO → fecha calendario YYYY-MM-DD → DD/MM/YYYY explícito → Date/timestamp.
 * @param {Date|string|number} [value] — default: ahora
 * @returns {string} dd/mm/yyyy o '' si inválido
 */
export function formatFechaCalendarioLima(value = new Date()) {
  if (value == null || value === '') return formatInstantLima(new Date());

  const asStr = String(value).trim();
  if (!asStr) return formatInstantLima(new Date());

  // Instant / timestamp con hora (prioridad sobre DD/MM ya convertido en TZ incorrecta)
  if (/^\d{4}-\d{2}-\d{2}T/.test(asStr) || /Z$/.test(asStr) || /[+-]\d{2}:\d{2}$/.test(asStr)) {
    const parsed = new Date(asStr);
    if (!Number.isNaN(parsed.getTime())) return formatInstantLima(parsed);
  }

  // Fecha calendario sin hora (contrato / persistencia DATE)
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asStr);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (isValidParts(y, m, d)) return formatPartsDdMmYyyy(y, m, d);
  }

  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(asStr);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (isValidParts(y, m, d)) return formatPartsDdMmYyyy(y, m, d);
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return formatInstantLima(d);
}

/** Marca fecha de validación: calendario Lima + instante UTC para PDF/UI. */
export function stampFechaValidacionCalendarioLima(now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now);
  return {
    fecha: formatFechaCalendarioLima(instant),
    fecha_instant: instant.toISOString(),
  };
}

/**
 * Fecha para pie PDF / reporte: prioriza fecha_instant (evita DD/MM legacy en TZ UTC).
 */
export function resolveFechaValidacionParaPdf(opts = {}) {
  const instant = opts.fecha_instant || opts.fechaInstant || null;
  if (instant) return formatFechaCalendarioLima(instant);
  const raw = opts.fecha;
  if (raw) return formatFechaCalendarioLima(raw);
  return formatFechaCalendarioLima();
}

/**
 * Compara solo año/mes/día.
 * @returns {number} negativo si a < b, 0 si igual, positivo si a > b; NaN si inválido
 */
export function compareCalendarDates(a, b) {
  const pa = parseCalendarDate(a);
  const pb = parseCalendarDate(b);
  if (!pa || !pb) return NaN;
  if (pa.y !== pb.y) return pa.y - pb.y;
  if (pa.m !== pb.m) return pa.m - pb.m;
  return pa.d - pb.d;
}

/**
 * Regla recepción: fechaRecepcion >= fechaEmisionOrden
 * @returns {{ ok: boolean, code?: string, message?: string, fechaRecepcion?: string, fechaEmision?: string }}
 */
export function validateFechaRecepcionVsEmision(fechaRecepcion, fechaEmisionOrden) {
  const rec = toCalendarIso(fechaRecepcion);
  const emi = toCalendarIso(fechaEmisionOrden);
  if (!rec) {
    return {
      ok: false,
      code: 'FECHA_RECEPCION_INVALIDA',
      message: 'La fecha de recepción no es válida.',
    };
  }
  if (!emi) {
    return { ok: true, fechaRecepcion: rec, fechaEmision: null };
  }
  if (compareCalendarDates(rec, emi) < 0) {
    return {
      ok: false,
      code: 'FECHA_RECEPCION_ANTERIOR_EMISION',
      message: 'La fecha de recepción no puede ser anterior a la fecha de emisión de la orden.',
      fechaRecepcion: rec,
      fechaEmision: emi,
    };
  }
  return { ok: true, fechaRecepcion: rec, fechaEmision: emi };
}

/**
 * Penalidad SÍ/NO: recepción posterior a fecha máxima.
 */
export function correspondeAplicarPenalidad(fechaRecepcion, fechaMaximaEntrega) {
  const cmp = compareCalendarDates(fechaRecepcion, fechaMaximaEntrega);
  if (Number.isNaN(cmp)) return null;
  return cmp > 0 ? 'SÍ' : 'NO';
}
