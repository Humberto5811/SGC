/**
 * RC8.6 — Revisión final del DEC.
 * Firma DEC; observar/devolver (Analista o Coordinador CM); aprobar y derivar a CCP.
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

export function evaluarAccionesDec(cuadro = {}) {
  const e = String(cuadro?.estado || cuadro?.estado_cuadro || '').toUpperCase();
  const firmadoCoord = !!(cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre);
  const firmadoDec = !!(cuadro?.tiene_pdf_firmado_dec || cuadro?.firmado_dec_nombre);
  const conformidad = !!(cuadro?.conformidad_dec || cuadro?.revision_dec?.conformidad);
  const enDec = ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(e);
  const vigente = cuadro?.vigente !== false && e !== 'ANULADO';
  // Aprobar/derivar CCP: firmas Coord + DEC (conformidad DEC se auto-registra)
  const puedeAprobarCcp = enDec && firmadoCoord && firmadoDec && vigente;
  return {
    estado: e,
    enDec,
    firmadoCoord,
    firmadoDec,
    conformidad,
    vigente,
    puedeObservar: enDec,
    puedeAprobarCcp,
    motivoAprobar: puedeAprobarCcp
      ? ''
      : (!firmadoCoord
        ? 'Falta PDF firmado del Coordinador CM'
        : (!firmadoDec
          ? 'Adjuntar PDF firmado DEC primero'
          : (!vigente ? 'Versión no vigente' : 'Fuera de revisión DEC'))),
  };
}

export function renderPanelDec(cuadro) {
  const g = evaluarAccionesDec(cuadro);

  return `
    <div class="card border border-primary mb-3" id="ccPanelDec">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-shield-check"></i> Revisión DEC</h6>
        <p class="small text-muted mb-2 mb-0">
          Con ambas firmas: <strong>Aprobar y derivar a CCP</strong>
          u <strong>Observar / Devolver</strong> (Analista o Coordinador CM).
        </p>
        <div class="d-flex flex-wrap gap-2 mt-2 mb-2">
          <span class="badge ${g.firmadoCoord ? 'bg-success' : 'bg-warning text-dark'}">
            Firmado Coord: ${g.firmadoCoord ? 'Sí' : 'No'}
          </span>
          <span class="badge ${g.firmadoDec ? 'bg-success' : 'bg-warning text-dark'}">
            Firmado DEC: ${g.firmadoDec ? 'Sí' : 'Pendiente'}
          </span>
        </div>
        <div class="d-flex flex-wrap gap-2" id="ccDecActions">
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnDecDescargarFirmado"
            ${!g.firmadoCoord ? 'disabled' : ''}
            title="Descargar cuadro firmado por Coordinador">
            <i class="bi bi-download"></i> Descargar
          </button>
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnDecAdjuntar"
            ${!g.firmadoCoord ? 'disabled' : ''}
            title="Adjuntar PDF firmado por DEC">
            <i class="bi bi-paperclip"></i> Adjuntar Firmado
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnDecVerFirmado"
            ${g.firmadoDec ? '' : 'disabled'}
            title="${g.firmadoDec ? 'Ver firma DEC' : 'Adjuntar Firma DEC primero'}">
            <i class="bi bi-eye"></i> Ver Firmado
          </button>
          ${g.firmadoDec && !g.conformidad ? `
            <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnDecEliminarFirmado"
              title="Eliminar firma DEC">
              <i class="bi bi-trash"></i> Eliminar firmado
            </button>` : ''}
          <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnDecObservar"
            ${g.puedeObservar ? '' : 'disabled'}
            title="Observar y devolver al Analista o Coordinador CM">
            <i class="bi bi-exclamation-triangle"></i> Observar / Devolver
          </button>
          <button type="button" class="btn btn-sm btn-success" id="ccBtnDecAprobarCcp"
            ${g.puedeAprobarCcp ? '' : 'disabled'}
            title="${g.puedeAprobarCcp ? 'Aprobar el cuadro y derivar a CCP' : esc(g.motivoAprobar)}">
            <i class="bi bi-check2-circle"></i> Aprobar y derivar a CCP
          </button>
        </div>
        ${!g.puedeAprobarCcp && g.enDec ? `
          <div class="alert alert-warning py-2 small mb-0 mt-2">${esc(g.motivoAprobar)}</div>` : ''}
        ${cuadro?.firmado_nombre ? `<div class="small text-muted mt-2">Coordinador: <strong>${esc(cuadro.firmado_nombre)}</strong></div>` : ''}
        ${cuadro?.firmado_dec_nombre ? `<div class="small text-muted">DEC: <strong>${esc(cuadro.firmado_dec_nombre)}</strong></div>` : ''}
      </div>
    </div>`;
}

/**
 * Modal simple: motivo obligatorio + destino (Analista | Coordinador CM).
 * @returns {Promise<{motivo:string, destino:'ANALISTA'|'COORDINADOR_CM'}|null>}
 */
export function showDevolverDecModal() {
  return new Promise((resolve) => {
    const id = `ccDecDev_${Date.now()}`;
    document.querySelectorAll('.cc-dec-devolver-overlay').forEach((n) => n.remove());
    const overlay = document.createElement('div');
    overlay.className = 'cc-dec-devolver-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2000',
      'background:rgba(15,23,42,.55)', 'display:flex',
      'align-items:center', 'justify-content:center', 'padding:1rem',
    ].join(';');
    overlay.innerHTML = `
      <div class="card shadow border-0" style="width:min(520px,100%)">
        <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
          <strong><i class="bi bi-exclamation-triangle"></i> Observar / Devolver</strong>
          <button type="button" class="btn-close" data-act="cancel" aria-label="Cerrar"></button>
        </div>
        <div class="card-body">
          <div class="mb-2">
            <label class="form-label fw-semibold" for="${id}_dest">Destino</label>
            <select class="form-select form-select-sm" id="${id}_dest">
              <option value="COORDINADOR_CM">Coordinador CM</option>
              <option value="ANALISTA">Analista que elaboró el cuadro</option>
            </select>
          </div>
          <div class="mb-0">
            <label class="form-label fw-semibold" for="${id}_motivo">Motivo de observación <span class="text-danger">*</span></label>
            <textarea class="form-control form-control-sm" id="${id}_motivo" rows="3"
              placeholder="Indique el motivo de la devolución" required></textarea>
          </div>
          <div id="${id}_err" class="alert alert-danger d-none py-2 mt-2 mb-0 small"></div>
        </div>
        <div class="card-footer d-flex justify-content-end gap-2">
          <button type="button" class="btn btn-secondary" data-act="cancel">Cancelar</button>
          <button type="button" class="btn btn-danger" data-act="ok" id="${id}_ok">Confirmar devolución</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    let closed = false;
    const close = (val) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      resolve(val);
    };
    overlay.querySelectorAll('[data-act="cancel"]').forEach((b) => {
      b.onclick = (ev) => { ev.preventDefault(); close(null); };
    });
    const btnOk = overlay.querySelector(`#${id}_ok`);
    btnOk.onclick = (ev) => {
      ev.preventDefault();
      const motivo = String(overlay.querySelector(`#${id}_motivo`)?.value || '').trim();
      const destino = String(overlay.querySelector(`#${id}_dest`)?.value || 'ANALISTA').toUpperCase();
      const err = overlay.querySelector(`#${id}_err`);
      if (!motivo) {
        if (err) {
          err.textContent = 'El motivo de observación es obligatorio.';
          err.classList.remove('d-none');
        }
        return;
      }
      if (!['ANALISTA', 'COORDINADOR_CM'].includes(destino)) {
        if (err) {
          err.textContent = 'Destino no permitido.';
          err.classList.remove('d-none');
        }
        return;
      }
      btnOk.disabled = true;
      close({ motivo, destino });
    };
  });
}

/** @deprecated RC8.5-D1 — usar showDevolverDecModal / observarCuadroConModalInstitucional */
export function showObservarDecModal() {
  return showDevolverDecModal();
}
