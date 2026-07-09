/**
 * Cronograma — fechas/horas sin conversión de zona horaria.
 * Los campos TIMESTAMP WITHOUT TIME ZONE deben mostrarse con la misma hora
 * que ingresó el analista en Invitaciones.
 */

const CRONOGRAMA_FIELDS = [
  'consultas_inicio', 'consultas_fin', 'cotizaciones_inicio', 'cotizaciones_fin',
];

/** Fragmento SQL: devuelve ISO naive YYYY-MM-DD"T"HH24:MI desde la BD. */
export const CRONOGRAMA_SELECT_SQL = `
  to_char(sc.consultas_inicio, 'YYYY-MM-DD"T"HH24:MI') AS consultas_inicio,
  to_char(sc.consultas_fin, 'YYYY-MM-DD"T"HH24:MI') AS consultas_fin,
  to_char(sc.cotizaciones_inicio, 'YYYY-MM-DD"T"HH24:MI') AS cotizaciones_inicio,
  to_char(sc.cotizaciones_fin, 'YYYY-MM-DD"T"HH24:MI') AS cotizaciones_fin`;

export function formatTimestampNaive(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  const naive = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (naive) return `${naive[1]}T${naive[2]}`;
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}T${pad(val.getHours())}:${pad(val.getMinutes())}`;
  }
  return s;
}

export function normalizeCronogramaRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  CRONOGRAMA_FIELDS.forEach((f) => {
    if (out[f] != null) out[f] = formatTimestampNaive(out[f]);
  });
  return out;
}

export function parseCronogramaDate(val) {
  const naive = formatTimestampNaive(val);
  if (!naive) return null;
  const d = new Date(naive);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isConvocatoriaCerrada(solicitud) {
  if (!solicitud?.cotizaciones_fin) return false;
  if (String(solicitud.estado || solicitud.solicitud_estado || '').toUpperCase() === 'CERRADA') return true;
  const fin = parseCronogramaDate(solicitud.cotizaciones_fin);
  return fin ? new Date() > fin : false;
}
