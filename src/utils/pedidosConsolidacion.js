// Utilidades UI — matriz de seguimiento de pedidos SIGAMEF
import * as XLSX from 'xlsx';
import { esc } from './trazabilidad.js';
import { estadoPaqueteBadge, responsableDosLineas, fmtMoney } from './paquetesConsolidacion.js';

export { esc, fmtMoney, estadoPaqueteBadge, responsableDosLineas };

export function renderPedidosKpiCards(indicadores, prefix = 'ped') {
  const i = indicadores || {};
  const cards = [
    { label: 'Total Pedidos', value: i.total_pedidos ?? 0, color: 'primary' },
    { label: 'Pedidos con Paquete', value: i.pedidos_con_paquete ?? 0, color: 'success' },
    { label: 'Pedidos sin Paquete', value: i.pedidos_sin_paquete ?? 0, color: 'secondary' },
    { label: 'Observados', value: i.observados ?? 0, color: 'danger' },
    { label: 'Retrasados', value: i.retrasados ?? 0, color: 'warning' },
    { label: 'Monto Consolidado', value: fmtMoney(i.monto_consolidado), color: 'success', raw: true },
  ];
  return `<div class="row g-2 mb-3" id="${prefix}KpiRow">${cards.map((c) => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="sgc-kpi-card">
        <div class="kpi-label">${esc(c.label)}</div>
        <div class="kpi-value text-${c.color}">${c.raw ? c.value : esc(String(c.value))}</div>
      </div>
    </div>`).join('')}</div>`;
}

export function renderPedidosFilterBar(prefix = 'ped') {
  return `
    <div class="sgc-search-bar mb-3" id="${prefix}FilterBar">
      <div class="row g-2 align-items-end">
        <div class="col-md-4">
          <label class="form-label small mb-1">Búsqueda</label>
          <input type="search" class="form-control form-control-sm" id="${prefix}Search"
            placeholder="Pedido, REQ, paquete, SIGAMEF, descripción…">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Estado</label>
          <select class="form-select form-select-sm" id="${prefix}FiltroEstado">
            <option value="">Todos</option>
            <option value="REGISTRADO">En Registro</option>
            <option value="EVALUACION">En Evaluación</option>
            <option value="DEC">En DEC</option>
            <option value="PROGRAMACION">En Programación</option>
            <option value="ACTOS_PREPARATORIOS">En Coordinación CM</option>
            <option value="INVITACIONES">En Invitaciones</option>
            <option value="CCP">En CCP</option>
            <option value="EJECUCION">En Ejecución</option>
            <option value="OBSERVADO">Observado</option>
            <option value="FINALIZADO">Finalizado</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Responsable</label>
          <input type="text" class="form-control form-control-sm" id="${prefix}FiltroResp" placeholder="Nombre">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Área Usuaria</label>
          <input type="text" class="form-control form-control-sm" id="${prefix}FiltroArea" placeholder="Área">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Centro</label>
          <input type="text" class="form-control form-control-sm" id="${prefix}FiltroCentro" placeholder="Centro">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Fecha desde</label>
          <input type="date" class="form-control form-control-sm" id="${prefix}FiltroDesde">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Fecha hasta</label>
          <input type="date" class="form-control form-control-sm" id="${prefix}FiltroHasta">
        </div>
        <div class="col-md-12 d-flex gap-2 flex-wrap mt-1">
          <button type="button" class="btn btn-sm btn-primary" id="${prefix}BtnFilter"><i class="bi bi-funnel"></i> Filtrar</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="${prefix}BtnClear">Limpiar</button>
          <button type="button" class="btn btn-sm btn-outline-success" id="${prefix}BtnExport"><i class="bi bi-file-earmark-excel"></i> Exportar Excel</button>
        </div>
      </div>
    </div>`;
}

export function readPedidosFilters(prefix = 'ped') {
  return {
    search: document.getElementById(`${prefix}Search`)?.value.trim().toLowerCase() || '',
    estado: document.getElementById(`${prefix}FiltroEstado`)?.value.trim().toUpperCase() || '',
    responsable: document.getElementById(`${prefix}FiltroResp`)?.value.trim().toLowerCase() || '',
    area: document.getElementById(`${prefix}FiltroArea`)?.value.trim().toLowerCase() || '',
    centro: document.getElementById(`${prefix}FiltroCentro`)?.value.trim().toLowerCase() || '',
    fechaDesde: document.getElementById(`${prefix}FiltroDesde`)?.value || '',
    fechaHasta: document.getElementById(`${prefix}FiltroHasta`)?.value || '',
  };
}

function parseFecha(val) {
  if (!val) return null;
  const s = String(val).slice(0, 10);
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

export function filterFilasPedidos(filas, filters) {
  return (filas || []).filter((f) => {
    if (filters.estado) {
      if (filters.estado === 'OBSERVADO') {
        if (!f.observado) return false;
      } else if (String(f.estado_actual || '').toUpperCase() !== filters.estado) return false;
    }
    if (filters.responsable && !String(f.responsable || '').toLowerCase().includes(filters.responsable)) return false;
    if (filters.area && !String(f.area_usuaria || '').toLowerCase().includes(filters.area)) return false;
    if (filters.centro && !String(f.centro || '').toLowerCase().includes(filters.centro)) return false;
    const fPed = parseFecha(f.fecha_pedido || f.fecha_asociacion);
    const fDesde = parseFecha(filters.fechaDesde);
    const fHasta = parseFecha(filters.fechaHasta);
    if (fDesde && fPed != null && fPed < fDesde) return false;
    if (fHasta && fPed != null && fPed > fHasta) return false;
    if (filters.search) {
      const blob = [
        f.pedido, f.requerimiento_codigo, f.codigo_paquete, f.codigo_sigamef,
        f.descripcion, f.area_usuaria, f.responsable, f.estado_actual_texto,
      ].join(' ').toLowerCase();
      if (!blob.includes(filters.search)) return false;
    }
    return true;
  });
}

export function computeIndicadoresPedidos(filas) {
  let conPaquete = 0;
  let sinPaquete = 0;
  let observados = 0;
  let retrasados = 0;
  let monto = 0;
  (filas || []).forEach((f) => {
    if (f.paquete_id) conPaquete += 1;
    else sinPaquete += 1;
    if (f.observado) observados += 1;
    if (f.retrasado) retrasados += 1;
    monto += Number(f.monto_total || 0);
  });
  return {
    total_pedidos: (filas || []).length,
    pedidos_con_paquete: conPaquete,
    pedidos_sin_paquete: sinPaquete,
    observados,
    retrasados,
    monto_consolidado: Number(monto.toFixed(2)),
  };
}

export function sortFilasPedidos(filas, sortField, sortDir) {
  const dir = sortDir === 'desc' ? -1 : 1;
  const key = sortField || 'pedido';
  return (filas || []).slice().sort((a, b) => {
    let va = a[key];
    let vb = b[key];
    if (key === 'fecha') {
      va = parseFecha(a.fecha_pedido || a.fecha_asociacion) || 0;
      vb = parseFecha(b.fecha_pedido || b.fecha_asociacion) || 0;
      return (va - vb) * dir;
    }
    if (key === 'paquete') {
      va = a.codigo_paquete || '';
      vb = b.codigo_paquete || '';
    }
    if (key === 'estado') {
      va = a.estado_actual_texto || '';
      vb = b.estado_actual_texto || '';
    }
    va = String(va ?? '').toLowerCase();
    vb = String(vb ?? '').toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
}

export function paqueteBadgeHtml(codigo) {
  if (codigo) {
    return `<span class="badge bg-success">${esc(codigo)}</span>`;
  }
  return '<span class="text-muted small">Sin paquete</span>';
}

export const EXPORT_COLUMNS = [
  'Pedido', 'Requerimiento', 'Paquete', 'Tipo', 'Código SIGAMEF', 'Descripción',
  'Cantidad', 'Monto Total', 'Centro', 'Área Usuaria', 'Estado Actual', 'Responsable',
  'Meta', 'Clasificador', 'Días en Estado',
];

export function exportPedidosExcel(filas) {
  const rows = [EXPORT_COLUMNS];
  (filas || []).forEach((f) => {
    rows.push([
      f.pedido,
      f.requerimiento_codigo,
      f.codigo_paquete || 'Sin paquete',
      f.tipo,
      f.codigo_sigamef,
      f.descripcion,
      f.cantidad,
      f.monto_total,
      f.centro,
      f.area_usuaria,
      f.estado_actual_texto,
      f.responsable,
      f.meta,
      f.clasificador,
      f.dias_en_estado,
    ]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Pedidos SIGAMEF');
  XLSX.writeFile(wb, `matriz_pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function pedidosMatrizStyles() {
  return `
    .ped-matriz-wrap .table { font-size: 0.78rem; }
    .ped-matriz-wrap .table th { white-space: nowrap; background: #f8f9fa; position: sticky; top: 0; z-index: 2; cursor: pointer; user-select: none; }
    .ped-matriz-wrap .table th.sorted-asc::after { content: ' ▲'; font-size: 0.65rem; }
    .ped-matriz-wrap .table th.sorted-desc::after { content: ' ▼'; font-size: 0.65rem; }
    .ped-matriz-wrap .table-responsive { max-height: 70vh; overflow: auto; }
    .ped-matriz-wrap tr.ped-row-highlight { background: #fff3cd !important; outline: 2px solid #ffc107; }
    @media (max-width: 1366px) {
      .ped-col-meta, .ped-col-clas { display: none; }
    }
  `;
}
