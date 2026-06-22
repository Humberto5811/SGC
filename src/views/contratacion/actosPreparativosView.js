// Actos Preparatorios — bandeja de trabajo del Coordinador de Contrataciones Menores
import { authService } from '../../services/authService.js';

const API = 'http://localhost:3000/api';
function authHeaders() {
  try { const u = JSON.parse(localStorage.getItem('currentUser')); if (u && u.id) return { 'x-user-id': String(u.id) }; } catch (_) {}
  return {};
}
async function apiFetch(path, opts = {}) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json', ...authHeaders() }, ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `Error ${r.status}`); }
  return r.status === 204 ? null : r.json();
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

const SUBMODULOS = [
  'Registro de Requerimientos', 'Evaluación', 'DEC', 'Programación',
  'Actos Preparatorios', 'Invitaciones', 'Consultas', 'Cotizaciones',
  'CCP', 'Cuadro Comparativo', 'Registro de Orden', 'Almacén', 'Tesorería'
];

let allExpedientes = [];
let stats = {};

function renderActosPreparativosView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-file-earmark-text"></i> Actos Preparatorios</h3>
          <p class="text-muted mb-0">Mesa de control del Coordinador de Contrataciones Menores.</p>
        </div>
        <button id="apReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      <div id="apIndicadores" class="row g-2 mb-3"></div>
      <hr/>
      <div id="apContent"><div class="text-muted">Cargando...</div></div>
    </div>
    <style>
      #apContent .ap-table, #apContent .ap-table th, #apContent .ap-table td {
        font-family: Arial, Helvetica, sans-serif; font-size: 10pt; font-weight: normal;
      }
      .ap-card { border-radius: 8px; padding: 12px 16px; text-align: center; color: #fff; min-width: 120px; }
      .ap-card h4 { margin: 0; font-size: 1.5rem; font-weight: 700; }
      .ap-card small { font-size: 0.75rem; opacity: 0.9; }
      .delay-green { color: #198754; } .delay-yellow { color: #ffc107; }
      .delay-orange { color: #fd7e14; } .delay-red { color: #dc3545; font-weight: bold; }
    </style>
  `;
}

async function loadBandeja() {
  const cont = document.getElementById('apContent');
  const indic = document.getElementById('apIndicadores');
  if (!cont) return;
  try {
    const [expedientesResp, statsResp] = await Promise.all([
      apiFetch('/actos-preparatorios'),
      apiFetch('/actos-preparatorios/stats'),
    ]);
    allExpedientes = (expedientesResp && expedientesResp.data) || [];
    stats = statsResp || {};

    // Render indicators
    if (indic) {
      indic.innerHTML = `
        <div class="col"><div class="ap-card" style="background:#0d6efd;"><h4>${stats.total || 0}</h4><small>Total Expedientes</small></div></div>
        <div class="col"><div class="ap-card" style="background:#6c757d;"><h4>${stats.pendientes_asignacion || 0}</h4><small>Pendientes Asignación</small></div></div>
        <div class="col"><div class="ap-card" style="background:#0dcaf0;"><h4>${stats.asignados || 0}</h4><small>Asignados</small></div></div>
        <div class="col"><div class="ap-card" style="background:#ffc107; color:#000;"><h4>${stats.observados || 0}</h4><small>Observados</small></div></div>
        <div class="col"><div class="ap-card" style="background:#fd7e14;"><h4>${stats.retrasados || 0}</h4><small>Retrasados</small></div></div>
        <div class="col"><div class="ap-card" style="background:#198754;"><h4>${stats.finalizados || 0}</h4><small>Finalizados</small></div></div>
      `;
    }

    if (!allExpedientes.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay expedientes en Actos Preparatorios.</div>';
      return;
    }

    const sty = 'padding:2px 6px; font-size:11px;';
    cont.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle ap-table">
          <thead class="table-light">
            <tr>
              <th>Timeline</th>
              <th>N° Requerimiento</th>
              <th>Tipo</th>
              <th>Código SIGAMEF</th>
              <th>Descripción</th>
              <th>Área Usuaria</th>
              <th>Estado Actual</th>
              <th>Responsable Actual</th>
              <th>Fecha Asignación</th>
              <th class="text-center">Días</th>
              <th style="width:200px;" class="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${allExpedientes.map((r) => {
              const dias = calcDias(r.fecha_estado_actual);
              const delayClass = dias <= 2 ? 'delay-green' : dias <= 5 ? 'delay-yellow' : dias <= 10 ? 'delay-orange' : 'delay-red';
              const sigamef = getSigamef(r);
              const desc = getDescripcion(r);
              return `
              <tr>
                <td><button class="btn btn-xs btn-outline-secondary ap-timeline" data-id="${r.id}" title="Ver Timeline" style="${sty}"><i class="bi bi-clock-history" style="font-size:11px;"></i></button></td>
                <td>${esc(r.codigo || '#' + r.id)}</td>
                <td><span class="badge bg-secondary text-uppercase" style="font-size:0.65rem;">${esc(r.tipo)}</span></td>
                <td class="small">${esc(sigamef)}</td>
                <td class="small">${esc(desc)}</td>
                <td>${esc(r.area || '')}</td>
                <td>${estadoBadge(r.estado)}</td>
                <td>${esc(r.responsable_actual || '<span class="text-muted">Sin asignar</span>')}</td>
                <td class="small">${r.fecha_estado_actual ? String(r.fecha_estado_actual).slice(0, 10) : ''}</td>
                <td class="text-center"><span class="${delayClass}">${dias >= 0 ? dias : '—'}</span></td>
                <td class="text-center" style="white-space:nowrap;">
                  <button class="btn btn-xs btn-outline-primary ap-asignar" data-id="${r.id}" title="Asignar Analista" style="${sty}"><i class="bi bi-person-plus" style="font-size:11px;"></i></button>
                  <button class="btn btn-xs btn-outline-info ap-reasignar" data-id="${r.id}" title="Reasignar" style="${sty}"><i class="bi bi-arrow-repeat" style="font-size:11px;"></i></button>
                  <button class="btn btn-xs btn-outline-success ap-aprobar" data-id="${r.id}" title="Aprobar" style="${sty}"><i class="bi bi-check-circle" style="font-size:11px;"></i></button>
                  <button class="btn btn-xs btn-outline-warning ap-observar" data-id="${r.id}" title="Observar" style="${sty}"><i class="bi bi-exclamation-triangle" style="font-size:11px;"></i></button>
                  <button class="btn btn-xs btn-outline-dark ap-docs" data-id="${r.id}" title="Documentos" style="${sty}"><i class="bi bi-folder2-open" style="font-size:11px;"></i></button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    bindEvents(cont);
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error: ${esc(e.message)}</div>`;
  }
}

function calcDias(fecha) {
  if (!fecha) return -1;
  const diff = Date.now() - new Date(fecha).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function getSigamef(r) {
  try { const p = JSON.parse(r.payload || '{}'); return p.codigo_sigamef || p.codigoSigamef || ''; } catch (_) { return ''; }
}
function getDescripcion(r) {
  return r.denominacion || '';
}

function estadoBadge(estado) {
  const e = String(estado || '');
  if (/actos/i.test(e)) return `<span class="badge bg-info">${esc(e)}</span>`;
  if (/asignad/i.test(e)) return `<span class="badge bg-primary">${esc(e)}</span>`;
  if (/observad/i.test(e)) return `<span class="badge bg-warning text-dark">${esc(e)}</span>`;
  if (/invitacion/i.test(e)) return `<span class="badge bg-success">${esc(e)}</span>`;
  return `<span class="badge bg-secondary">${esc(e)}</span>`;
}

function bindEvents(cont) {
  cont.querySelectorAll('.ap-asignar').forEach((b) => b.onclick = () => openAsignarModal(Number(b.dataset.id)));
  cont.querySelectorAll('.ap-reasignar').forEach((b) => b.onclick = () => openAsignarModal(Number(b.dataset.id), true));
  cont.querySelectorAll('.ap-aprobar').forEach((b) => b.onclick = () => openAprobarModal(Number(b.dataset.id)));
  cont.querySelectorAll('.ap-observar').forEach((b) => b.onclick = () => openObservarModal(Number(b.dataset.id)));
  cont.querySelectorAll('.ap-timeline').forEach((b) => b.onclick = () => openTimelineModal(Number(b.dataset.id)));
  cont.querySelectorAll('.ap-docs').forEach((b) => b.onclick = () => openDocumentosModal(Number(b.dataset.id)));
}

// ==================== MODAL: ASIGNAR / REASIGNAR ====================
async function openAsignarModal(reqId, isReasignar = false) {
  const req = allExpedientes.find((r) => r.id === reqId);
  const reqLabel = req ? (req.codigo || '#' + req.id) : '#' + reqId;
  const title = isReasignar ? 'Reasignar Expediente' : 'Asignar Analista';

  let usuarios = [];
  try {
    const resp = await apiFetch('/actos-preparatorios/usuarios-submodulo?submodulo=Actos%20Preparatorios');
    usuarios = (resp && resp.data) || [];
  } catch (_) {}

  const modal = createModal(`
    <div class="modal-header bg-primary text-white">
      <h5 class="modal-title"><i class="bi bi-person-plus"></i> ${title} — ${esc(reqLabel)}</h5>
      <button type="button" class="btn-close btn-close-white close-modal"></button>
    </div>
    <div class="modal-body">
      <label class="form-label fw-bold">Seleccionar Analista:</label>
      ${usuarios.length === 0 ? '<p class="text-muted">No hay usuarios disponibles.</p>' : `
        <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
          <thead class="table-light"><tr><th></th><th>Nombre</th><th>Usuario</th><th>Rol</th></tr></thead>
          <tbody>
            ${usuarios.map((u) => `
              <tr>
                <td class="text-center"><input type="radio" name="asignarUsuario" value="${esc(u.nombre)}" data-id="${u.id}"></td>
                <td>${esc(u.nombre)}</td><td>${esc(u.dni)}</td><td>${esc(u.rol)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      }
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary close-modal">Cancelar</button>
      <button class="btn btn-primary" id="confirmAsignar">Confirmar</button>
    </div>
  `);

  modal.querySelector('#confirmAsignar').onclick = async () => {
    const sel = modal.querySelector('input[name="asignarUsuario"]:checked');
    if (!sel) { alert('Seleccione un analista.'); return; }
    try {
      const user = authService.getCurrentUser();
      const endpoint = isReasignar ? '/actos-preparatorios/reasignar' : '/actos-preparatorios/asignar';
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          requerimiento_id: reqId,
          usuario_destino: sel.value,
          usuario_origen: user ? (user.nombre || user.dni || '') : '',
        }),
      });
      modal.remove();
      alert(isReasignar ? 'Expediente reasignado.' : 'Analista asignado correctamente.');
      loadBandeja();
    } catch (e) { alert('Error: ' + e.message); }
  };
}

// ==================== MODAL: APROBAR ====================
async function openAprobarModal(reqId) {
  const req = allExpedientes.find((r) => r.id === reqId);
  const reqLabel = req ? (req.codigo || '#' + req.id) : '#' + reqId;

  let usuarios = [];
  try {
    const resp = await apiFetch('/actos-preparatorios/usuarios-submodulo?submodulo=Invitaciones');
    usuarios = (resp && resp.data) || [];
  } catch (_) {}

  const modal = createModal(`
    <div class="modal-header bg-success text-white">
      <h5 class="modal-title"><i class="bi bi-check-circle"></i> Aprobar Expediente — ${esc(reqLabel)}</h5>
      <button type="button" class="btn-close btn-close-white close-modal"></button>
    </div>
    <div class="modal-body">
      <p>Al aprobar, el expediente será derivado al submódulo <strong>Invitaciones</strong>.</p>
      <label class="form-label fw-bold">Seleccionar Analista de Invitaciones:</label>
      ${usuarios.length === 0 ? '<p class="text-muted">No hay usuarios disponibles.</p>' : `
        <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
          <thead class="table-light"><tr><th></th><th>Nombre</th><th>Usuario</th><th>Rol</th></tr></thead>
          <tbody>
            ${usuarios.map((u) => `
              <tr>
                <td class="text-center"><input type="radio" name="aprobarUsuario" value="${esc(u.nombre)}" data-id="${u.id}"></td>
                <td>${esc(u.nombre)}</td><td>${esc(u.dni)}</td><td>${esc(u.rol)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      }
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary close-modal">Cancelar</button>
      <button class="btn btn-success" id="confirmAprobar"><i class="bi bi-check-circle"></i> Aprobar y Derivar</button>
    </div>
  `);

  modal.querySelector('#confirmAprobar').onclick = async () => {
    const sel = modal.querySelector('input[name="aprobarUsuario"]:checked');
    if (!sel) { alert('Seleccione un analista de Invitaciones.'); return; }
    if (!confirm('¿Aprobar este expediente y derivarlo a Invitaciones?')) return;
    try {
      const user = authService.getCurrentUser();
      await apiFetch('/actos-preparatorios/aprobar', {
        method: 'POST',
        body: JSON.stringify({
          requerimiento_id: reqId,
          usuario_destino: sel.value,
          usuario_origen: user ? (user.nombre || user.dni || '') : '',
        }),
      });
      modal.remove();
      alert('Expediente aprobado y derivado a Invitaciones.');
      loadBandeja();
    } catch (e) { alert('Error: ' + e.message); }
  };
}

// ==================== MODAL: OBSERVAR ====================
async function openObservarModal(reqId) {
  const req = allExpedientes.find((r) => r.id === reqId);
  const reqLabel = req ? (req.codigo || '#' + req.id) : '#' + reqId;

  const modal = createModal(`
    <div class="modal-header bg-warning text-dark">
      <h5 class="modal-title"><i class="bi bi-exclamation-triangle"></i> Observar Expediente — ${esc(reqLabel)}</h5>
      <button type="button" class="btn-close close-modal"></button>
    </div>
    <div class="modal-body">
      <div class="mb-3">
        <label class="form-label fw-bold">1. Observación:</label>
        <textarea class="form-control" id="obsTexto" rows="3" placeholder="Describa la observación..."></textarea>
      </div>
      <div class="mb-3">
        <label class="form-label fw-bold">2. Submódulo destino:</label>
        <select class="form-select" id="obsSubmodulo">
          <option value="">— Seleccionar —</option>
          ${SUBMODULOS.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label fw-bold">3. Usuario destino:</label>
        <div id="obsUsuarios"><p class="text-muted small">Seleccione un submódulo primero.</p></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary close-modal">Cancelar</button>
      <button class="btn btn-warning" id="confirmObservar"><i class="bi bi-exclamation-triangle"></i> Observar</button>
    </div>
  `);

  const selSub = modal.querySelector('#obsSubmodulo');
  const divUsuarios = modal.querySelector('#obsUsuarios');

  selSub.onchange = async () => {
    const sub = selSub.value;
    if (!sub) { divUsuarios.innerHTML = '<p class="text-muted small">Seleccione un submódulo.</p>'; return; }
    try {
      const resp = await apiFetch(`/actos-preparatorios/usuarios-submodulo?submodulo=${encodeURIComponent(sub)}`);
      const usuarios = (resp && resp.data) || [];
      if (!usuarios.length) { divUsuarios.innerHTML = '<p class="text-muted small">No hay usuarios para este submódulo.</p>'; return; }
      divUsuarios.innerHTML = `
        <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
          <thead class="table-light"><tr><th></th><th>Nombre</th><th>Usuario</th><th>Rol</th></tr></thead>
          <tbody>
            ${usuarios.map((u) => `
              <tr>
                <td class="text-center"><input type="radio" name="obsUsuario" value="${esc(u.nombre)}" data-id="${u.id}"></td>
                <td>${esc(u.nombre)}</td><td>${esc(u.dni)}</td><td>${esc(u.rol)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    } catch (e) { divUsuarios.innerHTML = `<p class="text-danger small">Error: ${esc(e.message)}</p>`; }
  };

  modal.querySelector('#confirmObservar').onclick = async () => {
    const obs = modal.querySelector('#obsTexto').value.trim();
    const sub = selSub.value;
    const sel = modal.querySelector('input[name="obsUsuario"]:checked');
    if (!obs) { alert('Ingrese una observación.'); return; }
    if (!sub) { alert('Seleccione un submódulo destino.'); return; }
    if (!sel) { alert('Seleccione un usuario destino.'); return; }
    try {
      const user = authService.getCurrentUser();
      await apiFetch('/actos-preparatorios/observar', {
        method: 'POST',
        body: JSON.stringify({
          requerimiento_id: reqId,
          observacion: obs,
          submodulo_destino: sub,
          usuario_destino: sel.value,
          usuario_origen: user ? (user.nombre || user.dni || '') : '',
        }),
      });
      modal.remove();
      alert('Expediente observado y derivado a ' + sub + '.');
      loadBandeja();
    } catch (e) { alert('Error: ' + e.message); }
  };
}

// ==================== MODAL: TIMELINE ====================
async function openTimelineModal(reqId) {
  const req = allExpedientes.find((r) => r.id === reqId);
  const reqLabel = req ? (req.codigo || '#' + req.id) : '#' + reqId;
  let trazabilidad = [];
  try {
    const resp = await apiFetch(`/actos-preparatorios/trazabilidad/${reqId}`);
    trazabilidad = (resp && resp.data) || [];
  } catch (_) {}

  const iconMap = {
    'CREACION': 'bi-plus-circle text-success',
    'ASIGNACION': 'bi-person-plus text-primary',
    'REASIGNACION': 'bi-arrow-repeat text-info',
    'APROBACION': 'bi-check-circle text-success',
    'OBSERVACION': 'bi-exclamation-triangle text-warning',
    'DEVOLUCION': 'bi-arrow-return-left text-danger',
    'DERIVACION': 'bi-send text-primary',
  };

  const modal = createModal(`
    <div class="modal-header">
      <h5 class="modal-title"><i class="bi bi-clock-history"></i> Timeline — ${esc(reqLabel)}</h5>
      <button type="button" class="btn-close close-modal"></button>
    </div>
    <div class="modal-body">
      ${trazabilidad.length === 0 ? '<p class="text-muted">Sin registros de trazabilidad.</p>' : `
        <div class="timeline-container" style="border-left:3px solid #0d6efd; padding-left:20px; margin-left:10px;">
          ${trazabilidad.map((t) => {
            const icon = iconMap[t.accion] || 'bi-circle text-secondary';
            return `
              <div class="mb-3 position-relative" style="margin-left:-31px;">
                <span style="position:absolute; left:0; width:20px; height:20px; background:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid #0d6efd;">
                  <i class="bi ${icon}" style="font-size:10px;"></i>
                </span>
                <div style="margin-left:28px;">
                  <strong>${esc(t.accion)}</strong>
                  <span class="text-muted small ms-2">${t.fecha ? new Date(t.fecha).toLocaleString('es-PE') : ''}</span>
                  <br/>
                  <small class="text-muted">${esc(t.origen || '')} → ${esc(t.destino || '')}</small>
                  ${t.usuario_origen ? `<br/><small>De: <strong>${esc(t.usuario_origen)}</strong></small>` : ''}
                  ${t.usuario_destino ? `<small> → Para: <strong>${esc(t.usuario_destino)}</strong></small>` : ''}
                  ${t.observacion ? `<br/><small class="text-danger"><i class="bi bi-chat-left-text"></i> ${esc(t.observacion)}</small>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>`
      }
    </div>
    <div class="modal-footer"><button class="btn btn-secondary close-modal">Cerrar</button></div>
  `, 'modal-lg');
}

// ==================== MODAL: DOCUMENTOS ====================
async function openDocumentosModal(reqId) {
  const req = allExpedientes.find((r) => r.id === reqId);
  const reqLabel = req ? (req.codigo || '#' + req.id) : '#' + reqId;

  // Load associated pedidos
  let pedidos = [];
  try {
    const resp = await apiFetch(`/programacion/pedidos/${reqId}`);
    pedidos = (resp && resp.data) || [];
  } catch (_) {}

  // Load trazabilidad
  let traz = [];
  try {
    const resp = await apiFetch(`/actos-preparatorios/trazabilidad/${reqId}`);
    traz = (resp && resp.data) || [];
  } catch (_) {}

  const modal = createModal(`
    <div class="modal-header">
      <h5 class="modal-title"><i class="bi bi-folder2-open"></i> Documentos — ${esc(reqLabel)}</h5>
      <button type="button" class="btn-close close-modal"></button>
    </div>
    <div class="modal-body">
      <h6>Requerimiento</h6>
      <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
        <tr><th style="width:150px;">Código</th><td>${esc(req?.codigo)}</td></tr>
        <tr><th>Tipo</th><td>${esc(req?.tipo)}</td></tr>
        <tr><th>Área Usuaria</th><td>${esc(req?.area)}</td></tr>
        <tr><th>Denominación</th><td>${esc(req?.denominacion)}</td></tr>
        <tr><th>Estado</th><td>${esc(req?.estado)}</td></tr>
        <tr><th>CMN</th><td>${esc(req?.cmn)}</td></tr>
      </table>

      <h6 class="mt-3">Pedidos SIGAMEF Asociados (${pedidos.length})</h6>
      ${pedidos.length === 0 ? '<p class="text-muted small">Sin pedidos asociados.</p>' : `
        <table class="table table-sm table-bordered" style="font-size:9px; font-family:Arial;">
          <thead class="table-light"><tr><th>Código</th><th>Año</th><th>Tipo</th><th>Nro</th><th>Descripción</th><th>Total</th></tr></thead>
          <tbody>
            ${pedidos.map((p) => `<tr><td>${esc(p.codigo_pedido)}</td><td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td><td>${esc(p.nro_pedido)}</td><td class="small">${esc(p.descripcion)}</td><td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td></tr>`).join('')}
          </tbody>
        </table>`
      }

      <h6 class="mt-3">Historial (${traz.length})</h6>
      ${traz.length === 0 ? '<p class="text-muted small">Sin historial.</p>' : `
        <table class="table table-sm table-bordered" style="font-size:9px; font-family:Arial;">
          <thead class="table-light"><tr><th>Acción</th><th>Origen</th><th>Destino</th><th>Usuario</th><th>Fecha</th><th>Obs.</th></tr></thead>
          <tbody>
            ${traz.map((t) => `<tr><td>${esc(t.accion)}</td><td>${esc(t.origen)}</td><td>${esc(t.destino)}</td><td>${esc(t.usuario_destino)}</td><td class="small">${t.fecha ? new Date(t.fecha).toLocaleString('es-PE') : ''}</td><td class="small">${esc(t.observacion || '')}</td></tr>`).join('')}
          </tbody>
        </table>`
      }
    </div>
    <div class="modal-footer"><button class="btn btn-secondary close-modal">Cerrar</button></div>
  `, 'modal-lg');
}

// ==================== HELPERS ====================
function createModal(bodyHtml, size = '') {
  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,0.5)';
  modal.setAttribute('tabindex', '-1');
  modal.innerHTML = `<div class="modal-dialog ${size} modal-dialog-scrollable"><div class="modal-content">${bodyHtml}</div></div>`;
  modal.querySelectorAll('.close-modal').forEach((b) => b.onclick = () => modal.remove());
  document.body.appendChild(modal);
  return modal;
}

function initActosPreparativosView() {
  const reload = document.getElementById('apReload');
  if (reload) reload.onclick = () => loadBandeja();
  loadBandeja();
}

export { renderActosPreparativosView, initActosPreparativosView };
