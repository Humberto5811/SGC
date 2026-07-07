/**
 * Normalización compartida para importaciones de Registro de Datos.
 */

const INVISIBLE_CHARS = /[\u200B-\u200D\uFEFF\u00A0]/g;

export function cleanString(value) {
  if (value == null) return '';
  return String(value)
    .replace(INVISIBLE_CHARS, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeHeaderKey(key) {
  return String(key || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .trim();
}

export function normalizeRowKeys(raw = {}) {
  const row = {};
  for (const [key, value] of Object.entries(raw)) {
    const normalized = normalizeHeaderKey(key);
    if (normalized) row[normalized] = value;
    const plain = String(key || '').toLowerCase().trim();
    if (plain && row[plain] === undefined) row[plain] = value;
  }
  return row;
}

export function isExcelSerialDate(value) {
  if (value == null || value === '') return false;
  const text = String(value).trim();
  if (!text || text.includes('/') || text.includes('-')) return false;
  const num = Number(text);
  return Number.isFinite(num) && num >= 20000 && num <= 120000;
}

export function excelSerialToIsoDate(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  const days = Math.round(Number(serial));
  const ms = epoch + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function normalizeDateValue(value) {
  if (value == null || value === '') return '';
  if (isExcelSerialDate(value)) return excelSerialToIsoDate(value);
  const text = cleanString(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const slash = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return text;
}

export function normalizeNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const text = cleanString(value).replace(/,/g, '');
  const num = Number(text);
  return Number.isFinite(num) ? num : fallback;
}

export function normalizeUpper(value) {
  return cleanString(value).toUpperCase();
}
