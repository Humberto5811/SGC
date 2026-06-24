// Invitaciones — bandeja maestra + pestaña solicitudes
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import {
  enrichReqRow, renderFilterBarHtml, readFilterParams, applyBandejaFilters,
  renderSummaryCardsHtml, updateSummaryCards, renderActionMenuCell, bindActionMenus,
  bindBandejaToolbar, bandejaTableStyles,
} from '../../utils/trazabilidad.js';
import { estadoModernBadge } from '../../utils/bandejaUi.js';
import { invitacionesMenuItems, invitacionesHiddenActions } from '../../utils/bandejaActions.js';
import { actosBandejaStyles, renderActosRowCells, actosBandejaHeaders } from '../../utils/actosModals.js';
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
let currentTab = 'bandeja';

export function renderInvitacionesView() {
  return `
    <div class="container-fluid actos-bandeja-page inv-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h3 class="mb-1"><i class="bi bi-envelope"></i> Invitaciones</h3>
          <p class="text-muted mb-0">Bandeja maestra — expedientes en Invitaciones con trazabilidad completa.</p>
        </div>
        <div class="d-flex gap-2 flex-wrap align-items-center">
          <button id="invBtnSC" class="btn btn-sm btn-primary" disabled><i class="bi bi-file-earmark-plus"></i> Crear Solicitud de Cotización</button>
          <button id="invBtnInvitar" class="btn btn-sm btn-success" disabled><i class="bi bi-send"></i> INVITAR</button>
          <span id="invSeleccionados" class="badge bg-secondary align-self-center">0 seleccionados</span>
          <button id="invReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
        </div>
      </div>
      <ul class="nav nav-tabs mb-3" id="invTabs">
        <li class="nav-item"><a class="nav-link active" href="#" data-tab="bandeja">Bandeja</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-tab="solicitudes">Invitaciones (Solicitudes)</a></li>
      </ul>
      <div id="invTrazaSummaryWrap">${renderSummaryCardsHtml('invTrazaSummary')}</div>
      <div id="invFilterWrap">${renderFilterBarHtml('inv')}</div>
      <div id="invContent"><div class="text-muted">Cargando…</div></div>
    </div>`;
}

function invitacionesBandejaHeaders() {
  return `
    <th style="width:35px;"><input type="checkbox" id="invSelectAll" title="Seleccionar todos"></th>
    ${actosBandejaHeaders({ includeAcc: false })}
    <th class="text-center" style="min-width:72px;">Invitado</th>
    <th class="text-center" style="min-width:120px;">N° Invitaciones Realizadas</th>
    <th class="req-col-acc"></th>`;
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

async function loadBandeja() {
  currentTab = 'bandeja';
  const cont = document.getElementById('invContent');
  if (!cont) return;
  try {
    cont.innerHTML = '<div class="text-muted">Cargando…</div>';
    const resp = await contratacionesService.listInvitaciones({ pageSize: 500, ...listFilters });
    let rows = (resp.data || []).map(enrichReqRow);
    rows = applyBandejaFilters(rows, listFilters);
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
        ${renderActosRowCells(r, { escFn: esc })}
        ${renderInvExtraCells(r)}
        ${renderActionMenuCell(r.id, invitacionesMenuItems(r), invitacionesHiddenActions(r))}
      </tr>`).join('');

    cont.innerHTML = `
      <div class="inv-tab-panel">
      <div class="table-responsive inv-bandeja-wrap actos-bandeja-wrap">
        <table class="table table-sm table-hover table-bordered req-list-table mb-0">
          <thead class="table-light"><tr>${invitacionesBandejaHeaders()}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
      </div>`;

    bindBandejaEvents(cont);
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
  const fw = document.getElementById('invFilterWrap');
  const sw = document.getElementById('invTrazaSummaryWrap');
  if (fw) fw.style.display = 'none';
  if (sw) sw.style.display = 'none';
  loadSolicitudesTab();
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

async function loadSolicitudesTab() {
  currentTab = 'solicitudes';
  const cont = document.getElementById('invContent');
  if (!cont) return;
  try {
    cont.innerHTML = '<div class="text-muted">Cargando solicitudes…</div>';
    const resp = await contratacionesService.listSolicitudesCotizacion({ pageSize: 100 });
    const rows = resp.data || [];
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay solicitudes de cotización registradas.</div>';
      return;
    }
    cont.innerHTML = `
      <div class="inv-tab-panel">
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
              <td>${estadoModernBadge(s.estado_invitacion || s.estado)}</td>
              <td class="small">${fmtDt(s.fecha_publicacion)}</td>
              <td class="small">${fmtDt(s.fecha_culminacion || s.cotizaciones_fin)}</td>
              <td class="text-center">${s.cantidad_proveedores ?? s.invitados ?? 0}</td>
              <td class="text-center">${s.cotizaciones_recibidas ?? 0}</td>
              ${renderActionMenuCell(s.id, solicitudesMenuItems(s), [])}
            </tr>`).join('')}</tbody>
        </table>
        </div>
      </div>`;

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

function bindBandejaEvents(cont) {
  bindTrazabilidadButtons(cont);
  bindRowDetailPanel(cont, allRows);
  bindActionMenus(cont, {
    detail: (id) => {
      openDetailPanel(allRows.find((r) => String(r.id) === String(id)));
    },
    obs: (id) => handleObservacion(id),
    timeline: (id) => cont.querySelector(`.req-traza[data-id="${id}"]`)?.click(),
    attach: (id) => manageAdjuntos(id, allRows.find((r) => String(r.id) === String(id))?.estado),
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
  const userName = getUserDisplayName(authService.getCurrentUser());
  const data = await showObservacionDirigidaModal({
    titulo: 'Observación — Invitaciones',
    origenSubmodulo: 'Invitaciones',
  });
  if (!data?.motivo) return;
  await contratacionesService.observarInvitaciones(id, {
    motivo: data.motivo,
    usuario: userName,
    destino_submodulo: data.destino_submodulo,
    destino_etapa: data.destino_etapa,
    destino_persona: data.destino_persona,
    origen_submodulo: 'Invitaciones',
  });
  alert('Observación registrada.');
  loadBandeja();
}

async function handleCrearSC(ids) {
  const rows = allRows.filter((r) => ids.includes(r.id));
  const result = await showSolicitudCotizacionModal(ids, rows);
  if (!result?.saved) return;
  await loadBandeja();
  switchToSolicitudesTab();
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
  loadBandeja();
  if (currentTab === 'solicitudes') loadSolicitudesTab();
}

export function initInvitacionesView() {
  bindBandejaToolbar({
    prefix: 'inv',
    onFilter: () => { listFilters = readFilterParams('inv'); loadCurrentTab(); },
    onClear: () => { listFilters = {}; loadCurrentTab(); },
    onExecutiveToggle: () => loadCurrentTab(),
  });

  document.getElementById('invReload')?.addEventListener('click', () => loadCurrentTab());
  document.getElementById('invBtnSC')?.addEventListener('click', () => handleCrearSC([...selectedIds]));
  document.getElementById('invBtnInvitar')?.addEventListener('click', () => handleInvitar());

  document.querySelectorAll('#invTabs .nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('#invTabs .nav-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      document.getElementById('invFilterWrap').style.display = link.dataset.tab === 'solicitudes' ? 'none' : '';
      document.getElementById('invTrazaSummaryWrap').style.display = link.dataset.tab === 'solicitudes' ? 'none' : '';
      loadCurrentTab();
    });
  });

  loadCurrentTab();
}

function loadCurrentTab() {
  const active = document.querySelector('#invTabs .nav-link.active')?.dataset?.tab || 'bandeja';
  if (active === 'solicitudes') loadSolicitudesTab();
  else loadBandeja();
}
