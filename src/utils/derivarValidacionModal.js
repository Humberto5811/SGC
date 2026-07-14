/**
 * Modal compartido — Enviar cotización a validación del área usuaria (sin propuesta económica).
 */
import { contratacionesService } from '../services/contratacionesService.js';
import { authService } from '../services/authService.js';
import { getUserDisplayName } from './userDisplay.js';

const API_BASE = 'http://localhost:3000/api';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function authHeaders() {
  try {
    const raw = localStorage.getItem('currentUser');
    if (raw) {
      const user = JSON.parse(raw);
      const h = {};
      if (user?.id) h['x-user-id'] = String(user.id);
      if (user?.username || user?.nombre || user?.dni) {
        h['x-user-name'] = String(user.username || user.nombre || user.dni);
      }
      return h;
    }
  } catch (_) { /* noop */ }
  return {};
}

async function openCotizacionDoc(cotId, ref, inline = false) {
  const url = `${API_BASE}/contrataciones/portal-analista/cotizaciones/${cotId}/documento/${encodeURIComponent(ref)}/${inline ? 'ver' : 'descargar'}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'No se pudo abrir el documento');
  }
  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') || '';
  let nombre = 'documento';
  const m = disp.match(/filename="([^"]+)"/);
  if (m) nombre = decodeURIComponent(m[1]);
  const objUrl = URL.createObjectURL(blob);
  if (inline) {
    window.open(objUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    return;
  }
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

function renderDocsList(cotId, docs) {
  if (!docs?.length) return '<div class="text-muted small">Sin documentos técnicos.</div>';
  return `<ul class="list-group list-group-flush border rounded mb-0">
    ${docs.map((d) => `
      <li class="list-group-item d-flex justify-content-between align-items-center py-2">
        <span class="small"><i class="bi bi-file-earmark-text text-primary"></i> ${esc(d.nombre)} <span class="text-muted">(${esc(d.grupo)})</span></span>
        <span class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary dv-doc-ver" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Ver</button>
          <button type="button" class="btn btn-outline-primary dv-doc-dl" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Descargar</button>
        </span>
      </li>`).join('')}
  </ul>`;
}

function bindDocButtons(container) {
  container.querySelectorAll('.dv-doc-ver').forEach((btn) => {
    btn.onclick = async () => {
      try { await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, true); }
      catch (err) { alert(err.message); }
    };
  });
  container.querySelectorAll('.dv-doc-dl').forEach((btn) => {
    btn.onclick = async () => {
      try { await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, false); }
      catch (err) { alert(err.message); }
    };
  });
}

/**
 * Abre modal para enviar cotización a validación AU.
 * @param {string|number} cotId
 * @param {{ title?: string, submitLabel?: string, onSuccess?: () => void }} opts
 */
export async function showEnviarValidarModal(cotId, opts = {}) {
  const title = opts.title || 'Enviar a validar';
  const submitLabel = opts.submitLabel || 'Enviar a validar';
  const id = `envVal_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-send"></i> ${esc(title)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body"><div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="${id}_enviar" disabled>${esc(submitLabel)}</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = window.bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  modal.show();

  const body = document.getElementById(`${id}_body`);
  const btnEnviar = document.getElementById(`${id}_enviar`);
  let submodulos = [];
  let usuarios = [];

  try {
    const [prevResp, subResp] = await Promise.all([
      contratacionesService.getPreviewDerivacionValidacion(cotId),
      contratacionesService.getValidacionSubmodulos(),
    ]);
    const preview = prevResp.data;
    submodulos = subResp.data || [];
    body.innerHTML = `
      <div class="alert alert-info small py-2">
        <i class="bi bi-info-circle"></i> ${esc(preview.nota || 'La propuesta económica no se envía al área usuaria.')}
      </div>
      <div class="card border-0 bg-light mb-3">
        <div class="card-body py-2 small">
          <strong>${esc(preview.solicitud_codigo)}</strong> — ${esc(preview.razon_social)} (RUC ${esc(preview.ruc)})
        </div>
      </div>
      <h6 class="fw-semibold">Expediente documental (técnico — sin propuesta económica)</h6>
      <div id="${id}_docs">${renderDocsList(cotId, preview.documentos_tecnicos)}</div>
      <hr/>
      <div class="row g-2">
        <div class="col-md-6">
          <label class="form-label fw-semibold">Área usuaria / Submódulo destino</label>
          <select class="form-select form-select-sm" id="${id}_sub">
            <option value="">Seleccione…</option>
            ${submodulos.map((s) => `<option value="${esc(s.code)}">${esc(s.label)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Responsable de validación</label>
          <select class="form-select form-select-sm" id="${id}_resp" disabled>
            <option value="">Seleccione área usuaria primero…</option>
          </select>
        </div>
      </div>
      <div id="${id}_err" class="alert alert-danger d-none py-2 mt-2 mb-0"></div>`;
    bindDocButtons(body);

    const selSub = document.getElementById(`${id}_sub`);
    const selResp = document.getElementById(`${id}_resp`);
    const errBox = document.getElementById(`${id}_err`);

    selSub.onchange = async () => {
      selResp.innerHTML = '<option value="">Cargando…</option>';
      selResp.disabled = true;
      btnEnviar.disabled = true;
      if (!selSub.value) {
        selResp.innerHTML = '<option value="">Seleccione área usuaria primero…</option>';
        return;
      }
      try {
        const uResp = await contratacionesService.listValidacionUsuarios(selSub.value);
        usuarios = uResp.data || [];
        selResp.innerHTML = usuarios.length
          ? '<option value="">Seleccione responsable…</option>' + usuarios.map((u) =>
            `<option value="${u.id}">${esc(u.nombre)}${u.cargo ? ` — ${esc(u.cargo)}` : ''}</option>`).join('')
          : '<option value="">Sin usuarios con permiso en este submódulo</option>';
        selResp.disabled = !usuarios.length;
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('d-none');
      }
    };

    selResp.onchange = () => { btnEnviar.disabled = !selResp.value; };

    btnEnviar.onclick = async () => {
      const sub = submodulos.find((s) => s.code === selSub.value);
      const u = usuarios.find((x) => String(x.id) === String(selResp.value));
      if (!sub || !u) return;
      btnEnviar.disabled = true;
      errBox.classList.add('d-none');
      try {
        await contratacionesService.derivarValidacion(cotId, {
          submodulo: sub.code,
          submodulo_label: sub.label,
          responsable_id: u.id,
          responsable_nombre: u.nombre,
          usuario: getUserDisplayName(authService.getCurrentUser()),
        });
        modal.hide();
        opts.onSuccess?.();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('d-none');
        btnEnviar.disabled = false;
      }
    };
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}
