// Matriz de consolidación — pestaña Paquetes (Programación)
import { programacionService } from '../../services/programacionService.js';
import { trazabilidadService } from '../../services/trazabilidadService.js';
import { renderTimeline, timelineModalStyles } from '../../services/timelineService.js';
import { todasObservaciones, historialHtml } from '../requerimiento/reqShared.js';
import {
  esc, renderPaquetesKpiCards, renderPaquetesFilterBar, readPaquetesFilters,
  filterMatrizPaquetes, exportMatrizExcel, paquetesMatrizStyles,
  estadoPaqueteBadge, responsableDosLineas, fmtMoney,
} from '../../utils/paquetesConsolidacion.js';
import { usePagination } from '../../utils/paginacion.js';

let rawMatriz = null;
const paqPagination = usePagination('paquetes', () => programacionService.getMatrizConsolidacion(), { defaultPageSize: 25 });
let filteredGrupos = [];
let collapsedPaquetes = new Set();
let panelEl = null;
let backdropEl = null;
let callbacks = {};

const PAQ_PANEL_STYLES = `
  .paq-panel-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 1055;
    opacity: 0; pointer-events: none; transition: opacity .2s;
  }
  .paq-panel-backdrop.open { opacity: 1; pointer-events: auto; }
  .paq-panel {
    position: fixed; top: 0; right: 0; width: min(620px, 96vw); height: 100vh;
    background: #fff; box-shadow: -4px 0 24px rgba(0,0,0,.15); z-index: 1060;
    display: flex; flex-direction: column; transform: translateX(100%);
    transition: transform .25s ease;
  }
  .paq-panel.open { transform: translateX(0); }
  .paq-panel #paqPanelTabs {
    display: flex; flex-wrap: wrap; gap: 0;
    overflow-x: auto; overflow-y: hidden;
    border-bottom: 1px solid #dee2e6; scrollbar-width: thin;
    flex-shrink: 0;
  }
  .paq-panel #paqPanelTabs .nav-item { flex-shrink: 0; }
  .paq-panel #paqPanelTabs .nav-link {
    font-size: 0.78rem; padding: 0.45rem 0.65rem; white-space: nowrap;
    border-radius: 0.375rem 0.375rem 0 0;
  }
  .paq-panel #paqPanelBody { min-height: 0; flex: 1 1 auto; }
`;

function ensurePanelStyles() {
  if (document.getElementById('paq-panel-styles')) return;
  const st = document.createElement('style');
  st.id = 'paq-panel-styles';
  st.textContent = PAQ_PANEL_STYLES;
  document.head.appendChild(st);
}

const COLS_FULL = [
  'Paquete', 'Requerimiento', 'Pedido', 'Tipo', 'Código SIGAMEF', 'Descripción',
  'Cant.', 'Monto Total', 'Centro', 'Área Usuaria', 'Estado Actual', 'Responsable', 'Meta', 'Clasificador', 'Acciones',
];

function ensurePanel() {
  ensurePanelStyles();
  if (panelEl) return;
  backdropEl = document.createElement('div');
  backdropEl.className = 'paq-panel-backdrop';
  backdropEl.onclick = closePaquetePanel;
  panelEl = document.createElement('div');
  panelEl.className = 'paq-panel';
  panelEl.innerHTML = `
    <style>${timelineModalStyles()}</style>
    <div class="border-bottom px-3 py-2 d-flex justify-content-between align-items-center bg-light">
      <h6 class="mb-0 fw-bold" id="paqPanelTitle">Paquete</h6>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="paqPanelClose"><i class="bi bi-x-lg"></i></button>
    </div>
    <ul class="nav nav-tabs px-2 pt-2" id="paqPanelTabs" role="tablist">
      <li class="nav-item"><button class="nav-link active small" data-tab="info">General</button></li>
      <li class="nav-item"><button class="nav-link small" data-tab="reqs">Requerimientos</button></li>
      <li class="nav-item"><button class="nav-link small" data-tab="peds">Pedidos SIGAMEF</button></li>
      <li class="nav-item"><button class="nav-link small" data-tab="traza">Trazabilidad</button></li>
      <li class="nav-item"><button class="nav-link small" data-tab="obs">Observaciones</button></li>
    </ul>
    <div class="flex-grow-1 overflow-auto p-3" id="paqPanelBody"></div>
  `;
  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);
  panelEl.querySelector('#paqPanelClose').onclick = closePaquetePanel;
  panelEl.querySelectorAll('#paqPanelTabs .nav-link').forEach((tab) => {
    tab.onclick = () => {
      panelEl.querySelectorAll('#paqPanelTabs .nav-link').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      if (panelEl._detail) renderPanelTab(panelEl._detail, tab.dataset.tab);
    };
  });
}

function closePaquetePanel() {
  if (panelEl) panelEl.classList.remove('open');
  if (backdropEl) backdropEl.classList.remove('open');
}

async function openPaquetePanel(paqueteId) {
  ensurePanel();
  panelEl.classList.add('open');
  backdropEl.classList.add('open');
  panelEl.querySelector('#paqPanelBody').innerHTML = '<div class="text-muted">Cargando…</div>';
  try {
    const detail = await programacionService.getPaquete(paqueteId);
    panelEl._detail = detail;
    panelEl.querySelector('#paqPanelTitle').textContent = detail.paquete?.codigo_paquete || 'Paquete';
    panelEl.querySelectorAll('#paqPanelTabs .nav-link').forEach((t, i) => t.classList.toggle('active', i === 0));
    renderPanelTab(detail, 'info');
  } catch (e) {
    panelEl.querySelector('#paqPanelBody').innerHTML = `<div class="alert alert-danger">${esc(e.message)}</div>`;
  }
}

async function renderPanelTab(detail, tab) {
  const body = panelEl.querySelector('#paqPanelBody');
  const p = detail.paquete;
  const res = detail.resumen || {};
  const reqs = detail.requerimientos || [];
  const peds = detail.pedidos || [];

  if (tab === 'info') {
    body.innerHTML = `
      <h6 class="text-muted small text-uppercase">Información General</h6>
      <table class="table table-sm table-borderless">
        <tr><td class="text-muted" style="width:40%">Código Paquete</td><td><strong>${esc(p.codigo_paquete)}</strong></td></tr>
        <tr><td class="text-muted">Fecha creación</td><td>${esc(String(p.fecha_creacion || '').slice(0, 16).replace('T', ' '))}</td></tr>
        <tr><td class="text-muted">Creado por</td><td>${esc(p.usuario_creacion)}</td></tr>
        <tr><td class="text-muted">Estado</td><td><span class="badge ${p.estado === 'Aprobado' ? 'bg-success' : 'bg-info'}">${esc(p.estado)}</span></td></tr>
        <tr><td class="text-muted">Monto Total</td><td><strong>${fmtMoney(res.monto_total)}</strong></td></tr>
        <tr><td class="text-muted">Requerimientos</td><td>${reqs.length}</td></tr>
        <tr><td class="text-muted">Pedidos SIGAMEF</td><td>${peds.length}</td></tr>
      </table>
      ${p.estado === 'Pendiente' ? `
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-sm btn-success" id="paqPanelApprove" data-id="${p.id}"><i class="bi bi-check-circle"></i> Aprobar</button>
          <button class="btn btn-sm btn-outline-danger" id="paqPanelDel" data-id="${p.id}"><i class="bi bi-trash"></i> Eliminar</button>
        </div>` : ''}`;
    body.querySelector('#paqPanelApprove')?.addEventListener('click', () => {
      callbacks.onApprove?.(p.id);
      closePaquetePanel();
    });
    body.querySelector('#paqPanelDel')?.addEventListener('click', () => {
      callbacks.onDelete?.(p.id);
      closePaquetePanel();
    });
    return;
  }

  if (tab === 'reqs') {
    body.innerHTML = `
      <h6 class="text-muted small">Requerimientos Asociados (${reqs.length})</h6>
      <ul class="list-group list-group-flush">${reqs.map((r) => `
        <li class="list-group-item px-0 py-2">
          <strong>${esc(r.codigo)}</strong> — ${esc(r.denominacion || r.area || '')}
          <div class="small text-muted">${esc(r.estado)} · ${esc(r.area)}</div>
        </li>`).join('')}</ul>`;
    return;
  }

  if (tab === 'peds') {
    body.innerHTML = `
      <h6 class="text-muted small">Pedidos SIGAMEF (${peds.length})</h6>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead><tr><th>REQ</th><th>Pedido</th><th>SIGAMEF</th><th>Descripción</th><th class="text-end">Monto</th></tr></thead>
          <tbody>${peds.map((ped) => `
            <tr>
              <td>${esc(ped.requerimiento_codigo)}</td>
              <td>${esc(ped.nro_pedido)}</td>
              <td>${esc(ped.codigo_sigamef)}</td>
              <td>${esc(ped.descripcion)}</td>
              <td class="text-end">${fmtMoney(ped.total_item)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;
    return;
  }

  if (tab === 'traza') {
    body.innerHTML = '<div class="text-muted small">Cargando trazabilidad…</div>';
    const blocks = await Promise.all(reqs.slice(0, 8).map(async (r) => {
      try {
        const t = await trazabilidadService.get(r.id);
        return `<div class="mb-3"><div class="fw-semibold small">${esc(r.codigo)}</div>${renderTimeline(t.historial || t.historialEstados || [])}</div>`;
      } catch (_) {
        return `<div class="mb-2 small text-muted">${esc(r.codigo)}: sin trazabilidad</div>`;
      }
    }));
    body.innerHTML = `<h6 class="text-muted small">Trazabilidad por requerimiento</h6>${blocks.join('')}`;
    return;
  }

  if (tab === 'obs') {
    const blocks = reqs.map((r) => {
      const obs = todasObservaciones({ ...r, payload: typeof r.payload === 'string' ? r.payload : JSON.stringify(r.payload || {}) });
      if (!obs.length) return '';
      return `<div class="mb-3"><div class="fw-semibold small">${esc(r.codigo)}</div>${historialHtml(obs)}</div>`;
    }).filter(Boolean);
    body.innerHTML = blocks.length
      ? `<h6 class="text-muted small">Observaciones</h6>${blocks.join('')}`
      : '<div class="alert alert-light border">Sin observaciones registradas.</div>';
  }
}

function renderAccionesPaquete(paqueteId, estado) {
  if (estado !== 'Pendiente') {
    return `<button class="btn btn-xs btn-outline-info paq-act-detail" data-id="${paqueteId}" title="Panel"><i class="bi bi-layout-sidebar"></i></button>`;
  }
  return `
    <button class="btn btn-xs btn-outline-info paq-act-detail" data-id="${paqueteId}" title="Panel"><i class="bi bi-layout-sidebar"></i></button>
    <button class="btn btn-xs btn-outline-success paq-act-approve" data-id="${paqueteId}" title="Aprobar"><i class="bi bi-check-circle"></i></button>
    <button class="btn btn-xs btn-outline-danger paq-act-del" data-id="${paqueteId}" title="Eliminar"><i class="bi bi-trash"></i></button>`;
}

function renderMatrizTable(grupos) {
  const cols = COLS_FULL;
  const thead = `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;

  let tbody = '';
  grupos.forEach((g) => {
    const p = g.paquete;
    const pid = p.id;
    const expanded = !collapsedPaquetes.has(pid);
    const icon = expanded ? '▼' : '▶';
    const badgeEst = p.estado === 'Aprobado' ? 'bg-success' : 'bg-info';

    tbody += `<tr class="paq-group-row" data-paq-toggle="${pid}" data-paq-panel="${pid}">
      <td colspan="${cols.length}">
        <span class="paq-toggle">${icon}</span>
        <strong>${esc(p.codigo_paquete)}</strong>
        <span class="badge ${badgeEst} ms-2">${esc(p.estado)}</span>
        <span class="text-muted small ms-3">${g.resumen.cant_requerimientos} requerimientos</span>
        <span class="text-muted small ms-2">${g.resumen.cant_pedidos} pedidos</span>
        <strong class="ms-2 text-success">${fmtMoney(g.resumen.monto_total)}</strong>
        <span class="float-end">${renderAccionesPaquete(pid, p.estado)}</span>
      </td>
    </tr>`;

    if (expanded) {
      g.filas.forEach((f) => {
        tbody += `<tr class="paq-detail-row" data-paq-parent="${pid}" data-pedido-id="${f.pedido_id || ''}">
          <td class="text-muted small">${esc(f.codigo_paquete)}</td>
          <td><strong>${esc(f.requerimiento_codigo)}</strong></td>
          <td>${esc(f.pedido || '—')}</td>
          <td><span class="badge bg-light text-dark border">${esc(f.tipo)}</span></td>
          <td>${esc(f.codigo_sigamef || '—')}</td>
          <td><span class="req-desc-text" title="${esc(f.descripcion)}">${esc(f.descripcion)}</span></td>
          <td class="text-end">${esc(f.cantidad)}</td>
          <td class="text-end">${fmtMoney(f.monto_total)}</td>
          <td>${esc(f.centro || '—')}</td>
          <td>${esc(f.area_usuaria || '—')}</td>
          <td>${estadoPaqueteBadge(f.estado, f.estado_actual, f.estado_actual_texto, f.requerimiento || f)}</td>
          <td>${responsableDosLineas(f.responsable, f.sub_modulo)}</td>
          <td>${esc(f.meta || '—')}</td>
          <td>${esc(f.clasificador || '—')}</td>
          <td class="text-center">
            <button class="btn btn-xs btn-outline-secondary paq-req-traza" data-req-id="${f.requerimiento_id}" title="Trazabilidad"><i class="bi bi-clock-history"></i></button>
          </td>
        </tr>`;
      });
    }
  });

  return `<div class="table-responsive"><table class="table table-sm table-hover table-bordered mb-0">
    <thead>${thead}</thead><tbody>${tbody || '<tr><td colspan="' + cols.length + '" class="text-muted text-center">Sin registros</td></tr>'}</tbody>
  </table></div>`;
}

function bindMatrizEvents(cont) {
  cont.querySelectorAll('[data-paq-toggle]').forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('.paq-act-detail, .paq-act-approve, .paq-act-del, .paq-req-traza')) return;
      const id = Number(row.dataset.paqToggle);
      if (collapsedPaquetes.has(id)) collapsedPaquetes.delete(id);
      else collapsedPaquetes.add(id);
      render();
    };
  });
  cont.querySelectorAll('[data-paq-panel]').forEach((row) => {
    row.addEventListener('dblclick', () => openPaquetePanel(Number(row.dataset.paqPanel)));
  });
  cont.querySelectorAll('.paq-act-detail').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); openPaquetePanel(Number(b.dataset.id)); };
  });
  cont.querySelectorAll('.paq-act-approve').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); callbacks.onApprove?.(Number(b.dataset.id)); };
  });
  cont.querySelectorAll('.paq-act-del').forEach((b) => {
    b.onclick = (e) => { e.stopPropagation(); callbacks.onDelete?.(Number(b.dataset.id)); };
  });
  cont.querySelectorAll('.paq-req-traza').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const id = b.dataset.reqId;
      try {
        const t = await trazabilidadService.get(id);
        const w = window.open('', '_blank', 'width=640,height=720');
        w.document.write(`<html><head><title>Trazabilidad</title><style>${timelineModalStyles()}</style></head><body>${renderTimeline(t.historial || [])}</body></html>`);
      } catch (err) { alert(err.message); }
    };
  });
}

function render() {
  const kpi = document.getElementById('paqKpiWrap');
  const table = document.getElementById('paqMatrizTable');
  const ind = filterMatrizPaquetes({ paquetes: filteredGrupos }, {}).indicadores;
  const result = paqPagination.paginateVirtual(filteredGrupos);
  const pageGrupos = result.data;
  if (kpi) kpi.innerHTML = renderPaquetesKpiCards(ind);
  if (table) {
    table.innerHTML = renderMatrizTable(pageGrupos);
    bindMatrizEvents(table);
    paqPagination.renderControls('paqMatrizTable', () => render());
  }
}

async function loadData() {
  rawMatriz = await programacionService.getMatrizConsolidacion();
  try {
    const { contratacionesService } = await import('../../services/contratacionesService.js');
    const resp = await contratacionesService.listProgramacion({ pageSize: 500 });
    const reqMap = new Map((resp?.data || []).map((r) => [r.id, r]));
    (rawMatriz?.paquetes || []).forEach((g) => {
      g.filas = (g.filas || []).map((f) => {
        const src = reqMap.get(f.requerimiento_id);
        return src ? { ...f, requerimiento: src } : f;
      });
    });
  } catch (_) {}
  const filters = readPaquetesFilters('paq');
  const filtered = filterMatrizPaquetes(rawMatriz, filters);
  filteredGrupos = filtered.paquetes;
}

export async function loadPaquetesConsolidacionTab(containerId, cbs = {}) {
  callbacks = cbs;
  const cont = document.getElementById(containerId);
  if (!cont) return;

  cont.innerHTML = `<div class="text-muted py-4 text-center">Cargando matriz de consolidación…</div>`;
  try {
    await loadData();
    if (!rawMatriz?.paquetes?.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay paquetes creados. Consolide requerimientos desde la bandeja.</div>';
      return;
    }

    cont.innerHTML = `
      <style>${paquetesMatrizStyles()}</style>
      <div class="paq-matriz-wrap">
        <p class="text-muted small mb-2">Matriz de consolidación — cada fila detalla un requerimiento y su pedido SIGAMEF dentro del paquete. Use ▶/▼ para expandir o contraer.</p>
        <div id="paqKpiWrap"></div>
        ${renderPaquetesFilterBar('paq')}
        <div id="paqMatrizTable"></div>
      </div>`;

    render();

    document.getElementById('paqBtnFilter')?.addEventListener('click', async () => {
      paqPagination.resetPage();
      await loadData();
      render();
    });
    document.getElementById('paqBtnClear')?.addEventListener('click', async () => {
      ['paqSearch', 'paqFiltroEstado', 'paqFiltroResp', 'paqFiltroArea', 'paqFiltroCentro', 'paqFiltroFecha'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      paqPagination.resetPage();
      await loadData();
      render();
    });
    document.getElementById('paqBtnExport')?.addEventListener('click', () => {
      exportMatrizExcel(filteredGrupos);
    });
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error: ${esc(e.message)}</div>`;
  }
}

export function reloadPaquetesConsolidacion() {
  return loadPaquetesConsolidacionTab('progContent', callbacks);
}

export { openPaquetePanel };

export function highlightPedidoInPaquetesMatriz(paqueteId, pedidoId) {
  if (!pedidoId) return;
  if (paqueteId) {
    collapsedPaquetes.delete(Number(paqueteId));
    render();
  }
  setTimeout(() => {
    const row = document.querySelector(`.paq-detail-row[data-pedido-id="${pedidoId}"]`);
    if (row) {
      row.classList.add('ped-row-highlight');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => row.classList.remove('ped-row-highlight'), 4000);
    }
  }, 300);
}
