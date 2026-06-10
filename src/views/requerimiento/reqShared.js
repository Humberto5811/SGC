// Utilidades compartidas entre Registro y Evaluación de Requerimientos:
//   - intent de apertura para editar desde Evaluación (pendingOpenId)
//   - badge de estado uniforme
//   - cuadro de diálogo de texto (observación / subsanación) basado en Bootstrap
//   - ciclo de observaciones/subsanaciones persistido en el payload
import { requerimientosService } from '../../services/requerimientosService.js';

// Intent para abrir un requerimiento a editar desde Evaluación (se navega a Registro).
// editingFromEvaluacion: cuando es true, el formulario oculta títulos de Registro y
// el botón "Volver" regresa al listado de Evaluación.
export const reqShared = { pendingOpenId: null, editingFromEvaluacion: false, onBackToEvaluacion: null };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeParse(payload) {
  try { return JSON.parse(payload || '{}'); } catch (_) { return {}; }
}

// Badge de estado uniforme para ambos listados.
export function estadoBadge(estado) {
  const e = String(estado || '');
  let cls = 'bg-secondary';
  if (/tr[aá]mite/i.test(e)) cls = 'bg-warning text-dark';
  else if (/observ/i.test(e)) cls = 'bg-danger';
  else if (/aprobad/i.test(e)) cls = 'bg-success';
  return `<span class="badge ${cls}">${esc(e || '—')}</span>`;
}

// Devuelve la última observación del payload (o null).
export function ultimaObservacion(req) {
  const obs = safeParse(req && req.payload).observaciones || [];
  return obs.length ? obs[obs.length - 1] : null;
}

// Devuelve todas las observaciones del payload.
export function todasObservaciones(req) {
  return safeParse(req && req.payload).observaciones || [];
}

// Genera HTML del historial completo de observaciones/subsanaciones.
export function historialHtml(observaciones) {
  if (!observaciones || !observaciones.length) return '';
  const items = observaciones.map((o) => {
    const fecha = o.fecha ? new Date(o.fecha).toLocaleDateString('es-PE') : '';
    let html = `<div class="border rounded p-2 mb-2" style="font-size:0.9em;">`;
    html += `<div class="fw-bold text-danger"><i class="bi bi-chat-left-dots"></i> Observación #${o.ronda || '?'} ${fecha ? '<small class="text-muted">(' + esc(fecha) + ')</small>' : ''}</div>`;
    html += `<div style="white-space:pre-wrap;" class="mb-1">${esc(o.motivo || '')}</div>`;
    if (o.subsanacion) {
      const fechaS = o.fecha_subsana ? new Date(o.fecha_subsana).toLocaleDateString('es-PE') : '';
      html += `<div class="fw-bold text-primary mt-1"><i class="bi bi-reply"></i> Subsanación ${fechaS ? '<small class="text-muted">(' + esc(fechaS) + ')</small>' : ''}</div>`;
      html += `<div style="white-space:pre-wrap;">${esc(o.subsanacion)}</div>`;
    } else {
      html += `<div class="text-muted fst-italic mt-1"><small>Sin respuesta aún</small></div>`;
    }
    html += `</div>`;
    return html;
  });
  return `<div class="mb-3"><label class="form-label fw-bold">Historial de observaciones</label>${items.join('')}</div>`;
}

// Agrega una observación (gerente) → estado "Observado".
export async function addObservacion(req, motivo, gerente) {
  const payload = safeParse(req.payload);
  payload.observaciones = payload.observaciones || [];
  payload.observaciones.push({
    ronda: payload.observaciones.length + 1,
    motivo,
    gerente: gerente || 'gerente',
    fecha: new Date().toISOString(),
    subsanacion: null,
  });
  await requerimientosService.update(req.id, { estado: 'Observado', payload: JSON.stringify(payload) });
}

// Agrega la subsanación del usuario a la última observación abierta → "En tramite de aprobación".
export async function addSubsanacion(req, texto, usuario) {
  const payload = safeParse(req.payload);
  payload.observaciones = payload.observaciones || [];
  for (let i = payload.observaciones.length - 1; i >= 0; i--) {
    if (!payload.observaciones[i].subsanacion) {
      payload.observaciones[i].subsanacion = texto;
      payload.observaciones[i].usuario_subsana = usuario || 'usuario';
      payload.observaciones[i].fecha_subsana = new Date().toISOString();
      break;
    }
  }
  await requerimientosService.update(req.id, { estado: 'En tramite de aprobación', payload: JSON.stringify(payload) });
}

// Cuadro de diálogo con un texto opcional de solo lectura y un textarea editable.
// Resuelve con el texto ingresado (trim) o null si se cancela/cierra.
export function showTextModal(opts = {}) {
  const id = 'modTxt_' + Date.now();
  const ro = opts.readonlyText
    ? `<div class="mb-3">
         <label class="form-label fw-bold">${esc(opts.readonlyLabel || 'Observación del gerente')}</label>
         <div class="alert alert-warning mb-0" style="white-space:pre-wrap;">${esc(opts.readonlyText)}</div>
       </div>`
    : '';
  const hist = opts.historyHtml || '';
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${esc(opts.title || 'Observación')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" style="max-height:60vh;overflow-y:auto;">
            ${hist}
            ${ro}
            <label class="form-label">${esc(opts.label || 'Detalle')}</label>
            <textarea id="${id}_txt" class="form-control" rows="4" placeholder="${esc(opts.placeholder || '')}"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" id="${id}_ok" class="btn ${opts.buttonClass || 'btn-primary'}">${esc(opts.buttonText || 'Guardar')}</button>
          </div>
        </div>
      </div>
    </div>`;
  const wrap = document.createElement('div');
  document.body.appendChild(wrap);
  wrap.innerHTML = html;
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  return new Promise((resolve) => {
    let resolved = false;
    document.getElementById(`${id}_ok`).onclick = () => {
      const v = (document.getElementById(`${id}_txt`).value || '').trim();
      if (!v) { alert('Por favor ingrese el texto.'); return; }
      resolved = true;
      resolve(v);
      modal.hide();
    };
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}
