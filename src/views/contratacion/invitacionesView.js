// Invitaciones — bandeja maestra + pestaña solicitudes (diseño alineado a Programación)
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
import { estadoModernBadge } from '../../utils/bandejaUi.js';
import { getRolDisplayFromRow } from '../../utils/observacionDestino.js';
import { resolvePedidoSigamef } from '../../utils/bandejaHelpers.js';
import { showSolicitudCotizacionModal, showInvitarProveedoresModal } from '../../utils/invitacionesModals.js';
import {
  bindTrazabilidadButtons, showObservacionDirigidaModal, showTrazabilidadModal,
} from '../requerimiento/reqShared.js';
import { openDetailPanel, bindRowDetailPanel } from '../../components/bandejaDetailPanel.js';
import { printRequerimiento, manageAdjuntos } from '../requerimiento/registroRequerimientoView.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let allRows = [];
let selectedIds = new Set();
let listFilters = {};
let invListSort = { sort: 'created_at', dir: 'desc' };
const invPagination = usePagination('invitaciones', loadInvitacionesBandeja, { defaultPageSize: 25 });
const solPagination = usePagination('solicitudes', (params) => contratacionesService.listSolicitudesCotizacion(params), { defaultPageSize: 50, pageSizeOptions: [25, 50, 100] });
let currentTab = 'bandeja';

function solicitudEstadoBadge(s) {
  const label = s.estado_invitacion || s.estado || '—';
  const cls = String(label).includes('Enviada') ? 'bg-primary' : (label === 'Enviado' ? 'bg-success' : 'bg-secondary');
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

export function renderInvitacionesView() {
  return `
    <div class="container-fluid actos-bandeja-page inv-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}
        .inv-bandeja-page { overflow: visible; padding-bottom: 2rem; }
        .inv-bandeja-wrap .table-responsive { overflow-x: auto; }
        .inv-bandeja-wrap .actos-col-centro { min-width: 120px; max-width: 180px; }
        .inv-bandeja-wrap .actos-col-area { min-width: 120px; max-width: 180px; }
      </style>
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h3 class="mb-1"><i class="bi bi-envelope"></i> Invitaciones</h3>
          <p class="text-muted mb-0">Bandeja maestra — expedientes en Invitaciones con trazabilidad completa.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap align-items-center" id="invToolbar">
          <button id="invBtnSC" class="btn btn-sm btn-primary" disabled><i class="bi bi-file-earmark-plus"></i> Crear Solicitud de Cotización</button>
          <button id="invBtnInvitar" class="btn btn-sm btn-success" disabled><i class="bi bi-send"></i> INVITAR</button>
          <span id="invSeleccionados" class="badge bg-secondary align-self-center">0 seleccionados</span>
        </div>
      </div>
      <hr/>
      <ul class="nav nav-tabs mb-3" id="invTabs">
        <li class="nav-item"><a class="nav-link active" href="#" data-tab="bandeja">📋 Bandeja</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-tab="solicitudes">✉️ Invitaciones (Solicitudes)</a></li>
      </ul>
      <div id="invTrazaSummaryWrap">${renderSummaryCardsHtml('invTrazaSummary')}</div>
      <div id="invFilterWrap">${renderFilterBarHtml('inv', { hideExecutive: true })}</div>
      <div id="invContent"><div class="text-muted">Cargando…</div></div>
    </div>`;
}

function setInvTabChrome(tab) {
  const showBandeja = tab === 'bandeja';
  document.getElementById('invTrazaSummaryWrap').style.display = showBandeja ? '' : 'none';
  document.getElementById('invFilterWrap').style.display = showBandeja ? '' : 'none';
  document.getElementById('invToolbar').style.display = showBandeja ? '' : 'none';
}

function invitacionesBandejaHeaders(sortState = null) {
  return `
    <th style="width:35px;"><input type="checkbox" id="invSelectAll" title="Seleccionar todos"></th>
    <th class="req-col-timeline" title="Timeline">🕒</th>
    ${sortableTh('N° Requerimiento', 'codigo', sortState)}
    ${sortableTh('Solicitud de Cotización', 'codigo_solicitud', sortState, 'actos-col-sc')}
    ${sortableTh('Paquete', 'paquete', sortState, 'actos-col-paq')}
    ${sortableTh('Pedido SIGAMEF', 'pedido', sortState, 'actos-col-pedido')}
    ${sortableTh('Código SIGAMEF', 'sigamef', sortState, 'actos-col-sigamef')}
    ${sortableTh('Descripción', 'denominacion', sortState, 'actos-col-desc')}
    ${sortableTh('Centro', 'centro_nombre', sortState, 'actos-col-centro')}
    ${sortableTh('Área Usuaria', 'area', sortState, 'actos-col-area')}
    ${sortableTh('Estado Actual', 'estado', sortState)}
    ${sortableTh('Responsable Actual', 'responsable', sortState)}
    ${sortableTh('Fecha Asignación', 'fecha', sortState)}
    ${sortableTh('Días', 'dias', sortState)}
    <th class="text-center actos-col-inv-count" style="min-width:72px;">Invitado</th>
    <th class="text-center actos-col-inv-count" style="min-width:100px;">N° Invitaciones</th>
    <th class="req-col-acc"></th>`;
}

function getResponsableRolDisplayInv(r) {
  const resp = String(r?.responsable_actual || r?.responsableActual || '').trim();
  if (/coordinador.*contratos/i.test(resp)) return 'Coordinador CM';
  if (/analista.*contratos/i.test(resp) || /\banalista\b/i.test(resp)) return 'Analista CM';
  return getRolDisplayFromRow(r);
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
  const fechaAsig = r.fecha_estado_actual || r.fechaEstadoActual || '';
  const fechaFmt = fechaAsig ? String(fechaAsig).slice(0, 16).replace('T', ' ') : '—';
  const dias = r.dias_en_estado ?? r.diasEnEstado ?? 0;
  const resp = r.responsable_actual || r.responsableActual || '—';
  const rol = getResponsableRolDisplayInv(r);
  const estadoBadgeHtml = estadoModernBadge(r, 'Coordinación CM');
  const pedidos = resolvePedidoSigamef(r);
  const scCode = r.codigo_solicitud || r.codigoSolicitud || '';

  return `
    <td class="text-center"><button type="button" class="btn btn-link btn-sm p-0 req-traza text-secondary" data-id="${r.id}" onclick="event.stopPropagation()"><i class="bi bi-clock-history"></i></button></td>
    <td><strong>${escFn(r.codigo || ('#' + r.id))}</strong></td>
    <td class="actos-col-sc small"><strong>${scCode ? escFn(scCode) : '<span class="text-muted">—</span>'}</strong></td>
    <td class="actos-col-paq">${paqBadge}</td>
    <td class="actos-col-pedido small">${escFn(pedidos)}</td>
    <td class="actos-col-sigamef small">${escFn(sigamef || '—')}</td>
    <td class="actos-col-desc"><span class="req-desc-text" title="${escFn(nombreItem)}">${escFn(nombreItem)}</span></td>
    <td class="actos-col-centro"><span class="req-centro-text" title="${escFn(r.centro_nombre || r.centro || '—')}">${escFn(r.centro_nombre || r.centro || '—')}</span></td>
    <td class="actos-col-area">${escFn(r.area || '—')}</td>
    <td class="req-col-estado-cell">${estadoBadgeHtml}</td>
    <td><div class="req-resp-name">${escFn(resp)}</div><div class="req-resp-role">${escFn(rol)}</div></td>
    <td class="small text-muted">${escFn(fechaFmt)}</td>
    <td class="text-center"><span class="badge badge-dias-mod" style="background:${dias > 10 ? '#dc3545' : dias > 5 ? '#fd7e14' : '#198754'};color:#fff;">${dias}d</span></td>`;
}

function renderInvExtraCells(r) {
  const num = r.num_solicitudes_cotizacion ?? r.cantidad_invitaciones ?? r.total_invitaciones ?? 0;
  const invitado = num > 0 || r.tiene_solicitud_cotizacion || r.tiene_invitacion;
  const badge = invitado
    ? '<span class="badge bg-success">Sí</span>'
    : '<span class="badge bg-secondary">No</span>';
  return `<td class="text-center">${badge}</td><td class="text-center"><strong>${num}</strong></td>`;
}

function updateSelectionUi() {
  const n = selectedIds.size;
  const badge = document.getElementById('invSeleccionados');
  if (badge) badge.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
  const btnInv = document.getElementById('invBtnInvitar');
  const btnSc = document.getElementById('invBtnSC');
  if (btnInv) btnInv.disabled = n === 0;
  if (btnSc) btnSc.disabled = n === 0;
}

async function loadBandeja(sortOverride = {}, resetPage = false) {
  currentTab = 'bandeja';
  setInvTabChrome('bandeja');
  const cont = document.getElementById('invContent');
  if (!cont) return;
  try {
    cont.innerHTML = '<div class="text-muted">Cargando…</div>';
    invListSort = mergeSortParams(invListSort, sortOverride);
    if (resetPage) invPagination.resetPage();
    const result = await invPagination.loadData({
      ...listFilters,
      sort: invListSort.sort,
      dir: invListSort.dir,
    }, resetPage);
    let rows = (result.data || []).map(enrichReqRow);
    rows = applyBandejaFilters(rows, listFilters);
    rows = sortBandejaRows(rows, invListSort.sort, invListSort.dir);
    allRows = rows;
    updateSummaryCards(rows, 'invTrazaSummary');
    selectedIds = new Set();
    updateSelectionUi();

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay expedientes en Invitaciones.</div>';
      return;
    }

    const tbody = rows.map((r) => `
      <tr data-req-id="${r.id}">
        <td onclick="event.stopPropagation()"><input type="checkbox" class="inv-select" data-id="${r.id}"></td>
        ${renderInvBandejaRowCells(r, { escFn: esc })}
        ${renderInvExtraCells(r)}
        ${renderActionMenuCell(r.id, invitacionesMenuItems(r), invitacionesHiddenActions(r))}
      </tr>`).join('');

    cont.innerHTML = `
      <div class="inv-tab-panel">
      <div class="sgc-bandeja-wrap" id="invBandejaOuter">
      <div class="table-responsive inv-bandeja-wrap actos-bandeja-wrap" id="invBandejaWrap">
        <table class="table table-sm table-hover table-bordered req-list-table mb-0">
          <thead class="table-light"><tr>${invitacionesBandejaHeaders(invListSort)}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
      </div>
      </div>`;

    bindBandejaEvents(cont);
    bindSortHandlers(cont.querySelector('#invBandejaWrap'), (p) => loadBandeja(p, true), {
      getSort: () => invListSort,
    });
    invPagination.renderControls('invBandejaOuter', () => loadBandeja({}, false));
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

function fmtDt(v) {
  if (!v) return '—';
  return esc(String(v).slice(0, 16).replace('T', ' '));
}

function switchToSolicitudesTab() {
  document.querySelectorAll('#invTabs .nav-link').forEach((l) => {
    l.classList.toggle('active', l.dataset.tab === 'solicitudes');
  });
  solPagination.resetPage();
  loadSolicitudesTab(true);
}

async function loadSolicitudesTab(resetPage = false) {
  currentTab = 'solicitudes';
  setInvTabChrome('solicitudes');
  const cont = document.getElementById('invContent');
  if (!cont) return;
  try {
    cont.innerHTML = '<div class="text-muted">Cargando solicitudes…</div>';
    if (resetPage) solPagination.resetPage();
    const result = await solPagination.loadData({}, resetPage);
    const rows = result.data || [];
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay solicitudes de cotización registradas.</div>';
      return;
    }
    cont.innerHTML = `
      <div class="inv-tab-panel">
        <div class="sgc-bandeja-wrap" id="invSolOuter">
        <div class="table-responsive inv-bandeja-wrap actos-bandeja-wrap">
        <table class="table table-sm table-hover table-bordered req-list-table mb-0">
          <thead class="table-light"><tr>
            <th>N° Solicitud</th>
            <th>Descripción de la contratación</th>
            <th>Estado de invitación</th>
            <th>Fecha publicación</th>
            <th>Fecha culminación</th>
            <th class="text-center">Cant. proveedores</th>
            <th class="text-center">Cant. cotizaciones</th>
            <th class="req-col-acc"></th>
          </tr></thead>
          <tbody>${rows.map((s) => `
            <tr data-sol-id="${s.id}">
              <td><strong>${esc(s.codigo)}</strong></td>
              <td>${esc(s.descripcion_contratacion || s.denominacion || s.objeto || '—')}</td>
              <td>${solicitudEstadoBadge(s)}</td>
              <td class="small">${fmtDt(s.fecha_publicacion)}</td>
              <td class="small">${fmtDt(s.fecha_culminacion || s.cotizaciones_fin)}</td>
              <td class="text-center">${s.cantidad_proveedores ?? s.invitados ?? 0}</td>
              <td class="text-center">${s.cotizaciones_recibidas ?? 0}</td>
              ${renderActionMenuCell(s.id, solicitudesMenuItems(s), [])}
            </tr>`).join('')}</tbody>
        </table>
        </div>
        </div>
      </div>`;

    solPagination.renderControls('invSolOuter', () => loadSolicitudesTab(false));

    bindActionMenus(cont, {
      detalle: (id) => handleSolicitudAction('detalle', rows.find((r) => String(r.id) === String(id))),
      timeline: (id) => handleSolicitudAction('timeline', rows.find((r) => String(r.id) === String(id))),
      editar: (id) => handleSolicitudAction('editar', rows.find((r) => String(r.id) === String(id))),
      eliminar: (id) => handleSolicitudAction('eliminar', rows.find((r) => String(r.id) === String(id))),
      invitar: (id) => handleSolicitudAction('invitar', rows.find((r) => String(r.id) === String(id))),
    });
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

function solicitudesMenuItems(s) {
  return [
    { act: 'detalle', label: 'Ver detalle', icon: 'bi-eye' },
    { act: 'timeline', label: 'Timeline', icon: 'bi-clock-history' },
    { act: 'editar', label: 'Editar', icon: 'bi-pencil' },
    { act: 'eliminar', label: 'Eliminar', icon: 'bi-trash' },
    { act: 'invitar', label: 'Invitar', icon: 'bi-send' },
  ];
}

async function handleSolicitudAction(act, s) {
  const id = s.id;
  if (act === 'detalle' || act === 'editar') {
    const reqIds = s.requerimiento_id ? [s.requerimiento_id] : [];
    await showSolicitudCotizacionModal(reqIds, [], { solicitudId: id, initialTab: act === 'editar' ? 'general' : 'general' });
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
      loadBandeja();
    } catch (err) { alert(err.message); }
    return;
  }
  if (act === 'invitar') {
    await showInvitarProveedoresModal(id);
    loadSolicitudesTab();
  }
}

function bindBandejaEvents(cont) {
  bindTrazabilidadButtons(cont);
  bindRowDetailPanel(cont, allRows);
  bindActionMenus(cont, {
    detail: (id) => {
      openDetailPanel(allRows.find((r) => String(r.id) === String(id)));
    },
    obs: (id) => handleObservacion(id),
    timeline: (id) => cont.querySelector(`.req-traza[data-id="${id}"]`)?.click(),
    attach: (id) => manageAdjuntos(id, true),
    download: (id) => printRequerimiento(id),
    crearSc: (id) => handleCrearSC([parseInt(id, 10)]),
  });

  cont.querySelector('#invSelectAll')?.addEventListener('change', (e) => {
    cont.querySelectorAll('.inv-select:not(:disabled)').forEach((cb) => {
      cb.checked = e.target.checked;
      const id = parseInt(cb.dataset.id, 10);
      if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
    });
    updateSelectionUi();
  });

  cont.querySelectorAll('.inv-select').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = parseInt(cb.dataset.id, 10);
      if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
      updateSelectionUi();
    });
  });
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
  const rows = allRows.filter((r) => ids.includes(r.id));
  const result = await showSolicitudCotizacionModal(ids, rows);
  if (!result?.saved) return;
  loadCurrentTab();
  switchToSolicitudesTab();
  window.dispatchEvent(new CustomEvent('sgc:invitaciones-updated'));
}

async function handleInvitar() {
  const ids = [...selectedIds];
  if (!ids.length) return;
  const row = allRows.find((r) => r.id === ids[0]);
  const solicitudId = row?.solicitud_id || null;
  if (!solicitudId) {
    alert('Primero debe crear una Solicitud de Cotización para los requerimientos seleccionados.');
    return;
  }
  await showInvitarProveedoresModal(solicitudId);
  loadCurrentTab();
  window.dispatchEvent(new CustomEvent('sgc:invitaciones-updated'));
}

export function initInvitacionesView() {
  document.getElementById('invVistaEjecutiva')?.remove();

  bindBandejaToolbar({
    prefix: 'inv',
    onFilter: () => { listFilters = readFilterParams('inv'); loadCurrentTab(true); },
    onClear: () => { listFilters = {}; loadCurrentTab(true); },
  });

  window.addEventListener('sgc:invitaciones-updated', () => loadCurrentTab());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadCurrentTab();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && document.querySelector('.inv-bandeja-page')) loadCurrentTab();
  }, 45000);

  document.getElementById('invBtnSC')?.addEventListener('click', () => handleCrearSC([...selectedIds]));
  document.getElementById('invBtnInvitar')?.addEventListener('click', () => handleInvitar());

  document.querySelectorAll('#invTabs .nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('#invTabs .nav-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      loadCurrentTab();
    });
  });

  loadCurrentTab();
}

function loadCurrentTab(resetPage = false) {
  const active = document.querySelector('#invTabs .nav-link.active')?.dataset?.tab || 'bandeja';
  if (active === 'solicitudes') loadSolicitudesTab(resetPage);
  else loadBandeja({}, resetPage);
}
