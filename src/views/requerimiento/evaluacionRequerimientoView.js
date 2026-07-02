// Evaluación de Requerimientos
import { authService } from '../../services/authService.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { reqShared, addObservacion, todasObservaciones, historialHtml, showObservacionDirigidaModal, bindTrazabilidadButtons, verHistorialObservaciones } from './reqShared.js';
import { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos, openRequerimiento } from './registroRequerimientoView.js';
import {
  renderFilterBarHtml, readFilterParams, enrichReqRow,
  renderSummaryCardsHtml, updateSummaryCards, wrapBandejaTable,
  renderTraceRowCells, renderActionMenuCell, bindActionMenus, bindBandejaToolbar,
  isEstadoObservado,
} from '../../utils/trazabilidad.js';
import { fetchBandejaEvaluacion } from '../../utils/bandejaRequerimientos.js';
import { evalMenuItems, evalHiddenActions } from '../../utils/bandejaActions.js';
import { openDetailPanel, bindRowDetailPanel } from '../../components/bandejaDetailPanel.js';
import { handleBandejaObservaciones } from '../../components/modalObservaciones.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let lastEvalRows = [];
let listFilters = {};

function renderEvaluacionRequerimientoView() {
  return `
    <div class="container-fluid">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-check-circle"></i> Evaluación de Requerimientos</h3>
          <p class="text-muted mb-0">Expedientes enviados a evaluación. El estado se actualiza al avanzar hacia DEC o al ser observados.</p>
        </div>
        <button id="evalReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
      </div>
      ${renderSummaryCardsHtml('evalTrazaSummary')}
      ${renderFilterBarHtml('eval')}
      <hr/>
      <div id="evalList"><div class="text-muted">Cargando…</div></div>
    </div>
  `;
}

async function loadEvaluacionList() {
  const cont = document.getElementById('evalList');
  if (!cont) return;
  try {
    let rows = await fetchBandejaEvaluacion(listFilters);
    lastEvalRows = rows;
    updateSummaryCards(rows, 'evalTrazaSummary');

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos enviados a evaluación.</div>';
      return;
    }

    cont.innerHTML = wrapBandejaTable({
      containerId: 'evalList',
      prefix: 'eval',
      bodyHtml: rows.map((r) => `
        <tr data-req-id="${r.id}">
          ${renderTraceRowCells(r, { prefix: 'eval', escFn: esc })}
          ${renderActionMenuCell(r.id, evalMenuItems(r), evalHiddenActions(r, esc))}
        </tr>`).join(''),
    });

    bindTrazabilidadButtons(cont);
    bindActionMenus(cont, {
      detail: (id) => {
        const req = rows.find((x) => String(x.id) === String(id));
        if (req) openDetailPanel(req, { onAdjuntos: (rid) => manageAdjuntos(rid, /aprobad/i.test(String(req.estado || ''))) });
      },
      obs: (id) => handleBandejaObservaciones(id, rows, {
        submoduloLabel: 'Evaluación de Requerimiento',
        puedeObservar: (r) => /tr[aá]mite/i.test(String(r.estado || '')) && !/aprobad/i.test(String(r.estado || '')),
        onObservar: async (reqId, data) => {
          await requerimientosService.observarEvaluacion(reqId, {
            ...data,
            motivo: data.motivo,
            origen_submodulo: data.origen_submodulo || 'Evaluación de Requerimiento',
          });
        },
        onAdjuntos: (rid) => manageAdjuntos(rid, false),
        onReload: () => loadEvaluacionList(),
        bandejaPrefix: 'eval',
        defaultDestinoObservacion: 'Registro de Requerimiento',
      }),
    });
    bindRowDetailPanel(cont, rows, {
      onAdjuntos: (id) => {
        const req = rows.find((x) => String(x.id) === String(id));
        manageAdjuntos(id, req && /aprobad/i.test(String(req.estado || '')));
      },
    });
    cont.querySelectorAll('.eval-edit').forEach((b) => b.onclick = () => editarRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-print').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-attach').forEach((b) => b.onclick = () => {
      manageAdjuntos(b.dataset.id, false);
    });
    cont.querySelectorAll('.eval-observar').forEach((b) => b.onclick = () => observarRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-approve').forEach((b) => b.onclick = () => approveRequerimiento(b.dataset.id));
    cont.querySelectorAll('.eval-del').forEach((b) => b.onclick = () => eliminarRequerimiento(b.dataset.id));
    rows.forEach((r) => cargarContadorAdjuntos(r.id));
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

function editarRequerimiento(id) {
  const cont = document.getElementById('evalList');
  if (!cont) return;
  const wrapper = cont.closest('.container-fluid');
  if (!wrapper) return;
  wrapper.innerHTML = `
    <div class="mb-2">
      <h5 class="mb-0"><i class="bi bi-check-circle"></i> Evaluación — Edición de Requerimiento</h5>
    </div>
    <div id="reqRoot"></div>
  `;
  reqShared.editingFromEvaluacion = true;
  reqShared.onBackToEvaluacion = () => {
    reqShared.editingFromEvaluacion = false;
    reqShared.onBackToEvaluacion = null;
    const tmp = document.createElement('div');
    tmp.innerHTML = renderEvaluacionRequerimientoView();
    const cf = tmp.querySelector('.container-fluid');
    wrapper.innerHTML = cf ? cf.innerHTML : tmp.innerHTML;
    initEvaluacionRequerimientoView();
  };
  openRequerimiento(id);
}

async function observarRequerimiento(id) {
  const req = (lastEvalRows || []).find((x) => String(x.id) === String(id));
  if (!req) return;
  const aprobado = /aprobad/i.test(String(req.estado || ''))
    && String(req.estado_actual || req.estadoActual || '').toUpperCase() !== 'EVALUACION';
  if (aprobado) {
    await verHistorialObservaciones(req, { title: 'Historial de observaciones — Evaluación' });
    return;
  }
  const allObs = todasObservaciones(req);
  const data = await showObservacionDirigidaModal({
    title: 'Observar requerimiento',
    historyHtml: historialHtml(allObs),
    origenSubmodulo: 'Evaluación de Requerimiento',
    defaultDestinoSubmodulo: 'Registro de Requerimiento',
    placeholder: 'Indique el motivo de la observación…',
    buttonText: 'Guardar observación',
    buttonClass: 'btn-danger',
  });
  if (!data) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    await addObservacion(req, data.motivo, getUserDisplayName(user), {
      destino_submodulo: data.destino_submodulo,
      destino_etapa: data.destino_etapa,
      destino_persona: data.destino_persona,
      origen_submodulo: data.origen_submodulo,
    });
    loadEvaluacionList();
  } catch (e) {
    alert('Error al guardar la observación: ' + e.message);
  }
}

async function approveRequerimiento(id) {
  if (!confirm('¿Aprobar este requerimiento?')) return;
  try {
    const user = (authService.getCurrentUser && authService.getCurrentUser()) || {};
    const res = await requerimientosService.aprobarEvaluacion(id, getUserDisplayName(user));
    if (res && res.success === false) throw new Error('No se pudo aprobar');
    loadEvaluacionList();
  } catch (e) {
    alert('Error al aprobar: ' + e.message);
  }
}

async function eliminarRequerimiento(id) {
  if (!confirm('¿Eliminar este requerimiento?')) return;
  try {
    await requerimientosService.remove(id);
    loadEvaluacionList();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}

function initEvaluacionRequerimientoView() {
  bindBandejaToolbar({
    prefix: 'eval',
    onFilter: () => { listFilters = readFilterParams('eval'); loadEvaluacionList(); },
    onClear: () => { listFilters = {}; loadEvaluacionList(); },
    onExecutiveToggle: () => loadEvaluacionList(),
  });
  const reload = document.getElementById('evalReload');
  if (reload) reload.onclick = () => loadEvaluacionList();
  loadEvaluacionList();
}

export { renderEvaluacionRequerimientoView, initEvaluacionRequerimientoView };
