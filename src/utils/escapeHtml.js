/**
 * Escape HTML special characters to prevent XSS in template strings.
 * @param {*} s - Value to escape (coerced to string; null/undefined become '').
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
