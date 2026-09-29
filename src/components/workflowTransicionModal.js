/**
 * RC8.17.3 — Modal compartido: etapa destino + responsable PERSONA.
 * Usado por Aprobar / Derivar / Devolver / Subsanar / Reasignar (workflow).
 */
import {
  escTransicionPicker as esc,
  renderTransicionPickerFieldsHtml,
  wireTransicionPicker,
} from '../utils/workflowTransicionPicker.js';

/**
 * @param {object} opts
 * @param {number|string} opts.requerimientoId
 * @param {string} opts.eventoCodigo — evento canónico (p.ej. EVALUACION_APROBADA)
 * @param {string} [opts.title]
 * @param {string} [opts.message]
 * @param {string} [opts.buttonText]
 * @param {string|function} [opts.candidatosApiPath] — ruta GET candidatos (sin /api); default requerimientos
 */
export function showWorkflowTransicionModal(opts = {}) {
  const id = 'modWfTrans_' + Date.now();
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${esc(opts.title || 'Confirmar transición')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            ${opts.message ? `<p class="text-muted small mb-2">${esc(opts.message)}</p>` : ''}
            ${renderTransicionPickerFieldsHtml(id, { label: 'Responsable', showEtapaSelect: true })}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" id="${id}_ok" class="btn btn-primary">${esc(opts.buttonText || 'Confirmar')}</button>
          </div>
        </div>
      </div>
    </div>`;
  const wrap = document.createElement('div');
  document.body.appendChild(wrap);
  wrap.innerHTML = html;
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  const readSeleccion = wireTransicionPicker(id, {
    requerimientoId: opts.requerimientoId,
    eventoCodigo: opts.eventoCodigo,
    candidatosApiPath: opts.candidatosApiPath,
  });

  return new Promise((resolve) => {
    let resolved = false;
    document.getElementById(`${id}_ok`).onclick = () => {
      const sel = readSeleccion();
      if (!sel) return;
      resolved = true;
      resolve(sel);
      modal.hide();
    };
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}

export default { showWorkflowTransicionModal };
