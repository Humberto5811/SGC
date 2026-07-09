/**
 * Formato de cronograma — misma hora que Invitaciones (sin desfase UTC).
 */

export function formatCronogramaDisplay(v) {
  if (!v) return '—';
  const s = String(v).trim();
  const naive = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (naive && !s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    return `${naive[1]} ${naive[2]}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return s.slice(0, 16).replace('T', ' ');
}

export function formatCronogramaRangoDisplay(inicio, fin) {
  if (!inicio && !fin) return '—';
  return `${formatCronogramaDisplay(inicio)} — ${formatCronogramaDisplay(fin)}`;
}

/** Para inputs datetime-local: respeta ISO naive sin aplicar offset UTC. */
export function toDatetimeLocalValue(d) {
  if (!d) return '';
  const s = String(d).trim();
  const naive = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (naive && !s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
    return `${naive[1]}T${naive[2]}`;
  }
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function splitDatetimeParts(iso, toLocalFn) {
  const local = toLocalFn ? toLocalFn(iso) : toDatetimeLocalValue(iso);
  if (!local) return { date: '', time: '' };
  const [date, time] = String(local).split('T');
  return { date: date || '', time: (time || '00:00').slice(0, 5) };
}
