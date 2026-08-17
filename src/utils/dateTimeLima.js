/**
 * Formato de fecha/hora para visualización en zona America/Lima.
 * No muta el valor almacenado; solo presenta.
 */

const TZ_LIMA = 'America/Lima';

/**
 * @param {string|Date|number|null|undefined} valor
 * @param {{ empty?: string, style?: 'ymd'|'dmy' }} [opts]
 *   style 'ymd' (por defecto): "2026-07-31 12:41"
 *   style 'dmy': "31/07/2026 12:41"
 * @returns {string}
 */
export function formatDateTimeLima(valor, opts = {}) {
  const empty = opts.empty != null ? opts.empty : '—';
  const style = opts.style === 'dmy' ? 'dmy' : 'ymd';
  if (valor == null || valor === '') return empty;

  let d;
  if (valor instanceof Date) {
    d = valor;
  } else if (typeof valor === 'number' && Number.isFinite(valor)) {
    d = new Date(valor);
  } else {
    const s = String(valor).trim();
    if (!s) return empty;
    d = new Date(s);
  }

  if (Number.isNaN(d.getTime())) return empty;

  try {
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
    return style === 'dmy'
      ? `${get('day')}/${get('month')}/${get('year')} ${hour}:${get('minute')}`
      : `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
  } catch (_) {
    return empty;
  }
}

export { TZ_LIMA };
