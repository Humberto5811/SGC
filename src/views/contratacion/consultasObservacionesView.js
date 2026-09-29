// Consultas y Observaciones — una fila por consulta (RC8.17.8H6-C3-D5)
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { bandejaTableStyles } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { usePagination, getPaginationState, updatePaginationState } from '../../utils/paginacion.js';
import { openAdjuntosSolicitudModal } from '../../utils/adjuntosModal.js';
import {
  closeBandejaActionMenus,
  bindActionMenus,
  renderActionMenuCell,
} from '../../utils/bandejaUi.js';
import { renderBandejaCanonicoEtapaEstadoRespCells } from '../../utils/bandejaExpedienteColumns.js';
import { formatDateTimeLima } from '../../utils/dateTimeLima.js';
import {
  formatCentrosConsultas,
  formatRequerimientosConsultas,
} from '../../utils/consultasObservacionesUtils.js';
import {
  buildConsultasObservacionModalConfig,
  consultasDetalleModalStyles,
  loadRequerimientoParaConsultasObservacion,
  usuarioPuedeSubsanarConsultas,
  CONSULTAS_SUBMODULO_LABEL,
} from '../../utils/consultasObservacionFlow.js';
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
let consultasBandejaRows = [];
let filtroEstado = '';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return formatDateTimeLima(iso);
}

function labelEstadoConsulta(estado) {
  const v = String(estado || '').toUpperCase();
  if (v === 'RESPONDIDA') return 'Respondida';
  if (v === 'PENDIENTE') return 'Pendiente';
  return estado || 'Pendiente';
}

function nroInvitacionDisplay(c) {
  if (c?.invitacion_id == null) {
    return { text: 'Legacy', cls: 'text-muted' };
  }
  const nro = c.nro_invitacion;
  if (nro != null && String(nro).trim() !== '') {
    return { text: String(nro), cls: 'fw-semibold' };
  }
  return { text: '—', cls: 'text-muted' };
}

function formatProveedorCompact(c) {
  const ruc = String(c.ruc || '').trim();
  const rs = String(c.razon_social || '').trim();
  if (!ruc && !rs) return '—';
  const title = [ruc, rs].filter(Boolean).join(' — ');
  const line = ruc
    ? `<span class="text-muted">${esc(ruc)}</span> ${esc(rs)}`
    : esc(rs);
  return `<span class="co-prov-cell small d-inline-block text-truncate" style="max-width:11rem;" title="${esc(title)}">${line}</span>`;
}

function formatAsuntoCell(c) {
  const asunto = String(c.asunto || '—');
  return `<span class="co-asunto-cell d-inline-block text-truncate" style="max-width:10rem;" title="${esc(asunto)}">${esc(asunto)}</span>`;
}

function consultasBandejaCompactStyles() {
  return `
    .co-bandeja-page .co-bandeja-table th,
    .co-bandeja-page .co-bandeja-table td {
      padding: 0.32rem 0.42rem;
      line-height: 1.25;
      vertical-align: middle;
    }
    .co-bandeja-page .co-col-inv { width: 3.25rem; text-align: center; white-space: nowrap; }
    .co-bandeja-page .co-col-fecha { width: 6.5rem; white-space: nowrap; font-size: 0.75rem; }
    .co-bandeja-page .co-col-est-cons { width: 6.5rem; }
    .co-bandeja-page .req-col-etapa { max-width: 9.5rem; }
    .co-bandeja-page .req-col-estado-cell { max-width: 9.5rem; }
    .co-bandeja-page .req-col-resp { max-width: 10rem; }
  `;
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
          <div class="kpi-label">Consultas</div>
          <div class="kpi-value text-dark" data-consulta-kpi="total">0</div>
        </div>
      </div>
      <div class="col-4">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Pendientes</div>
          <div class="kpi-value text-warning" data-consulta-kpi="pendiente">0</div>
        </div>
      </div>
      <div class="col-4">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Respondidas</div>
          <div class="kpi-value text-success" data-consulta-kpi="respondida">0</div>
        </div>
      </div>
    </div>`;
}

function updateConsultasSummaryCards(rows, containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const all = Array.isArray(rows) ? rows : [];
  const norm = (c) => String(c?.estado || '').trim().toUpperCase();
  const pendiente = all.filter((c) => norm(c) === 'PENDIENTE').length;
  const respondida = all.filter((c) => norm(c) === 'RESPONDIDA').length;
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
                      <span class="text-muted d-block">N° Invitación</span>
                      <strong>${esc(nroInvitacionDisplay(consulta).text)}</strong>
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
                      <span class="text-muted d-block">Estado consulta</span>
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

function showConsultaDetalleModal(consulta) {
  if (!consulta?.id) return;
  closeBandejaActionMenus();
  const id = `coExpModal_${Date.now()}`;
  const reqId = consulta.requerimiento_id;
  const inv = nroInvitacionDisplay(consulta);
  const pendiente = String(consulta.estado || '').toUpperCase() === 'PENDIENTE';
  const respondida = String(consulta.estado || '').toUpperCase() === 'RESPONDIDA';

  const renderModalBody = (reqRow, canSubsanar) => {
    const menuItems = [
      ...(pendiente ? [{ act: 'responder', label: 'Responder', icon: 'bi-reply-fill' }] : []),
      { act: 'adjuntos', label: 'Adjuntos', icon: 'bi-paperclip' },
      ...(pendiente ? [{ act: 'observar', label: 'Observar/Derivar', icon: 'bi-exclamation-circle' }] : []),
      ...(canSubsanar ? [{ act: 'subsanar', label: 'Subsanar', icon: 'bi-arrow-return-left' }] : []),
    ];
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <style>${consultasDetalleModalStyles()}</style>
      <div class="modal fade co-exp-modal" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header bg-light">
              <h5 class="modal-title">
                <i class="bi bi-chat-square-text"></i> Consulta #${esc(String(consulta.id))} — ${esc(consulta.solicitud_codigo || '')}
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body" id="${id}_body">
              <div class="card border-0 bg-light mb-3">
                <div class="card-body py-3 small">
                  <div class="row g-2">
                    <div class="col-md-4"><span class="text-muted d-block">Solicitud</span><strong>${esc(consulta.solicitud_codigo || '—')}</strong></div>
                    <div class="col-md-4"><span class="text-muted d-block">N° Inv.</span><strong class="${inv.cls}">${esc(inv.text)}</strong></div>
                    <div class="col-md-4"><span class="text-muted d-block">Estado consulta</span>${badgeEstadoConsulta(consulta.estado)}</div>
                    <div class="col-md-6"><span class="text-muted d-block">Proveedor</span><strong>${esc(consulta.razon_social || '—')}</strong> <span class="text-muted">RUC ${esc(consulta.ruc || '—')}</span></div>
                    <div class="col-md-6"><span class="text-muted d-block">Fecha</span><strong>${esc(fmtFecha(consulta.created_at))}</strong></div>
                    <div class="col-12"><span class="text-muted d-block">Asunto</span><strong>${esc(consulta.asunto || '—')}</strong></div>
                  </div>
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label fw-semibold">Consulta</label>
                <div class="border rounded p-3 bg-white" style="white-space:pre-wrap;max-height:240px;overflow-y:auto;">${esc(consulta.consulta || '—')}</div>
              </div>
              ${respondida && (consulta.respuesta || '').trim() ? `
              <div class="mb-3">
                <label class="form-label fw-semibold">Respuesta</label>
                <div class="border rounded p-3 bg-white" style="white-space:pre-wrap;max-height:240px;overflow-y:auto;">${esc(consulta.respuesta)}</div>
              </div>` : ''}
              <div class="d-flex justify-content-end">${renderActionMenuCell(`co_${consulta.id}`, menuItems)}</div>
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
    const obsConfig = buildConsultasObservacionModalConfig({
      onReload: () => {
        modal.hide();
        loadConsultas(true);
      },
      consultaId: consulta.id,
    });

    bindActionMenus(body, {
      responder: async () => {
        const ok = await showResponderConsultaModal(consulta);
        if (ok) {
          modal.hide();
          loadConsultas(true);
        }
      },
      adjuntos: () => {
        const sid = consulta.solicitud_id;
        if (sid) openAdjuntosSolicitudModal(sid, true);
      },
      observar: async () => {
        if (!reqId) {
          alert('Sin requerimiento asociado.');
          return;
        }
        const row = reqRow || await loadRequerimientoParaConsultasObservacion(reqId);
        if (!row) {
          alert('No se pudo cargar el expediente.');
          return;
        }
        const { handleBandejaObservaciones } = await import('../../components/modalObservaciones.js');
        await handleBandejaObservaciones(reqId, [row], obsConfig);
      },
      subsanar: async () => {
        if (!reqId) return;
        const row = reqRow || await loadRequerimientoParaConsultasObservacion(reqId);
        if (!row) {
          alert('No se pudo cargar el expediente.');
          return;
        }
        const { handleBandejaObservaciones } = await import('../../components/modalObservaciones.js');
        await handleBandejaObservaciones(reqId, [row], {
          ...obsConfig,
          puedeObservar: () => false,
        });
      },
    });
  };

  if (reqId) {
    loadRequerimientoParaConsultasObservacion(reqId)
      .then((reqRow) => renderModalBody(reqRow, usuarioPuedeSubsanarConsultas(reqRow)))
      .catch(() => renderModalBody(null, false));
  } else {
    renderModalBody(null, false);
  }
}

function showExpedienteConsultasModal(expediente) {
  const first = expediente?.consultas?.[0];
  if (first) showConsultaDetalleModal(first);
}

function buildLoadParams() {
  const params = {};
  if (filtroEstado) params.estado = filtroEstado;
  return params;
}

const CONSULTAS_THEAD = `<tr>
  <th>Solicitud</th>
  <th class="co-col-inv">N° Inv.</th>
  <th>Proveedor</th>
  <th>Requerimiento</th>
  <th>Centro</th>
  <th>Consulta / Asunto</th>
  <th class="co-col-fecha">Fecha</th>
  <th class="co-col-est-cons">Estado consulta</th>
  <th>Etapa</th>
  <th>Estado</th>
  <th>Responsable</th>
  <th class="text-center">Ver</th>
</tr>`;

function buildConsultaRowHtml(c) {
  const inv = nroInvitacionDisplay(c);
  const rowForErv = {
    ...c,
    requerimientos_texto: c.requerimientos_texto || c.requerimiento_codigo || '',
    centros_texto: c.centros_texto || c.centro || '',
  };
  return `
    <tr data-row-id="${esc(c.id)}" data-consulta-id="${esc(c.id)}">
      <td><strong class="small">${esc(c.solicitud_codigo || '—')}</strong></td>
      <td class="co-col-inv"><span class="${inv.cls}">${esc(inv.text)}</span></td>
      <td>${formatProveedorCompact(c)}</td>
      <td class="small">${formatRequerimientosConsultas(rowForErv, esc)}</td>
      <td class="small">${formatCentrosConsultas(rowForErv, esc)}</td>
      <td>${formatAsuntoCell(c)}</td>
      <td class="co-col-fecha small text-muted">${esc(fmtFecha(c.created_at))}</td>
      <td class="co-col-est-cons">${badgeEstadoConsulta(c.estado)}</td>
      ${renderBandejaCanonicoEtapaEstadoRespCells(rowForErv)}
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-primary co-consulta-ver"
          data-consulta-id="${esc(c.id)}" title="Ver consulta #${esc(String(c.id))}">
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
    tableClass: 'table table-sm table-hover table-bordered mb-0 co-bandeja-table',
  });

  const request = loadGuard.begin();
  if (lifecycle) lifecycle.addAbortController(request.controller);
  const isBg = hadShell && consultasBandejaRows.length > 0;
  if (isBg) refreshIndicator?.show('Actualizando…');

  try {
    if (resetPage) consultasPagination.resetPage();
    const result = await consultasPagination.loadData(buildLoadParams(), resetPage);
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    const flat = result.allData || result.data || [];
    consultasCache = flat;
    consultasBandejaRows = flat;
    updateConsultasSummaryCards(flat, `${VIEW_CONFIG.prefix}TrazaSummary`);

    if (!shell?.tbody || !shell?.thead) return;

    if (!consultasBandejaRows.length) {
      shell.thead.innerHTML = CONSULTAS_THEAD;
      shell.tbody.innerHTML = '';
      setEmptyState(shell, { empty: true, message: 'No hay consultas registradas.' });
      refreshIndicator?.hide();
      return;
    }

    const state = getPaginationState('consultas');
    const totalPages = Math.max(1, Math.ceil(consultasBandejaRows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    updatePaginationState('consultas', {
      total: consultasBandejaRows.length,
      totalPages,
      isVirtual: true,
    });
    const start = (state.page - 1) * state.pageSize;
    const pageRows = consultasBandejaRows.slice(start, start + state.pageSize);

    setEmptyState(shell, { empty: false });
    shell.thead.innerHTML = CONSULTAS_THEAD;
    shell.tbody.innerHTML = pageRows.map(buildConsultaRowHtml).join('');

    cont.querySelectorAll('.co-consulta-ver').forEach((btn) => {
      btn.onclick = () => {
        const cid = btn.dataset.consultaId;
        const row = consultasCache.find((c) => String(c.id) === String(cid));
        if (row) showConsultaDetalleModal(row);
      };
    });
    consultasPagination.renderControls('consultasObsOuter', () => loadConsultas(false));
    restoreScroll(VIEW_ID, SCROLL_SEL);
    refreshIndicator?.hide();
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    if (hadShell && consultasBandejaRows.length) {
      refreshIndicator?.error('No se pudo actualizar. Se conservan los datos actuales.');
    } else {
      cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
  }
}

export function renderConsultasObservacionesView() {
  const { prefix, title, icon, description, listId } = VIEW_CONFIG;
  return `
    <div class="container-fluid actos-bandeja-page co-bandeja-page sgc-registro-compact">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}${consultasBandejaCompactStyles()}</style>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div class="d-flex flex-wrap align-items-baseline gap-2">
          <h3 class="mb-0 fs-5"><i class="bi ${esc(icon)}"></i> ${esc(title)}</h3>
          <p class="text-muted mb-0 small">${esc(description)}</p>
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
