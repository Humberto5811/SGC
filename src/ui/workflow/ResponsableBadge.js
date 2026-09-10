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

/**
 * @param {object} data — adaptEstadoResponsable() o campos de responsable
 */
export function renderResponsableBadgeHtml(data = {}) {
  const tipo = data.responsableTipo || TIPO_RESPONSABLE_UI.PENDIENTE;
  let text = 'Pendiente de asignación';
  if (tipo === TIPO_RESPONSABLE_UI.PERSONA) {
    const nombre = String(data.responsableNombre || '').trim();
    const username = String(data.responsableUsername || '').trim();
    const uid = data.responsableUsuarioId;
    const nombreOk = nombre && !/^\d+$/.test(nombre);
    const usernameOk = username && !/^\d+$/.test(username);
    text = nombreOk
      ? nombre
      : (usernameOk
        ? username
        : (uid != null && Number.isFinite(Number(uid))
          ? `Usuario #${Number(uid)}`
          : (data.responsableDisplay || text)));
    // Nunca mostrar solo el número crudo
    if (/^\d+$/.test(String(text).trim())) {
      text = uid != null ? `Usuario #${Number(uid)}` : 'Pendiente de asignación';
    }
  } else if (tipo === TIPO_RESPONSABLE_UI.UNIDAD) {
    text = data.responsableUnidad || data.responsableDisplay || text;
  } else {
    text = data.responsableDisplay || text;
  }
  return `<span class="sgc-responsable-badge" data-responsable-tipo="${esc(tipo)}" title="${esc(text)}" aria-label="Responsable: ${esc(text)}"><span class="sgc-responsable-badge__text">${esc(text)}</span></span>`;
}

export function renderResponsableBadgeFromRow(row) {
  return renderResponsableBadgeHtml(adaptEstadoResponsable(row));
}

export default { renderResponsableBadgeHtml, renderResponsableBadgeFromRow };
