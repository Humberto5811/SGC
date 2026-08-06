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
import { bindBandejaToolbar, closeBandejaActionMenus, renderResponsableCellHtml } from '../../utils/bandejaUi.js';
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
  <th class="text-center">Cantidad</th>
  <th>Estado</th>
  <th>Responsable</th>
  <th class="text-center">Ver</th>
</tr>`;

/** Abre Validar expediente directamente (sin ventana intermedia). */
function openValidarExpediente(expediente) {
  closeBandejaActionMenus();
  const cots = expediente?.cotizaciones || [];
  if (!cots.length) {
    alert('No hay cotizaciones en validación para este expediente.');
    return;
  }
  const esAdmin = isAdminUser(authService.getCurrentUser());
  const enFlujo = (c) => ['DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO']
    .includes(String(c.validacion_estado || '').toUpperCase());
  const preferida = cots.find((c) => c.puede_validar && enFlujo(c))
    || cots.find((c) => c.puede_ver && enFlujo(c))
    || cots.find((c) => enFlujo(c))
    || cots[0];
  showValidarModal(preferida.id, () => loadValidaciones(false), { esAdmin });
}

function buildValidacionRowHtml(exp) {
  const n = Number(exp.cantidad_cotizaciones) || (exp.cotizaciones || []).length || 0;
  return `
    <tr data-row-id="${esc(exp.solicitud_id)}">
      <td>
        <strong>${esc(exp.solicitud_codigo)}</strong>
        <div class="small text-muted">${esc((exp.denominacion || exp.objeto || '').slice(0, 80))}</div>
      </td>
      <td class="small">${formatRequerimientosValidacion(exp, esc)}</td>
      <td class="small">${formatCentrosValidacion(exp, esc)}</td>
      <td class="text-center small">${esc(String(n))} cotizaci${n === 1 ? 'ón' : 'ones'}</td>
      <td>
        ${renderBadgeEstadoValidacionHtml(exp, esc)}
      </td>
      <td class="small">${renderResponsableCellHtml(exp, esc)}</td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-primary val-exp-ver"
          data-solicitud-id="${esc(exp.solicitud_id)}">
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
        const sid = btn.dataset.solicitudId;
        const exp = expedientesCache.find((e) => String(e.solicitud_id) === String(sid));
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
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
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
