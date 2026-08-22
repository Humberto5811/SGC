/**
 * RC8.15.6G-6 — Trazabilidad del entregable (estado vigente por orden_entrega_id).
 */
import { entregablesServiciosService } from '../services/entregablesServiciosService.js';
import { fmtFecha } from './ordenesUtils.js';

const ESC_MAP = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function renderEvento(evento) {
  return `
    <div class="border rounded p-3 mb-2 small ${evento.etapa_nueva_codigo ? '' : ''}">
      <div class="d-flex justify-content-between gap-2">
        <strong>${esc(evento.evento_codigo || 'Evento')}</strong>
        <span class="text-muted">${esc(fmtFecha(evento.ocurrido_at))}</span>
      </div>
      <div class="mt-1">
        ${esc(evento.etapa_anterior_codigo || '—')}
        <i class="bi bi-arrow-right"></i>
        ${esc(evento.etapa_nueva_codigo || '—')}
      </div>
      <div class="text-muted">
        ${esc(evento.responsable_anterior_nombre || evento.responsable_anterior_unidad || '—')}
        → ${esc(evento.responsable_nuevo_nombre || evento.responsable_nuevo_unidad || '—')}
      </div>
      ${evento.motivo ? `<div class="mt-2">${esc(evento.motivo)}</div>` : ''}
    </div>`;
}

function renderPanelHtml({ contexto, eventos }) {
  const vigenteCodigo = String(contexto?.etapa_codigo || '');
  const header = `
    <div class="row g-2 mb-3 small">
      <div class="col-md-3"><strong>Estado:</strong><br/>${esc(contexto?.estado_label || '—')}</div>
      <div class="col-md-3"><strong>Submódulo:</strong><br/>${esc(contexto?.submodulo_label || '—')}</div>
      <div class="col-md-3"><strong>Responsable:</strong><br/>${esc(contexto?.responsable_nombre || '—')}</div>
      <div class="col-md-3"><strong>Desde:</strong><br/>${esc(fmtFecha(contexto?.desde_at))}</div>
      <div class="col-12 text-muted">
        Orden ${esc(contexto?.tipo_orden || 'OS')} ${esc(contexto?.numero_orden || '')}
        · Entregable N.° ${esc(contexto?.numero_entrega ?? '—')}
      </div>
    </div>
    <hr class="my-2"/>
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="fw-bold mb-0">Recorrido completo (${eventos.length} eventos)</h6>
      <small class="text-muted">Más reciente arriba</small>
    </div>`;
  const vigenteIdx = eventos.findIndex(
    (evento) => String(evento.etapa_nueva_codigo || '') === vigenteCodigo,
  );
  const timeline = eventos.length
    ? eventos.map((evento, index) => {
      const markVigente = index === vigenteIdx && vigenteIdx >= 0;
      return `${markVigente ? '<div class="small text-success fw-semibold mb-1">Etapa vigente</div>' : ''}${renderEvento(evento)}`;
    }).join('')
    : '<p class="text-muted mb-0">Sin eventos registrados.</p>';
  return `${header}<div>${timeline}</div>`;
}

export async function openEntregableTrazabilidadModal(ordenEntregaId, {
  modalId = 'entregableTrazaModal',
  title = 'Trazabilidad del entregable',
} = {}) {
  let root = document.getElementById(modalId);
  if (!root) {
    root = document.createElement('div');
    root.id = modalId;
    document.body.appendChild(root);
  }
  root.innerHTML = `
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-dark text-white py-2">
            <h5 class="modal-title"><i class="bi bi-signpost-split"></i> ${esc(title)}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>
          </div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;
  const modalEl = root.querySelector('.modal');
  const body = modalEl.querySelector('.modal-body');
  const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  modalEl.addEventListener('hidden.bs.modal', () => { root.innerHTML = ''; }, { once: true });
  try {
    const response = await entregablesServiciosService.listarTrazabilidadPanel(ordenEntregaId);
    const payload = response?.data || response || {};
    const contexto = payload.contexto || {};
    const eventos = payload.eventos || [];
    if (!eventos.length && Array.isArray(payload)) {
      body.innerHTML = renderPanelHtml({ contexto: {}, eventos: payload });
      return;
    }
    body.innerHTML = renderPanelHtml({ contexto, eventos });
  } catch (error) {
    body.innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message || 'No se pudo cargar la trazabilidad')}</div>`;
  }
}
