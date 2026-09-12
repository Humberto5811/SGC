// DEC (Documento de Evaluacion de Contrataciones)
import { authService } from '../../services/authService.js';
import { permissionsService } from '../../services/permissionsService.js';
import { contratacionesService } from '../../services/contratacionesService.js';
import { loadDECBandeja } from '../../utils/bandejaRequerimientos.js';
import { usePagination } from '../../utils/paginacion.js';
import { bindTrazabilidadButtons } from '../requerimiento/reqShared.js';
import { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos } from '../requerimiento/registroRequerimientoView.js';
import {
  renderFilterBarHtml, readFilterParams,
  renderSummaryCardsHtml, updateSummaryCards,
  bindActionMenus, bindBandejaToolbar,
  sortBandejaRows, bindSortHandlers, mergeSortParams,
} from '../../utils/trazabilidad.js';
import { resolveBandejaAcciones } from '../../utils/bandejaAccionesResolver.js';
import {
  wrapBandejaExpedienteTable,
  renderBandejaExpedienteRowCells,
  renderBandejaExpedienteActionCell,
} from '../../utils/bandejaExpedienteColumns.js';
import { openDetailPanel, bindRowDetailPanel } from '../../components/bandejaDetailPanel.js';
import { handleBandejaObservaciones } from '../../components/modalObservaciones.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { estaEnDecAccionable } from '../../utils/bandejaActions.js';
import { showWorkflowTransicionModal } from '../../components/workflowTransicionModal.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let lastRows = [];
let listFilters = {};
let listSort = { sort: 'created_at', dir: 'desc' };
const decPagination = usePagination('dec', loadDECBandeja, { defaultPageSize: 25 });

/** Único flujo de observación DEC (menú Acciones → obs / botones .dec-observar). */
function openDecObservaciones(id, rows) {
  return handleBandejaObservaciones(id, rows, {
    submoduloLabel: 'DEC',
    puedeObservar: () => true,
    destinosPermitidosObservacion: [
      'Registro de Requerimiento',
      'Evaluación de Requerimiento',
      'Programación',
    ],
    candidatosApiPath: (reqId) => `/contrataciones/dec/candidatos-observacion-destino/${reqId}`,
    onObservar: async (reqId, data) => {
      const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
      await contratacionesService.observarDEC(reqId, data.motivo || '', getUserDisplayName(user), {
        ...data,
        origen_submodulo: data.origen_submodulo || 'DEC',
      });
    },
    onAdjuntos: (rid) => manageAdjuntos(rid, true),
    onReload: () => loadDecList(),
    bandejaPrefix: 'dec',
    defaultDestinoObservacion: 'Registro de Requerimiento',
  });
}

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
      ${renderFilterBarHtml('dec', { hideExecutive: true })}
      <hr/>
      <div id="decList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadDecList(sortOverride = {}, resetPage = false) {
  const cont = document.getElementById('decList');
  if (!cont) return;
  try {
    listSort = mergeSortParams(listSort, sortOverride);
    if (resetPage) decPagination.resetPage();
    const result = await decPagination.loadData({
      ...listFilters,
      sort: listSort.sort,
      dir: listSort.dir,
    }, resetPage);
    let rows = result.data || [];
    rows = sortBandejaRows(rows, listSort.sort, listSort.dir);
    lastRows = rows;
    updateSummaryCards(rows, 'decTrazaSummary');

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos derivados a DEC.</div>';
      return;
    }

    cont.innerHTML = wrapBandejaExpedienteTable({
      containerId: 'decList',
      prefix: 'dec',
      sortState: listSort,
      bodyHtml: rows.map((r) => {
        const acc = resolveBandejaAcciones({ modulo: 'DEC', row: r, escFn: esc });
        return `
        <tr data-req-id="${r.id}">
          ${renderBandejaExpedienteRowCells(r, { escFn: esc })}
          ${renderBandejaExpedienteActionCell(r.id, acc.menuItems, acc.hiddenActionsHtml)}
        </tr>`;
      }).join(''),
    });

    bindTrazabilidadButtons(cont);
    bindActionMenus(cont, {
      detail: (id) => {
        const req = rows.find((x) => String(x.id) === String(id));
        if (req) openDetailPanel(req, { onAdjuntos: (rid) => manageAdjuntos(rid, true) });
      },
      obs: (id) => openDecObservaciones(id, rows),
    });
    bindRowDetailPanel(cont, rows, { onAdjuntos: (id) => manageAdjuntos(id, true) });
    cont.querySelectorAll('.dec-ver').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.dec-attach').forEach((b) => b.onclick = () => manageAdjuntos(b.dataset.id, true));
    cont.querySelectorAll('.dec-aprobar').forEach((b) => b.onclick = () => aprobarDec(b.dataset.id));
    rows.forEach((r) => cargarContadorAdjuntos(r.id));
    permissionsService.applyActivityButtons(cont);
    bindSortHandlers(document.getElementById('decList-wrap'), (p) => loadDecList(p, true), {
      getSort: () => listSort,
    });
    decPagination.renderControls('decList-wrap', () => loadDecList({}, false));
  } catch (e) {
    cont.innerHTML = '<div class="alert alert-danger">Error al cargar: ' + esc(e.message) + '</div>';
  }
}

async function aprobarDec(id) {
  const req = (lastRows || []).find((x) => String(x.id) === String(id));
  // Guardia UI; el backend sigue siendo la autoridad final de la transición.
  if (req && !estaEnDecAccionable(req)) {
    alert('Este expediente no está pendiente de aprobación en DEC.');
    return;
  }

  const seleccion = await showWorkflowTransicionModal({
    requerimientoId: id,
    eventoCodigo: 'DEC_APROBADO',
    title: 'Aprobar y derivar a Programación',
    message: 'Seleccione la persona responsable en Programación. Etapa destino: Programación, estado: En trámite.',
    buttonText: 'Confirmar aprobación',
  });
  if (!seleccion) return;

  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    const res = await contratacionesService.aprobarDEC(id, {
      usuario: getUserDisplayName(user),
      usuario_destino_id: seleccion.usuario_destino_id,
      responsable_recomendado_id: seleccion.responsable_recomendado_id,
      reasignacion_manual: seleccion.reasignacion_manual,
    });
    if (res && res.success === false) throw new Error('No se pudo aprobar');
    loadDecList();
  } catch (e) {
    alert('Error al aprobar: ' + e.message);
  }
}

function initDecView() {
  bindBandejaToolbar({
    prefix: 'dec',
    onFilter: () => { listFilters = readFilterParams('dec'); loadDecList({}, true); },
    onClear: () => { listFilters = {}; loadDecList({}, true); },
  });
  const reload = document.getElementById('decReload');
  if (reload) reload.onclick = () => loadDecList();
  loadDecList();
}

export { renderDecView, initDecView };
