// Utilidades UI — matriz de seguimiento de pedidos SIGAMEF
import * as XLSX from 'xlsx';
import { esc } from './trazabilidad.js';
import { estadoPaqueteBadge, responsableDosLineas, fmtMoney } from './paquetesConsolidacion.js';
import { resolveContratoVisual, bandejaExpedienteStandardStyles } from './bandejaExpedienteColumns.js';
import { renderEtapaBadgeHtml } from '../ui/workflow/EtapaBadge.js';
import { renderEstadoBadgeHtml } from '../ui/workflow/EstadoBadge.js';
import { renderResponsableBadgeHtml } from '../ui/workflow/ResponsableBadge.js';

export { esc, fmtMoney, estadoPaqueteBadge, responsableDosLineas };

/** Fila matriz pedidos → row con bandeja_contrato para resolveContratoVisual. */
export function pedidoMatrizRowForContrato(f) {
  if (!f) return {};
  return {
    ...(f.requerimiento || {}),
    id: f.requerimiento_id,
    requerimiento_id: f.requerimiento_id,
    bandeja_contrato: f.bandeja_contrato,
    estado_responsable_vigente: f.estado_responsable_vigente,
  };
}

export function pedidoMatrizContratoExportTexts(f) {
  const bc = f?.bandeja_contrato;
  if (bc?.etapa?.label || bc?.estado?.label) {
    return {
      etapa: bc.etapa?.label || '',
      estado: bc.estado?.label || '',
      responsable: bc.responsable?.nombre || '',
    };
  }
  return {
    etapa: f?.etapa_label || '',
    estado: f?.estado_actual_texto ?? '',
    responsable: f?.responsable ?? '',
  };
}

export function renderPedidoMatrizWorkflowCells(f) {
  const visual = resolveContratoVisual(pedidoMatrizRowForContrato(f));
  return {
    etapa: renderEtapaBadgeHtml({ etapaLabel: visual.etapaLabel, etapaCodigo: visual.etapaCodigo }),
    estado: renderEstadoBadgeHtml({
      estadoCodigo: visual.estadoCodigo,
      estadoLabel: visual.estadoLabel,
      categoria: visual.categoria,
      icono: visual.icono,
      tooltip: visual.tooltip,
    }),
    responsable: renderResponsableBadgeHtml({
      responsableTipo: visual.responsableTipo,
      responsableNombre: visual.responsableNombre,
      responsableUsername: visual.responsableUsername,
      responsableUsuarioId: visual.responsableUsuarioId,
      responsableUnidad: visual.responsableUnidad,
      responsableDisplay: visual.responsableNombre,
    }),
  };
}

export function parseRequerimientoCorrelativo(codigo, requerimientoId) {
  const m = String(codigo || '').match(/REQ[-\s]*0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const n = Number(requerimientoId);
  return Number.isFinite(n) ? n : 0;
}

export function parsePedidoCorrelativo(pedido, nroPedido) {
  const raw = String(pedido || nroPedido || '');
  const m = raw.match(/(\d+)\s*$/);
  if (m) return parseInt(m[1], 10);
  return raw.toLowerCase();
}

export function compareFilasPedidosDefault(a, b) {
  const ra = parseRequerimientoCorrelativo(a.requerimiento_codigo, a.requerimiento_id);
  const rb = parseRequerimientoCorrelativo(b.requerimiento_codigo, b.requerimiento_id);
  if (ra !== rb) return rb - ra;
  const pa = parsePedidoCorrelativo(a.pedido, a.nro_pedido);
  const pb = parsePedidoCorrelativo(b.pedido, b.nro_pedido);
  if (typeof pa === 'number' && typeof pb === 'number' && pa !== pb) return pa - pb;
  return String(a.pedido || '').localeCompare(String(b.pedido || ''), 'es');
}

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
      const exp = pedidoMatrizContratoExportTexts(f);
      const blob = [
        f.pedido, f.requerimiento_codigo, f.codigo_paquete, f.codigo_sigamef,
        f.descripcion, f.area_usuaria, f.responsable, f.estado_actual_texto,
        exp.etapa, exp.estado,
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
  const key = sortField || 'requerimiento_codigo';
  if (!sortField || key === 'requerimiento_codigo') {
    return (filas || []).slice().sort((a, b) => compareFilasPedidosDefault(a, b) * (sortDir === 'asc' ? -1 : 1));
  }
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
    if (key === 'pedido') {
      const pa = parsePedidoCorrelativo(a.pedido, a.nro_pedido);
      const pb = parsePedidoCorrelativo(b.pedido, b.nro_pedido);
      if (typeof pa === 'number' && typeof pb === 'number') return (pa - pb) * dir;
      va = String(a.pedido || '');
      vb = String(b.pedido || '');
    }
    if (key === 'etapa') {
      va = a.etapa_label || a.bandeja_contrato?.etapa?.label || '';
      vb = b.etapa_label || b.bandeja_contrato?.etapa?.label || '';
    }
    if (key === 'estado') {
      va = a.estado_actual_texto || a.bandeja_contrato?.estado?.label || '';
      vb = b.estado_actual_texto || b.bandeja_contrato?.estado?.label || '';
    }
    if (key === 'responsable') {
      va = a.responsable || a.bandeja_contrato?.responsable?.nombre || '';
      vb = b.responsable || b.bandeja_contrato?.responsable?.nombre || '';
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
  'Cantidad', 'Monto Total', 'Centro', 'Área Usuaria', 'Etapa', 'Estado', 'Responsable',
  'Meta', 'Clasificador', 'Días en Estado',
];

export function exportPedidosExcel(filas) {
  const rows = [EXPORT_COLUMNS];
  (filas || []).forEach((f) => {
    const canon = pedidoMatrizContratoExportTexts(f);
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
      canon.etapa,
      canon.estado,
      canon.responsable,
      f.meta ?? '',
      f.clasificador ?? '',
      f.dias_en_estado ?? 0,
    ]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Pedidos SIGAMEF');
  XLSX.writeFile(wb, `matriz_pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function pedidosMatrizStyles() {
  return `
    ${bandejaExpedienteStandardStyles().replace(/\.sgc-bandeja-standard/g, '.ped-matriz-wrap')}
    .ped-matriz-wrap .ped-matriz-table {
      table-layout: fixed;
      width: 100%;
      min-width: 0;
      font-size: 0.78rem;
    }
    .ped-matriz-wrap .ped-matriz-table th,
    .ped-matriz-wrap .ped-matriz-table td {
      padding: 0.28rem 0.35rem;
      line-height: 1.22;
      vertical-align: middle;
      overflow: hidden;
    }
    .ped-matriz-wrap .ped-matriz-table th {
      white-space: nowrap;
      background: #f8f9fa;
      position: sticky;
      top: 0;
      z-index: 2;
      cursor: pointer;
      user-select: none;
      font-size: 0.72rem;
    }
    .ped-matriz-wrap .ped-matriz-table th.sorted-asc::after { content: ' ▲'; font-size: 0.65rem; }
    .ped-matriz-wrap .ped-matriz-table th.sorted-desc::after { content: ' ▼'; font-size: 0.65rem; }
    .ped-matriz-wrap .ped-matriz-scroll {
      max-height: 70vh;
      overflow-y: auto;
      overflow-x: auto;
    }
    @media (min-width: 1200px) {
      .ped-matriz-wrap .ped-matriz-scroll { overflow-x: hidden; }
    }
    .ped-matriz-wrap tr.ped-row-highlight { background: #fff3cd !important; outline: 2px solid #ffc107; }

    .ped-matriz-wrap .ped-col-pedido { width: 4.5%; }
    .ped-matriz-wrap .ped-col-req { width: 5.5%; }
    .ped-matriz-wrap .ped-col-paq { width: 4.5%; }
    .ped-matriz-wrap .ped-col-tipo { width: 3.5%; }
    .ped-matriz-wrap .ped-col-sigamef { width: 4.5%; }
    .ped-matriz-wrap .ped-col-desc { width: 11%; }
    .ped-matriz-wrap .ped-col-cant { width: 3%; }
    .ped-matriz-wrap .ped-col-monto { width: 5.5%; }
    .ped-matriz-wrap .ped-col-centro { width: 4%; }
    .ped-matriz-wrap .ped-col-area { width: 6%; }
    .ped-matriz-wrap .req-col-etapa { width: 8%; max-width: none; }
    .ped-matriz-wrap .req-col-estado-cell { width: 8%; max-width: none; }
    .ped-matriz-wrap .req-col-resp { width: 9%; max-width: none; }
    .ped-matriz-wrap .ped-col-meta { width: 4%; }
    .ped-matriz-wrap .ped-col-clas { width: 4%; }
    .ped-matriz-wrap .req-col-acc { width: 2.5%; min-width: 36px; text-align: center; position: static; overflow: visible; }

    .ped-matriz-wrap .ped-cell-compact {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.76rem;
    }
    .ped-matriz-wrap .ped-badge-tipo { font-size: 0.62rem; padding: 0.15em 0.35em; }
    .ped-matriz-wrap .ped-desc-clamp {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
      line-height: 1.2;
      font-size: 0.76rem;
    }
    .ped-matriz-wrap .ped-area-text {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
      line-height: 1.2;
      font-size: 0.76rem;
    }
    .ped-matriz-wrap .ped-meta-clamp {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.74rem;
    }
    .ped-matriz-wrap .ped-monto-text { font-size: 0.74rem; white-space: nowrap; }
    .ped-matriz-wrap .ped-col-paq .badge { font-size: 0.65rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }

    .ped-matriz-wrap .req-col-etapa .sgc-etapa-badge,
    .ped-matriz-wrap .req-col-estado-cell .sgc-estado-badge,
    .ped-matriz-wrap .req-col-resp .sgc-responsable-badge {
      max-width: 100%;
      min-height: 22px;
      max-height: 24px;
    }
    .ped-matriz-wrap .req-col-etapa .sgc-etapa-badge__text,
    .ped-matriz-wrap .req-col-estado-cell .sgc-estado-badge__text,
    .ped-matriz-wrap .req-col-resp .sgc-responsable-badge__text {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ped-matriz-wrap .req-col-acc .dropdown { position: static; }
    .ped-matriz-wrap .bandeja-actions-btn { padding: 2px 6px; line-height: 1; font-size: 1rem; border: 1px solid #dee2e6; }

    @media (max-width: 991px) {
      .ped-matriz-wrap .ped-matriz-table { min-width: 920px; }
      .ped-matriz-wrap .ped-matriz-scroll { overflow-x: auto; }
    }
  `;
}
