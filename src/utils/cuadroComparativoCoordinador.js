/**
 * RC8.5 — Revisión institucional del Coordinador de 8 UIT.
 * Solo lectura económica; firma externa; conformidad; observar; derivar DEC.
 */
import { resolveRolRevisionCliente, ROLES_REVISION } from './cuadroComparativoRevisionUi.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function isModoCoordinador8Uit(user, cuadro) {
  const rol = resolveRolRevisionCliente(user);
  const e = String(cuadro?.estado || cuadro?.estado_cuadro || '').toUpperCase();
  return rol === ROLES_REVISION.COORDINADOR_8UIT
    && ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(e);
}

export function renderPanelCoordinador(cuadro, matriz = {}) {
  const e = String(cuadro?.estado || '').toUpperCase();
  const tienePdf = !!(cuadro?.tiene_pdf || cuadro?.pdf_nombre);
  const tieneFirmado = !!(cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre);
  const conformidad = !!(cuadro?.conformidad_coordinador
    || cuadro?.revision_coordinador?.conformidad
    || matriz?.revision_coordinador?.conformidad);
  const puedeDerivar = conformidad && tieneFirmado
    && ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(e);

  return `
    <div class="card border border-warning mb-3" id="ccPanelCoordinador">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-person-badge"></i> Revisión Coordinador 8 UIT</h6>
        <p class="small text-muted mb-2 mb-0">
          El cuadro está en solo lectura. Descargue el Anexo, fírmelo externamente y adjúntelo.
          Luego registre conformidad para poder derivar al DEC.
        </p>
        <div class="d-flex flex-wrap gap-2 mt-2 mb-2">
          <span class="badge ${tienePdf ? 'bg-success' : 'bg-secondary'}">PDF Anexo: ${tienePdf ? 'Sí' : 'No'}</span>
          <span class="badge ${tieneFirmado ? 'bg-success' : 'bg-warning text-dark'}">PDF firmado: ${tieneFirmado ? 'Sí' : 'Pendiente'}</span>
          <span class="badge ${conformidad ? 'bg-success' : 'bg-warning text-dark'}">Conformidad: ${conformidad ? 'Sí' : 'Pendiente'}</span>
        </div>
        <div class="d-flex flex-wrap gap-2" id="ccCoordActions">
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnCoordDescargar">
            <i class="bi bi-download"></i> Descargar Anexo 08A
          </button>
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnCoordAdjuntar" ${!tienePdf ? 'disabled' : ''}>
            <i class="bi bi-paperclip"></i> Adjuntar cuadro firmado
          </button>
          ${tieneFirmado ? `
            <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnCoordVerFirmado"><i class="bi bi-eye"></i> Ver firmado</button>
            <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnCoordEliminarFirmado"><i class="bi bi-trash"></i> Eliminar firmado</button>
          ` : ''}
          <button type="button" class="btn btn-sm btn-success" id="ccBtnCoordConformidad" ${conformidad ? 'disabled' : ''}>
            <i class="bi bi-check2-circle"></i> Dar conformidad
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnCoordObservar">
            <i class="bi bi-exclamation-triangle"></i> Observar
          </button>
          <button type="button" class="btn btn-sm btn-warning" id="ccBtnCoordDerivarDec" ${puedeDerivar ? '' : 'disabled'}
            title="${puedeDerivar ? 'Derivar al DEC' : 'Requiere conformidad y PDF firmado'}">
            <i class="bi bi-send"></i> Derivar al DEC
          </button>
        </div>
        ${cuadro?.firmado_nombre ? `<div class="small text-muted mt-2">Firmado: <strong>${esc(cuadro.firmado_nombre)}</strong></div>` : ''}
      </div>
    </div>`;
}

/**
 * Modal obligatorio Motivo / Descripción / Observación.
 * @returns {Promise<{motivo,descripcion,observacion}|null>}
 */
export function showObservarCoordinadorModal() {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal fade" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header bg-danger text-white">
              <h5 class="modal-title"><i class="bi bi-exclamation-triangle"></i> Observar cuadro</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p class="small text-muted">Todos los campos son obligatorios. No se permiten observaciones vacías.</p>
              <div class="mb-2">
                <label class="form-label small mb-0">Motivo <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" id="ccObsMotivo" maxlength="200" required>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0">Descripción <span class="text-danger">*</span></label>
                <textarea class="form-control form-control-sm" id="ccObsDesc" rows="2" required></textarea>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0">Observación <span class="text-danger">*</span></label>
                <textarea class="form-control form-control-sm" id="ccObsTexto" rows="3" required></textarea>
              </div>
              <div class="alert alert-danger d-none py-2 small" id="ccObsErr"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-danger" id="ccObsOk">Registrar observación</button>
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
    wrap.querySelector('#ccObsOk').onclick = () => {
      const motivo = String(wrap.querySelector('#ccObsMotivo')?.value || '').trim();
      const descripcion = String(wrap.querySelector('#ccObsDesc')?.value || '').trim();
      const observacion = String(wrap.querySelector('#ccObsTexto')?.value || '').trim();
      const err = wrap.querySelector('#ccObsErr');
      const faltan = [];
      if (!motivo) faltan.push('Motivo');
      if (!descripcion) faltan.push('Descripción');
      if (!observacion) faltan.push('Observación');
      if (faltan.length) {
        err.textContent = `Complete: ${faltan.join(', ')}`;
        err.classList.remove('d-none');
        return;
      }
      finish({ motivo, descripcion, observacion });
    };
    if (modal) modal.show();
    else {
      modalEl.style.display = 'block';
      modalEl.classList.add('show');
    }
  });
}
