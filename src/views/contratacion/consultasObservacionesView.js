// Consultas y Observaciones — bandeja analista CM
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { bandejaTableStyles } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { usePagination } from '../../utils/paginacion.js';
import { openAdjuntosSolicitudModal } from '../../utils/adjuntosModal.js';

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

let consultasCache = [];
let filtroEstado = '';
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
          <div class="kpi-label">Total</div>
          <div class="kpi-value text-dark" data-consulta-kpi="total">0</div>
        </div>
      </div>
      <div class="col-4">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Respondida</div>
          <div class="kpi-value text-success" data-consulta-kpi="respondida">0</div>
        </div>
      </div>
      <div class="col-4">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Pendiente</div>
          <div class="kpi-value text-warning" data-consulta-kpi="pendiente">0</div>
        </div>
      </div>
    </div>`;
}

function updateConsultasSummaryCards(rows, containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const all = Array.isArray(rows) ? rows : [];
  const total = all.length;
  const respondida = all.filter((c) => String(c.estado || '').toUpperCase() === 'RESPONDIDA').length;
  const pendiente = all.filter((c) => String(c.estado || '').toUpperCase() === 'PENDIENTE').length;
  const map = { total, respondida, pendiente };
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
        <button id="${esc(prefix)}Reload" type="button" class="btn btn-sm btn-outline-secondary">
          <i class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
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

function showResponderConsultaModal(consulta) {
  return new Promise((resolve) => {
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

    const cleanup = () => {
      modal.hide();
    };

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
        cleanup();
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

function buildLoadParams() {
  const params = {};
  if (filtroEstado) params.estado = filtroEstado;
  return params;
}

async function loadConsultas(resetPage = false) {
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  try {
    if (resetPage) consultasPagination.resetPage();
    const result = await consultasPagination.loadData(buildLoadParams(), resetPage);
    const rows = result.data || [];
    consultasCache = result.allData || rows;
    updateConsultasSummaryCards(consultasCache, `${VIEW_CONFIG.prefix}TrazaSummary`);

    if (!rows.length && !consultasCache.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay consultas registradas.</div>';
      return;
    }
    cont.innerHTML = `
      <div class="sgc-bandeja-wrap" id="consultasObsOuter">
        <table class="table table-sm table-hover table-bordered mb-0">
          <thead class="table-light"><tr>
            <th>Solicitud</th><th>Requerimiento</th><th>Proveedor</th><th>Asunto</th><th>Estado</th><th>Fecha</th><th>Acciones</th>
          </tr></thead>
          <tbody>${rows.map((c) => `
            <tr>
              <td>${esc(c.solicitud_codigo || '—')}</td>
              <td>${esc(c.requerimiento_codigo || '—')}</td>
              <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
              <td>${esc(c.asunto)}<div class="small text-muted">${esc((c.consulta || '').slice(0, 80))}</div></td>
              <td>${badgeEstadoConsulta(c.estado)}</td>
              <td class="small">${esc(fmtFecha(c.created_at))}</td>
              <td class="text-nowrap">
                ${c.estado === 'PENDIENTE' ? `<button class="btn btn-sm btn-primary co-responder me-1" data-id="${c.id}">Responder</button>` : ''}
                <button class="btn btn-sm btn-outline-secondary co-adjuntos" data-sid="${c.solicitud_id}">Ver Adjuntos</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('.co-responder').forEach((btn) => {
      btn.onclick = async () => {
        const consulta = consultasCache.find((c) => String(c.id) === String(btn.dataset.id));
        if (!consulta) return;
        const ok = await showResponderConsultaModal(consulta);
        if (ok) loadConsultas();
      };
    });

    cont.querySelectorAll('.co-adjuntos').forEach((btn) => {
      btn.onclick = () => {
        const sid = parseInt(btn.dataset.sid, 10);
        if (sid) openAdjuntosSolicitudModal(sid, true);
      };
    });

    consultasPagination.renderControls('consultasObsOuter', () => loadConsultas(false));
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export function initConsultasObservacionesView() {
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
