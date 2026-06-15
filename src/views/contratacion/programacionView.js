// Programación
// Bandeja que muestra requerimientos APROBADOS DEC.
// Acciones: Ver, Aprobar, Observar
import { authService } from '../../services/authService.js';
import { contratacionesService } from '../../services/contratacionesService.js';
import { estadoBadge, todasObservaciones, historialHtml, showTextModal } from '../requerimiento/reqShared.js';
import { printRequerimiento } from '../requerimiento/registroRequerimientoView.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

let lastRows = [];

function renderProgramacionView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-calendar-check"></i> Programación</h3>
          <p class="text-muted mb-0">Requermientos aprobados por DEC pendientes de programación.</p>
        </div>
        <button id="progReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      <hr/>
      <div id="progList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadProgramacionList() {
  const cont = document.getElementById('progList');
  if (!cont) return;
  try {
    const resp = await contratacionesService.listProgramacion({ pageSize: 200 });
    let rows = (resp && resp.data) || [];

    rows = rows.map((r) => {
      let monto_total = 0;
      try {
        const payload = JSON.parse(r.payload || '{}');
        if (r.tipo === 'servicios' && Array.isArray(payload.servicioItems)) {
          monto_total = payload.servicioItems.reduce((sum, it) => sum + (Number(it.monto) || 0), 0);
        } else if (r.tipo === 'locacion' && Array.isArray(payload.locadorItems)) {
          monto_total = payload.locadorItems.reduce((sum, it) => sum + (Number(it.monto) || 0), 0);
        } else if (Array.isArray(payload.items)) {
          monto_total = payload.items.reduce((sum, it) => sum + ((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0)), 0);
        }
      } catch (_) {}
      return { ...r, monto_total: Number(monto_total.toFixed(2)) };
    });

    rows = rows.slice().sort((a, b) => {
      const getNum = (r) => { if (r && r.codigo) { const m = String(r.codigo).match(/(\d+)/); if (m) return Number(m[1]); } return Number(r && r.id) || 0; };
      return getNum(a) - getNum(b);
    });
    lastRows = rows;

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos aprobados por DEC pendientes de programación.</div>';
      return;
    }

    const style = 'padding: 2px 6px; font-size: 11px;';
    cont.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th>Código</th>
              <th>Tipo</th>
              <th>Descripción</th>
              <th>Área usuaria</th>
              <th>Centro</th>
              <th class="text-center">Monto Total</th>
              <th>Estado</th>
              <th style="width: 180px;" class="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => {
              let descrip = '';
              try {
                const p = JSON.parse(r.payload || '{}');
                const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
                if (Array.isArray(items) && items.length) descrip = items.map(it => esc(it.nombre_item || '')).join(', ');
              } catch (_) {}
              return `
              <tr>
                <td>${esc(r.codigo || ('#' + r.id))}</td>
                <td><span class="badge bg-secondary text-uppercase" style="font-size: 0.65rem;">${esc(r.tipo)}</span></td>
                <td class="small">${descrip || '<span class="text-muted small">—</span>'}</td>
                <td>${esc(r.area || '')}</td>
                <td>${esc(r.responsable || r.centro_nombre || '')}</td>
                <td class="text-center">${r.monto_total ? 'S/. ' + r.monto_total.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'S/. 0.00'}</td>
                <td>${estadoBadge(r.estado)}</td>
                <td class="text-center" style="white-space: nowrap;">
                  <button class="btn btn-xs btn-outline-primary prog-ver" data-id="${r.id}" title="Ver" style="${style}"><i class="bi bi-eye" style="font-size: 11px;"></i></button>
                  <button class="btn btn-xs btn-outline-danger prog-observar" data-id="${r.id}" title="Observar" style="${style}"><i class="bi bi-chat-left-dots" style="font-size: 11px;"></i></button>
                  <button class="btn btn-xs btn-success prog-aprobar" data-id="${r.id}" title="Aprobar" style="${style}"><i class="bi bi-check-circle" style="font-size: 11px;"></i> Aprobar</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    cont.querySelectorAll('.prog-ver').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.prog-aprobar').forEach((b) => b.onclick = () => aprobarProgramacion(b.dataset.id));
    cont.querySelectorAll('.prog-observar').forEach((b) => b.onclick = () => observarProgramacion(b.dataset.id));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

async function aprobarProgramacion(id) {
  if (!confirm('¿Aprobar este requerimiento desde Programación? Se cambiará el estado a "Aprobado Programación".')) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    const res = await contratacionesService.aprobarProgramacion(id, user.dni || 'dec');
    if (res && res.success === false) throw new Error('No se pudo aprobar');
    loadProgramacionList();
  } catch (e) {
    alert('Error al aprobar: ' + e.message);
  }
}

async function observarProgramacion(id) {
  const req = (lastRows || []).find((x) => String(x.id) === String(id));
  if (!req) return;
  const allObs = todasObservaciones(req);
  const motivo = await showTextModal({
    title: 'Observar requerimiento desde Programación',
    historyHtml: historialHtml(allObs),
    label: 'Motivo de la observación',
    placeholder: 'Indique el motivo de la observación…',
    buttonText: 'Observar',
    buttonClass: 'btn-danger',
  });
  if (!motivo) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    await contratacionesService.observarProgramacion(id, motivo, user.dni || 'dec');
    loadProgramacionList();
  } catch (e) {
    alert('Error al observar: ' + e.message);
  }
}

function initProgramacionView() {
  const reload = document.getElementById('progReload');
  if (reload) reload.onclick = () => loadProgramacionList();
  loadProgramacionList();
}

export { renderProgramacionView, initProgramacionView };