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
