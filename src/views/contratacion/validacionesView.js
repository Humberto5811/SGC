// Validaciones — bandeja consolidada por Solicitud (RC8.0 refresh no destructivo)
// Detalle por proveedor en modal Ver → Validar.
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import {
  renderFilterBarHtml,
  bandejaTableStyles,
  getResponsableVigenteLabel,
} from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { bindBandejaToolbar, closeBandejaActionMenus } from '../../utils/bandejaUi.js';
import {
  renderBandejaCanonicoEtapaCell,
  renderBandejaCanonicoResponsableCell,
} from '../../utils/bandejaExpedienteColumns.js';
import { usePagination, getPaginationState, updatePaginationState } from '../../utils/paginacion.js';
import { showValidarModal } from '../../utils/validacionesModal.js';
import {
  buildValidacionesStats,
  renderValidacionesStatsHtml,
  updateValidacionesStatsDom,
  isAdminUser,
  consolidarExpedientesValidacion,
  formatRequerimientosValidacion,
  formatCentrosValidacion,
  formatInvitacionBandejaLabel,
  renderBadgeEstadoValidacionHtml,
} from '../../utils/validacionesUtils.js';
import {
  createViewLifecycle,
  createRequestSequenceGuard,
  isAbortError,
  createBackgroundRefreshIndicator,
  ensureBandejaTableShell,
  captureScroll,
  restoreScroll,
  setEmptyState,
} from '../../utils/uiState/index.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const VIEW_ID = 'validaciones';
const SCROLL_SEL = '#validacionesWrap';
const loadGuard = createRequestSequenceGuard();
let lifecycle = null;
let refreshIndicator = null;
let expedientesCache = [];

const VIEW_CONFIG = {
  prefix: 'validaciones',
  title: 'Validaciones',
  icon: 'bi-shield-check',
  description: 'Validación técnica de cotizaciones enviadas desde Recepción de Cotizaciones.',
  listId: 'validacionesList',
};

const validacionesPagination = usePagination(
  'validaciones',
  async () => {
    const esAdmin = isAdminUser(authService.getCurrentUser());
    const resp = await contratacionesService.listValidacionesExpedientes(esAdmin);
    return { data: resp.data || [] };
  },
  { defaultPageSize: 25, pageSizeOptions: [25, 50, 100] },
);

const VALIDACIONES_THEAD = `<tr>
  <th>Solicitud de cotización</th>
  <th>Requerimiento</th>
  <th>Centro</th>
  <th class="text-center">Invitación</th>
  <th class="req-col-etapa">Etapa</th>
  <th class="req-col-estado-cell">Estado</th>
  <th class="req-col-resp">Responsable</th>
  <th class="text-center">Ver</th>
</tr>`;

const VALIDACIONES_ERV_COL_STYLES = `
  #validacionesWrap .req-col-etapa { width: 9rem; max-width: 9.5rem; }
  #validacionesWrap .req-col-estado-cell { width: 9.5rem; max-width: 10rem; }
  #validacionesWrap .req-col-resp { width: 10rem; max-width: 11rem; }
  #validacionesWrap .req-col-etapa .sgc-etapa-badge,
  #validacionesWrap .req-col-estado-cell .sgc-estado-badge,
  #validacionesWrap .req-col-resp .sgc-responsable-badge {
    max-width: 100%; min-height: 24px; max-height: 26px;
  }
  #validacionesWrap .sgc-etapa-badge__text,
  #validacionesWrap .sgc-estado-badge__text,
  #validacionesWrap .sgc-responsable-badge__text {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    display: inline-block; vertical-align: bottom; max-width: 100%;
  }
`;

/** Abre Validar expediente directamente (sin ventana intermedia). */
function openValidarExpediente(expediente) {
  closeBandejaActionMenus();
  const cotId = expediente?.cotizacion_id
    || expediente?.cotizaciones?.[0]?.id
    || expediente?.id;
  if (!cotId) {
    alert('No hay cotizaciones en validación para este expediente.');
    return;
  }
  const esAdmin = isAdminUser(authService.getCurrentUser());
  showValidarModal(cotId, () => loadValidaciones(false), { esAdmin });
}

function buildValidacionRowHtml(exp) {
  const invLabel = exp.invitacion_label || formatInvitacionBandejaLabel(exp.cotizaciones?.[0] || exp);
  const rowCotId = exp.cotizacion_id || exp.cotizaciones?.[0]?.id || exp.id;
  return `
    <tr data-row-id="${esc(rowCotId)}">
      <td>
        <strong>${esc(exp.solicitud_codigo)}</strong>
        <div class="small text-muted">${esc((exp.denominacion || exp.objeto || '').slice(0, 80))}</div>
      </td>
      <td class="small">${formatRequerimientosValidacion(exp, esc)}</td>
      <td class="small">${formatCentrosValidacion(exp, esc)}</td>
      <td class="text-center small">${esc(invLabel)}</td>
      <td class="req-col-etapa">${renderBandejaCanonicoEtapaCell(exp)}</td>
      <td class="req-col-estado-cell">${renderBadgeEstadoValidacionHtml(exp, esc)}</td>
      <td class="req-col-resp small">${renderBandejaCanonicoResponsableCell(exp)}</td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-primary val-exp-ver"
          data-cotizacion-id="${esc(rowCotId)}">
          <i class="bi bi-eye"></i> Ver
        </button>
      </td>
    </tr>`;
}

function ensureValidacionesChrome(shell) {
  if (!shell?.outer || document.getElementById('validacionesIntro')) return;
  const intro = document.createElement('p');
  intro.id = 'validacionesIntro';
  intro.className = 'small text-muted mb-2';
  intro.textContent = 'Expedientes derivados desde Recepción. Use Ver para revisar y validar cada cotización.';
  shell.outer.insertBefore(intro, shell.wrap);
}

async function loadValidaciones(resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;

  const hadShell = !!document.getElementById('validacionesBody');
  if (hadShell) captureScroll(VIEW_ID, SCROLL_SEL);
  closeBandejaActionMenus(cont);

  const shell = ensureBandejaTableShell(cont, {
    outerId: 'validacionesOuter',
    wrapId: 'validacionesWrap',
    theadId: 'validacionesHead',
    tbodyId: 'validacionesBody',
    emptyId: 'validacionesEmpty',
    outerClass: 'sgc-bandeja-wrap',
    wrapClass: 'table-responsive',
    tableClass: 'table table-sm table-hover table-bordered mb-0',
  });
  ensureValidacionesChrome(shell);

  const request = loadGuard.begin();
  if (lifecycle) lifecycle.addAbortController(request.controller);
  const isBg = hadShell && expedientesCache.length > 0;
  if (isBg) refreshIndicator?.show('Actualizando…');

  try {
    if (resetPage) validacionesPagination.resetPage();
    const result = await validacionesPagination.loadData({}, resetPage);
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    const flat = result.allData || result.data || [];
    expedientesCache = consolidarExpedientesValidacion(flat);
    updateValidacionesStatsDom(expedientesCache, 'validacionesStats');

    if (!shell?.tbody || !shell?.thead) return;

    if (!expedientesCache.length) {
      shell.thead.innerHTML = VALIDACIONES_THEAD;
      shell.tbody.innerHTML = '';
      setEmptyState(shell, { empty: true, message: 'No hay expedientes enviados a validación.' });
      refreshIndicator?.hide();
      return;
    }

    const state = getPaginationState('validaciones');
    const totalPages = Math.max(1, Math.ceil(expedientesCache.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    updatePaginationState('validaciones', {
      total: expedientesCache.length,
      totalPages,
      isVirtual: true,
    });
    const start = (state.page - 1) * state.pageSize;
    const pageExpedientes = expedientesCache.slice(start, start + state.pageSize);

    setEmptyState(shell, { empty: false });
    shell.thead.innerHTML = VALIDACIONES_THEAD;
    shell.tbody.innerHTML = pageExpedientes.map(buildValidacionRowHtml).join('');

    cont.querySelectorAll('.val-exp-ver').forEach((btn) => {
      btn.onclick = () => {
        const cotId = btn.dataset.cotizacionId;
        const exp = expedientesCache.find((e) => String(e.cotizacion_id || e.cotizaciones?.[0]?.id) === String(cotId));
        if (exp) openValidarExpediente(exp);
      };
    });
    validacionesPagination.renderControls('validacionesOuter', () => loadValidaciones(false));
    restoreScroll(VIEW_ID, SCROLL_SEL);
    refreshIndicator?.hide();
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    if (hadShell && expedientesCache.length) {
      refreshIndicator?.error('No se pudo actualizar. Se conservan los datos actuales.');
    } else {
      cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
  }
}

export function renderValidacionesView() {
  const { prefix, title, icon, description, listId } = VIEW_CONFIG;
  const statsHtml = renderValidacionesStatsHtml(buildValidacionesStats([]), 'validacionesStats');
  return `
    <div class="container-fluid actos-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}${VALIDACIONES_ERV_COL_STYLES}</style>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi ${esc(icon)}"></i> ${esc(title)}</h3>
          <p class="text-muted mb-0">${esc(description)}</p>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span id="validacionesBgRefreshHost"></span>
          <button id="${esc(prefix)}Reload" type="button" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>
      </div>
      ${statsHtml}
      ${renderFilterBarHtml(prefix, { hideExecutive: true })}
      <hr/>
      <div id="${esc(listId)}" class="sgc-bandeja-wrap actos-bandeja-wrap">
        <div class="text-muted">Cargando…</div>
      </div>
    </div>
  `;
}

export function initValidacionesView() {
  lifecycle = createViewLifecycle(VIEW_ID);
  lifecycle.addCleanup(() => {
    loadGuard.abortCurrent();
    closeBandejaActionMenus();
  });
  refreshIndicator = createBackgroundRefreshIndicator('#validacionesBgRefreshHost', { id: 'validacionesBgRefresh' });

  bindBandejaToolbar({
    prefix: VIEW_CONFIG.prefix,
    onFilter: () => loadValidaciones(true),
    onClear: () => loadValidaciones(true),
    onExecutiveToggle: () => loadValidaciones(true),
  });
  const reload = document.getElementById(`${VIEW_CONFIG.prefix}Reload`);
  if (reload) reload.onclick = () => loadValidaciones(true);
  loadValidaciones();
}
