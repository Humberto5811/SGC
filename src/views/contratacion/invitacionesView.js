// Invitaciones — RC8.0: refresh no destructivo, selección persistente, lifecycle/polling limpio
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import {
  enrichReqRow, renderFilterBarHtml, readFilterParams, applyBandejaFilters,
  renderSummaryCardsHtml, updateSummaryCards, renderActionMenuCell, bindActionMenus,
  bindBandejaToolbar, bandejaTableStyles,
  sortBandejaRows, bindSortHandlers, mergeSortParams, sortableTh,
} from '../../utils/trazabilidad.js';
import { invitacionesMenuItems, invitacionesHiddenActions } from '../../utils/bandejaActions.js';
import { loadInvitacionesBandeja } from '../../utils/bandejaRequerimientos.js';
import { usePagination } from '../../utils/paginacion.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import {
  renderBandejaCanonicoEtapaEstadoRespCells,
  renderBandejaCanonicoDiasCell,
  getBandejaCanonicoFechaAsignacion,
} from '../../utils/bandejaExpedienteColumns.js';
import { resolvePedidoSigamef } from '../../utils/bandejaHelpers.js';
import { showSolicitudCotizacionModal, showInvitarProveedoresModal } from '../../utils/invitacionesModals.js';
import {
  bindTrazabilidadButtons, showTrazabilidadModal,
} from '../requerimiento/reqShared.js';
import { openDetailPanel, bindRowDetailPanel } from '../../components/bandejaDetailPanel.js';
import { manageAdjuntos } from '../requerimiento/registroRequerimientoView.js';
import { descargarRequerimientoDesdeInvitaciones } from '../../utils/descargarRequerimientoOriginal.js';
import { formatCronogramaDisplay } from '../../utils/cronogramaDatetime.js';
import { formatDateTimeLima } from '../../utils/dateTimeLima.js';
import {
  createViewLifecycle,
  createRequestSequenceGuard,
  isAbortError,
  createTableSelectionState,
  captureTableViewState,
  restoreTableViewState,
  updateTableViewState,
  hydrateFilterInputs,
  createBackgroundRefreshIndicator,
  startPolling,
  stopPolling,
} from '../../utils/uiState/index.js';

const VIEW_ID = 'invitaciones';
const POLL_ID = 'invitaciones:auto';
const SCROLL_SEL = '#invBandejaWrap';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let allRows = [];
let listFilters = {};
let invListSort = { sort: 'created_at', dir: 'desc' };
const invPagination = usePagination('invitaciones', loadInvitacionesBandeja, { defaultPageSize: 25 });
const solPagination = usePagination('solicitudes', (params) => contratacionesService.listSolicitudesCotizacion(params), { defaultPageSize: 50, pageSizeOptions: [25, 50, 100] });
let currentTab = 'bandeja';

/** Selección persistente (no se reinicia en cada load). */
const selection = createTableSelectionState({
  normalizeId: (id) => String(parseInt(id, 10)),
});
const loadGuard = createRequestSequenceGuard();
let lifecycle = null;
let refreshIndicator = null;
let bandejaShellMounted = false;

function selectedNumericIds() {
  return selection.values().map((id) => parseInt(id, 10)).filter((n) => !Number.isNaN(n));
}

function hasOpenModal() {
  return !!(
    document.querySelector('.modal.show')
    || document.querySelector('.modal.d-block')
    || document.querySelector('.offcanvas.show')
  );
}

function solicitudEstadoBadge(s) {
  const label = s.estado_invitacion || s.invitacion_estado || s.estado || '—';
  const cls = String(label).includes('Enviada') || String(label).includes('ENVIADA')
    ? 'bg-primary'
    : (label === 'Enviado' ? 'bg-success' : 'bg-secondary');
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function fmtCronogramaConsultas(s) {
  const ini = s.consultas_inicio;
  const fin = s.consultas_fin;
  if (!ini && !fin) return '—';
  return `${fmtDt(ini)} — ${fmtDt(fin)}`;
}

function solicitudBandejaRowKey(s) {
  if (s.invitacion_id != null && s.invitacion_id !== '') return `inv-${s.invitacion_id}`;
  return `sc-${s.solicitud_id || s.id}`;
}

function findSolicitudBandejaRow(rows, menuKey) {
  const key = String(menuKey || '');
  if (key.startsWith('inv-')) {
    const invId = key.slice(4);
    return rows.find((r) => String(r.invitacion_id) === invId);
  }
  const scId = key.startsWith('sc-') ? key.slice(3) : key;
  return rows.find((r) => !r.invitacion_id && String(r.solicitud_id || r.id) === String(scId));
}

export function renderInvitacionesView() {
  return `
    <div class="container-fluid actos-bandeja-page inv-bandeja-page sgc-registro-compact">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div class="d-flex flex-wrap align-items-baseline gap-2">
          <h3 class="mb-0 fs-5"><i class="bi bi-envelope"></i> Invitaciones</h3>
          <p class="text-muted mb-0 inv-page-subtitle">Bandeja maestra — expedientes en Invitaciones.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap align-items-center" id="invToolbar">
          <button id="invBtnSC" class="btn btn-sm btn-primary" disabled><i class="bi bi-file-earmark-plus"></i> Crear Solicitud de Cotización</button>
          <button id="invBtnInvitar" class="btn btn-sm btn-success" disabled><i class="bi bi-send"></i> INVITAR</button>
          <span id="invSeleccionados" class="badge bg-secondary align-self-center">0 seleccionados</span>
          <span id="invBgRefreshHost"></span>
        </div>
      </div>
      <ul class="nav nav-tabs mb-2 inv-tabs-compact" id="invTabs">
        <li class="nav-item"><a class="nav-link active" href="#" data-tab="bandeja">📋 Bandeja</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-tab="solicitudes">✉️ Invitaciones (Solicitudes)</a></li>
      </ul>
      <div id="invTrazaSummaryWrap">${renderSummaryCardsHtml('invTrazaSummary', { compact: true })}</div>
      <div id="invFilterWrap">${renderFilterBarHtml('inv', { hideExecutive: true, compact: true })}</div>
      <div id="invContent"><div class="text-muted" id="invBootMsg">Cargando…</div></div>
    </div>`;
}

function setInvTabChrome(tab) {
  const showBandeja = tab === 'bandeja';
  const summary = document.getElementById('invTrazaSummaryWrap');
  const filters = document.getElementById('invFilterWrap');
  const toolbar = document.getElementById('invToolbar');
  if (summary) summary.style.display = showBandeja ? '' : 'none';
  if (filters) filters.style.display = showBandeja ? '' : 'none';
  if (toolbar) toolbar.style.display = showBandeja ? '' : 'none';
}

function invitacionesBandejaHeaders(sortState = null) {
  return `
    <th class="inv-col-select text-center"><input type="checkbox" id="invSelectAll" title="Seleccionar todos"></th>
    <th class="req-col-timeline" title="Timeline">🕒</th>
    ${sortableTh('N° Requerimiento', 'codigo', sortState, 'req-col-req')}
    ${sortableTh('Solicitud de Cotización', 'codigo_solicitud', sortState, 'actos-col-sc')}
    ${sortableTh('Paquete', 'paquete', sortState, 'actos-col-paq')}
    ${sortableTh('Pedido SIGAMEF', 'pedido', sortState, 'actos-col-pedido')}
    ${sortableTh('Código SIGAMEF', 'sigamef', sortState, 'actos-col-sigamef')}
    ${sortableTh('Descripción', 'denominacion', sortState, 'actos-col-desc')}
    ${sortableTh('Centro', 'centro_nombre', sortState, 'actos-col-centro')}
    ${sortableTh('Área Usuaria', 'area', sortState, 'actos-col-area')}
    ${sortableTh('CMN N°', 'cmn', sortState, 'actos-col-cmn')}
    ${sortableTh('Etapa', 'etapa', sortState, 'req-col-etapa')}
    ${sortableTh('Estado', 'estado', sortState, 'req-col-estado-cell')}
    ${sortableTh('Responsable', 'responsable', sortState, 'req-col-resp')}
    ${sortableTh('Fecha Asignación', 'fecha', sortState, 'inv-col-fecha')}
    ${sortableTh('Días', 'dias', sortState, 'req-col-dias')}
    <th class="text-center actos-col-inv-count" title="¿Invitado?">Inv.</th>
    <th class="text-center actos-col-inv-num" title="Número de invitaciones">N° Inv.</th>
    <th class="req-col-acc"></th>`;
}

function getResponsableRolDisplayInv(r) {
  // RC8.7 — legado; la celda usa renderResponsableCellHtml (etapaLabel vigente).
  void r;
  return '';
}

function renderInvBandejaRowCells(r, opts = {}) {
  const { escFn = esc } = opts;
  const sigamef = (() => {
    try {
      const p = JSON.parse(r.payload || '{}');
      const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
      if (items?.length) return items.map((it) => it.item_bien || '').filter(Boolean).join(', ');
    } catch (_) {}
    return '';
  })();
  const nombreItem = (() => {
    try {
      const p = JSON.parse(r.payload || '{}');
      const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
      if (Array.isArray(items) && items.length) {
        const names = items.map((it) => it.nombre_item || '').filter(Boolean);
        if (names.length) return names.join(', ');
      }
    } catch (_) {}
    return r.denominacion || '';
  })();
  const paqBadge = r.codigo_paquete
    ? `<span class="badge bg-success">${escFn(r.codigo_paquete)}</span>`
    : '<span class="text-muted small">Sin paquete</span>';
  const fechaAsig = getBandejaCanonicoFechaAsignacion(r);
  const fechaFmt = fechaAsig ? String(fechaAsig).slice(0, 16).replace('T', ' ') : '—';
  const pedidos = resolvePedidoSigamef(r);
  const scCode = r.codigo_solicitud || r.codigoSolicitud || '';

  return `
    <td class="text-center"><button type="button" class="btn btn-link btn-sm p-0 req-traza text-secondary" data-id="${r.id}" onclick="event.stopPropagation()"><i class="bi bi-clock-history"></i></button></td>
    <td class="req-col-req"><strong class="text-truncate d-inline-block" style="max-width:100%;" title="${escFn(r.codigo || ('#' + r.id))}">${escFn(r.codigo || ('#' + r.id))}</strong></td>
    <td class="actos-col-sc small"><span class="d-inline-block text-truncate" style="max-width:100%;" title="${escFn(scCode)}"><strong>${scCode ? escFn(scCode) : '<span class="text-muted">—</span>'}</strong></span></td>
    <td class="actos-col-paq">${paqBadge}</td>
    <td class="actos-col-pedido small"><span class="d-inline-block text-truncate" style="max-width:100%;" title="${escFn(pedidos)}">${escFn(pedidos)}</span></td>
    <td class="actos-col-sigamef small"><span class="d-inline-block text-truncate" style="max-width:100%;" title="${escFn(sigamef || '—')}">${escFn(sigamef || '—')}</span></td>
    <td class="actos-col-desc"><span class="req-desc-text" title="${escFn(nombreItem)}">${escFn(nombreItem)}</span></td>
    <td class="actos-col-centro"><span class="req-centro-text" title="${escFn(r.centro_nombre || r.centro || '—')}">${escFn(r.centro_nombre || r.centro || '—')}</span></td>
    <td class="actos-col-area"><span class="req-area-text" title="${escFn(r.area || '—')}">${escFn(r.area || '—')}</span></td>
    <td class="actos-col-cmn small">${escFn(r.cmn || '—')}</td>
    ${renderBandejaCanonicoEtapaEstadoRespCells(r)}
    <td class="inv-col-fecha small text-muted">${escFn(fechaFmt)}</td>
    <td class="text-center req-col-dias">${renderBandejaCanonicoDiasCell(r, escFn)}</td>`;
}

function renderInvExtraCells(r) {
  const num = r.num_solicitudes_cotizacion ?? r.cantidad_invitaciones ?? r.total_invitaciones ?? 0;
  const invitado = num > 0 || r.tiene_solicitud_cotizacion || r.tiene_invitacion;
  const badge = invitado
    ? '<span class="badge bg-success">Sí</span>'
    : '<span class="badge bg-secondary">No</span>';
  return `<td class="text-center actos-col-inv-count">${badge}</td><td class="text-center actos-col-inv-num"><strong>${num}</strong></td>`;
}

function updateSelectionUi() {
  const n = selection.size;
  const badge = document.getElementById('invSeleccionados');
  if (badge) badge.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
  const btnInv = document.getElementById('invBtnInvitar');
  const btnSc = document.getElementById('invBtnSC');
  if (btnInv) btnInv.disabled = n === 0;
  if (btnSc) btnSc.disabled = n === 0;
}

function buildBandejaRowHtml(r) {
  const checked = selection.has(r.id) ? 'checked' : '';
  return `
    <tr data-req-id="${r.id}" data-row-id="${r.id}" data-selection-id="${r.id}">
      <td class="inv-col-select" onclick="event.stopPropagation()"><input type="checkbox" class="inv-select" data-id="${r.id}" data-selection-id="${r.id}" ${checked}></td>
      ${renderInvBandejaRowCells(r, { escFn: esc })}
      ${renderInvExtraCells(r)}
      ${renderActionMenuCell(r.id, invitacionesMenuItems(r), invitacionesHiddenActions(r))}
    </tr>`;
}

function ensureBandejaShell() {
  const cont = document.getElementById('invContent');
  if (!cont) return null;
  let wrap = document.getElementById('invBandejaWrap');
  if (wrap && document.getElementById('invBandejaBody')) {
    bandejaShellMounted = true;
    return cont;
  }
  cont.innerHTML = `
    <div class="inv-tab-panel" id="invBandejaPanel">
      <div class="sgc-bandeja-wrap" id="invBandejaOuter">
        <div class="table-responsive inv-bandeja-wrap actos-bandeja-wrap" id="invBandejaWrap">
          <table class="table table-sm table-hover table-bordered req-list-table mb-0">
            <thead class="table-light" id="invBandejaHead"><tr>${invitacionesBandejaHeaders(invListSort)}</tr></thead>
            <tbody id="invBandejaBody"></tbody>
          </table>
        </div>
      </div>
      <div id="invEmptyMsg" class="alert alert-light border d-none">No hay expedientes en Invitaciones.</div>
    </div>`;
  bandejaShellMounted = true;
  return cont;
}

function paintBandejaRows(rows) {
  const head = document.getElementById('invBandejaHead');
  const body = document.getElementById('invBandejaBody');
  const empty = document.getElementById('invEmptyMsg');
  const wrap = document.getElementById('invBandejaWrap');
  const outer = document.getElementById('invBandejaOuter');
  if (!body || !head) return;

  head.innerHTML = `<tr>${invitacionesBandejaHeaders(invListSort)}</tr>`;

  if (!rows.length) {
    body.innerHTML = '';
    if (wrap) wrap.classList.add('d-none');
    if (empty) empty.classList.remove('d-none');
    if (outer) {
      const pag = outer.querySelector(':scope > .sgc-pagination-controls');
      if (pag) pag.remove();
    }
    return;
  }

  if (wrap) wrap.classList.remove('d-none');
  if (empty) empty.classList.add('d-none');
  body.innerHTML = rows.map(buildBandejaRowHtml).join('');
}

function bindBandejaShellEvents(cont) {
  if (!cont) return;
  bindTrazabilidadButtons(cont);
  bindRowDetailPanel(cont, allRows);
  bindActionMenus(cont, {
    detail: (id) => {
      openDetailPanel(allRows.find((r) => String(r.id) === String(id)));
    },
    obs: (id) => handleObservacion(id),
    timeline: (id) => cont.querySelector(`.req-traza[data-id="${id}"]`)?.click(),
    attach: (id) => manageAdjuntos(id, true),
    download: (id) => {
      descargarRequerimientoDesdeInvitaciones(id).catch((e) => alert(e.message || String(e)));
    },
    crearSc: (id) => handleCrearSC([parseInt(id, 10)]),
  });

  bindSortHandlers(cont.querySelector('#invBandejaWrap'), (p) => loadBandeja(p, true), {
    getSort: () => invListSort,
  });

  const selectAll = cont.querySelector('#invSelectAll');
  if (selectAll) {
    selectAll.onchange = (e) => {
      cont.querySelectorAll('.inv-select:not(:disabled)').forEach((cb) => {
        cb.checked = e.target.checked;
        if (e.target.checked) selection.select(cb.dataset.id);
        else selection.deselect(cb.dataset.id);
      });
      updateSelectionUi();
      persistViewMeta();
    };
  }

  cont.querySelectorAll('.inv-select').forEach((cb) => {
    cb.onchange = () => {
      if (cb.checked) selection.select(cb.dataset.id);
      else selection.deselect(cb.dataset.id);
      updateSelectionUi();
      persistViewMeta();
    };
  });

  selection.restoreCheckboxes(cont, '.inv-select', (el) => el.dataset.id);
  updateSelectionUi();
  invPagination.renderControls('invBandejaOuter', () => loadBandeja({}, false));
}

function persistViewMeta() {
  updateTableViewState(VIEW_ID, {
    filters: { ...listFilters },
    sortField: invListSort.sort,
    sortDirection: invListSort.dir,
    activeTab: currentTab,
    page: invPagination.state.page,
    pageSize: invPagination.state.pageSize,
    selectedIds: selection.values(),
  });
}

async function loadBandeja(sortOverride = {}, resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  currentTab = 'bandeja';
  setInvTabChrome('bandeja');

  const contRoot = document.getElementById('invContent');
  if (!contRoot) return;

  const hadShell = !!document.getElementById('invBandejaBody');
  const isBackground = hadShell && allRows.length > 0 && !resetPage && !Object.keys(sortOverride || {}).length;

  if (hadShell) {
    captureTableViewState(VIEW_ID, { scrollSelector: SCROLL_SEL });
  }

  ensureBandejaShell();
  const request = loadGuard.begin();
  if (lifecycle) lifecycle.addAbortController(request.controller);

  if (isBackground) refreshIndicator?.show('Actualizando…');
  else if (!hadShell && !allRows.length) {
    const boot = document.getElementById('invBootMsg');
    if (boot) boot.textContent = 'Cargando…';
  }

  try {
    invListSort = mergeSortParams(invListSort, sortOverride);
    if (resetPage) invPagination.resetPage();
    const result = await invPagination.loadData({
      ...listFilters,
      sort: invListSort.sort,
      dir: invListSort.dir,
    }, resetPage);

    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    let rows = (result.data || []).map(enrichReqRow);
    rows = applyBandejaFilters(rows, listFilters);
    rows = sortBandejaRows(rows, invListSort.sort, invListSort.dir);
    allRows = rows;
    updateSummaryCards(rows, 'invTrazaSummary');

    // Conservar selección: solo reconciliar IDs ya no presentes / no elegibles
    const validIds = rows.map((r) => r.id);
    selection.reconcile(validIds);
    // NO: selectedIds = new Set();

    paintBandejaRows(rows);
    bindBandejaShellEvents(document.getElementById('invContent'));
    restoreTableViewState(VIEW_ID, { scrollSelector: SCROLL_SEL });
    persistViewMeta();
    refreshIndicator?.hide();
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    if (hadShell && allRows.length) {
      refreshIndicator?.error('No se pudo actualizar. Se conservan los datos actuales.');
    } else {
      const cont = document.getElementById('invContent');
      if (cont) cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
      bandejaShellMounted = false;
    }
  }
}

function fmtDt(v) {
  if (!v) return '—';
  return esc(formatCronogramaDisplay(v));
}

/** Fecha de invitación / publicación real (timestamptz → America/Lima). */
function fmtInvitacionDt(v) {
  if (!v) return '—';
  return esc(formatDateTimeLima(v));
}

function switchToSolicitudesTab() {
  document.querySelectorAll('#invTabs .nav-link').forEach((l) => {
    l.classList.toggle('active', l.dataset.tab === 'solicitudes');
  });
  solPagination.resetPage();
  loadSolicitudesTab(true);
}

async function loadSolicitudesTab(resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  currentTab = 'solicitudes';
  setInvTabChrome('solicitudes');
  bandejaShellMounted = false;
  const cont = document.getElementById('invContent');
  if (!cont) return;

  const request = loadGuard.begin();
  if (lifecycle) lifecycle.addAbortController(request.controller);

  const keepPrevious = cont.querySelector('#invSolOuter');
  if (!keepPrevious) {
    cont.innerHTML = '<div class="text-muted">Cargando solicitudes…</div>';
  } else {
    refreshIndicator?.show('Actualizando…');
  }

  try {
    if (resetPage) solPagination.resetPage();
    const result = await solPagination.loadData({}, resetPage);
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    const rows = result.data || [];
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay solicitudes de cotización registradas.</div>';
      refreshIndicator?.hide();
      return;
    }
    cont.innerHTML = `
      <div class="inv-tab-panel">
        <div class="sgc-bandeja-wrap" id="invSolOuter">
        <div class="table-responsive inv-bandeja-wrap actos-bandeja-wrap">
        <table class="table table-sm table-hover table-bordered req-list-table mb-0">
          <thead class="table-light"><tr>
            <th>Solicitud de Cotización</th>
            <th class="text-center">N° Inv.</th>
            <th>N° Requerimiento</th>
            <th>Descripción de la contratación</th>
            <th>Proveedor</th>
            <th>Estado invitación</th>
            <th>Fecha envío</th>
            <th>Consultas (cronograma)</th>
            <th>Fecha culminación</th>
            <th class="text-center">Cotizaciones</th>
            <th class="req-col-acc"></th>
          </tr></thead>
          <tbody>${rows.map((s) => `
            <tr data-sol-id="${s.solicitud_id || s.id}" data-invitacion-id="${s.invitacion_id ?? ''}">
              <td><strong>${esc(s.codigo)}</strong></td>
              <td class="text-center">${s.invitacion_id != null ? esc(String(s.nro_invitacion ?? '—')) : '—'}</td>
              <td><strong>${esc(s.requerimiento_codigo || '—')}</strong></td>
              <td>${esc(s.descripcion_contratacion || s.denominacion || s.objeto || '—')}</td>
              <td class="small">${s.proveedor_ruc
    ? `<span class="text-muted">${esc(s.proveedor_ruc)}</span><br>${esc(s.proveedor_razon_social || '')}`
    : '—'}</td>
              <td>${solicitudEstadoBadge(s)}</td>
              <td class="small">${fmtInvitacionDt(s.fecha_envio || s.fecha_ultimo_envio || s.fecha_publicacion)}</td>
              <td class="small">${fmtCronogramaConsultas(s)}</td>
              <td class="small">${fmtDt(s.fecha_culminacion || s.cotizaciones_fin)}</td>
              <td class="text-center">${s.cotizaciones_recibidas ?? 0}</td>
              ${renderActionMenuCell(solicitudBandejaRowKey(s), solicitudesMenuItems(s), [])}
            </tr>`).join('')}</tbody>
        </table>
        </div>
        </div>
      </div>`;

    solPagination.renderControls('invSolOuter', () => loadSolicitudesTab(false));
    bindActionMenus(cont, {
      detalle: (id) => handleSolicitudAction('detalle', findSolicitudBandejaRow(rows, id)),
      timeline: (id) => handleSolicitudAction('timeline', findSolicitudBandejaRow(rows, id)),
      editar: (id) => handleSolicitudAction('editar', findSolicitudBandejaRow(rows, id)),
      eliminar: (id) => handleSolicitudAction('eliminar', findSolicitudBandejaRow(rows, id)),
      invitar: (id) => handleSolicitudAction('invitar', findSolicitudBandejaRow(rows, id)),
    });
    persistViewMeta();
    refreshIndicator?.hide();
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (keepPrevious) refreshIndicator?.error();
    else cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

function solicitudesMenuItems() {
  return [
    { act: 'detalle', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'timeline', label: 'Timeline', icon: 'bi-clock-history' },
    { act: 'editar', label: 'Editar', icon: 'bi-pencil' },
    { act: 'eliminar', label: 'Eliminar', icon: 'bi-trash' },
    { act: 'invitar', label: 'Invitar', icon: 'bi-send' },
  ];
}

async function handleSolicitudAction(act, s) {
  if (!s) return;
  const id = s.solicitud_id || s.id;
  const invitacionId = s.invitacion_id != null && s.invitacion_id !== '' ? Number(s.invitacion_id) : null;
  if (act === 'detalle' || act === 'editar') {
    const reqIds = s.requerimiento_id ? [s.requerimiento_id] : [];
    await showSolicitudCotizacionModal(reqIds, [], {
      solicitudId: id,
      invitacionId,
      initialTab: 'general',
    });
    loadSolicitudesTab();
    return;
  }
  if (act === 'timeline') {
    if (s.requerimiento_id) await showTrazabilidadModal(s.requerimiento_id);
    else alert('Sin requerimiento asociado para trazabilidad.');
    return;
  }
  if (act === 'eliminar') {
    if (!confirm(`¿Eliminar la solicitud ${s.codigo}?`)) return;
    try {
      await contratacionesService.eliminarSolicitudCotizacion(id);
      alert('Solicitud eliminada.');
      loadSolicitudesTab();
      // No limpiar selección de bandeja aquí
    } catch (err) { alert(err.message); }
    return;
  }
  if (act === 'invitar') {
    await showInvitarProveedoresModal(id);
    loadSolicitudesTab();
  }
}

async function handleObservacion(id) {
  const { handleBandejaObservaciones } = await import('../../components/modalObservaciones.js');
  const userName = getUserDisplayName(authService.getCurrentUser());
  await handleBandejaObservaciones(id, allRows, {
    submoduloLabel: 'Invitaciones',
    puedeObservar: () => true,
    onObservar: async (reqId, data) => {
      await contratacionesService.observarInvitaciones(reqId, {
        ...data,
        motivo: data.motivo,
        usuario: data.usuario || userName,
        origen_submodulo: data.origen_submodulo || 'Invitaciones',
      });
    },
    onAdjuntos: (rid) => manageAdjuntos(rid, true),
    onReload: () => loadBandeja(),
    bandejaPrefix: 'inv',
  });
}

async function handleCrearSC(ids) {
  const numIds = (ids || []).map((id) => parseInt(id, 10));
  const rows = allRows.filter((r) => numIds.includes(r.id));
  const result = await showSolicitudCotizacionModal(numIds, rows);
  if (!result?.saved) return;
  selection.removeMany(numIds);
  updateSelectionUi();
  loadCurrentTab();
  switchToSolicitudesTab();
  window.dispatchEvent(new CustomEvent('sgc:invitaciones-updated'));
}

async function handleInvitar() {
  const ids = selectedNumericIds();
  if (!ids.length) return;
  const row = allRows.find((r) => r.id === ids[0]);
  const solicitudId = row?.solicitud_id || null;
  if (!solicitudId) {
    alert('Primero debe crear una Solicitud de Cotización para los requerimientos seleccionados.');
    return;
  }
  await showInvitarProveedoresModal(solicitudId);
  selection.removeMany(ids);
  updateSelectionUi();
  loadCurrentTab();
  window.dispatchEvent(new CustomEvent('sgc:invitaciones-updated'));
}

function softRefreshCurrentTab() {
  if (lifecycle && !lifecycle.isActive()) return;
  if (!document.querySelector('.inv-bandeja-page')) return;
  if (hasOpenModal()) {
    // Actualización en segundo plano sin cerrar modal: solo bandeja si está montada
    if (currentTab === 'bandeja' && document.getElementById('invBandejaBody')) {
      loadBandeja({}, false);
    }
    return;
  }
  loadCurrentTab(false);
}

export function initInvitacionesView() {
  document.getElementById('invVistaEjecutiva')?.remove();

  lifecycle = createViewLifecycle(VIEW_ID);
  bandejaShellMounted = false;
  refreshIndicator = createBackgroundRefreshIndicator('#invBgRefreshHost', { id: 'invBgRefresh' });

  // Rehidratar filtros / tab desde estado persistente del módulo
  hydrateFilterInputs('inv', listFilters);
  if (currentTab === 'solicitudes') {
    document.querySelectorAll('#invTabs .nav-link').forEach((l) => {
      l.classList.toggle('active', l.dataset.tab === 'solicitudes');
    });
  }

  bindBandejaToolbar({
    prefix: 'inv',
    onFilter: () => {
      listFilters = readFilterParams('inv');
      persistViewMeta();
      loadCurrentTab(true);
    },
    onClear: () => {
      listFilters = {};
      persistViewMeta();
      loadCurrentTab(true);
    },
  });

  const onUpdated = () => softRefreshCurrentTab();
  lifecycle.addEventListener(window, 'sgc:invitaciones-updated', onUpdated);

  lifecycle.addEventListener(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') softRefreshCurrentTab();
  });

  stopPolling(POLL_ID);
  startPolling(POLL_ID, () => softRefreshCurrentTab(), 45000, {
    containerSelector: '.inv-bandeja-page',
    skipIfInteracting: () => false,
  });
  lifecycle.addCleanup(() => stopPolling(POLL_ID));
  lifecycle.addCleanup(() => loadGuard.abortCurrent());

  document.getElementById('invBtnSC')?.addEventListener('click', () => handleCrearSC(selectedNumericIds()));
  document.getElementById('invBtnInvitar')?.addEventListener('click', () => handleInvitar());

  document.querySelectorAll('#invTabs .nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('#invTabs .nav-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      currentTab = link.dataset.tab || 'bandeja';
      persistViewMeta();
      loadCurrentTab();
    });
  });

  updateSelectionUi();
  loadCurrentTab();
}

function loadCurrentTab(resetPage = false) {
  const active = document.querySelector('#invTabs .nav-link.active')?.dataset?.tab || currentTab || 'bandeja';
  currentTab = active;
  if (active === 'solicitudes') loadSolicitudesTab(resetPage);
  else loadBandeja({}, resetPage);
}
