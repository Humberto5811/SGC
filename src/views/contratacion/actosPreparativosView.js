// Coordinación CM — bandeja (código interno ACTOS_PREPARATORIOS)
import { authService } from '../../services/authService.js';
import { permissionsService } from '../../services/permissionsService.js';
import { contratacionesService } from '../../services/contratacionesService.js';
import { fetchBandejaActosPreparatorios } from '../../utils/bandejaRequerimientos.js';
import { todasObservaciones, historialHtml, bindTrazabilidadButtons, showSubsanacionDirigidaModal, getObservacionPendiente, observacionPendienteParaSubmodulo } from '../requerimiento/reqShared.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos } from '../requerimiento/registroRequerimientoView.js';
import {
  renderFilterBarHtml, readFilterParams, applyBandejaFilters,
  renderSummaryCardsHtml, updateSummaryCards, bandejaTableStyles,
  renderActionMenuCell, bindActionMenus, bindBandejaToolbar,
} from '../../utils/trazabilidad.js';
import { actosMenuItems, actosHiddenActions } from '../../utils/bandejaActions.js';
import { openDetailPanel, bindRowDetailPanel } from '../../components/bandejaDetailPanel.js';
import { handleBandejaObservaciones } from '../../components/modalObservaciones.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import {
  isCoordinadorActos, isExpedientePoolCoordinador, isExpedienteAsignadoAMi,
  showAsignarAnalistaModal, showAprobarInvitacionesModal, showActosDestinoModal,
  showDerivarAnalistaModal,
  renderActosRowCells, actosBandejaHeaders, actosBandejaStyles,
} from '../../utils/actosModals.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let lastRows = [];
let listFilters = {};

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
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
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
      ${renderFilterBarHtml('actos')}
      <hr/>
      <div id="actosList" class="sgc-bandeja-wrap actos-bandeja-wrap"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadActosList() {
  const cont = document.getElementById('actosList');
  if (!cont) return;
  try {
    let rows = await fetchBandejaActosPreparatorios(listFilters);
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
    lastRows = rows;
    updateSummaryCards(rows, 'actosTrazaSummary');

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay expedientes en Coordinación CM para su bandeja.</div>';
      return;
    }

    const tbody = rows.map((r) => {
      const ctx = getRowContext(r);
      return `<tr data-req-id="${r.id}">
        ${renderActosRowCells(r, { escFn: esc })}
        ${renderActionMenuCell(r.id, actosMenuItems(r, ctx), actosHiddenActions(r, ctx))}
      </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover table-bordered req-list-table mb-0">
          <thead class="table-light"><tr>${actosBandejaHeaders()}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>`;

    bindTrazabilidadButtons(cont);
    bindActionMenus(cont, {
      detail: (id) => {
        const req = rows.find((x) => String(x.id) === String(id));
        if (req) openDetailPanel(req, { onAdjuntos: (rid) => manageAdjuntos(rid, true) });
      },
      obs: (id) => handleBandejaObservaciones(id, rows, {
        submoduloLabel: 'Coordinación CM',
        puedeObservar: () => true,
        onObservar: async (reqId, data) => {
          await contratacionesService.observarActos(reqId, data.motivo, data.usuario, {
            destino_submodulo: data.destino_submodulo,
            destino_etapa: data.destino_etapa,
            destino_persona: data.destino_persona,
            origen_submodulo: 'Coordinación CM',
          });
        },
        onSubsanar: async (reqId, data) => {
          await requerimientosService.subsanarConDestino(reqId, {
            respuesta: data.texto,
            usuario: data.usuario,
            origen_submodulo: data.origen_submodulo || 'Coordinación CM',
            destino_submodulo: data.destino_submodulo,
            destino_etapa: data.destino_etapa,
            destino_persona: data.destino_persona,
          });
        },
        onAdjuntos: (rid) => manageAdjuntos(rid, true),
        onReload: () => loadActosList(),
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
    onFilter: () => { listFilters = readActosFilterParams(); loadActosList(); },
    onClear: () => {
      listFilters = {};
      const vista = document.getElementById('actosFiltroVista');
      if (vista) vista.value = '';
      loadActosList();
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
