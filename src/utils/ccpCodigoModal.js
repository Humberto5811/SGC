/**
 * OD35 — Modal Registrar / Editar código CCP.
 */
import { contratacionesService } from '../services/contratacionesService.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {object} row — fila bandeja CCP
 * @param {{ mode: 'registrar'|'editar', onSuccess?: Function }} opts
 */
export function openCcpCodigoModal(row, opts = {}) {
  const mode = opts.mode === 'editar' ? 'editar' : 'registrar';
  const id = `ccpCodModal_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title">
              <i class="bi bi-journal-check"></i>
              ${mode === 'editar' ? 'Editar CCP' : 'Registrar CCP'}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div id="${id}_alert" class="d-none"></div>
            <div class="row g-2 small mb-3">
              <div class="col-6">
                <span class="text-muted d-block">Requerimiento</span>
                <strong>${esc(row.requerimiento_codigo || '')}</strong>
              </div>
              <div class="col-6">
                <span class="text-muted d-block">Solicitud de Cotización</span>
                <strong>${esc(row.solicitud_codigo || '')}</strong>
              </div>
              <div class="col-6">
                <span class="text-muted d-block">Centro</span>
                <strong>${esc(row.centro || '—')}</strong>
              </div>
              <div class="col-6">
                <span class="text-muted d-block">Estado</span>
                <strong>${esc(row.etiqueta_estado || row.estado_ccp_label || '—')}</strong>
              </div>
            </div>
            <label class="form-label" for="${id}_codigo">Código CCP</label>
            <input type="text" class="form-control" id="${id}_codigo" maxlength="120"
              value="${esc(mode === 'editar' ? (row.codigo_ccp || '') : '')}"
              placeholder="Ingrese el código CCP" autocomplete="off" />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-primary" id="${id}_save">
              <i class="bi bi-check2"></i> Guardar
            </button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = window.bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  modal.show();

  const alertEl = document.getElementById(`${id}_alert`);
  const saveBtn = document.getElementById(`${id}_save`);
  const input = document.getElementById(`${id}_codigo`);
  setTimeout(() => input?.focus(), 200);

  function showErr(msg) {
    if (!alertEl) return;
    alertEl.className = 'alert alert-danger py-2 small';
    alertEl.textContent = msg;
  }

  saveBtn.onclick = async () => {
    const codigo = String(input?.value || '').trim();
    if (!codigo) {
      showErr('El código CCP es obligatorio');
      return;
    }
    saveBtn.disabled = true;
    const prev = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Guardando…';
    try {
      const rid = row.requerimiento_id;
      if (mode === 'editar') {
        await contratacionesService.editarCodigoCcp(rid, { codigo_ccp: codigo });
      } else {
        await contratacionesService.registrarCodigoCcp(rid, { codigo_ccp: codigo });
      }
      modal.hide();
      if (typeof opts.onSuccess === 'function') opts.onSuccess(codigo);
    } catch (err) {
      showErr(err.message || 'No se pudo guardar el código CCP');
      saveBtn.disabled = false;
      saveBtn.innerHTML = prev;
    }
  };
}
