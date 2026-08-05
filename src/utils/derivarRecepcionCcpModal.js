/**
 * Modal — Derivar Locadores desde Recepción de Cotizaciones a CCP.
 */
import { contratacionesService } from '../services/contratacionesService.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {string|number} cotId
 * @param {{ onSuccess?: () => void, row?: object }} opts
 */
export async function showDerivarRecepcionCcpModal(cotId, opts = {}) {
  const id = `derCcpRec_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-send"></i> Enviar a CCP</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body">
            <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-success" id="${id}_ok" disabled>Confirmar envío a CCP</button>
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
  const btnOk = document.getElementById(`${id}_ok`);
  const row = opts.row || {};

  try {
    const usersResp = await contratacionesService.listValidacionUsuarios('CCP', '');
    const usuarios = usersResp.data || [];
    body.innerHTML = `
      <div class="alert alert-info small py-2">
        <i class="bi bi-info-circle"></i>
        Locadores no pasan por Validaciones ni Cuadro Comparativo.
        Destino oficial: <strong>CCP</strong>.
      </div>
      <div class="card border-0 bg-light mb-3">
        <div class="card-body py-2 small">
          <strong>${esc(row.solicitud_codigo || '')}</strong>
          ${row.razon_social ? ` — ${esc(row.razon_social)}` : ''}
        </div>
      </div>
      <div class="mb-2">
        <label class="form-label fw-semibold">Usuario responsable CCP</label>
        <select class="form-select form-select-sm" id="${id}_resp">
          <option value="">Seleccione…</option>
          ${usuarios.map((u) => `
            <option value="${u.id}" data-nombre="${esc(u.nombre)}">
              ${esc(u.nombre)}${u.cargo ? ` — ${esc(u.cargo)}` : ''}
            </option>`).join('')}
        </select>
        ${!usuarios.length ? '<div class="text-danger small mt-1">No hay usuarios habilitados para CCP.</div>' : ''}
      </div>
      <div class="mb-0">
        <label class="form-label fw-semibold">Observación <span class="text-danger">*</span></label>
        <textarea class="form-control form-control-sm" id="${id}_obs" rows="3"
          placeholder="Observación de la derivación a CCP" required></textarea>
      </div>`;
    btnOk.disabled = !usuarios.length;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message || 'Error al cargar')}</div>`;
    return;
  }

  btnOk.onclick = async () => {
    const sel = document.getElementById(`${id}_resp`);
    const opt = sel?.selectedOptions?.[0];
    const responsable_id = parseInt(sel?.value, 10);
    const responsable_nombre = opt?.dataset?.nombre || opt?.textContent || '';
    const observacion = String(document.getElementById(`${id}_obs`)?.value || '').trim();
    if (!responsable_id || !responsable_nombre) {
      alert('Seleccione el responsable de CCP');
      return;
    }
    if (observacion.length < 3) {
      alert('La observación es obligatoria');
      return;
    }
    btnOk.disabled = true;
    const prev = btnOk.innerHTML;
    btnOk.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Derivando…';
    try {
      await contratacionesService.derivarRecepcionACcp(cotId, {
        responsable_id,
        responsable_nombre,
        observacion,
      });
      modal.hide();
      if (typeof opts.onSuccess === 'function') opts.onSuccess();
    } catch (err) {
      alert(err.message || 'No se pudo derivar a CCP');
      btnOk.disabled = false;
      btnOk.innerHTML = prev;
    }
  };
}
