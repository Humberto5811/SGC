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
  showAsignarAnalistaModal, showActosDestinoModal,
  showDerivarAnalistaModal,
  actosBandejaStyles,
} from '../../utils/actosModals.js';
import {
  renderBandejaCanonicoEtapaEstadoRespCells,
  renderBandejaCanonicoDiasCell,
  getBandejaCanonicoFechaAsignacion,
} from '../../utils/bandejaExpedienteColumns.js';
import { showWorkflowTransicionModal } from '../../components/workflowTransicionModal.js';
import { resolvePedidoSigamef } from '../../utils/bandejaHelpers.js';

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
    ${sortableTh('CMN N°', 'cmn', sortState, 'actos-col-cmn')}
    ${sortableTh('Etapa', 'etapa', sortState, 'req-col-etapa')}
    ${sortableTh('Estado', 'estado', sortState, 'req-col-estado-cell')}
    ${sortableTh('Responsable', 'responsable', sortState, 'req-col-resp')}
    ${sortableTh('Fecha Asignación', 'fecha', sortState)}
    ${sortableTh('Días', 'dias', sortState)}
    <th class="req-col-acc"></th>`;
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
  const fechaAsig = getBandejaCanonicoFechaAsignacion(r);
  const fechaFmt = fechaAsig ? String(fechaAsig).slice(0, 16).replace('T', ' ') : '—';
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
    <td class="actos-col-cmn small">${escFn(r.cmn || '—')}</td>
    ${renderBandejaCanonicoEtapaEstadoRespCells(r)}
    <td class="small text-muted">${escFn(fechaFmt)}</td>
    <td class="text-center">${renderBandejaCanonicoDiasCell(r, escFn)}</td>`;
}

function getCurrentUser() {
  return (authService.getCurrentUser && authService.getCurrentUser()) || {};
}

/** Denominación visible del submódulo (códigos internos CONT_MENORES / INVITACIONES sin cambio). */
const SUBMODULO_UI_LABEL = 'Coordinador CM';

function perfilActivoLabel(user) {
  return isCoordinadorActos(user) ? SUBMODULO_UI_LABEL : 'Operador CM';
}

function getRowContext(r) {
  const user = getCurrentUser();
  const userName = getUserDisplayName(user);
  return {
    user,
    userName,
    esCoordinador: isCoordinadorActos(user),
    esPoolCoordinador: isExpedientePoolCoordinador(r),
    esAsignadoAMi: isExpedienteAsignadoAMi(r, userName, user.id),
  };
}

function filterRowsForProfile(rows, filters = {}) {
  const user = getCurrentUser();
  const userName = getUserDisplayName(user);
  if (isCoordinadorActos(user)) {
    const vista = String(filters.vista || '').toLowerCase();
    if (vista === 'mi_equipo') {
      return rows.filter((r) => {
        const resp = String(r.responsableActual || r.responsable_actual || '');
        return resp && !/coordinador.*contratos/i.test(resp);
      });
    }
    if (vista === 'mios') {
      return rows.filter((r) => isExpedientePoolCoordinador(r) || isExpedienteAsignadoAMi(r, userName));
    }
    return rows;
  }
  // RC8.17.8H5-05 — visibilidad histórica: lista server ya acota por ingreso a CM.
  return rows;
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
  const perfil = perfilActivoLabel(user);
  return `
    <div class="container-fluid actos-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}
        .actos-bandeja-wrap .actos-col-centro { min-width: 120px; max-width: 180px; }
        .actos-bandeja-wrap .actos-col-area { min-width: 120px; max-width: 180px; }
        .actos-bandeja-wrap .req-col-etapa,
        .actos-bandeja-wrap .req-col-estado-cell,
        .actos-bandeja-wrap .req-col-resp {
          padding: 0.32rem 0.38rem;
          vertical-align: middle;
        }
        .actos-bandeja-wrap .req-col-etapa { width: 7.5rem; max-width: 7.5rem; }
        .actos-bandeja-wrap .req-col-estado-cell { width: 7.75rem; max-width: 7.75rem; }
        .actos-bandeja-wrap .req-col-resp { width: 8.25rem; max-width: 8.25rem; }
        .actos-bandeja-wrap .req-col-etapa .sgc-etapa-badge,
        .actos-bandeja-wrap .req-col-estado-cell .sgc-estado-badge,
        .actos-bandeja-wrap .req-col-resp .sgc-responsable-badge {
          min-height: 22px; max-height: 24px; max-width: 100%;
        }
        .actos-bandeja-wrap .req-col-etapa .sgc-etapa-badge__text { max-width: 6.75rem; }
        .actos-bandeja-wrap .req-col-estado-cell .sgc-estado-badge__text { max-width: 7rem; }
        .actos-bandeja-wrap .req-col-resp .sgc-responsable-badge__text { max-width: 7.5rem; }
        .actos-bandeja-wrap .sgc-etapa-badge__text,
        .actos-bandeja-wrap .sgc-estado-badge__text,
        .actos-bandeja-wrap .sgc-responsable-badge__text {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          display: inline-block; vertical-align: bottom;
        }
      </style>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-file-earmark-ruled"></i> ${esc(SUBMODULO_UI_LABEL)}</h3>
          <p class="text-muted mb-0">Expedientes en ${esc(SUBMODULO_UI_LABEL)}. Perfil activo: <strong>${esc(perfil)}</strong></p>
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
      cont.innerHTML = `<div class="alert alert-light border">No hay expedientes en ${esc(SUBMODULO_UI_LABEL)} para su bandeja.</div>`;
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
            usuario_destino_id: data.usuario_destino_id,
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
        usuario_destino_id: data.usuario_destino_id,
      });
      loadActosList();
    } catch (e) {
      alert('Error al responder: ' + e.message);
    }
    return;
  }

  const data = await showActosDestinoModal({
    title: pending ? `Continuar conversación — ${SUBMODULO_UI_LABEL}` : 'Observación',
    historyHtml: historialHtml(allObs),
    origenSubmodulo: 'Coordinación CM',
    observacionContMenores: true,
    requerimientoId: id,
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
  const { showContMenoresDerivacionUadModal } = await import('../../utils/actosModals.js');
  const data = await showContMenoresDerivacionUadModal({
    title: 'Derivar expediente',
    origenSubmodulo: 'Coordinación CM',
    incluirContMenores: true,
    motivoLabel: 'Observación (opcional)',
    buttonText: 'Derivar',
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
  const seleccion = await showWorkflowTransicionModal({
    requerimientoId: id,
    eventoCodigo: 'COORDINACION_CM_APROBADA',
    title: 'Aprobar y derivar a Invitaciones',
    message: 'Seleccione la persona responsable en Invitaciones. Etapa destino: Invitaciones, estado: En trámite.',
    buttonText: 'Confirmar envío',
  });
  if (!seleccion) return;
  try {
    const userName = getUserDisplayName(getCurrentUser());
    await contratacionesService.aprobarActosInvitaciones(id, {
      usuario: userName,
      usuario_destino_id: seleccion.usuario_destino_id,
      responsable_recomendado_id: seleccion.responsable_recomendado_id,
      reasignacion_manual: seleccion.reasignacion_manual,
    });
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
