// Utilidades compartidas entre Registro, Evaluación, DEC y Programación.
//   - intent de apertura para editar desde Evaluación
//   - badge de estado uniforme
//   - ciclo de observaciones/subsanaciones persistido en el payload
//   - historial coloreado por actor
//   - diálogo de texto
import { requerimientosService } from '../../services/requerimientosService.js';

export const reqShared = { pendingOpenId: null, editingFromEvaluacion: false, onBackToEvaluacion: null };

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

function safeParse(payload) {
  try { return JSON.parse(payload || '{}'); } catch (_) { return {}; }
}

// Badge de estado uniforme.
export function estadoBadge(estado) {
  const e = String(estado || '');
  let cls = 'bg-secondary';
  if (/tr[aá]mite/i.test(e)) cls = 'bg-warning text-dark';
  else if (/observ/i.test(e)) cls = 'bg-danger';
  else if (/aprobad/i.test(e)) cls = 'bg-success';
  return `<span class="badge ${cls}">${esc(e || '—')}</span>`;
}

export function ultimaObservacion(req) {
  const obs = safeParse(req && req.payload).observaciones || [];
  return obs.length ? obs[obs.length - 1] : null;
}

export function todasObservaciones(req) {
  return safeParse(req && req.payload).observaciones || [];
}

// Genera HTML del historial coloreado por actor/origen.
// DEC → verde, GERENTE → rojo, USUARIO → azul, PROGRAMACIÓN → naranja
export function historialHtml(observaciones) {
  if (!observaciones || !observaciones.length) {
    return '<div class="text-muted fst-italic">No hay observaciones registradas.</div>';
  }
  const items = observaciones.map((o) => {
    const origen = (o.origen || 'GERENTE').toUpperCase();
    const ronda = o.ronda || '?';
    const fecha = o.fecha ? new Date(o.fecha).toLocaleDateString('es-PE', { 
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    }) : '';

    // Color por origen
    let colorClass, bgClass, label;
    if (origen === 'DEC') {
      colorClass = 'text-success';
      bgClass = 'bg-success-subtle border-success';
      label = 'Observación DEC';
    } else if (origen === 'PROGRAMACIÓN' || origen === 'PROGRAMACION') {
      colorClass = 'text-warning';
      bgClass = 'bg-warning-subtle border-warning';
      label = 'Observación Programación';
    } else if (origen === 'USUARIO') {
      colorClass = 'text-primary';
      bgClass = 'bg-primary-subtle border-primary';
      label = 'Observación Usuario';
    } else {
      colorClass = 'text-danger';
      bgClass = 'bg-danger-subtle border-danger';
      label = 'Observación Gerente';
    }

    let html = `<div class="border rounded p-2 mb-2 ${bgClass}" style="font-size:0.9em;">`;
    html += `<div class="fw-bold ${colorClass}"><i class="bi bi-chat-left-dots"></i> ${label} #${ronda} ${fecha ? '<small class="text-muted">(' + esc(fecha) + ')</small>' : ''}</div>`;
    html += `<div style="white-space:pre-wrap;" class="mb-1">${esc(o.motivo || '')}</div>`;
    
    if (o.subsanacion) {
      const fechaS = o.fecha_subsana ? new Date(o.fecha_subsana).toLocaleDateString('es-PE', { 
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
      }) : '';
      html += `<div class="fw-bold text-primary mt-1"><i class="bi bi-reply"></i> Respuesta del usuario ${fechaS ? '<small class="text-muted">(' + esc(fechaS) + ')</small>' : ''}</div>`;
      html += `<div style="white-space:pre-wrap;">${esc(o.subsanacion)}</div>`;
    } else {
      html += `<div class="text-muted fst-italic mt-1"><small>Sin respuesta aún</small></div>`;
    }
    html += `</div>`;
    return html;
  });
  return `<div class="mb-3"><label class="form-label fw-bold">Historial de la conversación</label>${items.join('')}</div>`;
}

// Agrega una observación (cualquier origen) con estado personalizado.
export async function addObservacionCustom(req, motivo, origen, gerente, nuevoEstado) {
  const payload = safeParse(req.payload);
  payload.observaciones = payload.observaciones || [];
  payload.observaciones.push({
    ronda: payload.observaciones.length + 1,
    motivo,
    gerente: gerente || origen || 'sistema',
    origen: origen || 'GERENTE',
    fecha: new Date().toISOString(),
    subsanacion: null,
  });
  await requerimientosService.update(req.id, { 
    estado: nuevoEstado || 'Observado', 
    payload: JSON.stringify(payload) 
  });
}

// Agrega la subsanación del usuario a la última observación abierta.
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
  await requerimientosService.update(req.id, { 
    estado: 'En tramite de aprobación', 
    payload: JSON.stringify(payload) 
  });
}

// Agrega una observación (gerente) → estado "Observado".
export async function addObservacion(req, motivo, gerente) {
  return addObservacionCustom(req, motivo, 'GERENTE', gerente, 'Observado');
}

// Cuadro de diálogo con historial + textarea.
export function showTextModal(opts = {}) {
  const id = 'modTxt_' + Date.now();
  const hist = opts.historyHtml || '';
  const inputSection = opts.readOnlyMode ? '' : `
            <label class="form-label">${esc(opts.label || 'Detalle')}</label>
            <textarea id="${id}_txt" class="form-control" rows="4" placeholder="${esc(opts.placeholder || '')}"></textarea>`;
  const footerBtns = opts.readOnlyMode
    ? `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>`
    : `<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" id="${id}_ok" class="btn ${opts.buttonClass || 'btn-primary'}">${esc(opts.buttonText || 'Guardar')}</button>`;
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
            ${inputSection}
          </div>
          <div class="modal-footer">
            ${footerBtns}
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
    if (!opts.readOnlyMode) {
      document.getElementById(`${id}_ok`).onclick = () => {
        const v = (document.getElementById(`${id}_txt`).value || '').trim();
        if (!v) { alert('Por favor ingrese el texto.'); return; }
        resolved = true;
        resolve(v);
        modal.hide();
      };
    }
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}

// Modal para mostrar historial + texto + botones personalizados (para derivar)
export function showObservarModal(opts = {}) {
  const id = 'modObs_' + Date.now();
  const hist = opts.historyHtml || '';
  const btnsHtml = (opts.buttons || []).map((b, i) => {
    return `<button type="button" id="${id}_btn_${i}" class="btn ${b.cls || 'btn-primary'}">${esc(b.label || 'Aceptar')}</button>`;
  }).join('');
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
            <label class="form-label">${esc(opts.label || 'Detalle')}</label>
            <textarea id="${id}_txt" class="form-control" rows="4" placeholder="${esc(opts.placeholder || '')}"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            ${btnsHtml}
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
    (opts.buttons || []).forEach((b, i) => {
      document.getElementById(`${id}_btn_${i}`).onclick = () => {
        const v = (document.getElementById(`${id}_txt`).value || '').trim();
        if (!v) { alert('Por favor ingrese el texto.'); return; }
        resolved = true;
        resolve({ action: b.action, text: v });
        modal.hide();
      };
    });
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}