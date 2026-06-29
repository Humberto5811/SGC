// DEC (Documento de Evaluacion de Contrataciones)
import { authService } from '../../services/authService.js';
import { permissionsService } from '../../services/permissionsService.js';
import { contratacionesService } from '../../services/contratacionesService.js';
import { fetchBandejaDEC } from '../../utils/bandejaRequerimientos.js';
import { reqShared, todasObservaciones, historialHtml, showObservacionDirigidaModal, bindTrazabilidadButtons, verHistorialObservaciones } from '../requerimiento/reqShared.js';
import { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos } from '../requerimiento/registroRequerimientoView.js';
import {
  renderFilterBarHtml, readFilterParams,
  renderSummaryCardsHtml, updateSummaryCards, wrapBandejaTable,
  renderTraceRowCells, renderActionMenuCell, bindActionMenus, bindBandejaToolbar,
} from '../../utils/trazabilidad.js';
import { decMenuItems, decHiddenActions } from '../../utils/bandejaActions.js';
import { openDetailPanel, bindRowDetailPanel } from '../../components/bandejaDetailPanel.js';
import { handleBandejaObservaciones } from '../../components/modalObservaciones.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let lastRows = [];
let listFilters = {};

function renderDecView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-file-earmark-check"></i> DEC — Dependencia Encargada de las Contrataciones</h3>
          <p class="text-muted mb-0">Expedientes aprobados en evaluación y derivados a DEC. Gestione la revisión cuando corresponda.</p>
        </div>
        <button id="decReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      ${renderSummaryCardsHtml('decTrazaSummary')}
      ${renderFilterBarHtml('dec')}
      <hr/>
      <div id="decList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadDecList() {
  const cont = document.getElementById('decList');
  if (!cont) return;
  try {
    let rows = await fetchBandejaDEC(listFilters);
    lastRows = rows;
    updateSummaryCards(rows, 'decTrazaSummary');

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos derivados a DEC.</div>';
      return;
    }

    cont.innerHTML = wrapBandejaTable({
      containerId: 'decList',
      prefix: 'dec',
      bodyHtml: rows.map((r) => `
        <tr data-req-id="${r.id}">
          ${renderTraceRowCells(r, { prefix: 'dec', escFn: esc })}
          ${renderActionMenuCell(r.id, decMenuItems(r), decHiddenActions(r))}
        </tr>`).join(''),
    });

    bindTrazabilidadButtons(cont);
    bindActionMenus(cont, {
      detail: (id) => {
        const req = rows.find((x) => String(x.id) === String(id));
        if (req) openDetailPanel(req, { onAdjuntos: (rid) => manageAdjuntos(rid, true) });
      },
      obs: (id) => handleBandejaObservaciones(id, rows, {
        submoduloLabel: 'DEC',
        puedeObservar: () => true,
        onObservar: async (reqId, data) => {
          const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
          await contratacionesService.observarDEC(reqId, data.motivo || '', getUserDisplayName(user), {
            ...data,
            origen_submodulo: data.origen_submodulo || 'DEC',
          });
        },
        onAdjuntos: (rid) => manageAdjuntos(rid, true),
        onReload: () => loadDecList(),
        defaultDestinoObservacion: 'Registro de Requerimiento',
      }),
    });
    bindRowDetailPanel(cont, rows, { onAdjuntos: (id) => manageAdjuntos(id, true) });
    cont.querySelectorAll('.dec-ver').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.dec-attach').forEach((b) => b.onclick = () => manageAdjuntos(b.dataset.id, true));
    cont.querySelectorAll('.dec-aprobar').forEach((b) => b.onclick = () => aprobarDec(b.dataset.id));
    cont.querySelectorAll('.dec-observar').forEach((b) => b.onclick = () => observarDec(b.dataset.id));
    rows.forEach((r) => cargarContadorAdjuntos(r.id));
    permissionsService.applyActivityButtons(cont);
  } catch (e) {
    cont.innerHTML = '<div class="alert alert-danger">Error al cargar: ' + esc(e.message) + '</div>';
  }
}

async function aprobarDec(id) {
  if (!confirm('Confirmar aprobacion desde DEC? El expediente pasara a Programacion.')) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    const res = await contratacionesService.aprobarDEC(id, getUserDisplayName(user));
    if (res && res.success === false) throw new Error('No se pudo aprobar');
    loadDecList();
  } catch (e) {
    alert('Error al aprobar: ' + e.message);
  }
}

async function observarDec(id) {
  const req = (lastRows || []).find((x) => String(x.id) === String(id));
  if (!req) return;
  const allObs = todasObservaciones(req);
  const data = await showObservacionDirigidaModal({
    title: 'Observar requerimiento desde DEC',
    historyHtml: historialHtml(allObs),
    origenSubmodulo: 'DEC',
    defaultDestinoSubmodulo: 'Registro de Requerimiento',
    placeholder: 'Indique el motivo de la observacion...',
    buttonText: 'Observar',
    buttonClass: 'btn-danger',
  });
  if (!data) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    await contratacionesService.observarDEC(id, data.motivo, getUserDisplayName(user), {
      destino_submodulo: data.destino_submodulo,
      destino_etapa: data.destino_etapa,
      destino_persona: data.destino_persona,
      origen_submodulo: data.origen_submodulo || 'DEC',
    });
    loadDecList();
  } catch (e) {
    alert('Error al observar: ' + e.message);
  }
}

function initDecView() {
  bindBandejaToolbar({
    prefix: 'dec',
    onFilter: () => { listFilters = readFilterParams('dec'); loadDecList(); },
    onClear: () => { listFilters = {}; loadDecList(); },
    onExecutiveToggle: () => loadDecList(),
  });
  const reload = document.getElementById('decReload');
  if (reload) reload.onclick = () => loadDecList();
  loadDecList();
}

export { renderDecView, initDecView };
