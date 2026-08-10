/**
 * UI reutilizable — Checklist de validación preventiva de expediente.
 * Usable en Registro de Órdenes y futuras etapas (Recepción, Ejecución, Pago).
 *
 * RC8.10.3 — Completar información NO navega a bandeja: cierra el checklist,
 * espera hidden.bs.modal y luego abre el modal del requisito (mismo REQ).
 */
import { ordenesContratacionService } from '../services/ordenesContratacionService.js';
import { ETAPAS_CHECKLIST } from '../../shared/expedienteChecklist.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ensureRoot() {
  let el = document.getElementById('roChecklistRoot');
  if (!el) {
    el = document.createElement('div');
    el.id = 'roChecklistRoot';
    document.body.appendChild(el);
  }
  return el;
}

/**
 * @param {object} checklist — resultado de evaluarChecklist
 * @param {object} opts
 * @param {(action: string, item: object) => void|Promise<void>} opts.onCompletar
 * @param {string} [opts.titulo]
 * @param {boolean} [opts.forzar] — mostrar aunque esté completo
 * @param {number|string} [opts.requerimientoId] — contexto del expediente
 * @param {number|string} [opts.ordenId]
 */
export function openChecklistModal(checklist, opts = {}) {
  const {
    onCompletar,
    titulo = 'Checklist de validación',
    forzar = false,
    onClose,
    requerimientoId = null,
    ordenId = null,
  } = opts;
  if (!checklist) return null;
  if (checklist.completo && !forzar) {
    onClose?.({ completo: true, checklist });
    return null;
  }

  const root = ensureRoot();
  const ctxReq = requerimientoId != null ? String(requerimientoId) : '';
  const ctxOrd = ordenId != null ? String(ordenId) : '';
  const rows = (checklist.items || []).map((it) => `
    <tr>
      <td>${esc(it.label)}</td>
      <td>
        <span class="badge ${it.ok ? 'bg-success' : 'bg-warning text-dark'}">${esc(it.estado)}</span>
      </td>
      <td class="small ${it.ok ? 'text-muted' : 'text-danger'}">${esc(it.mensaje || (it.ok ? '—' : 'Pendiente'))}</td>
      <td>
        ${it.ok ? '' : `<button type="button" class="btn btn-sm btn-primary ro-chk-go"
          data-action="${esc(it.action)}"
          data-id="${esc(it.id)}"
          data-requerimiento-id="${esc(ctxReq)}"
          data-orden-id="${esc(ctxOrd)}">
          Completar información
        </button>`}
      </td>
    </tr>`).join('');

  root.innerHTML = `
    <div class="modal fade" tabindex="-1" id="roChecklistModal"
      data-requerimiento-id="${esc(ctxReq)}" data-orden-id="${esc(ctxOrd)}">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${esc(titulo)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="alert ${checklist.completo ? 'alert-success' : 'alert-warning'} py-2">
              ${esc(checklist.resumen)}
            </div>
            <div class="table-responsive">
              <table class="table table-sm align-middle">
                <thead>
                  <tr><th>Requisito</th><th>Estado</th><th>Detalle</th><th></th></tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="4" class="text-muted">Sin requisitos</td></tr>'}</tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;

  const modalEl = root.querySelector('.modal');
  // eslint-disable-next-line no-undef
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  /** @type {{ action: string, item: object } | null} */
  let pendingCompletar = null;

  modalEl.addEventListener('hidden.bs.modal', async () => {
    root.innerHTML = '';
    const pending = pendingCompletar;
    pendingCompletar = null;
    if (pending && onCompletar) {
      // RC8.10.3 — abrir modal del requisito SOLO tras cerrar checklist (evita race Bootstrap).
      await onCompletar(pending.action, pending.item);
      return;
    }
    onClose?.({ completo: !!checklist.completo, checklist });
  }, { once: true });

  modal.show();

  modalEl.querySelectorAll('.ro-chk-go').forEach((btn) => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const item = (checklist.items || []).find((x) => x.id === id) || { id, action };
      pendingCompletar = {
        action,
        item: {
          ...item,
          requerimientoId: btn.dataset.requerimientoId || ctxReq || null,
          ordenId: btn.dataset.ordenId || ctxOrd || null,
        },
      };
      // eslint-disable-next-line no-undef
      bootstrap.Modal.getInstance(modalEl)?.hide();
    };
  });
  return { modalEl, modal, checklist };
}

export async function fetchChecklistOrden(ordenId, etapa = ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION) {
  const resp = await ordenesContratacionService.getChecklist(ordenId, etapa);
  return resp?.data || resp;
}

export async function fetchChecklistRequerimiento(requerimientoId, etapa = ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION) {
  const resp = await ordenesContratacionService.getChecklistRequerimiento(requerimientoId, etapa);
  return resp?.data || resp;
}

/**
 * Tras guardar una sección: revalida y muestra checklist si hay pendientes.
 */
export async function validarYMostrarChecklist({
  ordenId, requerimientoId, onCompletar, titulo,
} = {}) {
  let data;
  if (ordenId) data = await fetchChecklistOrden(ordenId);
  else if (requerimientoId) data = await fetchChecklistRequerimiento(requerimientoId);
  else return { completo: false };
  const checklist = data.checklist || data;
  if (!checklist.completo) {
    openChecklistModal(checklist, {
      titulo: titulo || 'Información pendiente del expediente',
      onCompletar,
      forzar: true,
      requerimientoId,
      ordenId,
    });
  }
  return { completo: !!checklist.completo, checklist, snapshot: data.snapshot };
}

export function renderChecklistBadge(checklistOrResumen) {
  if (!checklistOrResumen) return '';
  const completo = checklistOrResumen.completo === true
    || checklistOrResumen.checklist_completo === true;
  const pendientes = checklistOrResumen.pendientes?.length
    || checklistOrResumen.checklist?.pendientes?.length
    || 0;
  if (completo) {
    return '<span class="badge bg-success" title="Checklist completo">OK</span>';
  }
  return `<span class="badge bg-warning text-dark" title="${esc(checklistOrResumen.resumen || 'Pendientes')}">${pendientes || '!'} pend.</span>`;
}

export { ETAPAS_CHECKLIST };
