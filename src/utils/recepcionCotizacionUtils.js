/** Utilidades compartidas — bandeja Recepción de Cotizaciones. */

export function puedeEnviarValidarRecepcion(c) {
  const v = String(c?.validacion_estado || '').toUpperCase();
  return c?.estado === 'COTIZACION_PRESENTADA' && (!v || v === 'PENDIENTE');
}

export function formatRequerimientosBandeja(c, esc) {
  const raw = c?.requerimientos_codigos || c?.requerimientos_texto || '';
  const codes = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  if (!codes.length) return '—';
  if (codes.length <= 2) {
    return codes.map((code) => `<div class="small">${esc(code)}</div>`).join('');
  }
  const title = codes.join(', ');
  return `<span class="small" title="${esc(title)}">${esc(codes[0])} <span class="text-muted">+ ${codes.length - 1} más</span></span>`;
}
