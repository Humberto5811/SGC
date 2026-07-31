/**
 * Cronograma — fechas/horas sin conversión de zona horaria.
 * Los campos TIMESTAMP WITHOUT TIME ZONE deben mostrarse con la misma hora
 * que ingresó el analista en Invitaciones.
 *
 * Comparaciones de vigencia usan America/Lima (hora de negocio), no UTC del servidor.
 */

const CRONOGRAMA_FIELDS = [
  'consultas_inicio', 'consultas_fin', 'cotizaciones_inicio', 'cotizaciones_fin',
];

export const TZ_LIMA = 'America/Lima';

/** Fragmento SQL: devuelve ISO naive YYYY-MM-DD"T"HH24:MI desde la BD. */
export const CRONOGRAMA_SELECT_SQL = `
  to_char(sc.consultas_inicio, 'YYYY-MM-DD"T"HH24:MI') AS consultas_inicio,
  to_char(sc.consultas_fin, 'YYYY-MM-DD"T"HH24:MI') AS consultas_fin,
  to_char(sc.cotizaciones_inicio, 'YYYY-MM-DD"T"HH24:MI') AS cotizaciones_inicio,
  to_char(sc.cotizaciones_fin, 'YYYY-MM-DD"T"HH24:MI') AS cotizaciones_fin`;

/**
 * Orden SQL para la invitación vigente (mismo proveedor + solicitud).
 * Usar tras DISTINCT ON (solicitud_id [, proveedor_id]).
 */
export const INVITACION_VIGENTE_ORDER_SQL = `
  COALESCE(ip.nro_invitacion, 1) DESC,
  ip.fecha_envio DESC NULLS LAST,
  ip.id DESC`;

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

/** Ahora en America/Lima como YYYY-MM-DDTHH:mm (hora de negocio). */
export function limaNowNaive(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_LIMA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/**
 * Parsea fecha de cronograma naive. Preferir comparar con limaNowNaive (strings).
 * @deprecated para vigencia — usar isConvocatoriaCerrada / limaNowNaive
 */
export function parseCronogramaDate(val) {
  const naive = formatTimestampNaive(val);
  if (!naive) return null;
  const d = new Date(naive);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ¿Venció el plazo de cotización?
 * `cotizaciones_fin` es TIMESTAMP WITHOUT TIME ZONE = hora de negocio (Lima).
 * Se compara contra la hora actual en America/Lima (no contra UTC del VPS).
 *
 * @param {object} solicitud
 * @param {Date|string|number} [now] — inyectable en pruebas
 */
export function isConvocatoriaCerrada(solicitud, now = new Date()) {
  if (!solicitud?.cotizaciones_fin) return false;
  const estadoSol = String(solicitud.solicitud_estado || solicitud.estado || '').toUpperCase();
  if (estadoSol === 'CERRADA') return true;
  const fin = formatTimestampNaive(solicitud.cotizaciones_fin);
  if (!fin) return false;
  const ahora = limaNowNaive(now);
  if (!ahora) return false;
  return ahora > fin;
}

/**
 * Elige la invitación vigente entre filas ya cargadas.
 * Prioridad: mayor nro_invitacion → fecha_envio → id.
 */
export function pickInvitacionVigente(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return [...rows].sort((a, b) => {
    const na = Number(a.nro_invitacion) || 1;
    const nb = Number(b.nro_invitacion) || 1;
    if (nb !== na) return nb - na;
    const fa = a.fecha_envio ? new Date(a.fecha_envio).getTime() : 0;
    const fb = b.fecha_envio ? new Date(b.fecha_envio).getTime() : 0;
    if (fb !== fa) return fb - fa;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  })[0];
}
