// Validaciones — bandeja consolidada por Solicitud (RC8.0 refresh no destructivo)
// Detalle por proveedor en modal Ver → Validar.
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { renderFilterBarHtml, bandejaTableStyles } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { bindBandejaToolbar, closeBandejaActionMenus } from '../../utils/bandejaUi.js';
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
  <th class="text-center">Ver</th>
</tr>`;

function badgeClass(row) {
  return row.estado_bandeja_class || 'secondary';
}

function renderAccionCotizacion(c) {
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

function showExpedienteDetalleModal(expediente) {
  closeBandejaActionMenus();
  const id = `valExpModal_${Date.now()}`;
  const cots = expediente?.cotizaciones || [];
  const esAdmin = isAdminUser(authService.getCurrentUser());
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title">
              <i class="bi bi-shield-check"></i> Cotizaciones en validación — ${esc(expediente.solicitud_codigo || '')}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body">
            <div class="mb-3 small">
              <div><strong>${esc(expediente.solicitud_codigo || '')}</strong> — ${esc(expediente.denominacion || expediente.objeto || '')}</div>
              <div class="text-muted mt-1">
                Requerimiento(s): ${esc(expediente.requerimientos_texto || expediente.requerimientos || '—')}
                · Centro: ${esc(expediente.centros_texto || '—')}
                · Cotizaciones: <strong>${cots.length}</strong>
              </div>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-bordered mb-0">
                <thead class="table-light"><tr>
                  <th>Proveedor</th>
                  <th>Tipo</th>
                  <th>Fecha recepción</th>
                  <th>Estado</th>
                  <th>Responsable</th>
                  <th class="text-center">Acciones</th>
                </tr></thead>
                <tbody>
                  ${cots.map((c) => `
                    <tr>
                      <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
                      <td class="small">${esc(c.tipo_contratacion || '—')}</td>
                      <td class="small">${esc(fmtFecha(c.fecha_presentacion || c.created_at))}</td>
                      <td><span class="badge bg-${badgeClass(c)}">${esc(c.estado_bandeja || c.estado_display || '—')}</span></td>
                      <td class="small">${esc(c.validacion_responsable || c.responsable_nombre || '—')}</td>
                      <td class="text-center">${renderAccionCotizacion(c)}</td>
                    </tr>`).join('') || '<tr><td colspan="6" class="text-muted text-center">Sin cotizaciones</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = window.bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener('hidden.bs.modal', () => {
    closeBandejaActionMenus();
    wrap.remove();
  }, { once: true });
  modal.show();

  const body = document.getElementById(`${id}_body`);
  body?.querySelectorAll('.val-validar, .val-ver').forEach((btn) => {
    btn.onclick = () => {
      modal.hide();
      showValidarModal(btn.dataset.id, () => loadValidaciones(false), { esAdmin });
    };
  });
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
        <span class="badge bg-${esc(exp.estado_bandeja_class || 'secondary')}">${esc(exp.estado_bandeja || '—')}</span>
      </td>
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
        if (exp) showExpedienteDetalleModal(exp);
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
