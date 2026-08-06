// Consultas y Observaciones — bandeja consolidada por Solicitud (RC8.0 refresh no destructivo)
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { bandejaTableStyles, getResponsableVigenteLabel } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { usePagination, getPaginationState, updatePaginationState } from '../../utils/paginacion.js';
import { openAdjuntosSolicitudModal } from '../../utils/adjuntosModal.js';
import { closeBandejaActionMenus, renderResponsableCellHtml } from '../../utils/bandejaUi.js';
import {
  consolidarExpedientesConsultas,
  formatCentrosConsultas,
  formatRequerimientosConsultas,
} from '../../utils/consultasObservacionesUtils.js';
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

const VIEW_ID = 'consultas-observaciones';
const SCROLL_SEL = '#consultasObsWrap';
const loadGuard = createRequestSequenceGuard();
let lifecycle = null;
let refreshIndicator = null;
let consultasCache = [];
let expedientesCache = [];
let filtroEstado = '';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
}

function labelEstadoConsulta(estado) {
  const v = String(estado || '').toUpperCase();
  if (v === 'RESPONDIDA') return 'Respondida';
  if (v === 'PENDIENTE') return 'Pendiente';
  return estado || 'Pendiente';
}

function badgeEstadoConsulta(estado) {
  const v = String(estado || '').toUpperCase();
  const cls = v === 'RESPONDIDA' ? 'success' : 'warning text-dark';
  return `<span class="badge bg-${cls}">${esc(labelEstadoConsulta(estado))}</span>`;
}

const VIEW_CONFIG = {
  prefix: 'consultasObs',
  title: 'Consultas y Observaciones',
  icon: 'bi-chat-square-text',
  description: 'Gestión de consultas y observaciones recibidas desde el Portal de Proveedores.',
  listId: 'consultasObsList',
};

const consultasPagination = usePagination(
  'consultas',
  (params) => contratacionesService.listConsultasAnalista(params),
  { defaultPageSize: 25, pageSizeOptions: [25, 50, 100] },
);

function renderConsultasSummaryCards(containerId) {
  return `
    <div id="${containerId}" class="row g-2 mb-3 traza-summary-cards">
      <div class="col-4">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Expedientes</div>
          <div class="kpi-value text-dark" data-consulta-kpi="total">0</div>
        </div>
      </div>
      <div class="col-4">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Con pendientes</div>
          <div class="kpi-value text-warning" data-consulta-kpi="pendiente">0</div>
        </div>
      </div>
      <div class="col-4">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Todas respondidas</div>
          <div class="kpi-value text-success" data-consulta-kpi="respondida">0</div>
        </div>
      </div>
    </div>`;
}

function updateConsultasSummaryCards(expedientes, containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const all = Array.isArray(expedientes) ? expedientes : [];
  const pendiente = all.filter((e) => (e.consultas || []).some((c) => String(c.estado || '').toUpperCase() === 'PENDIENTE')).length;
  const respondida = all.filter((e) => (e.consultas || []).length
    && (e.consultas || []).every((c) => String(c.estado || '').toUpperCase() === 'RESPONDIDA')).length;
  const map = { total: all.length, respondida, pendiente };
  Object.entries(map).forEach(([k, v]) => {
    const el = root.querySelector(`[data-consulta-kpi="${k}"]`);
    if (el) el.textContent = String(v);
  });
}

function renderConsultasFilterBar(prefix) {
  return `
    <div class="sgc-search-bar mb-3">
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small mb-0">Estado</label>
          <select class="form-select form-select-sm" id="${prefix}FiltroEstado">
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="RESPONDIDA">Respondida</option>
          </select>
        </div>
        <div class="col-md-3 d-flex gap-2">
          <button type="button" class="btn btn-sm btn-primary" id="${prefix}FiltroBtn">
            <i class="bi bi-funnel"></i> Filtrar
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="${prefix}FiltroLimpiar">
            Limpiar
          </button>
        </div>
      </div>
    </div>`;
}

function showResponderConsultaModal(consulta) {
  return new Promise((resolve) => {
    closeBandejaActionMenus();
    const id = `coRespModal_${Date.now()}`;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal fade" id="${id}" tabindex="-1" aria-labelledby="${id}_title">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header bg-light">
              <h5 class="modal-title" id="${id}_title">
                <i class="bi bi-reply-fill text-primary"></i> Responder consulta del proveedor
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div class="card border-0 bg-light mb-3">
                <div class="card-body py-3">
                  <div class="row g-2 small">
                    <div class="col-md-4">
                      <span class="text-muted d-block">Solicitud</span>
                      <strong>${esc(consulta.solicitud_codigo || '—')}</strong>
                    </div>
                    <div class="col-md-4">
                      <span class="text-muted d-block">Requerimiento</span>
                      <strong>${esc(consulta.requerimiento_codigo || '—')}</strong>
                    </div>
                    <div class="col-md-4">
                      <span class="text-muted d-block">Fecha de consulta</span>
                      <strong>${esc(fmtFecha(consulta.created_at))}</strong>
                    </div>
                    <div class="col-md-4">
                      <span class="text-muted d-block">Estado</span>
                      ${badgeEstadoConsulta(consulta.estado)}
                    </div>
                    <div class="col-12">
                      <span class="text-muted d-block">Proveedor</span>
                      <strong>${esc(consulta.razon_social || '—')}</strong>
                      <span class="text-muted ms-2">RUC ${esc(consulta.ruc || '—')}</span>
                    </div>
                    <div class="col-12">
                      <span class="text-muted d-block">Asunto</span>
                      <strong>${esc(consulta.asunto || '—')}</strong>
                    </div>
                  </div>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold">Consulta del proveedor</label>
                <div class="border rounded p-3 bg-white" style="white-space:pre-wrap;max-height:220px;overflow-y:auto;">${esc(consulta.consulta || '—')}</div>
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold" for="${id}_respuesta">Respuesta al proveedor</label>
                <textarea id="${id}_respuesta" class="form-control" rows="5" placeholder="Redacte la respuesta o absolución…"></textarea>
              </div>
              <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" id="${id}_publicar">
                <label class="form-check-label" for="${id}_publicar">
                  Publicar absolución para <strong>todos</strong> los proveedores invitados a la convocatoria
                </label>
              </div>
              <div id="${id}_error" class="alert alert-danger d-none py-2 mb-0"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-primary" id="${id}_enviar">
                <i class="bi bi-send"></i> Enviar respuesta
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const el = document.getElementById(id);
    const modal = window.bootstrap.Modal.getOrCreateInstance(el);
    const txt = document.getElementById(`${id}_respuesta`);
    const chk = document.getElementById(`${id}_publicar`);
    const errBox = document.getElementById(`${id}_error`);
    const btnEnviar = document.getElementById(`${id}_enviar`);
    let resolved = false;

    btnEnviar.onclick = async () => {
      const respuesta = (txt.value || '').trim();
      if (!respuesta) {
        errBox.textContent = 'Ingrese la respuesta al proveedor.';
        errBox.classList.remove('d-none');
        txt.focus();
        return;
      }
      errBox.classList.add('d-none');
      btnEnviar.disabled = true;
      btnEnviar.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Enviando…';
      try {
        const usuario = getUserDisplayName(authService.getCurrentUser());
        await contratacionesService.responderConsultaAnalista(String(consulta.id), {
          respuesta,
          publicar: !!chk.checked,
          usuario,
        });
        resolved = true;
        resolve(true);
        modal.hide();
      } catch (err) {
        errBox.textContent = err.message || 'No se pudo enviar la respuesta.';
        errBox.classList.remove('d-none');
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = '<i class="bi bi-send"></i> Enviar respuesta';
      }
    };

    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(false);
    }, { once: true });

    modal.show();
    setTimeout(() => txt.focus(), 300);
  });
}

function showExpedienteConsultasModal(expediente) {
  closeBandejaActionMenus();
  const id = `coExpModal_${Date.now()}`;
  const consultas = expediente?.consultas || [];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title">
              <i class="bi bi-chat-square-text"></i> Consultas — ${esc(expediente.solicitud_codigo || '')}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body">
            <div class="mb-3 small">
              <div><strong>${esc(expediente.solicitud_codigo || '')}</strong></div>
              <div class="text-muted mt-1">
                Requerimiento(s): ${esc(expediente.requerimientos_texto || '—')}
                · Centro: ${esc(expediente.centros_texto || '—')}
                · Consultas: <strong>${consultas.length}</strong>
              </div>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-bordered mb-0">
                <thead class="table-light"><tr>
                  <th>Proveedor</th><th>Asunto</th><th>Estado</th><th>Fecha</th><th class="text-center">Acciones</th>
                </tr></thead>
                <tbody>
                  ${consultas.map((c) => `
                    <tr>
                      <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
                      <td>${esc(c.asunto)}<div class="small text-muted">${esc((c.consulta || '').slice(0, 80))}</div></td>
                      <td>${badgeEstadoConsulta(c.estado)}</td>
                      <td class="small">${esc(fmtFecha(c.created_at))}</td>
                      <td class="text-center text-nowrap">
                        ${String(c.estado || '').toUpperCase() === 'PENDIENTE'
                          ? `<button type="button" class="btn btn-sm btn-primary co-responder" data-id="${c.id}">Responder</button>`
                          : '<span class="small text-muted">—</span>'}
                        <button type="button" class="btn btn-sm btn-outline-secondary co-adjuntos ms-1" data-sid="${c.solicitud_id}">Adjuntos</button>
                      </td>
                    </tr>`).join('') || '<tr><td colspan="5" class="text-muted text-center">Sin consultas</td></tr>'}
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
  body?.querySelectorAll('.co-responder').forEach((btn) => {
    btn.onclick = async () => {
      const consulta = consultasCache.find((c) => String(c.id) === String(btn.dataset.id));
      if (!consulta) return;
      const ok = await showResponderConsultaModal(consulta);
      if (ok) {
        modal.hide();
        loadConsultas(true);
      }
    };
  });
  body?.querySelectorAll('.co-adjuntos').forEach((btn) => {
    btn.onclick = () => {
      const sid = parseInt(btn.dataset.sid, 10);
      if (sid) openAdjuntosSolicitudModal(sid, true);
    };
  });
}

function buildLoadParams() {
  const params = {};
  if (filtroEstado) params.estado = filtroEstado;
  return params;
}

const CONSULTAS_THEAD = `<tr>
  <th>Solicitud de cotización</th>
  <th>Requerimiento</th>
  <th>Centro</th>
  <th class="text-center">Cantidad</th>
  <th>Estado</th>
  <th>Responsable actual</th>
  <th class="text-center">Ver</th>
</tr>`;

function buildConsultaRowHtml(exp) {
  const n = Number(exp.cantidad_consultas) || (exp.consultas || []).length || 0;
  const tienePendiente = (exp.consultas || []).some((c) => String(c.estado || '').toUpperCase() === 'PENDIENTE');
  const estadoLabel = tienePendiente ? 'Consultas' : 'Consultas';
  const estadoBadge = tienePendiente ? 'warning text-dark' : 'success';
  return `
    <tr data-row-id="${esc(exp.solicitud_id)}">
      <td>
        <strong>${esc(exp.solicitud_codigo || '—')}</strong>
      </td>
      <td class="small">${formatRequerimientosConsultas(exp, esc)}</td>
      <td class="small">${formatCentrosConsultas(exp, esc)}</td>
      <td class="text-center small">${esc(String(n))} consulta${n === 1 ? '' : 's'}</td>
      <td>
        <span class="badge bg-${estadoBadge}">${esc(estadoLabel)}</span>
      </td>
      <td class="small">${renderResponsableCellHtml(exp, esc, { submodulo: 'Consultas y Observaciones' })}</td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-primary co-exp-ver"
          data-solicitud-id="${esc(exp.solicitud_id)}">
          <i class="bi bi-eye"></i> Ver
        </button>
      </td>
    </tr>`;
}

async function loadConsultas(resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;

  const hadShell = !!document.getElementById('consultasObsBody');
  if (hadShell) captureScroll(VIEW_ID, SCROLL_SEL);
  closeBandejaActionMenus(cont);

  const shell = ensureBandejaTableShell(cont, {
    outerId: 'consultasObsOuter',
    wrapId: 'consultasObsWrap',
    theadId: 'consultasObsHead',
    tbodyId: 'consultasObsBody',
    emptyId: 'consultasObsEmpty',
    outerClass: 'sgc-bandeja-wrap',
    wrapClass: 'table-responsive',
    tableClass: 'table table-sm table-hover table-bordered mb-0',
  });

  const request = loadGuard.begin();
  if (lifecycle) lifecycle.addAbortController(request.controller);
  const isBg = hadShell && expedientesCache.length > 0;
  if (isBg) refreshIndicator?.show('Actualizando…');

  try {
    if (resetPage) consultasPagination.resetPage();
    const result = await consultasPagination.loadData(buildLoadParams(), resetPage);
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    const flat = result.allData || result.data || [];
    consultasCache = flat;
    expedientesCache = consolidarExpedientesConsultas(flat);
    updateConsultasSummaryCards(expedientesCache, `${VIEW_CONFIG.prefix}TrazaSummary`);

    if (!shell?.tbody || !shell?.thead) return;

    if (!expedientesCache.length) {
      shell.thead.innerHTML = CONSULTAS_THEAD;
      shell.tbody.innerHTML = '';
      setEmptyState(shell, { empty: true, message: 'No hay consultas registradas.' });
      refreshIndicator?.hide();
      return;
    }

    const state = getPaginationState('consultas');
    const totalPages = Math.max(1, Math.ceil(expedientesCache.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    updatePaginationState('consultas', {
      total: expedientesCache.length,
      totalPages,
      isVirtual: true,
    });
    const start = (state.page - 1) * state.pageSize;
    const pageExpedientes = expedientesCache.slice(start, start + state.pageSize);

    setEmptyState(shell, { empty: false });
    shell.thead.innerHTML = CONSULTAS_THEAD;
    shell.tbody.innerHTML = pageExpedientes.map(buildConsultaRowHtml).join('');

    cont.querySelectorAll('.co-exp-ver').forEach((btn) => {
      btn.onclick = () => {
        const sid = btn.dataset.solicitudId;
        const exp = expedientesCache.find((e) => String(e.solicitud_id) === String(sid));
        if (exp) showExpedienteConsultasModal(exp);
      };
    });
    consultasPagination.renderControls('consultasObsOuter', () => loadConsultas(false));
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

export function renderConsultasObservacionesView() {
  const { prefix, title, icon, description, listId } = VIEW_CONFIG;
  return `
    <div class="container-fluid actos-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi ${esc(icon)}"></i> ${esc(title)}</h3>
          <p class="text-muted mb-0">${esc(description)}</p>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span id="consultasObsBgRefreshHost"></span>
          <button id="${esc(prefix)}Reload" type="button" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>
      </div>
      ${renderConsultasSummaryCards(`${prefix}TrazaSummary`)}
      ${renderConsultasFilterBar(prefix)}
      <hr/>
      <div id="${esc(listId)}" class="sgc-bandeja-wrap actos-bandeja-wrap">
        <div class="text-muted">Cargando…</div>
      </div>
    </div>
  `;
}

export function initConsultasObservacionesView() {
  lifecycle = createViewLifecycle(VIEW_ID);
  lifecycle.addCleanup(() => {
    loadGuard.abortCurrent();
    closeBandejaActionMenus();
  });
  refreshIndicator = createBackgroundRefreshIndicator('#consultasObsBgRefreshHost', { id: 'consultasObsBgRefresh' });

  const { prefix } = VIEW_CONFIG;
  document.getElementById(`${prefix}FiltroBtn`)?.addEventListener('click', () => {
    filtroEstado = document.getElementById(`${prefix}FiltroEstado`)?.value || '';
    loadConsultas(true);
  });
  document.getElementById(`${prefix}FiltroLimpiar`)?.addEventListener('click', () => {
    filtroEstado = '';
    const sel = document.getElementById(`${prefix}FiltroEstado`);
    if (sel) sel.value = '';
    loadConsultas(true);
  });
  const reload = document.getElementById(`${prefix}Reload`);
  if (reload) reload.onclick = () => loadConsultas(true);
  loadConsultas();
}
