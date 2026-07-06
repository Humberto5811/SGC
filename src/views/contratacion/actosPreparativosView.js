// Coordinación CM — bandeja (código interno ACTOS_PREPARATORIOS)
import { authService } from '../../services/authService.js';
import { permissionsService } from '../../services/permissionsService.js';
import { contratacionesService } from '../../services/contratacionesService.js';
import { loadActosBandeja } from '../../utils/bandejaRequerimientos.js';
import { usePagination } from '../../utils/paginacion.js';
import { todasObservaciones, historialHtml, bindTrazabilidadButtons, showSubsanacionDirigidaModal, getObservacionPendiente, observacionPendienteParaSubmodulo } from '../requerimiento/reqShared.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos } from '../requerimiento/registroRequerimientoView.js';
import {
  renderFilterBarHtml, readFilterParams, applyBandejaFilters,
  renderSummaryCardsHtml, updateSummaryCards, bandejaTableStyles,
  renderActionMenuCell, bindActionMenus, bindBandejaToolbar,
  sortBandejaRows, bindSortHandlers, mergeSortParams, sortableTh,
} from '../../utils/trazabilidad.js';
import { actosMenuItems, actosHiddenActions } from '../../utils/bandejaActions.js';
import { openDetailPanel, bindRowDetailPanel } from '../../components/bandejaDetailPanel.js';
import { handleBandejaObservaciones } from '../../components/modalObservaciones.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import {
  isCoordinadorActos, isExpedientePoolCoordinador, isExpedienteAsignadoAMi,
  showAsignarAnalistaModal, showAprobarInvitacionesModal, showActosDestinoModal,
  showDerivarAnalistaModal,
  actosBandejaStyles,
} from '../../utils/actosModals.js';
import { estadoModernBadge } from '../../utils/bandejaUi.js';
import { getRolDisplayFromRow } from '../../utils/observacionDestino.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let lastRows = [];
let listFilters = {};
let listSort = { sort: 'created_at', dir: 'desc' };
const actosPagination = usePagination('actos', loadActosBandeja, { defaultPageSize: 25 });

function actosSortBandejaHeaders(sortState = null) {
  return `
    <th class="req-col-timeline" title="Timeline">🕒</th>
    ${sortableTh('N° Requerimiento', 'codigo', sortState)}
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
    <th class="req-col-acc"></th>`;
}

function looksPedidoSigamefCode(value) {
  const first = String(value || '').split(',')[0].trim();
  return /^(PB|PS)-/i.test(first);
}

function resolvePedidoSigamef(r) {
  const backend = String(r.pedidos_sigamef || r.pedidosSigamef || r.pedido_sigamef || '').trim();
  if (looksPedidoSigamefCode(backend)) return backend;
  if (backend) return backend;
  return String(r.codigo_sigamef || '').trim() || '—';
}

function getResponsableRolDisplayCm(r) {
  const resp = String(r?.responsable_actual || r?.responsableActual || '').trim();
  if (/coordinador.*contratos/i.test(resp)) return 'Coordinador CM';
  if (/analista.*contratos/i.test(resp) || /\banalista\b/i.test(resp)) return 'Analista CM';
  return getRolDisplayFromRow(r);
}

function renderCmBandejaRowCells(r, opts = {}) {
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
  const rol = getResponsableRolDisplayCm(r);
  const estadoBadgeHtml = estadoModernBadge(r, 'Coordinación CM');
  const pedidos = resolvePedidoSigamef(r);

  return `
    <td class="text-center"><button type="button" class="btn btn-link btn-sm p-0 req-traza text-secondary" data-id="${r.id}" onclick="event.stopPropagation()"><i class="bi bi-clock-history"></i></button></td>
    <td><strong>${escFn(r.codigo || ('#' + r.id))}</strong></td>
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

function getCurrentUser() {
  return (authService.getCurrentUser && authService.getCurrentUser()) || {};
}

function getRowContext(r) {
  const user = getCurrentUser();
  const userName = getUserDisplayName(user);
  return {
    user,
    userName,
    esCoordinador: isCoordinadorActos(user),
    esPoolCoordinador: isExpedientePoolCoordinador(r),
    esAsignadoAMi: isExpedienteAsignadoAMi(r, userName),
  };
}

function filterRowsForProfile(rows, filters = {}) {
  const user = getCurrentUser();
  const userName = getUserDisplayName(user);
  if (isCoordinadorActos(user)) {
    const vista = String(filters.vista || '').toLowerCase();
    if (vista === 'mi_equipo') {
      return rows.filter((r) => {
        const resp = String(r.responsable_actual || r.responsableActual || '');
        return resp && !/coordinador.*contratos/i.test(resp);
      });
    }
    if (vista === 'mios') {
      return rows.filter((r) => isExpedientePoolCoordinador(r) || isExpedienteAsignadoAMi(r, userName));
    }
    return rows;
  }
  return rows.filter((r) => isExpedienteAsignadoAMi(r, userName));
}

function readActosFilterParams() {
  const base = readFilterParams('actos');
  return {
    ...base,
    vista: document.getElementById('actosFiltroVista')?.value || '',
    mi_equipo: document.getElementById('actosFiltroVista')?.value === 'mi_equipo' ? '1' : '',
    solo_mios: document.getElementById('actosFiltroVista')?.value === 'mios' ? '1' : '',
  };
}

function renderActosView() {
  const user = getCurrentUser();
  const perfil = isCoordinadorActos(user) ? 'Coordinador de Contratos Menores' : 'Analista de Contratos Menores';
  return `
    <div class="container-fluid actos-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}
        .actos-bandeja-wrap .actos-col-centro { min-width: 120px; max-width: 180px; }
        .actos-bandeja-wrap .actos-col-area { min-width: 120px; max-width: 180px; }
      </style>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-file-earmark-ruled"></i> Coordinación CM</h3>
          <p class="text-muted mb-0">Expedientes asignados a la Coordinación de Contratos Menores. Perfil activo: <strong>${esc(perfil)}</strong></p>
        </div>
        <button id="actosReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      ${renderSummaryCardsHtml('actosTrazaSummary')}
      ${isCoordinadorActos(user) ? `
      <div class="sgc-search-bar mb-2">
        <div class="row g-2 align-items-end">
          <div class="col-md-3">
            <label class="form-label small mb-0">Vista de supervisión</label>
            <select class="form-select form-select-sm" id="actosFiltroVista">
              <option value="">Todos los expedientes</option>
              <option value="mios">Mis expedientes</option>
              <option value="mi_equipo">Mi equipo</option>
            </select>
          </div>
        </div>
      </div>` : ''}
      ${renderFilterBarHtml('actos', { hideExecutive: true })}
      <hr/>
      <div id="actosList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadActosList(sortOverride = {}, resetPage = false) {
  const cont = document.getElementById('actosList');
  if (!cont) return;
  try {
    listSort = mergeSortParams(listSort, sortOverride);
    if (resetPage) actosPagination.resetPage();
    const result = await actosPagination.loadData({
      ...listFilters,
      sort: listSort.sort,
      dir: listSort.dir,
    }, resetPage);
    let rows = result.data || [];
    rows = applyBandejaFilters(rows, listFilters);
    const buscar = String(listFilters.buscar || '').toLowerCase();
    if (buscar) {
      rows = rows.filter((r) => {
        let nombreItem = '';
        try {
          const p = JSON.parse(r.payload || '{}');
          const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
          nombreItem = (items || []).map((it) => it.nombre_item || '').join(' ');
        } catch (_) {}
        const blob = [r.codigo, r.codigo_paquete, r.pedidos_sigamef, r.area, r.responsable_actual, nombreItem, r.denominacion].join(' ').toLowerCase();
        return blob.includes(buscar);
      });
    }
    rows = filterRowsForProfile(rows, listFilters);
    rows = sortBandejaRows(rows, listSort.sort, listSort.dir);
    lastRows = rows;
    updateSummaryCards(rows, 'actosTrazaSummary');

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay expedientes en Coordinación CM para su bandeja.</div>';
      return;
    }

    const tbody = rows.map((r) => {
      const ctx = getRowContext(r);
      return `<tr data-req-id="${r.id}">
        ${renderCmBandejaRowCells(r, { escFn: esc })}
        ${renderActionMenuCell(r.id, actosMenuItems(r, ctx), actosHiddenActions(r, ctx))}
      </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="sgc-bandeja-wrap" id="actosBandejaOuter">
      <div class="table-responsive actos-bandeja-wrap" id="actosBandejaWrap">
        <table class="table table-sm table-hover table-bordered req-list-table mb-0">
          <thead class="table-light"><tr>${actosSortBandejaHeaders(listSort)}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
      </div>`;

    bindTrazabilidadButtons(cont);
    bindSortHandlers(cont.querySelector('#actosBandejaWrap'), (p) => loadActosList(p, true), {
      getSort: () => listSort,
    });
    actosPagination.renderControls('actosBandejaOuter', () => loadActosList({}, false));
    bindActionMenus(cont, {
      detail: (id) => {
        const req = rows.find((x) => String(x.id) === String(id));
        if (req) openDetailPanel(req, { onAdjuntos: (rid) => manageAdjuntos(rid, true) });
      },
      obs: (id) => handleBandejaObservaciones(id, rows, {
        submoduloLabel: 'Coordinación CM',
        puedeObservar: () => true,
        onObservar: async (reqId, data) => {
          await contratacionesService.observarActos(reqId, data.motivo || '', data.usuario, {
            ...data,
            origen_submodulo: data.origen_submodulo || 'Coordinación CM',
          });
        },
        onSubsanar: async (reqId, data) => {
          await requerimientosService.subsanarConDestino(reqId, {
            respuesta: data.texto,
            usuario: data.usuario,
            observacion_id: data.observacion_id,
            origen_submodulo: data.origen_submodulo || 'Coordinación CM',
            destino_submodulo: data.destino_submodulo,
            destino_etapa: data.destino_etapa,
            destino_persona: data.destino_persona,
          });
        },
        onAdjuntos: (rid) => manageAdjuntos(rid, true),
        onReload: () => loadActosList(),
        bandejaPrefix: 'actos',
      }),
      deriveAnalyst: (id) => derivarAnalistaActos(id),
    });
    bindRowDetailPanel(cont, rows, { onAdjuntos: (id) => manageAdjuntos(id, true) });

    cont.querySelectorAll('.actos-ver').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.actos-attach').forEach((b) => b.onclick = () => manageAdjuntos(b.dataset.id, true));
    cont.querySelectorAll('.actos-asignar').forEach((b) => b.onclick = () => asignarActos(b.dataset.id));
    cont.querySelectorAll('.actos-derivar-analista').forEach((b) => b.onclick = () => derivarAnalistaActos(b.dataset.id));
    cont.querySelectorAll('.actos-observar').forEach((b) => b.onclick = () => observarActos(b.dataset.id));
    cont.querySelectorAll('.actos-derivar').forEach((b) => b.onclick = () => derivarActos(b.dataset.id));
    cont.querySelectorAll('.actos-aprobar-inv').forEach((b) => b.onclick = () => aprobarActosInv(b.dataset.id));

    rows.forEach((r) => cargarContadorAdjuntos(r.id));
    fixActosDropdownMenus(cont);
    permissionsService.applyActivityButtons(cont);
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

async function asignarActos(id) {
  const req = lastRows.find((x) => String(x.id) === String(id));
  if (!req) return;
  const ctx = getRowContext(req);
  const data = await showAsignarAnalistaModal({
    title: ctx.esPoolCoordinador ? 'Asignar responsable' : 'Reasignar analista',
    subtitle: ctx.esPoolCoordinador
      ? 'Seleccione el submódulo destino y el analista autorizado. El expediente permanecerá visible en Coordinación CM.'
      : 'Seleccione el nuevo analista responsable.',
  });
  if (!data) return;
  try {
    const userName = getUserDisplayName(getCurrentUser());
    const fn = ctx.esPoolCoordinador ? contratacionesService.asignarActos : contratacionesService.reasignarActos;
    await fn(id, data.analista, userName, {
      submodulo_code: data.submodulo_code,
      submodulo_label: data.submodulo_label,
    });
    alert(`Asignación registrada. Responsable: ${data.analista}. El expediente sigue visible en la bandeja de Coordinación CM.`);
    loadActosList();
  } catch (e) {
    alert('Error al asignar: ' + e.message);
  }
}

async function observarActos(id) {
  const req = lastRows.find((x) => String(x.id) === String(id));
  if (!req) return;
  const userName = getUserDisplayName(getCurrentUser());
  const pending = getObservacionPendiente(req);
  const allObs = todasObservaciones(req);

  if (observacionPendienteParaSubmodulo(pending, 'Coordinación CM')) {
    const data = await showSubsanacionDirigidaModal({
      title: 'Responder observación',
      historyHtml: historialHtml(allObs),
      origenSubmodulo: 'Coordinación CM',
      defaultDestinoSubmodulo: 'Programación',
      label: 'Respuesta a la observación',
      placeholder: 'Describa la subsanación o respuesta…',
      buttonText: 'Responder observación',
      buttonClass: 'btn-primary',
      requerimientoId: req.id,
    });
    if (!data) return;
    try {
      await requerimientosService.subsanarConDestino(id, {
        respuesta: data.texto,
        usuario: userName,
        origen_submodulo: 'Coordinación CM',
        destino_submodulo: data.destino_submodulo,
        destino_etapa: data.destino_etapa,
        destino_persona: data.destino_persona,
      });
      loadActosList();
    } catch (e) {
      alert('Error al responder: ' + e.message);
    }
    return;
  }

  const data = await showActosDestinoModal({
    title: pending ? 'Continuar conversación — Coordinación CM' : 'Observación',
    historyHtml: historialHtml(allObs),
    origenSubmodulo: 'Coordinación CM',
    motivoRequired: true,
    buttonText: pending ? 'Reenviar observación' : 'Observar',
    buttonClass: 'btn-danger',
  });
  if (!data) return;
  try {
    await contratacionesService.observarActos(id, data.motivo, userName, {
      destino_submodulo: data.destino_submodulo,
      destino_etapa: data.destino_etapa,
      destino_persona: data.destino_persona,
      origen_submodulo: data.origen_submodulo,
    });
    loadActosList();
  } catch (e) {
    alert('Error al observar: ' + e.message);
  }
}

async function derivarAnalistaActos(id) {
  const req = lastRows.find((x) => String(x.id) === String(id));
  if (!req) return;
  const ctx = getRowContext(req);
  const data = await showDerivarAnalistaModal({
    subtitle: 'El expediente permanece en Coordinación CM; el analista quedará como responsable.',
  });
  if (!data) return;
  try {
    const userName = getUserDisplayName(getCurrentUser());
    const fn = ctx.esPoolCoordinador ? contratacionesService.asignarActos : contratacionesService.reasignarActos;
    await fn(id, data.analista, userName, {
      submodulo_code: data.submodulo_code,
      submodulo_label: data.submodulo_label,
    });
    alert(`Expediente asignado a ${data.analista}.`);
    loadActosList();
  } catch (e) {
    alert('Error al derivar: ' + e.message);
  }
}

async function derivarActos(id) {
  const req = lastRows.find((x) => String(x.id) === String(id));
  if (!req) return;
  const data = await showActosDestinoModal({
    title: 'Derivar expediente',
    origenSubmodulo: 'Coordinación CM',
    motivoRequired: false,
    motivoLabel: 'Observación (opcional)',
    buttonText: 'Derivar',
    buttonClass: 'btn-primary',
  });
  if (!data) return;
  try {
    const userName = getUserDisplayName(getCurrentUser());
    await contratacionesService.derivarActos(id, { ...data, usuario: userName });
    loadActosList();
  } catch (e) {
    alert('Error al derivar: ' + e.message);
  }
}

async function aprobarActosInv(id) {
  const data = await showAprobarInvitacionesModal();
  if (!data) return;
  try {
    const userName = getUserDisplayName(getCurrentUser());
    await contratacionesService.aprobarActosInvitaciones(id, data.responsable_destino, userName);
    alert('Expediente enviado a Invitaciones.');
    loadActosList();
  } catch (e) {
    alert('Error al aprobar: ' + e.message);
  }
}

function fixActosDropdownMenus(container) {
  container.querySelectorAll('.actos-bandeja-wrap .dropdown-toggle').forEach((btn) => {
    btn.setAttribute('data-bs-display', 'static');
    btn.setAttribute('data-bs-popper-config', JSON.stringify({
      strategy: 'fixed',
      modifiers: [{ name: 'preventOverflow', options: { boundary: 'viewport', padding: 8 } }],
    }));
  });
}

function initActosPreparatoriosView() {
  bindBandejaToolbar({
    prefix: 'actos',
    onFilter: () => { listFilters = readActosFilterParams(); loadActosList({}, true); },
    onClear: () => {
      listFilters = {};
      const vista = document.getElementById('actosFiltroVista');
      if (vista) vista.value = '';
      loadActosList({}, true);
    },
    onExecutiveToggle: () => loadActosList(),
  });
  const reload = document.getElementById('actosReload');
  if (reload) reload.onclick = () => loadActosList();
  const vistaEl = document.getElementById('actosFiltroVista');
  if (vistaEl) {
    vistaEl.onchange = () => {
      listFilters = readActosFilterParams();
      loadActosList();
    };
  }
  loadActosList();
}

export { renderActosView as renderActosPreparativosView, initActosPreparatoriosView as initActosPreparativosView };
