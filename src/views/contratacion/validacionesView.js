// Validaciones — bandeja y flujo área usuaria (RC8.0 refresh no destructivo)
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { renderFilterBarHtml, bandejaTableStyles } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { bindBandejaToolbar } from '../../utils/bandejaUi.js';
import { usePagination } from '../../utils/paginacion.js';
import { showValidarModal } from '../../utils/validacionesModal.js';
import {
  buildValidacionesStats,
  renderValidacionesStatsHtml,
  updateValidacionesStatsDom,
  isAdminUser,
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

function fmtFecha(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
}

const VIEW_ID = 'validaciones';
const SCROLL_SEL = '#validacionesWrap';
const loadGuard = createRequestSequenceGuard();
let lifecycle = null;
let refreshIndicator = null;
let cachedAllRows = [];

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
  <th>Solicitud</th><th>Requerimiento</th><th>Proveedor</th><th>Tipo</th>
  <th>Fecha recepción</th><th>Estado</th><th>Responsable</th><th>Acciones</th>
</tr>`;

function badgeClass(row) {
  return row.estado_bandeja_class || 'secondary';
}

function renderAccionFila(c) {
  if (c.sin_asignacion) {
    return '<span class="small text-muted">Pendiente de asignación</span>';
  }
  if (c.puede_validar) {
    return `<button type="button" class="btn btn-sm btn-primary val-validar" data-id="${c.id}"><i class="bi bi-clipboard-check"></i> Validar</button>`;
  }
  if (c.puede_ver) {
    return `<button type="button" class="btn btn-sm btn-outline-secondary val-ver" data-id="${c.id}"><i class="bi bi-eye"></i> Ver</button>`;
  }
  return '<span class="small text-muted">—</span>';
}

function buildValidacionRowHtml(c) {
  return `
    <tr data-row-id="${c.id}">
      <td><strong>${esc(c.solicitud_codigo)}</strong></td>
      <td class="small">${esc(c.requerimientos || '—')}</td>
      <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
      <td class="small">${esc(c.tipo_contratacion || '—')}</td>
      <td class="small">${esc(fmtFecha(c.fecha_presentacion))}</td>
      <td><span class="badge bg-${badgeClass(c)}">${esc(c.estado_bandeja || c.estado_display || '—')}</span></td>
      <td class="small">${esc(c.validacion_responsable || c.responsable_nombre || '—')}</td>
      <td>${renderAccionFila(c)}</td>
    </tr>`;
}

function ensureValidacionesChrome(shell) {
  if (!shell?.outer || document.getElementById('validacionesIntro')) return;
  const intro = document.createElement('p');
  intro.id = 'validacionesIntro';
  intro.className = 'small text-muted mb-2';
  intro.textContent = 'Expedientes derivados desde Recepción de Cotizaciones. La propuesta económica no se envía al área usuaria.';
  shell.outer.insertBefore(intro, shell.wrap);

  const title = document.createElement('h6');
  title.id = 'validacionesTitle';
  title.className = 'fw-bold text-primary mb-2';
  title.innerHTML = '<i class="bi bi-inbox"></i> Cotizaciones en validación técnica';
  shell.outer.insertBefore(title, shell.wrap);
}

async function loadValidaciones(resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;

  const hadShell = !!document.getElementById('validacionesBody');
  if (hadShell) captureScroll(VIEW_ID, SCROLL_SEL);

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
  const isBg = hadShell && cachedAllRows.length > 0;
  if (isBg) refreshIndicator?.show('Actualizando…');

  try {
    if (resetPage) validacionesPagination.resetPage();
    const result = await validacionesPagination.loadData({}, resetPage);
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    const pageRows = result.data || [];
    const allRows = result.allData || pageRows;
    cachedAllRows = allRows;

    updateValidacionesStatsDom(allRows, 'validacionesStats');

    if (!shell?.tbody || !shell?.thead) return;

    if (!allRows.length) {
      shell.thead.innerHTML = VALIDACIONES_THEAD;
      shell.tbody.innerHTML = '';
      setEmptyState(shell, { empty: true, message: 'No hay expedientes enviados a validación.' });
      const title = document.getElementById('validacionesTitle');
      if (title) title.classList.add('d-none');
      refreshIndicator?.hide();
      return;
    }

    const title = document.getElementById('validacionesTitle');
    if (title) title.classList.remove('d-none');
    setEmptyState(shell, { empty: false });
    shell.thead.innerHTML = VALIDACIONES_THEAD;
    shell.tbody.innerHTML = pageRows.map(buildValidacionRowHtml).join('');

    const esAdmin = isAdminUser(authService.getCurrentUser());
    cont.querySelectorAll('.val-validar, .val-ver').forEach((btn) => {
      btn.onclick = () => showValidarModal(btn.dataset.id, () => loadValidaciones(false), { esAdmin });
    });
    validacionesPagination.renderControls('validacionesOuter', () => loadValidaciones(false));
    restoreScroll(VIEW_ID, SCROLL_SEL);
    refreshIndicator?.hide();
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    if (hadShell && cachedAllRows.length) {
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
  lifecycle.addCleanup(() => loadGuard.abortCurrent());
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
