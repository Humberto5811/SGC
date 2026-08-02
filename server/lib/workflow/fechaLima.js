/**
 * Helper único de fechas America/Lima para el Workflow SGC.
 * Reglas:
 * - El timestamp real se guarda en BD sin conversión.
 * - Para UI se convierte a America/Lima (UTC-5, sin horario de verano).
 * - Prohibido slice(0,16) / replace('T',' ') para fechas del tramo.
 * - No se cambia la zona horaria global del servidor como parche.
 */
const TZ_LIMA = 'America/Lima';

/**
 * Formatea una fecha ISO a cadena corta en hora de Lima.
 * Ej.: 2026-08-01T00:13:00.000Z → '31/07/2026 19:13'
 *
 * @param {string|Date|null} value
 * @returns {string} 'dd/mm/yyyy HH:mm' o '' si nulo/inválido
 */
export function formatFechaLima(value) {
  if (value == null || value === '') return '';
  const d = (value instanceof Date) ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  // America/Lima = UTC-5. America/Lima no usa DST.
  // Normalizamos: restar 5h y formatear partes locales (equivalente a UTC-5).
  const lima = new Date(d.getTime() - 5 * 3600 * 1000);
  const dd = String(lima.getUTCDate()).padStart(2, '0');
  const mm = String(lima.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = lima.getUTCFullYear();
  const hh = String(lima.getUTCHours()).padStart(2, '0');
  const min = String(lima.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Convierte a Date en zona Lima (para contratos API que expongan fecha_presentacion_lima como ISO).
 * No cambia la zona global; solo devuelve el timestamp desplazado a UTC-5.
 *
 * @param {string|Date|null} value
 * @returns {string|null} ISO con offset -05:00, o null si inválido
 */
export function fechaLimaISO(value) {
  if (value == null || value === '') return null;
  const d = (value instanceof Date) ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const lima = new Date(d.getTime() - 5 * 3600 * 1000);
  return lima.toISOString().replace('Z', '-05:00');
}

/**
 * Expone las fecha_presentacion (real) y fecha_presentacion_lima (formateada UI)
 * para el contrato API del tramo de recepción/cotizaciones.
 */
export function buildFechasContrato({ fecha_presentacion } = {}) {
  return {
    fecha_presentacion: fecha_presentacion || null,
    fecha_presentacion_lima: formatFechaLima(fecha_presentacion) || null,
  };
}

export default { formatFechaLima, fechaLimaISO, buildFechasContrato };