/**
 * RC8.6B — Badge institucional de Estado.
 */
import { getEstadoCatalogEntry, getCategoriaCssClass } from './estadoCatalogo.js';
import { adaptEstadoResponsable } from './adaptEstadoResponsable.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} data — adaptEstadoResponsable() o { estadoCodigo, estadoLabel, categoria, icono, tooltip }
 * @param {{ observed?: boolean, className?: string }} [opts]
 */
export function renderEstadoBadgeHtml(data = {}, opts = {}) {
  const codigo = data.estadoCodigo || data.codigo || '';
  const entry = getEstadoCatalogEntry(codigo, data.estadoLabel || data.label || '');
  const categoria = data.categoria || entry.categoria;
  const label = data.estadoLabel || entry.label;
  const icono = data.icono || entry.icono;
  const tooltip = data.tooltip || entry.tooltip || label;
  const catClass = getCategoriaCssClass(opts.observed ? 'OBSERVADO' : categoria);
  const extra = opts.className ? ` ${opts.className}` : '';
  const observedSuffix = opts.observed && categoria !== 'OBSERVADO'
    ? `<span class="sgc-estado-badge sgc-estado-badge--observed ms-1" title="Observación pendiente" aria-label="Observado"><i class="bi bi-exclamation-triangle sgc-estado-badge__icon" aria-hidden="true"></i><span class="sgc-estado-badge__text">Observado</span></span>`
    : '';

  return `<span class="sgc-estado-badge sgc-estado-badge--${catClass} badge-estado-mod${extra}" data-estado="${esc(entry.codigo)}" data-categoria="${esc(categoria)}" title="${esc(tooltip)}" aria-label="${esc(label)}"><i class="bi ${esc(icono)} sgc-estado-badge__icon" aria-hidden="true"></i><span class="sgc-estado-badge__text">${esc(label)}</span></span>${observedSuffix}`;
}

/** Atajo desde fila de bandeja. */
export function renderEstadoBadgeFromRow(row, opts = {}) {
  const adapted = adaptEstadoResponsable(row);
  return renderEstadoBadgeHtml(adapted, opts);
}

export default { renderEstadoBadgeHtml, renderEstadoBadgeFromRow };
