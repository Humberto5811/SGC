// Matriz de seguimiento — pestaña Pedidos (Programación)
import { programacionService } from '../../services/programacionService.js';
import { trazabilidadService } from '../../services/trazabilidadService.js';
import { renderTimeline, timelineModalStyles } from '../../services/timelineService.js';
import { openDetailPanel } from '../../components/bandejaDetailPanel.js';
import { enrichReqRow } from '../../utils/trazabilidad.js';
import {
  esc, renderPedidosKpiCards, renderPedidosFilterBar, readPedidosFilters,
  filterFilasPedidos, computeIndicadoresPedidos, sortFilasPedidos,
  paqueteBadgeHtml, exportPedidosExcel, pedidosMatrizStyles,
  estadoPaqueteBadge, responsableDosLineas, fmtMoney,
} from '../../utils/pedidosConsolidacion.js';

let rawFilas = [];
let displayFilas = [];
let sortField = 'pedido';
let sortDir = 'asc';
let callbacks = {};

const SORT_MAP = {
  Pedido: 'pedido',
  Requerimiento: 'requerimiento_codigo',
  Paquete: 'paquete',
  Estado: 'estado',
  Responsable: 'responsable',
  Fecha: 'fecha',
};

function renderTable() {
  const headers = [
    { label: 'Pedido', sort: 'Pedido' },
    { label: 'Requerimiento', sort: 'Requerimiento' },
    { label: 'Paquete', sort: 'Paquete' },
    { label: 'Tipo', sort: null },
    { label: 'Código SIGAMEF', sort: null },
    { label: 'Descripción', sort: null },
    { label: 'Cant.', sort: null },
    { label: 'Monto Total', sort: null },
    { label: 'Centro', sort: null },
    { label: 'Área Usuaria', sort: null },
    { label: 'Estado Actual', sort: 'Estado' },
    { label: 'Responsable', sort: 'Responsable' },
    { label: 'Meta', sort: null, cls: 'ped-col-meta' },
    { label: 'Clasificador', sort: null, cls: 'ped-col-clas' },
    { label: 'Acciones', sort: null },
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
    return `<tr data-pedido-id="${f.pedido_id}" data-paquete-id="${f.paquete_id || ''}"
      title="${esc([tipMeta, tipClas, tipDias].filter(Boolean).join(' · '))}">
      <td><strong>${esc(f.pedido)}</strong></td>
      <td>${esc(f.requerimiento_codigo)}</td>
      <td>${paqueteBadgeHtml(f.codigo_paquete)}</td>
      <td><span class="badge bg-light text-dark border">${esc(f.tipo)}</span></td>
      <td>${esc(f.codigo_sigamef || '—')}</td>
      <td><span class="req-desc-text" title="${esc(f.descripcion)}">${esc(f.descripcion)}</span></td>
      <td class="text-end">${esc(f.cantidad)}</td>
      <td class="text-end">${fmtMoney(f.monto_total)}</td>
      <td>${esc(f.centro || '—')}</td>
      <td>${esc(f.area_usuaria || '—')}</td>
      <td title="${esc(tipDias)}">${estadoPaqueteBadge(f.estado, f.estado_actual, f.estado_actual_texto, f.requerimiento || f)}</td>
      <td>${responsableDosLineas(f.responsable, f.sub_modulo)}</td>
      <td class="ped-col-meta" title="${esc(f.meta)}">${esc(f.meta || '—')}</td>
      <td class="ped-col-clas" title="${esc(f.clasificador)}">${esc(f.clasificador || '—')}</td>
      <td class="text-nowrap text-center">
        <button class="btn btn-xs btn-outline-primary ped-act-exp" data-req-id="${f.requerimiento_id}" title="Ver expediente"><i class="bi bi-eye"></i></button>
        <button class="btn btn-xs btn-outline-secondary ped-act-traza" data-req-id="${f.requerimiento_id}" title="Trazabilidad"><i class="bi bi-clock-history"></i></button>
        ${f.paquete_id ? `<button class="btn btn-xs btn-outline-success ped-act-paq" data-paq-id="${f.paquete_id}" data-ped-id="${f.pedido_id}" title="Ir al paquete"><i class="bi bi-box-seam"></i></button>` : ''}
      </td>
    </tr>`;
  }).join('');

  return `<div class="table-responsive"><table class="table table-sm table-hover table-bordered mb-0">
    <thead>${thead}</thead>
    <tbody>${tbody || `<tr><td colspan="15" class="text-center text-muted">Sin pedidos</td></tr>`}</tbody>
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
  cont.querySelectorAll('.ped-act-exp').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const f = displayFilas.find((x) => String(x.requerimiento_id) === String(b.dataset.reqId));
      if (f?.requerimiento) openDetailPanel(enrichReqRow(f.requerimiento));
    };
  });
  cont.querySelectorAll('.ped-act-traza').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation();
      try {
        const t = await trazabilidadService.get(b.dataset.reqId);
        const w = window.open('', '_blank', 'width=640,height=720');
        w.document.write(`<html><head><title>Trazabilidad</title><style>${timelineModalStyles()}</style></head><body>${renderTimeline(t.historial || t.historialEstados || [])}</body></html>`);
      } catch (err) { alert(err.message); }
    };
  });
  cont.querySelectorAll('.ped-act-paq').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      callbacks.onGoToPaquete?.(Number(b.dataset.paqId), Number(b.dataset.pedId));
    };
  });
}

function applyView() {
  const filters = readPedidosFilters('ped');
  let filas = filterFilasPedidos(rawFilas, filters);
  filas = sortFilasPedidos(filas, sortField, sortDir);
  displayFilas = filas;

  const kpi = document.getElementById('pedKpiWrap');
  const table = document.getElementById('pedMatrizTable');
  if (kpi) kpi.innerHTML = renderPedidosKpiCards(computeIndicadoresPedidos(filas));
  if (table) {
    table.innerHTML = renderTable();
    bindTableEvents(table);
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

    document.getElementById('pedBtnFilter')?.addEventListener('click', () => applyView());
    document.getElementById('pedBtnClear')?.addEventListener('click', () => {
      ['pedSearch', 'pedFiltroEstado', 'pedFiltroResp', 'pedFiltroArea', 'pedFiltroCentro', 'pedFiltroDesde', 'pedFiltroHasta'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      applyView();
    });
    document.getElementById('pedBtnExport')?.addEventListener('click', () => exportPedidosExcel(displayFilas));
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
