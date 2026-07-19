/**
 * RC8.6 — Revisión final del DEC.
 * Solo lectura; descarga firmado Coordinador; adjunta firma DEC; conforme; observar; derivar Analista.
 */
import { resolveRolRevisionCliente, ROLES_REVISION } from './cuadroComparativoRevisionUi.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function isModoDec(user, cuadro) {
  const rol = resolveRolRevisionCliente(user);
  const e = String(cuadro?.estado || cuadro?.estado_cuadro || '').toUpperCase();
  return rol === ROLES_REVISION.DEC
    && ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(e);
}

export function renderPanelDec(cuadro) {
  const e = String(cuadro?.estado || '').toUpperCase();
  const firmadoCoord = !!(cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre);
  const firmadoDec = !!(cuadro?.tiene_pdf_firmado_dec || cuadro?.firmado_dec_nombre);
  const conformidad = !!(cuadro?.conformidad_dec || cuadro?.revision_dec?.conformidad);
  const enDec = ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(e);
  const puedeDerivar = conformidad && firmadoCoord && firmadoDec && enDec;

  return `
    <div class="card border border-primary mb-3" id="ccPanelDec">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-shield-check"></i> Revisión final DEC</h6>
        <p class="small text-muted mb-2">
          Solo lectura. Descargue la versión firmada por el Coordinador, firme externamente,
          adjunte la firma DEC y registre conformidad para derivar al Analista (Generación CCP).
        </p>
        <div class="d-flex flex-wrap gap-2 mt-2 mb-2">
          <span class="badge ${firmadoCoord ? 'bg-success' : 'bg-warning text-dark'}">
            Firmado Coordinador: ${firmadoCoord ? 'Sí' : 'No'}
          </span>
          <span class="badge ${firmadoDec ? 'bg-success' : 'bg-warning text-dark'}">
            Firmado DEC: ${firmadoDec ? 'Sí' : 'Pendiente'}
          </span>
          <span class="badge ${conformidad ? 'bg-success' : 'bg-warning text-dark'}">
            Conformidad: ${conformidad ? 'Sí' : 'Pendiente'}
          </span>
        </div>
        <div class="d-flex flex-wrap gap-2" id="ccDecActions">
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnDecDescargarFirmado"
            ${!firmadoCoord ? 'disabled' : ''}>
            <i class="bi bi-download"></i> Descargar versión firmada
          </button>
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnDecAdjuntar"
            ${!firmadoCoord ? 'disabled' : ''}>
            <i class="bi bi-paperclip"></i> Adjuntar firma DEC
          </button>
          ${firmadoDec ? `
            <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnDecVerFirmado">
              <i class="bi bi-eye"></i> Ver firma DEC
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnDecEliminarFirmado">
              <i class="bi bi-trash"></i> Eliminar firma DEC
            </button>
          ` : ''}
          <button type="button" class="btn btn-sm btn-success" id="ccBtnDecConformidad"
            ${conformidad || !firmadoCoord || !firmadoDec ? 'disabled' : ''}
            title="${firmadoCoord && firmadoDec ? 'Registrar conformidad' : 'Requiere PDF Coordinador y PDF DEC'}">
            <i class="bi bi-check2-circle"></i> Conforme
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnDecObservar">
            <i class="bi bi-exclamation-triangle"></i> Observar
          </button>
          <button type="button" class="btn btn-sm btn-warning" id="ccBtnDecDerivarAnalista"
            ${puedeDerivar ? '' : 'disabled'}
            title="${puedeDerivar ? 'Derivar al Analista (Generación CCP)' : 'Requiere conformidad y ambas firmas'}">
            <i class="bi bi-send"></i> Derivar al Analista
          </button>
        </div>
        ${cuadro?.firmado_nombre ? `<div class="small text-muted mt-2">Coordinador: <strong>${esc(cuadro.firmado_nombre)}</strong></div>` : ''}
        ${cuadro?.firmado_dec_nombre ? `<div class="small text-muted">DEC: <strong>${esc(cuadro.firmado_dec_nombre)}</strong></div>` : ''}
      </div>
    </div>`;
}

/**
 * Modal obligatorio Motivo / Observación / Comentario.
 * @returns {Promise<{motivo,observacion,comentario}|null>}
 */
export function showObservarDecModal() {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal fade" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header bg-danger text-white">
              <h5 class="modal-title"><i class="bi bi-exclamation-triangle"></i> Observar cuadro (DEC)</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p class="small text-muted">Todos los campos son obligatorios. El cuadro volverá al Analista para corrección.</p>
              <div class="mb-2">
                <label class="form-label small mb-0">Motivo <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" id="ccDecObsMotivo" maxlength="200" required>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0">Observación <span class="text-danger">*</span></label>
                <textarea class="form-control form-control-sm" id="ccDecObsTexto" rows="3" required></textarea>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0">Comentario <span class="text-danger">*</span></label>
                <textarea class="form-control form-control-sm" id="ccDecObsComentario" rows="2" required></textarea>
              </div>
              <div class="alert alert-danger d-none py-2 small" id="ccDecObsErr"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-danger" id="ccDecObsOk">Registrar observación</button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const modalEl = wrap.querySelector('.modal');
    const modal = window.bootstrap?.Modal ? new window.bootstrap.Modal(modalEl) : null;
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      if (modal) modal.hide();
      else wrap.remove();
      resolve(val);
    };
    modalEl.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!done) resolve(null);
    });
    wrap.querySelector('#ccDecObsOk').onclick = () => {
      const motivo = String(wrap.querySelector('#ccDecObsMotivo')?.value || '').trim();
      const observacion = String(wrap.querySelector('#ccDecObsTexto')?.value || '').trim();
      const comentario = String(wrap.querySelector('#ccDecObsComentario')?.value || '').trim();
      const err = wrap.querySelector('#ccDecObsErr');
      const faltan = [];
      if (!motivo) faltan.push('Motivo');
      if (!observacion) faltan.push('Observación');
      if (!comentario) faltan.push('Comentario');
      if (faltan.length) {
        err.textContent = `Complete: ${faltan.join(', ')}`;
        err.classList.remove('d-none');
        return;
      }
      finish({ motivo, observacion, comentario });
    };
    if (modal) modal.show();
    else {
      modalEl.style.display = 'block';
      modalEl.classList.add('show');
    }
  });
}
