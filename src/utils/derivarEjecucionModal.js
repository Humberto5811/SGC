/**
 * RC8.15.2 — Modal de derivación a Presentación de Entregables.
 * El Analista CM selecciona explícitamente la persona que recibirá el expediente.
 * Reutiliza el patrón de modales de derivación con selector (derivarRecepcionCcpModal).
 */
import { ordenesContratacionService } from '../services/ordenesContratacionService.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {string|number} ordenId
 * @param {{ onSuccess?: () => void }} opts
 */
export async function showDerivarEjecucionModal(ordenId, opts = {}) {
  const id = `derEjec_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-box-arrow-right"></i> Derivar a Presentación de Entregables</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body">
            <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-success" id="${id}_ok" disabled>Derivar</button>
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
  let usuarios = [];

  try {
    const resp = await ordenesContratacionService.listResponsablesDerivacion(ordenId);
    const data = resp?.data || resp || {};
    usuarios = Array.isArray(data.usuarios) ? data.usuarios : [];
    const submodulo = data.submodulo || { label: 'Presentación Entregables de Servicios' };
    const centro = data.centro || {};

    body.innerHTML = `
      <div class="row g-2 mb-2">
        <div class="col-12">
          <label class="form-label fw-semibold mb-1">Submódulo destino</label>
          <div class="form-control-plaintext py-0 small">${esc(submodulo.label || 'Presentación Entregables de Servicios')}</div>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold mb-1">Centro / Área Usuaria</label>
          <div class="form-control-plaintext py-0 small">${esc(centro.nombre || centro.codigo || '—')}</div>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold mb-1">Responsable <span class="text-danger">*</span></label>
          <select class="form-select form-select-sm" id="${id}_resp">
            <option value="">Seleccione…</option>
            ${usuarios.map((u) => `
              <option value="${u.id}" data-nombre="${esc(u.nombre)}">
                ${esc(u.nombre)}${u.cargo ? ` — ${esc(u.cargo)}` : ''}
              </option>`).join('')}
          </select>
          ${!usuarios.length ? '<div class="text-danger small mt-1">No hay usuarios activos habilitados para recibir en este centro.</div>' : ''}
        </div>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message || 'Error al cargar responsables')}</div>`;
    return;
  }

  const selResp = document.getElementById(`${id}_resp`);
  const refreshOk = () => { btnOk.disabled = !selResp?.value; };
  if (selResp) selResp.onchange = refreshOk;
  refreshOk();

  btnOk.onclick = async () => {
    const opt = selResp?.selectedOptions?.[0];
    const responsableId = parseInt(selResp?.value, 10);
    const responsableNombre = opt?.dataset?.nombre || opt?.textContent || '';
    if (!responsableId || !responsableNombre) {
      alert('Seleccione el responsable que recibirá el expediente');
      return;
    }
    btnOk.disabled = true;
    const prev = btnOk.innerHTML;
    btnOk.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Derivando…';
    try {
      await ordenesContratacionService.derivarEjecucion(ordenId, responsableId);
      modal.hide();
      if (typeof opts.onSuccess === 'function') opts.onSuccess();
    } catch (err) {
      alert(err.message || 'No se pudo derivar a Presentación de Entregables');
      btnOk.disabled = false;
      btnOk.innerHTML = prev;
    }
  };
}

export default { showDerivarEjecucionModal };