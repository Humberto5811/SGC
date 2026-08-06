/**
 * RC8.6B — Badge institucional de Responsable (neutro; no usa colores de estado).
 */
import { adaptEstadoResponsable, TIPO_RESPONSABLE_UI } from './adaptEstadoResponsable.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function iconForTipo(tipo) {
  if (tipo === TIPO_RESPONSABLE_UI.PERSONA) return 'bi-person';
  if (tipo === TIPO_RESPONSABLE_UI.UNIDAD) return 'bi-building';
  return 'bi-person-dash';
}

/**
 * @param {object} data — adaptEstadoResponsable() o campos de responsable
 */
export function renderResponsableBadgeHtml(data = {}) {
  const tipo = data.responsableTipo || TIPO_RESPONSABLE_UI.PENDIENTE;
  let text = 'Pendiente de asignación';
  if (tipo === TIPO_RESPONSABLE_UI.PERSONA) {
    text = data.responsableNombre || data.responsableUsername || data.responsableDisplay || text;
  } else if (tipo === TIPO_RESPONSABLE_UI.UNIDAD) {
    text = data.responsableUnidad || data.responsableDisplay || text;
  } else {
    text = data.responsableDisplay || text;
  }
  const icon = iconForTipo(tipo);
  return `<span class="sgc-responsable-badge" data-responsable-tipo="${esc(tipo)}" title="${esc(text)}" aria-label="Responsable: ${esc(text)}"><i class="bi ${icon} sgc-responsable-badge__icon" aria-hidden="true"></i><span class="sgc-responsable-badge__text">${esc(text)}</span></span>`;
}

export function renderResponsableBadgeFromRow(row) {
  return renderResponsableBadgeHtml(adaptEstadoResponsable(row));
}

export default { renderResponsableBadgeHtml, renderResponsableBadgeFromRow };
