// Matriz de seguimiento — pestaña Pedidos (Programación)
import { programacionService } from '../../services/programacionService.js';
import { trazabilidadService } from '../../services/trazabilidadService.js';
import { renderTimeline, timelineModalStyles } from '../../services/timelineService.js';
import { openDetailPanel } from '../../components/bandejaDetailPanel.js';
import { enrichReqRow } from '../../utils/trazabilidad.js';
import { renderActionMenuCell, bindActionMenus } from '../../utils/bandejaUi.js';
import { pedidosMenuItems } from '../../utils/bandejaActions.js';
import { formatPedidoOperativo } from '../../utils/bandejaHelpers.js';
import {
  esc, renderPedidosKpiCards, renderPedidosFilterBar, readPedidosFilters,
  filterFilasPedidos, computeIndicadoresPedidos, sortFilasPedidos,
  paqueteBadgeHtml, exportPedidosExcel, pedidosMatrizStyles,
  renderPedidoMatrizWorkflowCells, fmtMoney,
} from '../../utils/pedidosConsolidacion.js';
import { usePagination } from '../../utils/paginacion.js';

let rawFilas = [];
let displayFilas = [];
let allFilteredFilas = [];
const pedPagination = usePagination('pedidos', () => programacionService.getMatrizPedidos(), { defaultPageSize: 25 });
let sortField = 'requerimiento_codigo';
let sortDir = 'desc';
let callbacks = {};

const SORT_MAP = {
  'Pedido SIGAMEF': 'pedido',
  Requerimiento: 'requerimiento_codigo',
  Paquete: 'paquete',
  Etapa: 'etapa',
  Estado: 'estado',
  Responsable: 'responsable',
  Fecha: 'fecha',
};

function renderTable() {
  const headers = [
    { label: 'Pedido SIGAMEF', sort: 'Pedido SIGAMEF', cls: 'ped-col-pedido' },
    { label: 'Requerimiento', sort: 'Requerimiento', cls: 'ped-col-req' },
    { label: 'Paquete', sort: 'Paquete', cls: 'ped-col-paq' },
    { label: 'Tipo', sort: null, cls: 'ped-col-tipo' },
    { label: 'Código SIGAMEF', sort: null, cls: 'ped-col-sigamef' },
    { label: 'Descripción', sort: null, cls: 'ped-col-desc' },
    { label: 'Cant.', sort: null, cls: 'ped-col-cant' },
    { label: 'Monto Total', sort: null, cls: 'ped-col-monto' },
    { label: 'Centro', sort: null, cls: 'ped-col-centro' },
    { label: 'Área Usuaria', sort: null, cls: 'ped-col-area' },
    { label: 'Etapa', sort: 'Etapa', cls: 'req-col-etapa' },
    { label: 'Estado', sort: 'Estado', cls: 'req-col-estado-cell' },
    { label: 'Responsable', sort: 'Responsable', cls: 'req-col-resp' },
    { label: 'Meta', sort: null, cls: 'ped-col-meta' },
    { label: 'Clasificador', sort: null, cls: 'ped-col-clas' },
    { label: 'Acciones', sort: null, cls: 'req-col-acc' },
  ];

  const thead = `<tr>${headers.map((h) => {
    const sf = h.sort ? SORT_MAP[h.sort] : '';
    const sorted = sf && sortField === sf ? (sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc') : '';
    return `<th class="${h.cls || ''} ${sorted}" data-sort="${sf || ''}">${esc(h.label)}</th>`;
  }).join('')}</tr>`;

  const tbody = displayFilas.map((f) => {
    const tipMeta = f.meta ? `Meta: ${f.meta}` : '';
    const tipClas = f.clasificador ? `Clasificador: ${f.clasificador}` : '';
    const tipDias = `${f.dias_en_estado} días en estado`;
    const pedidoLabel = formatPedidoOperativo(f.pedido);
    const areaText = f.area_usuaria || '—';
    const wf = renderPedidoMatrizWorkflowCells(f);
    return `<tr data-pedido-id="${f.pedido_id}" data-paquete-id="${f.paquete_id || ''}"
      title="${esc([tipMeta, tipClas, tipDias].filter(Boolean).join(' · '))}">
      <td class="ped-col-pedido"><strong class="ped-cell-compact">${esc(pedidoLabel)}</strong></td>
      <td class="ped-col-req"><span class="ped-cell-compact">${esc(f.requerimiento_codigo)}</span></td>
      <td class="ped-col-paq">${paqueteBadgeHtml(f.codigo_paquete)}</td>
      <td class="ped-col-tipo"><span class="badge bg-light text-dark border ped-badge-tipo">${esc(f.tipo)}</span></td>
      <td class="ped-col-sigamef"><span class="ped-cell-compact">${esc(f.codigo_sigamef || '—')}</span></td>
      <td class="ped-col-desc"><span class="ped-desc-clamp" title="${esc(f.descripcion)}">${esc(f.descripcion)}</span></td>
      <td class="ped-col-cant text-end">${esc(f.cantidad)}</td>
      <td class="ped-col-monto text-end"><span class="ped-monto-text">${fmtMoney(f.monto_total)}</span></td>
      <td class="ped-col-centro"><span class="ped-cell-compact" title="${esc(f.centro || '—')}">${esc(f.centro || '—')}</span></td>
      <td class="ped-col-area"><span class="ped-area-text" title="${esc(areaText)}">${esc(areaText)}</span></td>
      <td class="req-col-etapa">${wf.etapa}</td>
      <td class="req-col-estado-cell" title="${esc(tipDias)}">${wf.estado}</td>
      <td class="req-col-resp">${wf.responsable}</td>
      <td class="ped-col-meta"><span class="ped-meta-clamp" title="${esc(f.meta)}">${esc(f.meta || '—')}</span></td>
      <td class="ped-col-clas"><span class="ped-meta-clamp" title="${esc(f.clasificador)}">${esc(f.clasificador || '—')}</span></td>
      ${renderActionMenuCell(`ped-${f.pedido_id}`, pedidosMenuItems(f), '')}
    </tr>`;
  }).join('');

  return `<div class="table-responsive ped-matriz-scroll"><table class="table table-sm table-hover table-bordered mb-0 ped-matriz-table">
    <thead>${thead}</thead>
    <tbody>${tbody || `<tr><td colspan="16" class="text-center text-muted">Sin pedidos</td></tr>`}</tbody>
  </table></div>`;
}

function bindTableEvents(cont) {
  cont.querySelectorAll('th[data-sort]').forEach((th) => {
    const sf = th.dataset.sort;
    if (!sf) return;
    th.onclick = () => {
      if (sortField === sf) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortField = sf; sortDir = 'asc'; }
      applyView();
    };
  });

  bindActionMenus(cont, {
    detail: (id) => {
      const pedidoId = String(id).replace(/^ped-/, '');
      const f = displayFilas.find((x) => String(x.pedido_id) === pedidoId);
      if (f?.requerimiento) openDetailPanel(enrichReqRow(f.requerimiento));
    },
    timeline: async (id) => {
      const pedidoId = String(id).replace(/^ped-/, '');
      const f = displayFilas.find((x) => String(x.pedido_id) === pedidoId);
      if (!f?.requerimiento_id) return;
      try {
        const t = await trazabilidadService.get(f.requerimiento_id);
        const w = window.open('', '_blank', 'width=640,height=720');
        w.document.write(`<html><head><title>Trazabilidad</title><style>${timelineModalStyles()}</style></head><body>${renderTimeline(t.historial || t.historialEstados || [])}</body></html>`);
      } catch (err) { alert(err.message); }
    },
    goPaq: (id) => {
      const pedidoId = String(id).replace(/^ped-/, '');
      const f = displayFilas.find((x) => String(x.pedido_id) === pedidoId);
      if (f?.paquete_id) callbacks.onGoToPaquete?.(Number(f.paquete_id), Number(f.pedido_id));
    },
  });
}

function applyView() {
  const filters = readPedidosFilters('ped');
  let filas = filterFilasPedidos(rawFilas, filters);
  filas = sortFilasPedidos(filas, sortField, sortDir);
  allFilteredFilas = filas;
  const result = pedPagination.paginateVirtual(filas);
  displayFilas = result.data;

  const kpi = document.getElementById('pedKpiWrap');
  const table = document.getElementById('pedMatrizTable');
  if (kpi) kpi.innerHTML = renderPedidosKpiCards(computeIndicadoresPedidos(filas));
  if (table) {
    table.innerHTML = renderTable();
    bindTableEvents(table);
    pedPagination.renderControls('pedMatrizTable', () => applyView());
  }
}

async function loadData() {
  const resp = await programacionService.getMatrizPedidos();
  rawFilas = resp?.filas || [];
}

export function highlightPedidoRow(pedidoId) {
  setTimeout(() => {
    const row = document.querySelector(`tr[data-pedido-id="${pedidoId}"]`);
    if (row) {
      row.classList.add('ped-row-highlight');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => row.classList.remove('ped-row-highlight'), 4000);
    }
  }, 400);
}

export async function loadPedidosConsolidacionTab(containerId, cbs = {}) {
  callbacks = cbs;
  const cont = document.getElementById(containerId);
  if (!cont) return;

  cont.innerHTML = '<div class="text-muted py-4 text-center">Cargando pedidos SIGAMEF…</div>';
  try {
    await loadData();
    if (!rawFilas.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay pedidos SIGAMEF asociados a requerimientos.</div>';
      return;
    }

    cont.innerHTML = `
      <style>${pedidosMatrizStyles()}</style>
      <div class="ped-matriz-wrap">
        <p class="text-muted small mb-2">Matriz de seguimiento de pedidos — estado y trazabilidad del requerimiento asociado.</p>
        <div id="pedKpiWrap"></div>
        ${renderPedidosFilterBar('ped')}
        <div id="pedMatrizTable"></div>
      </div>`;

    applyView();

    document.getElementById('pedBtnFilter')?.addEventListener('click', () => {
      pedPagination.resetPage();
      applyView();
    });
    document.getElementById('pedBtnClear')?.addEventListener('click', () => {
      ['pedSearch', 'pedFiltroEstado', 'pedFiltroResp', 'pedFiltroArea', 'pedFiltroCentro', 'pedFiltroDesde', 'pedFiltroHasta'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      pedPagination.resetPage();
      applyView();
    });
    document.getElementById('pedBtnExport')?.addEventListener('click', () => exportPedidosExcel(allFilteredFilas));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error: ${esc(e.message)}</div>`;
  }
}

export function invalidatePedidosMatriz() {
  rawFilas = [];
}

export function reloadPedidosConsolidacion() {
  return loadPedidosConsolidacionTab('progContent', callbacks);
}
