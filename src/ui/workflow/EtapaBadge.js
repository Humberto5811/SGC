/**
 * RC8.17.2B — Badge institucional de Etapa (neutro; no usa colores de estado).
 */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ etapaLabel?: string, etapaCodigo?: string }} data
 */
export function renderEtapaBadgeHtml(data = {}) {
  const text = String(data.etapaLabel || data.etapaCodigo || '—').trim() || '—';
  return `<span class="sgc-etapa-badge" data-etapa-codigo="${esc(data.etapaCodigo || '')}" title="${esc(text)}" aria-label="Etapa: ${esc(text)}"><span class="sgc-etapa-badge__text">${esc(text)}</span></span>`;
}

export default { renderEtapaBadgeHtml };
