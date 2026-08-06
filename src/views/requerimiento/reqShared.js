// Utilidades compartidas entre Registro, Evaluación, DEC y Programación.
//   - intent de apertura para editar desde Evaluación
//   - badge de estado uniforme
//   - ciclo de observaciones/subsanaciones persistido en el payload
//   - historial coloreado por actor
//   - diálogo de texto
import { requerimientosService } from '../../services/requerimientosService.js';
import { api } from '../../services/apiService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { trazabilidadService } from '../../services/trazabilidadService.js';
import { renderTimeline, timelineModalStyles } from '../../services/timelineService.js';
import {
  diasEnEstadoBadge, fmtDateTime, retrasadoIndicator,
} from '../../utils/trazabilidad.js';
import { renderEstadoVisualHtml, buildPresenterRow } from '../../utils/estadoVisualPresenter.js';
import { renderEstadoExpedienteHtml } from '../../utils/estadoExpedientePresenter.js';
import { renderBadgeEstadoVigenteHtml } from '../../ui/workflow/index.js';
import { SUBMODULOS_DESTINO, getPersonasForSubmodulo, getSubmoduloByLabel, getObservacionOrigenLabel, getSubmoduloDisplayLabel, getObservacionPendiente, observacionPendienteParaSubmodulo } from '../../utils/observacionDestino.js';
import { getListaObservaciones, obtenerEstadoObservaciones, migrateObservacion, buildArbolObservaciones, formatEtiquetaJerarquica, getObservacionPadreId, calcularRondaRaiz } from '../../../shared/observacionesMotor.js';
import { renderAdjuntosPanel } from '../../utils/adjuntosModal.js';

export const reqShared = { pendingOpenId: null, editingFromEvaluacion: false, onBackToEvaluacion: null };

export { getObservacionPendiente, observacionPendienteParaSubmodulo } from '../../utils/observacionDestino.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

function safeParse(payload) {
  try { return JSON.parse(payload || '{}'); } catch (_) { return {}; }
}

// Badge de estado — delega exclusivamente en EstadoVisualPresenter.
export function estadoBadge(estado, row = null) {
  if (row && typeof row === 'object') return renderEstadoVisualHtml(row);
  return renderEstadoVisualHtml(buildPresenterRow({ estado: String(estado || '') }));
}

export function ultimaObservacion(req) {
  const obs = safeParse(req && req.payload).observaciones || [];
  return obs.length ? obs[obs.length - 1] : null;
}

export function todasObservaciones(req) {
  return getListaObservaciones(req);
}

export async function verHistorialObservaciones(req, opts = {}) {
  return showTextModal({
    title: opts.title || 'Historial de observaciones',
    historyHtml: historialHtml(todasObservaciones(req)),
    readOnlyMode: true,
  });
}

// Panel reconstruido únicamente desde payload.observaciones (motor, vista jerárquica).
function renderObservacionCard(o, hilos, idx, depth = 0) {
  const esHija = !!getObservacionPadreId(o);
  const hiloNum = formatEtiquetaJerarquica(o, hilos, idx);
  const tipoLabel = esHija ? 'Subobservación' : (o.subsanacion || o.respuesta ? 'Respuesta final' : 'Observación');
  const indent = depth > 0 ? `margin-left:${Math.min(depth * 1.25, 4)}rem;` : '';
  const fecha = o.fecha ? new Date(o.fecha).toLocaleDateString('es-PE', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';
  const label = getObservacionOrigenLabel(o);
  const emisor = getSubmoduloDisplayLabel(o.origen_submodulo || o.moduloEmisor || o.moduloOrigen || '—');
  const receptor = getSubmoduloDisplayLabel(o.destino_submodulo || o.moduloReceptor || o.moduloDestino || '—');
  const usuario = o.gerente || o.usuarioOrigen || o.usuario || '—';
  const origen = String(o.origen || o.moduloOrigen || '').toUpperCase();

  let colorClass, bgClass;
  if (origen.includes('DEC')) {
    colorClass = 'text-success';
    bgClass = 'bg-success-subtle border-success';
  } else if (origen.includes('PROGRAM')) {
    colorClass = 'text-warning';
    bgClass = 'bg-warning-subtle border-warning';
  } else if (origen.includes('ACTOS') || origen.includes('COORDIN') || /coordinaci/i.test(String(o.origen_submodulo || '')) || /actos prep/i.test(String(o.origen_submodulo || ''))) {
    colorClass = 'text-info';
    bgClass = 'bg-info-subtle border-info';
  } else if (origen.includes('INVITAC')) {
    colorClass = 'text-primary';
    bgClass = 'bg-primary-subtle border-primary';
  } else if (origen === 'USUARIO') {
    colorClass = 'text-primary';
    bgClass = 'bg-primary-subtle border-primary';
  } else {
    colorClass = 'text-danger';
    bgClass = 'bg-danger-subtle border-danger';
  }

  let html = `<div class="border rounded p-2 mb-2 ${bgClass}" style="font-size:0.9em;${indent}">`;
  html += `<div class="fw-bold ${colorClass}"><i class="bi bi-chat-left-dots"></i> ${esc(tipoLabel)} #${esc(hiloNum)}`;
  if (o.estado && o.estado !== 'CERRADA') {
    html += ` <span class="badge bg-secondary ms-1">${esc(o.estado)}</span>`;
  } else if (o.cerrada || o.estado === 'CERRADA') {
    html += ` <span class="badge bg-dark ms-1">CERRADA</span>`;
  }
  html += ` ${fecha ? '<small class="text-muted">(' + esc(fecha) + ')</small>' : ''}</div>`;
  html += `<div class="small text-muted mb-1"><i class="bi bi-diagram-3"></i> ${esc(emisor)} → ${esc(receptor)} · Usuario: <strong>${esc(usuario)}</strong></div>`;
  html += `<div style="white-space:pre-wrap;" class="mb-1">${esc(o.motivo || o.observacion || '')}</div>`;
  if (o.destino_submodulo || o.destino_persona) {
    html += `<div class="small text-muted"><i class="bi bi-arrow-right-circle"></i> Dirigida a: <strong>${esc(o.destino_persona || '—')}</strong> · ${esc(getSubmoduloDisplayLabel(o.destino_submodulo || o.moduloDestino || '—'))}</div>`;
  }

  const respuestaTexto = o.respuesta || o.subsanacion;
  if (respuestaTexto) {
    const fechaS = o.fecha_respuesta || o.fecha_subsana
      ? new Date(o.fecha_respuesta || o.fecha_subsana).toLocaleDateString('es-PE', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }) : '';
    const respModulo = getSubmoduloDisplayLabel(o.subsanacion_origen_submodulo || o.modulo_respuesta || 'Usuario');
    html += `<div class="fw-bold text-primary mt-1"><i class="bi bi-reply"></i> Respuesta (${esc(respModulo)}) ${fechaS ? '<small class="text-muted">(' + esc(fechaS) + ')</small>' : ''}</div>`;
    html += `<div style="white-space:pre-wrap;">${esc(respuestaTexto)}</div>`;
    if (o.subsanacion_destino_submodulo || o.subsanacion_destino_persona) {
      html += `<div class="small text-muted mt-1"><i class="bi bi-arrow-return-right"></i> Devuelto a: <strong>${esc(o.subsanacion_destino_persona || '—')}</strong> · ${esc(getSubmoduloDisplayLabel(o.subsanacion_destino_submodulo || '—'))}</div>`;
    }
  } else if (!o.cerrada && o.estado !== 'CERRADA') {
    html += `<div class="text-muted fst-italic mt-1"><small>Sin respuesta aún — hilo abierto</small></div>`;
  }

  if (o.cerrada || o.estado === 'CERRADA') {
    const fc = o.fecha_cierre ? new Date(o.fecha_cierre).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
    html += `<div class="small text-success mt-1"><i class="bi bi-check-circle"></i> Cierre${fc ? ` (${esc(fc)})` : ''}</div>`;
  }

  if (Array.isArray(o.adjuntos) && o.adjuntos.length) {
    html += `<div class="small mt-1"><i class="bi bi-paperclip"></i> Adjuntos: ${o.adjuntos.map((a) => esc(a.nombre || a.name || a)).join(', ')}</div>`;
  }

  html += `</div>`;
  return html;
}

function renderArbolObservaciones(nodos, hilos, depth = 0) {
  return nodos.map((nodo, idx) => {
    const card = renderObservacionCard(nodo.observacion, hilos, idx, depth);
    const hijos = nodo.hijos?.length
      ? `<div class="obs-hijos">${renderArbolObservaciones(nodo.hijos, hilos, depth + 1)}</div>`
      : '';
    return card + hijos;
  }).join('');
}

export function historialHtml(observacionesOrReq) {
  const hilos = Array.isArray(observacionesOrReq)
    ? observacionesOrReq.map((o) => migrateObservacion({ ...o }))
    : obtenerEstadoObservaciones(observacionesOrReq).hilos;
  if (!hilos.length) {
    return '<div class="text-muted fst-italic">No hay observaciones registradas.</div>';
  }
  const arbol = buildArbolObservaciones(hilos);
  const items = renderArbolObservaciones(arbol, hilos);
  const raices = arbol.length;
  return `<div class="mb-3"><label class="form-label fw-bold">Historial de la conversación (${raices} hilo${raices === 1 ? '' : 's'})</label>${items}</div>`;
}

// Agrega una observación (cualquier origen) con estado personalizado.
export async function addObservacionCustom(req, motivo, origen, gerente, nuevoEstado, destino = {}) {
  const payload = safeParse(req.payload);
  payload.observaciones = payload.observaciones || [];
  payload.observaciones.push({
    ronda: calcularRondaRaiz(payload.observaciones || []),
    motivo,
    gerente: gerente || origen || 'sistema',
    origen: origen || 'GERENTE',
    origen_submodulo: destino.origen_submodulo || '',
    destino_submodulo: destino.destino_submodulo || '',
    destino_etapa: destino.destino_etapa || '',
    destino_persona: destino.destino_persona || '',
    fecha: new Date().toISOString(),
    subsanacion: null,
  });
  const updateBody = {
    payload: JSON.stringify(payload),
    usuario_modificacion: gerente || origen || 'gerente',
  };
  if (nuevoEstado) updateBody.estado = nuevoEstado;
  await requerimientosService.update(req.id, updateBody);
}

// Agrega una observación (gerente) — no altera el estado del workflow.
export async function addObservacion(req, motivo, gerente, destino = {}) {
  return addObservacionCustom(req, motivo, 'GERENTE', gerente, null, destino);
}

// Agrega la subsanación y deriva al submódulo destino seleccionado.
export async function addSubsanacion(req, texto, usuario, destino = {}) {
  await requerimientosService.subsanarConDestino(req.id, {
    respuesta: texto,
    usuario: usuario || 'usuario',
    observacion_id: destino.observacion_id,
    origen_submodulo: destino.origen_submodulo || 'Registro de Requerimiento',
    destino_submodulo: destino.destino_submodulo || '',
    destino_etapa: destino.destino_etapa || '',
    destino_persona: destino.destino_persona || '',
  });
}

function buildDestinoSelectorsHtml(id, defaultSubmodulo = '') {
  const opts = SUBMODULOS_DESTINO.map((s) =>
    `<option value="${esc(s.label)}" data-code="${esc(s.code)}" ${s.label === defaultSubmodulo ? 'selected' : ''}>${esc(s.label)}</option>`,
  ).join('');
  return `
    <div class="row g-2 mb-3 border rounded p-2 bg-light">
      <div class="col-md-6">
        <label class="form-label small fw-semibold mb-1">Submódulo destino</label>
        <select id="${id}_destSub" class="form-select form-select-sm">${opts}</select>
      </div>
      <div class="col-md-6">
        <label class="form-label small fw-semibold mb-1">Persona destino</label>
        <div class="input-group input-group-sm mb-1">
          <input type="text" id="${id}_buscarUsr" class="form-control" placeholder="Buscar en Usuarios y Permisos…" />
          <button type="button" id="${id}_btnBuscarUsr" class="btn btn-outline-primary" title="Buscar usuario"><i class="bi bi-search"></i></button>
        </div>
        <div id="${id}_usrResults" class="mb-1" style="display:none"></div>
        <select id="${id}_destPer" class="form-select form-select-sm"></select>
        <input type="text" id="${id}_destPerOtro" class="form-control form-control-sm mt-1" placeholder="O escriba otro nombre…">
      </div>
    </div>`;
}

function formatUsuarioNombre(u) {
  if (!u) return '';
  return String(u.nombre || [u.apellidos, u.nombres].filter(Boolean).join(' ').trim() || u.username || u.dni || '').trim();
}

function wireDestinoSelectors(id) {
  const subEl = document.getElementById(`${id}_destSub`);
  const perEl = document.getElementById(`${id}_destPer`);
  const otroEl = document.getElementById(`${id}_destPerOtro`);
  const buscarEl = document.getElementById(`${id}_buscarUsr`);
  const btnBuscar = document.getElementById(`${id}_btnBuscarUsr`);
  const resultsEl = document.getElementById(`${id}_usrResults`);
  const refreshPersonas = () => {
    const label = subEl.value;
    const personas = getPersonasForSubmodulo(label);
    perEl.innerHTML = personas.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')
      + '<option value="__otro__">Otro…</option>';
  };
  const seleccionarUsuario = (nombre) => {
    if (!nombre) return;
    perEl.value = '__otro__';
    otroEl.value = nombre;
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
    buscarEl.value = nombre;
  };
  const buscarUsuarios = async () => {
    const q = (buscarEl.value || '').trim();
    if (q.length < 2) {
      alert('Ingrese al menos 2 caracteres para buscar.');
      return;
    }
    resultsEl.style.display = 'block';
    resultsEl.innerHTML = '<div class="text-muted small p-2">Buscando…</div>';
    try {
      const resp = await api.list('usuarios', { page: 1, pageSize: 15, search: q, estado: 'Activo' });
      const rows = (resp && resp.data) || [];
      if (!rows.length) {
        resultsEl.innerHTML = '<div class="text-muted small p-2 border rounded">Sin usuarios activos.</div>';
        return;
      }
      resultsEl.innerHTML = `<div class="list-group list-group-flush border rounded" style="max-height:140px;overflow-y:auto">${rows.map((u) => {
        const nom = formatUsuarioNombre(u);
        const det = [u.dni, u.cargo, u.descripcion_area || u.descripcionArea].filter(Boolean).join(' · ');
        return `<button type="button" class="list-group-item list-group-item-action py-1 px-2 usr-pick" data-nom="${esc(nom)}">
          <strong>${esc(nom)}</strong>${det ? `<br><span class="text-muted small">${esc(det)}</span>` : ''}
        </button>`;
      }).join('')}</div>`;
      resultsEl.querySelectorAll('.usr-pick').forEach((b) => {
        b.onclick = () => seleccionarUsuario(b.dataset.nom);
      });
    } catch (e) {
      resultsEl.innerHTML = `<div class="alert alert-danger py-1 px-2 small mb-0">${esc(e.message)}</div>`;
    }
  };
  subEl.onchange = refreshPersonas;
  btnBuscar.onclick = buscarUsuarios;
  buscarEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); buscarUsuarios(); } };
  refreshPersonas();
  return () => {
    const sub = getSubmoduloByLabel(subEl.value);
    let persona = perEl.value;
    if (persona === '__otro__' || otroEl.value.trim()) {
      persona = otroEl.value.trim() || persona;
    }
    if (!persona || persona === '__otro__') {
      alert('Indique la persona destino de la observación.');
      return null;
    }
    return {
      destino_submodulo: subEl.value,
      destino_etapa: sub?.code || '',
      destino_persona: persona,
    };
  };
}

/** Modal de observación con selección de submódulo y persona destino. */
export function showObservacionDirigidaModal(opts = {}) {
  const id = 'modObsDir_' + Date.now();
  const hist = opts.historyHtml || '';
  const destHtml = buildDestinoSelectorsHtml(id, opts.defaultDestinoSubmodulo || 'Registro de Requerimiento');
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${esc(opts.title || 'Registrar observación')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" style="max-height:65vh;overflow-y:auto;">
            ${opts.origenSubmodulo ? `<div class="alert alert-light border small py-2 mb-2">Origen: <strong>${esc(opts.origenSubmodulo)}</strong></div>` : ''}
            ${hist}
            ${destHtml}
            <label class="form-label">${esc(opts.label || 'Motivo de la observación')}</label>
            <textarea id="${id}_txt" class="form-control" rows="4" placeholder="${esc(opts.placeholder || 'Describa la observación…')}"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" id="${id}_ok" class="btn ${opts.buttonClass || 'btn-danger'}">${esc(opts.buttonText || 'Registrar observación')}</button>
          </div>
        </div>
      </div>
    </div>`;
  const wrap = document.createElement('div');
  document.body.appendChild(wrap);
  wrap.innerHTML = html;
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  const readDestino = wireDestinoSelectors(id);
  return new Promise((resolve) => {
    let resolved = false;
    document.getElementById(`${id}_ok`).onclick = () => {
      const motivo = (document.getElementById(`${id}_txt`).value || '').trim();
      if (!motivo) { alert('Ingrese el motivo de la observación.'); return; }
      const destino = readDestino();
      if (!destino) return;
      resolved = true;
      resolve({
        motivo,
        ...destino,
        origen_submodulo: opts.origenSubmodulo || '',
      });
      modal.hide();
    };
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
}

/** Modal de subsanación con selección de submódulo y persona destino. */
export function showSubsanacionDirigidaModal(opts = {}) {
  const id = 'modSubDir_' + Date.now();
  const hist = opts.historyHtml || '';
  const destHtml = buildDestinoSelectorsHtml(id, opts.defaultDestinoSubmodulo || 'Evaluación de Requerimiento');
  const adjHtml = opts.requerimientoId ? `<div id="${id}_adjPanel"></div>` : '';
  const html = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${esc(opts.title || 'Subsanar observación')}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" style="max-height:65vh;overflow-y:auto;">
            ${hist}
            ${adjHtml}
            ${destHtml}
            <label class="form-label">${esc(opts.label || 'Subsanación realizada')}</label>
            <textarea id="${id}_txt" class="form-control" rows="4" placeholder="${esc(opts.placeholder || 'Describa la subsanación…')}"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" id="${id}_ok" class="btn ${opts.buttonClass || 'btn-primary'}">${esc(opts.buttonText || 'Enviar subsanación')}</button>
          </div>
        </div>
      </div>
    </div>`;
  const wrap = document.createElement('div');
  document.body.appendChild(wrap);
  wrap.innerHTML = html;
  const el = document.getElementById(id);
  const modal = new bootstrap.Modal(el);
  const readDestino = wireDestinoSelectors(id);
  if (opts.requerimientoId) {
    const panel = document.getElementById(`${id}_adjPanel`);
    if (panel) panel.id = `${id}_adjPanel`;
    renderAdjuntosPanel(`${id}_adjPanel`, opts.requerimientoId, { readOnly: false });
  }
  return new Promise((resolve) => {
    let resolved = false;
    document.getElementById(`${id}_ok`).onclick = () => {
      const texto = (document.getElementById(`${id}_txt`).value || '').trim();
      if (!texto) { alert('Ingrese la subsanación realizada.'); return; }
      const destino = readDestino();
      if (!destino) return;
      resolved = true;
      resolve({ texto, ...destino, origen_submodulo: opts.origenSubmodulo || 'Registro de Requerimiento' });
      modal.hide();
    };
    el.addEventListener('hidden.bs.modal', () => {
      wrap.remove();
      if (!resolved) resolve(null);
    }, { once: true });
    modal.show();
  });
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

export async function showTrazabilidadModal(requerimientoId) {
  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,.45)';
    modal.innerHTML = `
    <style>${timelineModalStyles()}</style>
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header bg-dark text-white">
          <h5 class="modal-title"><i class="bi bi-signpost-split"></i> Trazabilidad del expediente</h5>
          <button type="button" class="btn-close btn-close-white" id="closeTraza"></button>
        </div>
        <div class="modal-body"><div class="text-muted small">Cargando historial…</div></div>
        <div class="modal-footer py-2"><button type="button" class="btn btn-secondary btn-sm" id="cerrarTrazaFooter">Cerrar</button></div>
      </div>
    </div>`;
  const close = () => modal.remove();
  modal.querySelector('#closeTraza').onclick = close;
  modal.querySelector('#cerrarTrazaFooter')?.addEventListener('click', close);
  document.body.appendChild(modal);

  try {
    const data = await trazabilidadService.get(requerimientoId);
    const req = data.requerimiento || {};
    const movCount = (data.historialMovimientos || []).length;
    const histCount = (data.historialEstados || []).length;
    const eventCount = movCount || histCount;
    // Única fuente del badge: expediente.estadoVigente (no workflowSnapshot / no último evento)
    const estadoVigente = data.expediente?.estadoVigente || data.estadoVigente || {
      codigo: data.estadoActual,
      label: data.estadoActualTexto,
    };
    const badgeEstadoHtml = estadoVigente?.label
      ? renderEstadoExpedienteHtml(estadoVigente)
      : renderBadgeEstadoVigenteHtml({
        estado_vigente: estadoVigente?.codigo,
        estado_vigente_label: estadoVigente?.label,
        recepcion_estado_global: estadoVigente?.codigo,
      }, esc);
    const subModuloLabel = (typeof data.expediente?.submoduloVigente === 'object'
      ? data.expediente.submoduloVigente.label
      : data.expediente?.submoduloVigente)
      || data.subModuloActual
      || '—';
    modal.querySelector('.modal-body').innerHTML = `
      <div class="mb-3">
        <div><strong>${esc(req.codigo || ('#' + requerimientoId))}</strong> — ${esc(req.denominacion || req.tipo || '')}</div>
        <div class="small text-muted">${esc(req.area || '')} · ${esc(req.centro || '')}</div>
      </div>
      <div class="row g-2 mb-3 small">
        <div class="col-md-3"><strong>Estado actual:</strong><br/>${badgeEstadoHtml}</div>
        <div class="col-md-3"><strong>Submódulo:</strong><br/>${esc(subModuloLabel)}</div>
        <div class="col-md-3"><strong>Responsable:</strong><br/>${esc(data.expediente?.responsableActual || data.responsableActual || '—')}</div>
        <div class="col-md-3"><strong>Días en etapa:</strong><br/>${diasEnEstadoBadge({ dias_en_estado: data.expediente?.diasEnEtapa ?? data.diasEnEstado })}${data.retrasado || Number(data.diasEnEstado) > 10 ? retrasadoIndicator({ dias_en_estado: data.diasEnEstado }) : ''}</div>
        <div class="col-12"><strong>Desde:</strong> ${esc(fmtDateTime(data.expediente?.fechaInicioEtapa || data.fechaEstadoActual || data.fechaIngresoActual))}</div>
      </div>
      <hr class="my-2"/>
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0">Recorrido completo (${eventCount} eventos)</h6>
        <small class="text-muted">Más reciente arriba</small>
      </div>
      <div class="traza-modal-scroll">
        <div class="traza-timeline-wrap">${renderTimeline(data)}</div>
      </div>
    `;
  } catch (e) {
    modal.querySelector('.modal-body').innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

export function bindTrazabilidadButtons(container) {
  if (!container) return;
  container.querySelectorAll('.req-traza').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      showTrazabilidadModal(btn.dataset.id);
    };
  });
}