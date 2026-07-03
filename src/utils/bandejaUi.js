// UI compartida de bandejas SGC — columnas compactas, KPI, filtros, menú ⋮, panel lateral
import {
  esc, enrichReqRow, parsePayloadItems, fmtDateTime, calcDiasEnEstado, diasLabel,
  ETAPA_LABELS, getEstadoActualTexto, mapEstadoToUbicacion,
  computeTraceSummary, filterRowsClient,
} from './trazabilidad.js';
import { getRolDisplayFromRow, countPendientesModulo } from './observacionDestino.js';
import { renderEstadoVisualHtml, resolveModuloFromPrefix } from './observacionesUi.js';

const MODULO_BANDEJA_POR_PREFIX = Object.freeze({
  req: 'Registro de Requerimiento',
  eval: 'Evaluación de Requerimiento',
  dec: 'DEC',
  prog: 'Programación',
  actos: 'Coordinación CM',
  inv: 'Invitaciones',
});

const executiveMode = new Map();

export const ESTADO_BADGE_STYLES = {
  REGISTRADO: { bg: '#0d6efd', label: 'En Registro' },
  EVALUACION: { bg: '#ffc107', fg: '#212529', label: 'En Evaluación' },
  DEC: { bg: '#6f42c1', label: 'En DEC' },
  PROGRAMACION: { bg: '#0dcaf0', fg: '#055160', label: 'En Programación' },
  ACTOS_PREPARATORIOS: { bg: '#fd7e14', label: 'En Coordinación CM' },
  INVITACIONES: { bg: '#0a4275', label: 'En Invitaciones' },
  RECEPCION_COTIZACIONES: { bg: '#0a4275', label: 'En Recep. Cotiz.' },
  VALIDACION_USUARIO: { bg: '#ffc107', fg: '#212529', label: 'En Valid. Usuario' },
  CUADRO_COMPARATIVO: { bg: '#495057', label: 'En Cuadro Comp.' },
  CCP: { bg: '#6f42c1', label: 'En CCP' },
  EJECUCION: { bg: '#495057', label: 'En Ejecución' },
  REGISTRO_ORDEN: { bg: '#0d6efd', label: 'En Reg. Orden' },
  ALMACEN: { bg: '#495057', label: 'En Almacén' },
  TESORERIA: { bg: '#495057', label: 'En Tesorería' },
  FINALIZADO: { bg: '#198754', label: 'Finalizado' },
  OBSERVADO: { bg: '#dc3545', label: 'Observado' },
};

export function bandejaGlobalStyles() {
  return `
    .sgc-bandeja-wrap .table-responsive { overflow-x: auto; overflow-y: visible; }
    .sgc-bandeja-wrap .req-list-table { table-layout: fixed; width: 100%; min-width: 720px; }
    .sgc-bandeja-wrap .req-col-acc { position: static; overflow: visible; }
    .sgc-bandeja-wrap .req-col-acc .dropdown { position: static; }
    .sgc-bandeja-wrap .req-col-acc .dropdown-menu { z-index: 1080; max-height: 70vh; overflow-y: auto; }
    .sgc-bandeja-wrap .req-list-table th,
    .sgc-bandeja-wrap .req-list-table td {
      font-family: 'Segoe UI', system-ui, sans-serif; font-size: 0.8125rem;
      vertical-align: middle; padding: 0.45rem 0.5rem;
    }
    .sgc-bandeja-wrap .req-list-table tbody tr { cursor: pointer; transition: background .15s; }
    .sgc-bandeja-wrap .req-list-table tbody tr:hover { background: #f8f9fc; }
    .sgc-bandeja-wrap .req-list-table tbody tr.row-selected { background: #e7f1ff; }
    .sgc-kpi-card {
      border: 1px solid #e9ecef; border-radius: 8px; background: #fff;
      padding: 0.65rem 1rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.06);
    }
    .sgc-kpi-card .kpi-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: .04em; color: #6c757d; }
    .sgc-kpi-card .kpi-value { font-size: 1.35rem; font-weight: 700; line-height: 1.2; }
    .sgc-search-bar { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 0.75rem; }
    .req-col-timeline { width: 42px; text-align: center; }
    .req-col-req { width: 120px; }
    .req-col-tipo { width: 72px; }
    .req-col-desc { width: 28%; min-width: 160px; }
    .req-col-estado { width: 130px; }
    .req-col-resp { width: 130px; }
    .req-col-dias { width: 72px; text-align: center; }
    .req-col-acc { width: 56px; text-align: center; position: static; overflow: visible; }
    .req-desc-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
    .req-meta-chips { margin-top: 2px; display: flex; gap: 6px; flex-wrap: wrap; }
    .req-meta-chips .chip { font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; border: 1px solid transparent; cursor: pointer; }
    .req-meta-chips .chip-obs { color: #dc3545; background: #fff5f5; border-color: #f1aeb5; font-weight: 600; }
    .req-meta-chips .chip-adj { color: #495057; background: #f8f9fa; border-color: #dee2e6; }
    .req-meta-chips .chip:hover { filter: brightness(0.97); }
    .req-resp-name { font-weight: 500; line-height: 1.2; }
    .req-resp-role { font-size: 0.72rem; color: #6c757d; }
    .badge-estado-mod { font-size: 0.68rem; font-weight: 600; padding: 0.35em 0.55em; border-radius: 6px; }
    .badge-dias-mod { font-size: 0.72rem; font-weight: 600; min-width: 3.2rem; }
    .bandeja-actions-btn { padding: 2px 8px; line-height: 1; font-size: 1.1rem; border: 1px solid #dee2e6; }
    .text-orange { color: #fd7e14 !important; }
    @media (max-width: 768px) {
      .sgc-bandeja-wrap .req-list-table { min-width: 640px; }
    }
  `;
}

export function isExecutiveMode(prefix = 'req') {
  return !!executiveMode.get(prefix);
}

export function setExecutiveMode(prefix, value) {
  executiveMode.set(prefix, !!value);
}

export function truncateText(text, max = 60) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

export function getRowDescripcionRaw(r) {
  try {
    const p = JSON.parse(r.payload || '{}');
    const items = r.tipo === 'servicios' ? (p.servicioItems || [])
      : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
    if (Array.isArray(items) && items.length) {
      const names = items.map((it) => it.nombre_item || '').filter(Boolean);
      if (names.length) return names.join(', ');
    }
  } catch (_) {}
  return String(r.denominacion || r.codigo || '').trim();
}

/** Alias semántico: nombre del ítem en bandeja */
export function getNombreItemRaw(r) {
  return getRowDescripcionRaw(r);
}

export function getSigamefRaw(r) {
  try {
    const p = JSON.parse(r.payload || '{}');
    const items = r.tipo === 'servicios' ? (p.servicioItems || [])
      : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
    if (Array.isArray(items) && items.length) {
      return items.map((it) => it.item_bien || '').filter(Boolean).join(', ');
    }
  } catch (_) {}
  return '';
}

export function countObservacionesPendientes(req, moduloLabel = null) {
  if (moduloLabel) return countPendientesModulo(req, moduloLabel);
  return countPendientesModulo(req, MODULO_BANDEJA_POR_PREFIX.req);
}

function resolveModuloBandeja(prefix, opts = {}) {
  return opts.moduloLabel || MODULO_BANDEJA_POR_PREFIX[prefix] || null;
}

export function getResponsableRol(row) {
  return getRolDisplayFromRow(row);
}

export function buildRowTooltip(row) {
  const enriched = enrichReqRow(row);
  const sigamef = getSigamefRaw(enriched);
  const parts = [
    enriched.area ? `Área: ${enriched.area}` : '',
    enriched.responsable || enriched.centro_nombre ? `Centro: ${enriched.responsable || enriched.centro_nombre}` : '',
    sigamef ? `SIGAMEF: ${sigamef}` : '',
    enriched.monto_total ? `Monto: S/. ${Number(enriched.monto_total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}` : '',
    enriched.created_at ? `Creación: ${fmtDateTime(enriched.created_at)}` : '',
    enriched.fecha_estado_actual ? `Último mov.: ${fmtDateTime(enriched.fecha_estado_actual)}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

export function estadoModernBadge(estadoActual, estadoTexto, estadoNegocio, row, moduloLabel = null) {
  return renderEstadoVisualHtml(row || {}, { moduloContext: moduloLabel });
}

export function diasBadgeHtml(row) {
  const dias = row.dias_en_estado ?? row.diasEnEstado ?? calcDiasEnEstado(row.fecha_estado_actual || row.fechaEstadoActual);
  let bg = '#198754';
  if (dias > 10) bg = '#dc3545';
  else if (dias > 5) bg = '#fd7e14';
  else if (dias > 2) bg = '#ffc107';
  const fg = dias > 2 && dias <= 5 ? '#212529' : '#fff';
  return `<span class="badge badge-dias-mod" style="background:${bg};color:${fg};" title="Días en etapa actual">${esc(diasLabel(dias))}</span>`;
}

export function trazaIconHtml(id) {
  return `<button type="button" class="btn btn-link btn-sm p-0 req-traza text-secondary" data-id="${id}" title="Ver timeline" onclick="event.stopPropagation()"><i class="bi bi-clock-history"></i></button>`;
}

export function renderSummaryCardsHtml(containerId = 'trazaSummary') {
  return `
    <div id="${containerId}" class="row g-2 mb-3 traza-summary-cards">
      <div class="col-6 col-md"><div class="sgc-kpi-card"><div class="kpi-label">Total Expedientes</div><div class="kpi-value text-dark" data-traza-kpi="total">0</div></div></div>
      <div class="col-6 col-md"><div class="sgc-kpi-card"><div class="kpi-label">En Proceso</div><div class="kpi-value text-primary" data-traza-kpi="enProceso">0</div></div></div>
      <div class="col-6 col-md"><div class="sgc-kpi-card"><div class="kpi-label">Observados</div><div class="kpi-value text-danger" data-traza-kpi="observados">0</div></div></div>
      <div class="col-6 col-md"><div class="sgc-kpi-card"><div class="kpi-label">Retrasados</div><div class="kpi-value text-orange" data-traza-kpi="retrasados">0</div></div></div>
      <div class="col-6 col-md"><div class="sgc-kpi-card"><div class="kpi-label">Finalizados</div><div class="kpi-value text-success" data-traza-kpi="finalizados">0</div></div></div>
    </div>`;
}

export function updateSummaryCards(rows, containerId = 'trazaSummary') {
  const root = document.getElementById(containerId);
  if (!root) return;
  const s = computeTraceSummary(rows);
  Object.entries(s).forEach(([k, v]) => {
    const el = root.querySelector(`[data-traza-kpi="${k}"]`);
    if (el) el.textContent = String(v);
  });
}

export function renderFilterBarHtml(prefix = 'req', opts = {}) {
  const execBtn = opts.hideExecutive ? '' : `
          <button type="button" class="btn btn-sm btn-outline-dark flex-grow-1" id="${prefix}VistaEjecutiva" title="Vista compacta"><i class="bi bi-layout-text-window"></i> Vista Ejecutiva</button>`;
  return `
    <div class="sgc-search-bar mb-3">
      <div class="row g-2 align-items-end">
        <div class="col-lg-3 col-md-4">
          <label class="form-label small mb-0">Buscar</label>
          <input type="text" class="form-control form-control-sm" id="${prefix}FiltroBuscar" placeholder="REQ, descripción, SIGAMEF…">
        </div>
        <div class="col-lg-2 col-md-3">
          <label class="form-label small mb-0">Estado</label>
          <select class="form-select form-select-sm" id="${prefix}FiltroEstado">
            <option value="">Todos</option>
            ${Object.entries(ETAPA_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div class="col-lg-2 col-md-3">
          <label class="form-label small mb-0">Responsable</label>
          <input type="text" class="form-control form-control-sm" id="${prefix}FiltroResponsable" placeholder="Nombre o rol">
        </div>
        <div class="col-lg-2 col-md-3">
          <label class="form-label small mb-0">Área Usuaria</label>
          <input type="text" class="form-control form-control-sm" id="${prefix}FiltroArea" placeholder="Facultad…">
        </div>
        <div class="col-lg-1 col-md-2">
          <label class="form-label small mb-0">Desde</label>
          <input type="date" class="form-control form-control-sm" id="${prefix}FiltroFechaDesde">
        </div>
        <div class="col-lg-1 col-md-2">
          <label class="form-label small mb-0">Hasta</label>
          <input type="date" class="form-control form-control-sm" id="${prefix}FiltroFechaHasta">
        </div>
        <div class="col-lg-2 col-md-12 d-flex gap-2 flex-wrap">
          <button type="button" class="btn btn-sm btn-primary flex-grow-1" id="${prefix}FiltroBtn"><i class="bi bi-funnel"></i> Filtrar</button>
          <button type="button" class="btn btn-sm btn-outline-secondary flex-grow-1" id="${prefix}FiltroLimpiar"><i class="bi bi-x-lg"></i> Limpiar</button>${execBtn}
        </div>
      </div>
    </div>`;
}

export function readFilterParams(prefix = 'req') {
  return {
    buscar: document.getElementById(`${prefix}FiltroBuscar`)?.value.trim() || '',
    codigo: document.getElementById(`${prefix}FiltroBuscar`)?.value.trim() || '',
    estado_actual: document.getElementById(`${prefix}FiltroEstado`)?.value.trim() || '',
    responsable_actual: document.getElementById(`${prefix}FiltroResponsable`)?.value.trim() || '',
    area: document.getElementById(`${prefix}FiltroArea`)?.value.trim() || '',
    fecha_desde: document.getElementById(`${prefix}FiltroFechaDesde`)?.value || '',
    fecha_hasta: document.getElementById(`${prefix}FiltroFechaHasta`)?.value || '',
  };
}

export function clearFilterInputs(prefix = 'req') {
  ['Buscar', 'Estado', 'Responsable', 'Area', 'FechaDesde', 'FechaHasta'].forEach((s) => {
    const el = document.getElementById(`${prefix}Filtro${s}`);
    if (!el) return;
    if (el.tagName === 'SELECT') el.value = '';
    else el.value = '';
  });
}

export function applyBandejaFilters(rows, filters = {}) {
  let list = filterRowsClient(rows, {
    ...filters,
    codigo: filters.buscar || filters.codigo || '',
    codigo_sigamef: filters.buscar || filters.codigo_sigamef || '',
  });
  const buscar = String(filters.buscar || '').toLowerCase();
  if (buscar) {
    list = list.filter((r) => {
      const desc = getRowDescripcionRaw(r).toLowerCase();
      const sig = getSigamefRaw(r).toLowerCase();
      const cod = String(r.codigo || '').toLowerCase();
      return cod.includes(buscar) || desc.includes(buscar) || sig.includes(buscar);
    });
  }
  const desde = filters.fecha_desde ? new Date(filters.fecha_desde) : null;
  const hasta = filters.fecha_hasta ? new Date(`${filters.fecha_hasta}T23:59:59`) : null;
  if (desde || hasta) {
    list = list.filter((r) => {
      const ref = r.fecha_estado_actual || r.created_at;
      if (!ref) return !desde && !hasta;
      const t = new Date(ref).getTime();
      if (Number.isNaN(t)) return false;
      if (desde && t < desde.getTime()) return false;
      if (hasta && t > hasta.getTime()) return false;
      return true;
    });
  }
  return list;
}

export function bandejaTraceHeaders(prefix = 'req', extraColsBeforeAcc = '') {
  const exec = isExecutiveMode(prefix);
  if (exec) {
    return `
      <th class="req-col-req">N° Req</th>
      <th class="req-col-desc">Ítem</th>
      <th class="req-col-estado">Estado</th>
      <th class="req-col-resp">Responsable</th>
      <th class="req-col-dias">Días</th>
      ${extraColsBeforeAcc}
      <th class="req-col-acc"></th>`;
  }
  return `
    <th class="req-col-timeline" title="Timeline">🕒</th>
    <th class="req-col-req">N° Req</th>
    <th class="req-col-tipo">Tipo</th>
    <th class="req-col-desc">Ítem</th>
    <th class="req-col-estado">Estado</th>
    <th class="req-col-resp">Responsable</th>
    <th class="req-col-dias">Días</th>
    ${extraColsBeforeAcc}
    <th class="req-col-acc"></th>`;
}

export function renderCompactRowCells(r, opts = {}) {
  const { prefix = 'req', escFn = esc, obsCount = null, adjCount = 0 } = opts;
  const moduloBandeja = resolveModuloBandeja(prefix, opts);
  const row = enrichReqRow(r);
  const exec = isExecutiveMode(prefix);
  const descFull = getRowDescripcionRaw(row);
  const descShort = truncateText(descFull, 60);
  const sigamef = getSigamefRaw(row);
  const tooltip = buildRowTooltip(row);
  const obsPend = obsCount != null ? obsCount : countObservacionesPendientes(row, moduloBandeja);
  const tipoBadge = row.tipo === 'servicios' ? 'bg-success' : row.tipo === 'locacion' ? 'bg-info' : 'bg-primary';
  const tipoLabel = row.tipo === 'servicios' ? 'Serv.' : row.tipo === 'locacion' ? 'Loc.' : 'Bien';
  const metaChips = `
    <div class="req-meta-chips">
      ${obsPend > 0 ? `<button type="button" class="chip chip-obs chip-obs-btn" data-req-id="${row.id}" title="${obsPend} observación(es) pendiente(s)" onclick="event.stopPropagation()"><i class="bi bi-exclamation-circle-fill"></i> ${obsPend}</button>` : ''}
      ${adjCount > 0
    ? `<button type="button" class="chip chip-adj chip-adj-btn bandeja-adj-count-${row.id}" data-req-id="${row.id}" title="${adjCount} documento(s) adjunto(s)" onclick="event.stopPropagation()"><i class="bi bi-file-earmark-text"></i> ${adjCount}</button>`
    : `<button type="button" class="chip chip-adj chip-adj-btn bandeja-adj-count-${row.id} d-none" data-req-id="${row.id}" onclick="event.stopPropagation()"><i class="bi bi-file-earmark-text"></i> 0</button>`}
    </div>`;

  const reqCell = `
    <div class="req-codigo fw-semibold">${escFn(row.codigo || ('#' + row.id))}</div>
    <div class="req-sigamef small text-muted">SIGAMEF: ${escFn(sigamef || '—')}</div>`;
  const descCell = `
    <span class="req-desc-text" title="${escFn(descFull)}">${escFn(descShort || '—')}</span>${metaChips}`;
  const respCell = `
    <div class="req-resp-name">${escFn(row.responsableActual)}</div>
    <div class="req-resp-role">${escFn(getResponsableRol(row))}</div>`;

  if (exec) {
    return `
      <td title="${escFn(tooltip)}">${reqCell}</td>
      <td title="${escFn(descFull)}">${descCell}</td>
      <td class="req-col-estado-cell">${estadoModernBadge(row.estadoActual, row.estadoActualTexto, row.estado, row, moduloBandeja)}</td>
      <td>${respCell}</td>
      <td class="text-center">${diasBadgeHtml(row)}</td>`;
  }
  return `
    <td class="req-col-timeline">${trazaIconHtml(row.id)}</td>
    <td title="${escFn(tooltip)}">${reqCell}</td>
    <td><span class="badge ${tipoBadge}" style="font-size:0.65rem;">${escFn(tipoLabel)}</span></td>
    <td title="${escFn(descFull)}">${descCell}</td>
    <td class="req-col-estado-cell">${estadoModernBadge(row.estadoActual, row.estadoActualTexto, row.estado, row, moduloBandeja)}</td>
    <td>${respCell}</td>
    <td class="text-center">${diasBadgeHtml(row)}</td>`;
}

export function renderActionMenuCell(id, menuItems = [], hiddenActionsHtml = '') {
  const items = menuItems.filter((m) => m.show !== false);
  return `
    <td class="req-col-acc" onclick="event.stopPropagation()">
      <div class="dropdown">
        <button class="btn btn-sm bandeja-actions-btn dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Acciones">⋮</button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm" data-bs-popper="static">
          ${items.map((m) => `
            <li><button type="button" class="dropdown-item bandeja-menu-act py-1" data-act="${esc(m.act)}" data-id="${id}" ${m.disabled ? 'disabled' : ''}>
              <i class="bi ${m.icon || 'bi-dot'} me-2"></i>${esc(m.label)}
            </button></li>`).join('')}
        </ul>
      </div>
      <div class="visually-hidden bandeja-hidden-actions" data-req-id="${id}">${hiddenActionsHtml}</div>
    </td>`;
}

export function bindActionMenus(container, actMap = {}) {
  if (!container) return;
  container.querySelectorAll('.bandeja-menu-act').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      if (actMap[act]) {
        actMap[act](id, btn);
        return;
      }
      const hidden = btn.closest('td')?.querySelector('.bandeja-hidden-actions');
      const trigger = hidden?.querySelector(`[data-act-trigger="${act}"]`);
      trigger?.click();
    };
  });
}

export function wrapBandejaTable({ containerId, prefix = 'req', headExtraBefore = '', extraColsBeforeAcc = '', bodyHtml }) {
  return `
    <style>${bandejaGlobalStyles()}</style>
    <div class="sgc-bandeja-wrap" id="${containerId}-wrap">
      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle req-list-table mb-0">
          <thead class="table-light">
            <tr>${headExtraBefore}${bandejaTraceHeaders(prefix, extraColsBeforeAcc)}</tr>
          </thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </div>`;
}

export function bindBandejaToolbar({ prefix, onFilter, onClear, onExecutiveToggle }) {
  document.getElementById(`${prefix}FiltroBtn`)?.addEventListener('click', () => onFilter?.());
  document.getElementById(`${prefix}FiltroLimpiar`)?.addEventListener('click', () => {
    clearFilterInputs(prefix);
    onClear?.();
  });
  const execBtn = document.getElementById(`${prefix}VistaEjecutiva`);
  if (execBtn) {
    execBtn.onclick = () => {
      setExecutiveMode(prefix, !isExecutiveMode(prefix));
      execBtn.classList.toggle('active', isExecutiveMode(prefix));
      onExecutiveToggle?.(isExecutiveMode(prefix));
    };
  }
}

export function buildExportRowData(r) {
  const row = enrichReqRow(r);
  const sigamef = getSigamefRaw(row);
  const desc = getRowDescripcionRaw(row);
  return {
    'Código': row.codigo || ('#' + row.id),
    'Tipo': row.tipo === 'servicios' ? 'Servicio' : row.tipo === 'locacion' ? 'Locador' : 'Bien',
    'Código SIGAMEF': sigamef,
    'Descripción': desc,
    'Área usuaria': row.area || '',
    'Centro': row.responsable || row.centro_nombre || '',
    'Monto Total': Number(row.monto_total) || 0,
    'Estado Negocio': row.estado || '',
    'Estado Actual': row.estadoActualTexto || '',
    'Responsable Actual': row.responsableActual || '',
    'Días en Etapa': row.dias_en_estado ?? 0,
    'Fecha Último Movimiento': fmtDateTime(row.fecha_estado_actual || row.fechaEstadoActual),
    'CMN N°': row.cmn || '',
  };
}

export function updateBandejaAdjCount(requerimientoId, count) {
  document.querySelectorAll(`.bandeja-adj-count-${requerimientoId}`).forEach((el) => {
    const n = Number(count) || 0;
    if (n > 0) {
      el.innerHTML = `<i class="bi bi-file-earmark-text"></i> ${n}`;
      el.classList.remove('d-none');
    } else {
      el.classList.add('d-none');
    }
  });
}
