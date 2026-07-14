/**
 * Modal/panel unificado de adjuntos — única implementación SGC.
 */
import { adjuntosService } from '../services/adjuntosService.js';
import { updateBandejaAdjCount } from './bandejaUi.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function renderAdjuntosLista(containerEl, requerimientoId, adjuntos, readOnly = false) {
  if (!containerEl) return;
  if (!adjuntos || adjuntos.length === 0) {
    containerEl.innerHTML = '<div class="text-muted">Sin adjuntos registrados.</div>';
    return;
  }
  const rows = adjuntos.map((a) => {
    const deleteBtn = readOnly ? '' : `<button class="btn btn-sm btn-outline-danger adj-del" data-id="${a.id}" title="Eliminar"><i class="bi bi-trash"></i></button>`;
    return `
    <div class="d-flex justify-content-between align-items-center p-2 border rounded mb-2">
      <div class="flex-grow-1">
        <span class="small fw-bold">${esc(a.nombre_archivo || '')}</span>
        <div class="text-muted small">${a.tamaño_bytes ? (a.tamaño_bytes / 1024).toFixed(1) + ' KB' : ''}</div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-secondary adj-open" data-id="${a.id}" data-name="${esc(a.nombre_archivo || '')}" title="Ver / descargar"><i class="bi bi-download"></i></button>
        ${deleteBtn}
      </div>
    </div>`;
  }).join('');
  containerEl.innerHTML = `<div class="border-top pt-2">${rows}</div>`;
  containerEl.querySelectorAll('.adj-open').forEach((b) => {
    b.onclick = async () => {
      try {
        await adjuntosService.descargarAdjunto(b.dataset.id, b.dataset.name);
      } catch (err) {
        alert('Error al descargar: ' + err.message);
      }
    };
  });
  if (!readOnly) {
    containerEl.querySelectorAll('.adj-del').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('¿Eliminar este adjunto?')) return;
        try {
          await adjuntosService.eliminarAdjunto(b.dataset.id);
          const resp = await adjuntosService.getAdjuntos(requerimientoId);
          await renderAdjuntosLista(containerEl, requerimientoId, (resp && resp.adjuntos) || [], false);
          await syncAdjuntosCount(requerimientoId);
        } catch (err) {
          alert('Error al eliminar: ' + err.message);
        }
      };
    });
  }
}

export async function syncAdjuntosCount(requerimientoId) {
  try {
    const adjuntos = await adjuntosService.getAdjuntos(requerimientoId);
    const count = (adjuntos && adjuntos.adjuntos && adjuntos.adjuntos.length) || 0;
    const badge = document.querySelector(`.adjunto-count-${requerimientoId}`);
    if (badge) badge.textContent = count;
    updateBandejaAdjCount(requerimientoId, count);
    return count;
  } catch (_) {
    return 0;
  }
}

/** Panel inline (subsanación u otros modales). */
export async function renderAdjuntosPanel(containerId, requerimientoId, opts = {}) {
  const readOnly = !!opts.readOnly;
  const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  if (!container) return;
  container.innerHTML = `
    <div class="border rounded p-2 mb-3">
      <div class="fw-semibold small mb-2"><i class="bi bi-paperclip"></i> Adjuntos del expediente</div>
      ${readOnly ? '' : `
        <div class="mb-2">
          <label class="form-label small mb-1">Adjuntar archivo</label>
          <input type="file" class="form-control form-control-sm" id="${container.id}_adjFile" />
        </div>
        <button type="button" class="btn btn-sm btn-outline-success mb-2" id="${container.id}_adjUpload"><i class="bi bi-cloud-upload"></i> Subir archivo</button>`}
      <div id="${container.id}_adjList" class="small text-muted">Cargando adjuntos…</div>
    </div>`;
  const listEl = document.getElementById(`${container.id}_adjList`);
  const refresh = async () => {
    const resp = await adjuntosService.getAdjuntos(requerimientoId);
    await renderAdjuntosLista(listEl, requerimientoId, (resp && resp.adjuntos) || [], readOnly);
  };
  if (!readOnly) {
    const uploadBtn = document.getElementById(`${container.id}_adjUpload`);
    const fileInput = document.getElementById(`${container.id}_adjFile`);
    uploadBtn.onclick = async () => {
      if (!fileInput?.files?.[0]) { alert('Seleccione un archivo.'); return; }
      try {
        uploadBtn.disabled = true;
        await adjuntosService.uploadAdjunto(requerimientoId, fileInput.files[0]);
        fileInput.value = '';
        await refresh();
        await syncAdjuntosCount(requerimientoId);
      } catch (e) {
        alert('Error al subir: ' + e.message);
      } finally {
        uploadBtn.disabled = false;
      }
    };
  }
  await refresh();
}

/** Modal de solo lectura con adjuntos de todos los requerimientos de una solicitud. */
export async function openAdjuntosSolicitudModal(solicitudId, readOnly = true) {
  try {
    const resp = await adjuntosService.getAdjuntosSolicitud(solicitudId);
    const adjuntosData = (resp && resp.adjuntos) || [];
    const modalId = `modAdjSol_${solicitudId}`;
    document.getElementById(modalId)?.remove();
    const rows = adjuntosData.length
      ? adjuntosData.map((a) => `
        <div class="d-flex justify-content-between align-items-center p-2 border rounded mb-2">
          <div class="flex-grow-1">
            <span class="badge bg-light text-dark border me-1">${esc(a.requerimiento_codigo || 'REQ')}</span>
            <span class="small fw-bold">${esc(a.nombre_archivo || '')}</span>
            <div class="text-muted small">${a.tamaño_bytes ? (a.tamaño_bytes / 1024).toFixed(1) + ' KB' : ''}</div>
          </div>
          <button class="btn btn-sm btn-outline-secondary adj-open" data-id="${a.id}" data-name="${esc(a.nombre_archivo || '')}" title="Ver / descargar"><i class="bi bi-download"></i></button>
        </div>`).join('')
      : '<div class="text-muted">Sin adjuntos registrados para los requerimientos de esta solicitud.</div>';
    const html = `
      <div class="modal fade" id="${modalId}" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-paperclip"></i> Ver Adjuntos — Solicitud</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">${rows}</div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>
          </div>
        </div>
      </div>`;
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const modalEl = document.getElementById(modalId);
    modalEl.querySelectorAll('.adj-open').forEach((b) => {
      b.onclick = async () => {
        try {
          await adjuntosService.descargarAdjunto(b.dataset.id, b.dataset.name);
        } catch (err) {
          alert('Error al descargar: ' + err.message);
        }
      };
    });
    const modal = new bootstrap.Modal(modalEl);
    modalEl.addEventListener('hidden.bs.modal', function onHide() {
      container.remove();
    }, { once: true });
    modal.show();
  } catch (err) {
    alert('Error al cargar adjuntos: ' + err.message);
  }
}

/** Modal Bootstrap — menú Acciones y cualquier otro punto de entrada. */
export async function openAdjuntosModal(requerimientoId, readOnly = false) {
  try {
    const resp = await adjuntosService.getAdjuntos(requerimientoId);
    const adjuntosData = (resp && resp.adjuntos) || [];
    const modalId = `modAdjuntos_${requerimientoId}`;
    document.getElementById(modalId)?.remove();
    const uploadSection = readOnly ? '' : `
      <div class="mb-3">
        <label class="form-label">Seleccionar archivo para cargar</label>
        <input id="inputAdjunto_${requerimientoId}" type="file" class="form-control" />
      </div>
      <button id="btnSubir_${requerimientoId}" class="btn btn-sm btn-success mb-3"><i class="bi bi-cloud-upload"></i> Subir archivo</button>`;
    const html = `
      <div class="modal fade" id="${modalId}" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-paperclip"></i> ${readOnly ? 'Ver Adjuntos' : 'Gestionar Adjuntos'}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              ${uploadSection}
              <div id="listAdjuntos_${requerimientoId}"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>
          </div>
        </div>
      </div>`;
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = html;
    const listEl = document.getElementById(`listAdjuntos_${requerimientoId}`);
    await renderAdjuntosLista(listEl, requerimientoId, adjuntosData, readOnly);
    if (!readOnly) {
      document.getElementById(`btnSubir_${requerimientoId}`).onclick = async () => {
        const input = document.getElementById(`inputAdjunto_${requerimientoId}`);
        if (!input?.files?.[0]) { alert('Selecciona un archivo'); return; }
        const btn = document.getElementById(`btnSubir_${requerimientoId}`);
        try {
          btn.disabled = true;
          btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Subiendo…';
          await adjuntosService.uploadAdjunto(requerimientoId, input.files[0]);
          input.value = '';
          const resp2 = await adjuntosService.getAdjuntos(requerimientoId);
          await renderAdjuntosLista(listEl, requerimientoId, (resp2 && resp2.adjuntos) || [], false);
          await syncAdjuntosCount(requerimientoId);
        } catch (err) {
          alert('Error al subir: ' + err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-cloud-upload"></i> Subir archivo';
        }
      };
    }
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    document.getElementById(modalId).addEventListener('hidden.bs.modal', function onHide() {
      this.remove();
    }, { once: true });
    modal.show();
  } catch (err) {
    alert('Error al cargar adjuntos: ' + err.message);
  }
}

/** Alias retrocompatible. */
export const manageAdjuntos = openAdjuntosModal;

export default { openAdjuntosModal, openAdjuntosSolicitudModal, manageAdjuntos, renderAdjuntosPanel, renderAdjuntosLista, syncAdjuntosCount };
