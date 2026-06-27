// Panel lateral de detalle de expediente (pestañas)
import { trazabilidadService } from '../services/trazabilidadService.js';
import { adjuntosService } from '../services/adjuntosService.js';
import { renderTimeline, timelineModalStyles } from '../services/timelineService.js';
import { fmtDateTime, esc } from '../utils/trazabilidad.js';
import {
  estadoModernBadge, diasBadgeHtml, getNombreItemRaw, getSigamefRaw, getResponsableRol,
} from '../utils/bandejaUi.js';
import { todasObservaciones, historialHtml } from '../views/requerimiento/reqShared.js';

let panelEl = null;
let backdropEl = null;

const PANEL_STYLES = `
  .sgc-detail-panel {
    position: fixed; top: 0; right: 0; width: min(90vw, 100%); max-width: 100%; height: 100vh;
    background: #fff; box-shadow: -4px 0 24px rgba(0,0,0,.15); z-index: 1100;
    display: flex; flex-direction: column; transform: translateX(0);
    transition: transform .25s ease;
  }
  .sgc-detail-panel:not(.open) { transform: translateX(100%); }
  .sgc-detail-panel.open { transform: translateX(0); }
  .sgc-detail-panel #sgcPanelBody {
    flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; min-height: 0;
  }
  .sgc-detail-panel #sgcPanelTabs {
    overflow-x: auto; overflow-y: hidden; flex-wrap: nowrap;
    border-bottom: 1px solid #dee2e6; scrollbar-width: thin;
  }
  .sgc-detail-panel #sgcPanelTabs .nav-item { flex-shrink: 0; }
  .sgc-detail-panel #sgcPanelTabs .nav-link {
    font-size: 0.78rem; padding: 0.45rem 0.7rem; white-space: nowrap;
  }
  .sgc-detail-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 1095;
    opacity: 0; pointer-events: none; transition: opacity .2s;
  }
  .sgc-detail-backdrop.open { opacity: 1; pointer-events: auto; }
`;

function ensurePanelStyles() {
  if (document.getElementById('sgc-detail-panel-styles')) return;
  const st = document.createElement('style');
  st.id = 'sgc-detail-panel-styles';
  st.textContent = PANEL_STYLES;
  document.head.appendChild(st);
}

function ensurePanel() {
  ensurePanelStyles();
  if (panelEl) return;
  backdropEl = document.createElement('div');
  backdropEl.className = 'sgc-detail-backdrop';
  backdropEl.onclick = closeDetailPanel;
  panelEl = document.createElement('div');
  panelEl.className = 'sgc-detail-panel';
  panelEl.innerHTML = `
    <style>${timelineModalStyles()}</style>
    <div class="border-bottom px-3 py-2 d-flex justify-content-between align-items-center bg-light">
      <h6 class="mb-0 fw-bold" id="sgcPanelTitle">Detalle</h6>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="sgcPanelClose"><i class="bi bi-x-lg"></i></button>
    </div>
    <ul class="nav nav-tabs px-2 pt-2 flex-nowrap" id="sgcPanelTabs" role="tablist">
      <li class="nav-item"><button class="nav-link active small" data-tab="info">General</button></li>
      <li class="nav-item"><button class="nav-link small" data-tab="traza">Trazabilidad</button></li>
      <li class="nav-item"><button class="nav-link small" data-tab="obs">Observaciones</button></li>
      <li class="nav-item"><button class="nav-link small" data-tab="adj">Adjuntos</button></li>
      <li class="nav-item"><button class="nav-link small" data-tab="hist">Historial</button></li>
    </ul>
    <div class="flex-grow-1 overflow-auto p-3" id="sgcPanelBody"><div class="text-muted small">Cargando…</div></div>
  `;
  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);
  panelEl.querySelector('#sgcPanelClose').onclick = closeDetailPanel;
  panelEl.querySelectorAll('#sgcPanelTabs .nav-link').forEach((tab) => {
    tab.onclick = () => {
      panelEl.querySelectorAll('#sgcPanelTabs .nav-link').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      panelEl._activeTab = tab.dataset.tab;
      if (panelEl._req) renderPanelTab(panelEl._req, tab.dataset.tab);
    };
  });
}

export function closeDetailPanel() {
  ensurePanelStyles();
  panelEl?.classList.remove('open');
  backdropEl?.classList.remove('open');
  closeBandejaDropdowns();
  document.querySelectorAll('.sgc-bandeja-wrap tbody tr.row-selected').forEach((tr) => tr.classList.remove('row-selected'));
}

export function closeBandejaDropdowns() {
  document.querySelectorAll('.dropdown-menu.show').forEach((menu) => menu.classList.remove('show'));
  document.querySelectorAll('.dropdown-toggle.show').forEach((btn) => btn.classList.remove('show'));
  document.querySelectorAll('.dropdown-toggle[aria-expanded="true"]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
    try {
      const inst = window.bootstrap?.Dropdown?.getInstance(btn);
      inst?.hide();
    } catch (_) {}
  });
}

export async function openDetailPanel(req, opts = {}) {
  closeBandejaDropdowns();
  ensurePanel();
  panelEl._req = req;
  panelEl._activeTab = opts.tab || 'info';
  panelEl._onAdjuntos = opts.onAdjuntos;
  panelEl.querySelector('#sgcPanelTitle').textContent = req.codigo || `REQ #${req.id}`;
  panelEl.querySelectorAll('#sgcPanelTabs .nav-link').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === panelEl._activeTab);
  });
  panelEl.classList.add('open');
  backdropEl.classList.add('open');
  document.querySelectorAll('.sgc-bandeja-wrap tbody tr.row-selected').forEach((tr) => tr.classList.remove('row-selected'));
  const tr = document.querySelector(`.sgc-bandeja-wrap tbody tr[data-req-id="${req.id}"]`);
  tr?.classList.add('row-selected');
  await renderPanelTab(req, panelEl._activeTab);
}

function formatMovimientoLabel(m) {
  const accion = String(m?.accion || '').toUpperCase();
  const sub = String(m?.subModulo || m?.sub_modulo || '').trim();
  if (accion === 'SUBSANADO' && sub) return `Subsanado ${sub}`;
  if (accion && sub) return `${accion} · ${sub}`;
  return accion || sub || '—';
}

async function renderPanelTab(req, tab) {
  const body = panelEl.querySelector('#sgcPanelBody');
  if (tab === 'info') {
    const row = req;
    const nombreItem = getNombreItemRaw(row);
    body.innerHTML = `
      <div class="small">
        <p class="mb-2"><strong>${esc(row.codigo)}</strong></p>
        <table class="table table-sm table-borderless mb-0">
          <tr><td class="text-muted" style="width:42%;">Código SIGAMEF</td><td>${esc(getSigamefRaw(row) || '—')}</td></tr>
          <tr><td class="text-muted">Nombre del ítem</td><td>${esc(nombreItem || '—')}</td></tr>
          <tr><td class="text-muted">Estado</td><td>${estadoModernBadge(row.estadoActual || row.estado_actual, row.estadoActualTexto || row.sub_modulo_actual, row.estado)}</td></tr>
          <tr><td class="text-muted">Responsable</td><td>${esc(row.responsableActual)}<br/><small class="text-muted">${esc(getResponsableRol(row))}</small></td></tr>
          <tr><td class="text-muted">Días en etapa</td><td>${diasBadgeHtml(row)}</td></tr>
          <tr><td class="text-muted">Área usuaria</td><td>${esc(row.area || '—')}</td></tr>
          <tr><td class="text-muted">Centro</td><td>${esc(row.responsable || row.centro_nombre || '—')}</td></tr>
          <tr><td class="text-muted">Monto</td><td>${row.monto_total ? 'S/. ' + Number(row.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 }) : '—'}</td></tr>
          <tr><td class="text-muted">Creación</td><td>${esc(fmtDateTime(row.created_at))}</td></tr>
          <tr><td class="text-muted">Último movimiento</td><td>${esc(fmtDateTime(row.fecha_estado_actual))}</td></tr>
        </table>
      </div>`;
    return;
  }
  if (tab === 'traza') {
    body.innerHTML = '<div class="text-muted small">Cargando trazabilidad…</div>';
    try {
      const data = await trazabilidadService.get(req.id);
      body.innerHTML = `<div class="traza-timeline-wrap traza-modal-scroll">${renderTimeline(data)}</div>`;
    } catch (e) {
      body.innerHTML = `<div class="alert alert-danger small">${esc(e.message)}</div>`;
    }
    return;
  }
  if (tab === 'obs') {
    const obs = todasObservaciones(req);
    body.innerHTML = obs.length
      ? historialHtml(obs)
      : '<p class="text-muted small mb-0">Sin observaciones registradas.</p>';
    return;
  }
  if (tab === 'adj') {
    body.innerHTML = '<div class="text-muted small">Cargando adjuntos…</div>';
    try {
      const resp = await adjuntosService.getAdjuntos(req.id);
      const files = (resp && resp.adjuntos) || [];
      if (!files.length) {
        body.innerHTML = '<p class="text-muted small">No hay adjuntos.</p>';
      } else {
        body.innerHTML = `<ul class="list-group list-group-flush small">${files.map((f) => `
          <li class="list-group-item px-0 py-1"><i class="bi bi-file-earmark me-1"></i>${esc(f.nombre_archivo || f.nombre || 'Archivo')}</li>`).join('')}</ul>`;
      }
      if (panelEl._onAdjuntos) {
        body.innerHTML += `<button type="button" class="btn btn-sm btn-outline-primary mt-2" id="sgcPanelAdjBtn"><i class="bi bi-paperclip"></i> Gestionar adjuntos</button>`;
        body.querySelector('#sgcPanelAdjBtn').onclick = () => panelEl._onAdjuntos(req.id);
      }
    } catch (e) {
      body.innerHTML = `<div class="alert alert-warning small">${esc(e.message)}</div>`;
    }
    return;
  }
  if (tab === 'hist') {
    body.innerHTML = '<div class="text-muted small">Cargando historial…</div>';
    try {
      const data = await trazabilidadService.get(req.id);
      const movs = data.historialMovimientos || [];
      if (!movs.length) {
        body.innerHTML = '<p class="text-muted small">Sin movimientos.</p>';
        return;
      }
      body.innerHTML = `<div class="traza-modal-scroll"><div class="list-group list-group-flush small">${[...movs].reverse().map((m) => `
        <div class="list-group-item px-0 py-2 border-bottom">
          <div class="fw-semibold">${esc(formatMovimientoLabel(m))}</div>
          <div class="text-muted">${esc(fmtDateTime(m.fecha))} · ${esc(m.usuario || m.responsable || '—')}</div>
          ${m.observacion ? `<div class="mt-1">${esc(m.observacion)}</div>` : ''}
        </div>`).join('')}</div></div>`;
    } catch (e) {
      body.innerHTML = `<div class="alert alert-danger small">${esc(e.message)}</div>`;
    }
  }
}

export function bindRowDetailPanel(container, rows, opts = {}) {
  if (!container) return;
  const map = new Map((rows || []).map((r) => [String(r.id), r]));
  container.querySelectorAll('.sgc-bandeja-wrap tbody tr[data-req-id]').forEach((tr) => {
    tr.onclick = (e) => {
      if (e.target.closest('button, a, input, .dropdown-menu, .req-traza, .chip-obs-btn, .chip-adj-btn')) return;
      const req = map.get(tr.dataset.reqId);
      if (req) openDetailPanel(req, opts);
    };
  });
  bindBandejaMetaChips(container, rows, opts);
}

export function bindBandejaMetaChips(container, rows, opts = {}) {
  if (!container) return;
  const map = new Map((rows || []).map((r) => [String(r.id), r]));
  container.querySelectorAll('.chip-obs-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const req = map.get(btn.dataset.reqId);
      if (req) openDetailPanel(req, { ...opts, tab: 'obs' });
    };
  });
  container.querySelectorAll('.chip-adj-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const req = map.get(btn.dataset.reqId);
      if (req) openDetailPanel(req, { ...opts, tab: 'adj' });
    };
  });
}
