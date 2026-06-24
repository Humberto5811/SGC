// Shell de bandeja Contrataciones — misma estructura visual que Coordinación CM (sin lógica operativa).
import {
  renderFilterBarHtml,
  renderSummaryCardsHtml,
  bandejaTableStyles,
} from './trazabilidad.js';
import { bindBandejaToolbar } from './bandejaUi.js';
import { actosBandejaStyles } from './actosModals.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {object} config
 * @param {string} config.prefix - prefijo IDs (filtros, reload)
 * @param {string} config.title - título del submódulo
 * @param {string} config.icon - clase Bootstrap Icons
 * @param {string} config.description - texto descriptivo
 * @param {string} config.listId - id del contenedor de la bandeja
 */
export function renderContratacionBandejaStub(config) {
  const { prefix, title, icon, description, listId } = config;
  return `
    <div class="container-fluid actos-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi ${esc(icon)}"></i> ${esc(title)}</h3>
          <p class="text-muted mb-0">${esc(description)}</p>
        </div>
        <button id="${esc(prefix)}Reload" type="button" class="btn btn-sm btn-outline-secondary">
          <i class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
      </div>
      ${renderSummaryCardsHtml(`${prefix}TrazaSummary`)}
      ${renderFilterBarHtml(prefix)}
      <hr/>
      <div id="${esc(listId)}" class="sgc-bandeja-wrap actos-bandeja-wrap">
        <div class="text-muted">Cargando…</div>
      </div>
    </div>
  `;
}

export function loadContratacionBandejaStub(config) {
  const cont = document.getElementById(config.listId);
  if (!cont) return;
  cont.innerHTML = `
    <div class="alert alert-light border mb-0">
      <strong>${esc(config.title)}</strong> — estructura de bandeja lista.
      <span class="text-muted d-block small mt-1">La funcionalidad operativa se implementará en una fase posterior.</span>
    </div>
  `;
}

export function initContratacionBandejaStub(config) {
  bindBandejaToolbar({
    prefix: config.prefix,
    onFilter: () => loadContratacionBandejaStub(config),
    onClear: () => loadContratacionBandejaStub(config),
    onExecutiveToggle: () => loadContratacionBandejaStub(config),
  });
  const reload = document.getElementById(`${config.prefix}Reload`);
  if (reload) reload.onclick = () => loadContratacionBandejaStub(config);
  loadContratacionBandejaStub(config);
}
