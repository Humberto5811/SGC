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
  // UI: estado canónico (misma lectura que Coordinador / bandeja)
  const e = String(cuadro?.estado || cuadro?.estado_cuadro || '').toUpperCase();
  const firmadoCoord = !!(cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre);
  const firmadoDec = !!(cuadro?.tiene_pdf_firmado_dec || cuadro?.firmado_dec_nombre);
  const conformidad = !!(cuadro?.conformidad_dec || cuadro?.revision_dec?.conformidad);
  const enDec = ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'].includes(e);
  const puedeDerivar = conformidad && firmadoCoord && firmadoDec && enDec;

  return `
    <div class="card border border-primary mb-3" id="ccPanelDec">
      <div class="card-body py-3">
        <h6 class="fw-bold mb-2"><i class="bi bi-shield-check"></i> Revisión DEC</h6>
        <p class="small text-muted mb-2 mb-0">
          Secuencia: Descargar → Adjuntar Firma DEC → Ver Firmado → Dar Conformidad → Derivar Analista.
          Solo lectura económica.
        </p>
        <div class="d-flex flex-wrap gap-2 mt-2 mb-2">
          <span class="badge ${firmadoCoord ? 'bg-success' : 'bg-warning text-dark'}">
            Firmado Coord: ${firmadoCoord ? 'Sí' : 'No'}
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
            ${!firmadoCoord ? 'disabled' : ''}
            title="Descargar cuadro firmado por Coordinador">
            <i class="bi bi-download"></i> Descargar
          </button>
          <button type="button" class="btn btn-sm btn-outline-primary" id="ccBtnDecAdjuntar"
            ${!firmadoCoord ? 'disabled' : ''}
            title="Adjuntar PDF firmado por DEC">
            <i class="bi bi-paperclip"></i> Adjuntar Firmado
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ccBtnDecVerFirmado"
            ${firmadoDec ? '' : 'disabled'}
            title="${firmadoDec ? 'Ver firma DEC' : 'Adjuntar Firma DEC primero'}">
            <i class="bi bi-eye"></i> Ver Firmado
          </button>
          ${firmadoDec ? `
            <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnDecEliminarFirmado"
              title="Eliminar firma DEC">
              <i class="bi bi-trash"></i> Eliminar firmado
            </button>` : ''}
          <button type="button" class="btn btn-sm btn-success" id="ccBtnDecConformidad"
            ${conformidad || !firmadoCoord || !firmadoDec ? 'disabled' : ''}
            title="${firmadoCoord && firmadoDec ? 'Registrar conformidad DEC' : 'Requiere PDF Coordinador y PDF DEC'}">
            <i class="bi bi-check2-circle"></i> Dar Conformidad
          </button>
          <button type="button" class="btn btn-sm btn-warning" id="ccBtnDecDerivarAnalista"
            ${puedeDerivar ? '' : 'disabled'}
            title="${puedeDerivar ? 'Derivar al Analista (Generación CCP)' : 'Requiere conformidad y ambas firmas'}">
            <i class="bi bi-send"></i> Derivar Analista
          </button>
          <button type="button" class="btn btn-sm btn-outline-danger" id="ccBtnDecObservar"
            ${enDec ? '' : 'disabled'}
            title="Observar y devolver al Analista">
            <i class="bi bi-exclamation-triangle"></i> Observar
          </button>
        </div>
        ${cuadro?.firmado_nombre ? `<div class="small text-muted mt-2">Coordinador: <strong>${esc(cuadro.firmado_nombre)}</strong></div>` : ''}
        ${cuadro?.firmado_dec_nombre ? `<div class="small text-muted">DEC: <strong>${esc(cuadro.firmado_dec_nombre)}</strong></div>` : ''}
      </div>
    </div>`;
}

/** @deprecated RC8.5-D1 — usar observarCuadroConModalInstitucional */
export function showObservarDecModal() {
  console.warn('showObservarDecModal eliminado (RC8.5-D1). Use observarCuadroConModalInstitucional.');
  return Promise.resolve(null);
}
