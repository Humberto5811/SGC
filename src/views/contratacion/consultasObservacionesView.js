// Consultas y Observaciones — bandeja analista CM
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { renderContratacionBandejaStub } from '../../utils/contratacionBandejaStub.js';
import { bindBandejaToolbar } from '../../utils/bandejaUi.js';
import { usePagination } from '../../utils/paginacion.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
}

const VIEW_CONFIG = {
  prefix: 'consultasObs',
  title: 'Consultas y Observaciones',
  icon: 'bi-chat-square-text',
  description: 'Gestión de consultas y observaciones recibidas desde el Portal de Proveedores.',
  listId: 'consultasObsList',
};

let consultasCache = [];
const consultasPagination = usePagination(
  'consultas',
  (params) => contratacionesService.listConsultasAnalista(params),
  { defaultPageSize: 25, pageSizeOptions: [25, 50, 100] },
);

export function renderConsultasObservacionesView() {
  return renderContratacionBandejaStub(VIEW_CONFIG);
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
                      <span class="text-muted d-block">Fecha de consulta</span>
                      <strong>${esc(fmtFecha(consulta.created_at))}</strong>
                    </div>
                    <div class="col-md-4">
                      <span class="text-muted d-block">Estado</span>
                      <span class="badge bg-warning text-dark">${esc(consulta.estado || 'PENDIENTE')}</span>
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

async function loadConsultas(resetPage = false) {
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  try {
    if (resetPage) consultasPagination.resetPage();
    const result = await consultasPagination.loadData({}, resetPage);
    const rows = result.data || [];
    consultasCache = result.allData || rows;
    if (!rows.length && !consultasCache.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay consultas pendientes.</div>';
      return;
    }
    cont.innerHTML = `
      <div class="sgc-bandeja-wrap" id="consultasObsOuter">
        <table class="table table-sm table-hover table-bordered mb-0">
          <thead class="table-light"><tr>
            <th>Solicitud</th><th>Proveedor</th><th>Asunto</th><th>Estado</th><th>Fecha</th><th>Acciones</th>
          </tr></thead>
          <tbody>${rows.map((c) => `
            <tr>
              <td>${esc(c.solicitud_codigo)}</td>
              <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
              <td>${esc(c.asunto)}<div class="small text-muted">${esc((c.consulta || '').slice(0, 80))}</div></td>
              <td><span class="badge bg-${c.estado === 'RESPONDIDA' ? 'success' : 'warning'}">${esc(c.estado)}</span></td>
              <td class="small">${esc(fmtFecha(c.created_at))}</td>
              <td>${c.estado === 'PENDIENTE' ? `<button class="btn btn-sm btn-primary co-responder" data-id="${c.id}">Responder</button>` : '—'}</td>
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
    consultasPagination.renderControls('consultasObsOuter', () => loadConsultas(false));
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export function initConsultasObservacionesView() {
  bindBandejaToolbar({
    prefix: VIEW_CONFIG.prefix,
    onFilter: () => loadConsultas(true),
    onClear: () => loadConsultas(true),
    onExecutiveToggle: () => loadConsultas(true),
  });
  const reload = document.getElementById(`${VIEW_CONFIG.prefix}Reload`);
  if (reload) reload.onclick = () => loadConsultas(true);
  loadConsultas();
}
