// Utilidades UI — matriz de consolidación de paquetes
import * as XLSX from 'xlsx';
import { esc } from './trazabilidad.js';
import { renderEstadoVisualHtml, buildPresenterRow } from './estadoVisualPresenter.js';

export { esc };

const money = (n) => `S/. ${Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Estado visual — delega exclusivamente en EstadoVisualPresenter. */
export function estadoPaqueteBadge(estado, estadoActual, estadoTexto, row = null) {
  const r = buildPresenterRow(row || {
    estado,
    estado_actual: estadoActual,
    sub_modulo: estadoTexto,
    estado_actual_texto: estadoTexto,
  });
  return renderEstadoVisualHtml(r, { moduloContext: 'Programación' });
}

export function responsableDosLineas(nombre, rol) {
  const n = esc(nombre || '—');
  const r = esc(rol || '');
  return `<div class="req-resp-name">${n}</div>${r ? `<div class="req-resp-role">${r}</div>` : ''}`;
}

export function renderPaquetesKpiCards(indicadores, prefix = 'paq') {
  const i = indicadores || {};
  const cards = [
    { label: 'Total Paquetes', value: i.total_paquetes ?? 0, color: 'primary' },
    { label: 'Total Requerimientos', value: i.total_requerimientos ?? 0, color: 'info' },
    { label: 'Total Pedidos', value: i.total_pedidos ?? 0, color: 'secondary' },
    { label: 'Monto Consolidado', value: money(i.monto_consolidado), color: 'success', raw: true },
    { label: 'Observados', value: i.observados ?? 0, color: 'danger' },
    { label: 'Retrasados', value: i.retrasados ?? 0, color: 'warning' },
  ];
  return `<div class="row g-2 mb-3" id="${prefix}KpiRow">${cards.map((c) => `
    <div class="col-6 col-md-4 col-lg-2">
      <div class="sgc-kpi-card">
        <div class="kpi-label">${esc(c.label)}</div>
        <div class="kpi-value text-${c.color}">${c.raw ? c.value : esc(String(c.value))}</div>
      </div>
    </div>`).join('')}</div>`;
}

export function renderPaquetesFilterBar(prefix = 'paq') {
  return `
    <div class="sgc-search-bar mb-3" id="${prefix}FilterBar">
      <div class="row g-2 align-items-end">
        <div class="col-md-4">
          <label class="form-label small mb-1">Búsqueda</label>
          <input type="search" class="form-control form-control-sm" id="${prefix}Search"
            placeholder="Paquete, REQ, pedido, SIGAMEF, descripción, área, responsable…">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-1">Estado</label>
          <select class="form-select form-select-sm" id="${prefix}FiltroEstado">
            <option value="">Todos</option>
            <option value="REGISTRADO">En Registro</option>
            <option value="EVALUACION">En Evaluación</option>
            <option value="DEC">En DEC</option>
            <option value="PROGRAMACION">En Programación</option>
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
          <label class="form-label small mb-1">Fecha paquete</label>
          <input type="date" class="form-control form-control-sm" id="${prefix}FiltroFecha">
        </div>
        <div class="col-md-12 d-flex gap-2 flex-wrap mt-1">
          <button type="button" class="btn btn-sm btn-primary" id="${prefix}BtnFilter"><i class="bi bi-funnel"></i> Filtrar</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="${prefix}BtnClear">Limpiar</button>
          <button type="button" class="btn btn-sm btn-outline-dark" id="${prefix}BtnExecutive"><i class="bi bi-bar-chart"></i> Vista Ejecutiva</button>
          <button type="button" class="btn btn-sm btn-outline-success" id="${prefix}BtnExport"><i class="bi bi-file-earmark-excel"></i> Exportar Excel</button>
        </div>
      </div>
    </div>`;
}

export function readPaquetesFilters(prefix = 'paq') {
  return {
    search: document.getElementById(`${prefix}Search`)?.value.trim().toLowerCase() || '',
    estado: document.getElementById(`${prefix}FiltroEstado`)?.value.trim().toUpperCase() || '',
    responsable: document.getElementById(`${prefix}FiltroResp`)?.value.trim().toLowerCase() || '',
    area: document.getElementById(`${prefix}FiltroArea`)?.value.trim().toLowerCase() || '',
    centro: document.getElementById(`${prefix}FiltroCentro`)?.value.trim().toLowerCase() || '',
    fecha: document.getElementById(`${prefix}FiltroFecha`)?.value || '',
  };
}

function filaMatches(f, filters) {
  if (filters.estado) {
    if (filters.estado === 'OBSERVADO') {
      if (!f.observado) return false;
    } else if (String(f.estado_actual || '').toUpperCase() !== filters.estado) return false;
  }
  if (filters.responsable && !String(f.responsable || '').toLowerCase().includes(filters.responsable)) return false;
  if (filters.area && !String(f.area_usuaria || '').toLowerCase().includes(filters.area)) return false;
  if (filters.centro && !String(f.centro || '').toLowerCase().includes(filters.centro)) return false;
  if (filters.fecha) {
    const fd = String(f.paquete_fecha || '').slice(0, 10);
    if (fd !== filters.fecha) return false;
  }
  if (filters.search) {
    const blob = [
      f.codigo_paquete, f.requerimiento_codigo, f.pedido, f.codigo_sigamef,
      f.descripcion, f.area_usuaria, f.responsable, f.estado_actual_texto, f.centro,
    ].join(' ').toLowerCase();
    if (!blob.includes(filters.search)) return false;
  }
  return true;
}

export function filterMatrizPaquetes(matrizData, filters) {
  const out = [];
  for (const grupo of matrizData.paquetes || []) {
    const filas = (grupo.filas || []).filter((f) => filaMatches(f, filters));
    if (!filas.length) continue;
    const monto = filas.reduce((s, f) => s + Number(f.monto_total || 0), 0);
    const reqSet = new Set(filas.map((f) => f.requerimiento_id));
    const pedSet = new Set(filas.filter((f) => f.pedido_id).map((f) => f.pedido_id));
    out.push({
      ...grupo,
      filas,
      resumen: {
        cant_requerimientos: reqSet.size,
        cant_pedidos: pedSet.size,
        monto_total: Number(monto.toFixed(2)),
      },
    });
  }
  return { paquetes: out, indicadores: computeIndicadoresFromGrupos(out) };
}

function computeIndicadoresFromGrupos(grupos) {
  const reqIds = new Set();
  const pedIds = new Set();
  let monto = 0;
  let observados = 0;
  let retrasados = 0;
  grupos.forEach((g) => {
    g.filas.forEach((f) => {
      reqIds.add(f.requerimiento_id);
      if (f.pedido_id) pedIds.add(f.pedido_id);
      monto += Number(f.monto_total || 0);
      if (f.observado) observados += 1;
      if (f.retrasado) retrasados += 1;
    });
  });
  return {
    total_paquetes: grupos.length,
    total_requerimientos: reqIds.size,
    total_pedidos: pedIds.size,
    monto_consolidado: Number(monto.toFixed(2)),
    observados,
    retrasados,
  };
}

export function exportMatrizExcel(grupos) {
  const resumenRows = [['Código Paquete', 'Estado Paquete', 'Requerimientos', 'Pedidos', 'Monto Total', 'Creado por', 'Fecha']];
  const detalleRows = [[
    'Paquete', 'Requerimiento', 'Pedido', 'Tipo', 'Código SIGAMEF', 'Descripción', 'Cantidad', 'Monto Total',
    'Centro', 'Área Usuaria', 'Estado Actual', 'Responsable', 'Meta', 'Clasificador', 'Días en Estado',
  ]];

  (grupos || []).forEach((g) => {
    const p = g.paquete;
    resumenRows.push([
      p.codigo_paquete, p.estado, g.resumen.cant_requerimientos, g.resumen.cant_pedidos,
      g.resumen.monto_total, p.usuario_creacion, String(p.fecha_creacion || '').slice(0, 10),
    ]);
    g.filas.forEach((f) => {
      detalleRows.push([
        f.codigo_paquete, f.requerimiento_codigo, f.pedido, f.tipo, f.codigo_sigamef, f.descripcion,
        f.cantidad, f.monto_total, f.centro, f.area_usuaria, f.estado_actual_texto, f.responsable,
        f.meta, f.clasificador, f.dias_en_estado,
      ]);
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumenRows), 'Resumen de Paquetes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalleRows), 'Detalle de Requerimientos');
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `matriz_paquetes_${fecha}.xlsx`);
}

export function paquetesMatrizStyles() {
  return `
    .paq-matriz-wrap .table { font-size: 0.78rem; }
    .paq-matriz-wrap .table th { white-space: nowrap; background: #f8f9fa; position: sticky; top: 0; z-index: 2; }
    .paq-group-row { background: #eef2ff !important; cursor: pointer; font-weight: 600; }
    .paq-group-row:hover { background: #e0e7ff !important; }
    .paq-group-row .paq-toggle { width: 24px; display: inline-block; text-align: center; }
    .paq-detail-row { background: #fff; }
    .paq-matriz-wrap .table-responsive { max-height: 70vh; overflow: auto; }
    .ped-row-highlight, tr.ped-row-highlight { background: #fff3cd !important; outline: 2px solid #ffc107; }
  `;
}

export function fmtMoney(n) { return money(n); }
