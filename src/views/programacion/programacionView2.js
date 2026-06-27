// src/views/programacion/programacionView.js
import { programacionService } from '../../services/programacionService.js';
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { todasObservaciones, historialHtml, showObservacionDirigidaModal, showSubsanacionDirigidaModal, bindTrazabilidadButtons, getObservacionPendiente, observacionPendienteParaSubmodulo } from '../requerimiento/reqShared.js';
import { requerimientosService } from '../../services/requerimientosService.js';
import { printRequerimiento, manageAdjuntos, cargarContadorAdjuntos } from '../requerimiento/registroRequerimientoView.js';
import {
  enrichReqRow,
  renderFilterBarHtml, readFilterParams, applyBandejaFilters,
  renderSummaryCardsHtml, updateSummaryCards,
  renderActionMenuCell, bindActionMenus, bindBandejaToolbar,
  bandejaTableStyles,
} from '../../utils/trazabilidad.js';
import { estadoModernBadge } from '../../utils/bandejaUi.js';
import { progMenuItems, progHiddenActions } from '../../utils/bandejaActions.js';
import { fetchBandejaProgramacion } from '../../utils/bandejaRequerimientos.js';
import { openDetailPanel, bindRowDetailPanel } from '../../components/bandejaDetailPanel.js';
import { handleBandejaObservaciones } from '../../components/modalObservaciones.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { getRolDisplayFromRow } from '../../utils/observacionDestino.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { loadPaquetesConsolidacionTab, openPaquetePanel, highlightPedidoInPaquetesMatriz } from './paquetesConsolidacionView.js';
import { loadPedidosConsolidacionTab } from './pedidosConsolidacionView.js';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

let allRows = [];
let pedidosCountMap = {};
let selectedIds = new Set();

// ==================== RENDER ====================
export function renderProgramacionView() {
  return `
    <div class="container-fluid prog-bandeja-page">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi bi-calendar-check"></i> Programación</h3>
          <p class="text-muted mb-0">Bandeja maestra de seguimiento: todos los expedientes que pasaron por Programación, con estado y responsable actuales.</p>
        </div>
        <div class="d-flex gap-2">
          <button id="progConsolidar" class="btn btn-sm btn-success" disabled>
            <i class="bi bi-box-seam"></i> Consolidar Requerimientos
          </button>
          <span id="progSeleccionados" class="badge bg-secondary align-self-center">0 seleccionados</span>
          <button id="progReload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
        </div>
      </div>
      <hr/>
      <ul class="nav nav-tabs mb-3" id="progTabs">
        <li class="nav-item"><a class="nav-link active" href="#" data-tab="bandeja">📋 Bandeja</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-tab="paquetes">📦 Paquetes</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-tab="pedidos">📑 Pedidos</a></li>
      </ul>
      <div id="progTrazaSummaryWrap">${renderSummaryCardsHtml('progTrazaSummary')}</div>
      <div id="progFilterWrap">${renderFilterBarHtml('prog')}</div>
      <div id="progContent"><div class="text-muted">Cargando…</div></div>
    </div>
    <style>${bandejaTableStyles()}${actosBandejaStyles()}
      .prog-bandeja-page { overflow: visible; padding-bottom: 2rem; }
      .prog-bandeja-wrap .table-responsive { overflow-x: auto; overflow-y: visible; }
      .prog-bandeja-wrap .req-list-table { table-layout: auto; width: 100%; min-width: 1280px; }
    </style>
  `;
}

function getPayloadItemTexts(r) {
  let codigosSigamef = '';
  let descripcionesBien = '';
  try {
    const p = JSON.parse(r.payload || '{}');
    const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
    if (Array.isArray(items) && items.length) {
      codigosSigamef = items.map((it) => it.item_bien || '').filter(Boolean).join(', ');
      descripcionesBien = items.map((it) => it.nombre_item || '').filter(Boolean).join(', ');
    }
  } catch (_) {}
  return { codigosSigamef, descripcionesBien };
}

function getResponsableRolDisplay(r) {
  const resp = String(r?.responsable_actual || r?.responsableActual || '').trim();
  if (/program/i.test(resp)) return 'Programación';
  return getRolDisplayFromRow(r);
}

function renderPedidosAdjuntosCell(pedCnt, reqId) {
  if (pedCnt > 0) {
    return `<button type="button" class="btn btn-sm btn-link p-0 prog-ver-pedidos" data-id="${reqId}" title="Ver pedidos SIGAMEF asociados">
      <span class="badge bg-success">${pedCnt} pedido${pedCnt === 1 ? '' : 's'}</span>
    </button>`;
  }
  return '<span class="text-muted small">Sin pedidos</span>';
}

function programacionBandejaHeaders() {
  return `
    <th style="width:35px;"><input type="checkbox" id="progSelectAll" title="Seleccionar todos"></th>
    <th class="req-col-timeline" title="Timeline">🕒</th>
    <th>N° Requerimiento</th>
    <th>Paquete</th>
    <th>Pedido SIGAMEF</th>
    <th>Código SIGAMEF</th>
    <th>Descripción</th>
    <th>Área Usuaria</th>
    <th>Estado Actual</th>
    <th>Responsable Actual</th>
    <th>Fecha Asignación</th>
    <th>Días</th>
    <th>Pedidos Adjuntos</th>
    <th class="req-col-acc"></th>`;
}

function renderProgramacionRowCells(r, opts = {}) {
  const { pedCnt = 0 } = opts;
  const { codigosSigamef, descripcionesBien } = getPayloadItemTexts(r);
  const paqBadge = r.codigo_paquete
    ? `<span class="badge bg-success">${esc(r.codigo_paquete)}</span>`
    : '<span class="text-muted small">Sin paquete</span>';
  const pedidos = r.pedidos_sigamef || r.pedidosSigamef || '';
  const pedidosDisplay = pedidos ? esc(pedidos) : '<span class="text-muted small">—</span>';
  const fechaAsig = r.fecha_estado_actual || r.fechaEstadoActual || '';
  const fechaFmt = fechaAsig ? String(fechaAsig).slice(0, 16).replace('T', ' ') : '—';
  const dias = r.dias_en_estado ?? r.diasEnEstado ?? 0;
  const resp = r.responsable_actual || r.responsableActual || '—';
  const rol = getResponsableRolDisplay(r);
  const estadoBadgeHtml = estadoModernBadge(
    r.estado_actual || r.estadoActual,
    r.estadoActualTexto || r.estado_actual_texto,
    r.estado,
  );
  const nombreItem = descripcionesBien || r.denominacion || '—';

  return `
    <td class="text-center"><button type="button" class="btn btn-link btn-sm p-0 req-traza text-secondary" data-id="${r.id}" onclick="event.stopPropagation()"><i class="bi bi-clock-history"></i></button></td>
    <td><strong>${esc(r.codigo || ('#' + r.id))}</strong></td>
    <td class="actos-col-paq">${paqBadge}</td>
    <td class="actos-col-pedido small">${pedidosDisplay}</td>
    <td class="actos-col-sigamef small">${esc(codigosSigamef || '—')}</td>
    <td class="actos-col-desc"><span class="req-desc-text" title="${esc(nombreItem)}">${esc(nombreItem)}</span></td>
    <td>${esc(r.area || '—')}</td>
    <td>${estadoBadgeHtml}</td>
    <td><div class="req-resp-name">${esc(resp)}</div><div class="req-resp-role">${esc(rol)}</div></td>
    <td class="small text-muted">${esc(fechaFmt)}</td>
    <td class="text-center"><span class="badge badge-dias-mod" style="background:${dias > 10 ? '#dc3545' : dias > 5 ? '#fd7e14' : '#198754'};color:#fff;">${dias}d</span></td>
    <td class="text-center">${renderPedidosAdjuntosCell(pedCnt, r.id)}</td>`;
}

let currentTab = 'bandeja';
let progListFilters = {};

// ==================== LOAD ====================
async function loadBandeja() {
  setTabChrome('bandeja');
  const cont = document.getElementById('progContent');
  if (!cont) return;
  try {
    cont.innerHTML = '<div class="text-muted">Cargando…</div>';
    let rows = await fetchBandejaProgramacion(progListFilters);
    let countMap = {};
    try { countMap = await programacionService.getPedidosCount(); } catch (_) {}

    pedidosCountMap = countMap || {};

    rows = applyBandejaFilters(rows, progListFilters);
    rows = rows.map(enrichReqRow);
    allRows = rows;
    updateSummaryCards(rows, 'progTrazaSummary');

    selectedIds = new Set();

    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay requerimientos que coincidan con los filtros.</div>';
      return;
    }

    const tbody = rows.map((r) => {
      const pedCnt = pedidosCountMap[r.id] || 0;
      const inPaq = !!(r.codigo_paquete);
      const esAprobadoDec = r.estado === 'Aprobado DEC';
      const canSelect = esAprobadoDec && !inPaq && pedCnt > 0;
      return `
        <tr data-req-id="${r.id}">
          <td onclick="event.stopPropagation()"><input type="checkbox" class="prog-select" data-id="${r.id}" ${canSelect ? '' : 'disabled'} title="${!canSelect ? (pedCnt === 0 ? 'Sin pedidos asociados' : inPaq ? 'Ya consolidado' : 'No seleccionable') : 'Seleccionar'}"></td>
          ${renderProgramacionRowCells(r, { pedCnt })}
          ${renderActionMenuCell(r.id, progMenuItems(r), progHiddenActions(r))}
        </tr>`;
    }).join('');

    cont.innerHTML = `
      <div class="table-responsive prog-bandeja-wrap actos-bandeja-wrap">
        <table class="table table-sm table-hover table-bordered req-list-table mb-0">
          <thead class="table-light"><tr>${programacionBandejaHeaders()}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>`;

    bindBandejaEvents(cont);
    bindTrazabilidadButtons(cont);
    bindActionMenus(cont, {
      detail: (id) => {
        const req = allRows.find((x) => String(x.id) === String(id));
        if (req) openDetailPanel(req, { onAdjuntos: (rid) => manageAdjuntos(rid, true) });
      },
      obs: (id) => handleBandejaObservaciones(id, allRows, {
        submoduloLabel: 'Programación',
        puedeObservar: (r) => ['Aprobado DEC', 'En Programación'].includes(String(r.estado || '')) || /observ/i.test(String(r.estado || '')),
        onObservar: async (reqId, data) => {
          await contratacionesService.observarProgramacion(reqId, data.motivo, data.usuario, {
            destino_submodulo: data.destino_submodulo,
            destino_etapa: data.destino_etapa,
            destino_persona: data.destino_persona,
            origen_submodulo: 'Programación',
          });
        },
        onSubsanar: async (reqId, data) => {
          await requerimientosService.subsanarConDestino(reqId, {
            respuesta: data.texto,
            usuario: data.usuario,
            origen_submodulo: data.origen_submodulo || 'Programación',
            destino_submodulo: data.destino_submodulo,
            destino_etapa: data.destino_etapa,
            destino_persona: data.destino_persona,
          });
        },
        onAdjuntos: (rid) => manageAdjuntos(rid, true),
        onReload: () => loadBandeja(),
      }),
    });
    bindRowDetailPanel(cont, allRows, { onAdjuntos: (id) => manageAdjuntos(id, true) });
    updateConsolidarBtn();
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error al cargar: ${esc(e.message)}</div>`;
  }
}

function estadoBadge(estado) {
  const e = String(estado || '');
  if (/observ/i.test(e)) return `<span class="badge bg-danger">${esc(e)}</span>`;
  if (e === 'Programado') return `<span class="badge bg-primary">${esc(e)}</span>`;
  if (/aprobad/i.test(e)) return `<span class="badge bg-success">${esc(e)}</span>`;
  return `<span class="badge bg-secondary">${esc(e)}</span>`;
}

function bindBandejaEvents(cont) {
  const selectAll = cont.querySelector('#progSelectAll');
  if (selectAll) selectAll.onchange = () => {
    cont.querySelectorAll('.prog-select:not(:disabled)').forEach((cb) => {
      cb.checked = selectAll.checked;
      if (cb.checked) selectedIds.add(Number(cb.dataset.id));
      else selectedIds.delete(Number(cb.dataset.id));
    });
    updateConsolidarBtn();
  };

  cont.querySelectorAll('.prog-select').forEach((cb) => cb.onchange = () => {
    if (cb.checked) selectedIds.add(Number(cb.dataset.id));
    else selectedIds.delete(Number(cb.dataset.id));
    updateConsolidarBtn();
  });

  cont.querySelectorAll('.prog-add-pedido').forEach((b) => b.onclick = () => openAsociarPedidosModal(Number(b.dataset.id)));
  cont.querySelectorAll('.prog-ver').forEach((b) => b.onclick = () => printRequerimiento(b.dataset.id));
  cont.querySelectorAll('.prog-attach').forEach((b) => b.onclick = () => manageAdjuntos(b.dataset.id, true));
  cont.querySelectorAll('.prog-aprobar').forEach((b) => b.onclick = () => aprobarProgramacion(Number(b.dataset.id)));
  cont.querySelectorAll('.prog-observar').forEach((b) => b.onclick = () => observarProgramacion(Number(b.dataset.id)));
  allRows.forEach((r) => cargarContadorAdjuntos(r.id));

  cont.querySelectorAll('.prog-ver-pedidos').forEach((b) => b.onclick = () => openVerPedidosModal(Number(b.dataset.id)));

  cont.querySelectorAll('.prog-paq-detail').forEach((b) => b.onclick = () => openPaqueteDetail(Number(b.dataset.id)));
  cont.querySelectorAll('.prog-paq-approve').forEach((b) => b.onclick = () => aprobarPaquete(Number(b.dataset.id)));
  cont.querySelectorAll('.prog-paq-del').forEach((b) => b.onclick = () => eliminarPaquete(Number(b.dataset.id)));
}

function updateConsolidarBtn() {
  const btn = document.getElementById('progConsolidar');
  const label = document.getElementById('progSeleccionados');
  const count = selectedIds.size;
  if (btn) btn.disabled = count < 2;
  if (label) label.textContent = `${count} seleccionados`;
}

async function aprobarProgramacion(id) {
  if (!confirm('¿Confirmar aprobación? El expediente pasará a Coordinación CM (Programado).')) return;
  try {
    const user = authService.getCurrentUser() || {};
    const res = await contratacionesService.aprobarProgramacion(id, getUserDisplayName(user));
    if (res && res.success === false) throw new Error('No se pudo aprobar');
    loadBandeja();
  } catch (e) {
    alert('Error al aprobar: ' + e.message);
  }
}

async function observarProgramacion(id) {
  const req = allRows.find((x) => String(x.id) === String(id));
  if (!req) return;
  const user = authService.getCurrentUser() || {};
  const userName = getUserDisplayName(user);
  const pending = getObservacionPendiente(req);
  const allObs = todasObservaciones(req);

  if (observacionPendienteParaSubmodulo(pending, 'Programación')) {
    const data = await showSubsanacionDirigidaModal({
      title: 'Responder observación',
      historyHtml: historialHtml(allObs),
      origenSubmodulo: 'Programación',
      defaultDestinoSubmodulo: 'Coordinación CM',
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
        origen_submodulo: 'Programación',
        destino_submodulo: data.destino_submodulo,
        destino_etapa: data.destino_etapa,
        destino_persona: data.destino_persona,
      });
      loadBandeja();
    } catch (e) {
      alert('Error al responder: ' + e.message);
    }
    return;
  }

  const data = await showObservacionDirigidaModal({
    title: pending ? 'Continuar conversación — Programación' : 'Observar requerimiento desde Programación',
    historyHtml: historialHtml(allObs),
    origenSubmodulo: 'Programación',
    defaultDestinoSubmodulo: 'Coordinación CM',
    placeholder: 'Indique el motivo...',
    buttonText: pending ? 'Reenviar observación' : 'Observar',
    buttonClass: 'btn-danger',
  });
  if (!data) return;
  try {
    await contratacionesService.observarProgramacion(id, data.motivo, userName, {
      destino_submodulo: data.destino_submodulo,
      destino_etapa: data.destino_etapa,
      destino_persona: data.destino_persona,
      origen_submodulo: data.origen_submodulo || 'Programación',
    });
    loadBandeja();
  } catch (e) {
    alert('Error al observar: ' + e.message);
  }
}

// ==================== MODAL: ASOCIAR PEDIDOS ====================
function setupDraggableModal(modalEl) {
  if (modalEl._dragCleanup) modalEl._dragCleanup();
  const dialog = modalEl.querySelector('.modal-dialog');
  const header = modalEl.querySelector('.modal-header');
  if (!dialog || !header) return;

  modalEl.style.background = 'transparent';
  modalEl.style.pointerEvents = 'none';
  dialog.style.pointerEvents = 'auto';
  dialog.style.position = 'fixed';
  dialog.style.margin = '0';
  dialog.style.zIndex = '1055';

  if (!modalEl._posInit) {
    dialog.style.top = '80px';
    dialog.style.left = '50%';
    dialog.style.transform = 'translateX(-50%)';
    modalEl._posInit = true;
  }

  header.style.cursor = 'move';
  header.style.userSelect = 'none';

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onMouseDown = (e) => {
    if (e.target.closest('.btn-close')) return;
    dragging = true;
    const rect = dialog.getBoundingClientRect();
    dialog.style.transform = 'none';
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
  };
  const onMouseMove = (e) => {
    if (!dragging) return;
    dialog.style.left = `${e.clientX - offsetX}px`;
    dialog.style.top = `${e.clientY - offsetY}px`;
  };
  const onMouseUp = () => { dragging = false; };

  header.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  modalEl._dragCleanup = () => {
    header.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
}

function pedidoSearchAction(p, assocIds) {
  const inList = assocIds.has(p.id);
  const yaAsignado = inList || p.asignado_este || p.asignado_otro || p.asignado;
  if (yaAsignado) {
    let title = 'Ya agregado a este requerimiento';
    if (p.asignado_otro) title = `Ya asignado a ${p.requerimiento_codigo || 'otro requerimiento'}`;
    return `<button class="btn btn-xs btn-outline-primary" disabled title="${esc(title)}"><i class="bi bi-check-circle-fill"></i></button>`;
  }
  return `<button class="btn btn-xs btn-outline-primary add-ped-result" data-ped='${JSON.stringify(p).replace(/'/g, '&#39;')}' title="Agregar"><i class="bi bi-plus-circle"></i></button>`;
}

async function openAsociarPedidosModal(requerimientoId) {
  const req = allRows.find((r) => r.id === requerimientoId);
  const reqLabel = req ? (req.codigo || 'REQ-' + String(req.id).padStart(5, '0')) : '#' + requerimientoId;

  let currentPedidos = [];
  try {
    const resp = await programacionService.getPedidos(requerimientoId);
    currentPedidos = (resp && resp.data) || [];
  } catch (_) {}

  const tempPedidos = [...currentPedidos];
  const newPedidoIds = [];

  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'transparent';
  modal.style.pointerEvents = 'none';
  modal.setAttribute('tabindex', '-1');

  function renderModal() {
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content shadow">
          <div class="modal-header bg-success text-white prog-modal-drag">
            <h5 class="modal-title"><i class="bi bi-link-45deg"></i> Asociar Pedidos SIGAMEF al Requerimiento ${esc(reqLabel)}</h5>
            <button type="button" class="btn-close btn-close-white" id="closeAsociar"></button>
          </div>
          <div class="modal-body">
            <div class="mb-3">
              <label class="form-label fw-bold">Buscar Pedido SIGAMEF</label>
              <div class="input-group">
                <input type="text" class="form-control" id="buscarPedidoInput" placeholder="Código, número o descripción...">
                <button class="btn btn-outline-primary" id="buscarPedidoBtn"><i class="bi bi-search"></i> Buscar</button>
              </div>
              <div id="buscarPedidoResults" class="mt-2"></div>
            </div>
            <hr/>
            <h6>Pedidos Asociados (${tempPedidos.length})</h6>
            <div id="pedidosAsociadosList">
              ${tempPedidos.length === 0 ? '<p class="text-muted small">No hay pedidos asociados.</p>' : `
                <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
                  <thead class="table-light"><tr>
                    <th>Año</th><th>Tipo</th><th>Pedido Sigamef</th><th>Centro</th><th>Código SIGAMEF</th>
                    <th>Descripción</th><th>Cantidad</th><th>P.Unit.</th><th>Total</th><th>Acción</th>
                  </tr></thead>
                  <tbody>
                    ${tempPedidos.map((p, i) => `
                      <tr>
                        <td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td>
                        <td>${esc(p.nro_pedido)}</td><td>${esc(p.centro)}</td><td class="small">${esc(p.codigo_sigamef || '')}</td>
                        <td class="small">${esc(p.descripcion)}</td>
                        <td class="text-end">${parseFloat(p.cant_solicitada || 0).toFixed(2)}</td>
                        <td class="text-end">${parseFloat(p.precio_unitario || 0).toFixed(2)}</td>
                        <td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td>
                        <td class="text-center"><button class="btn btn-xs btn-outline-danger remove-ped" data-idx="${i}" title="Eliminar"><i class="bi bi-trash"></i></button></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>`
              }
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelAsociar">Cancelar</button>
            <button class="btn btn-success" id="guardarAsociar"><i class="bi bi-save"></i> Guardar</button>
          </div>
        </div>
      </div>
    `;

    setupDraggableModal(modal);
    modal.querySelector('#closeAsociar').onclick = () => {
      if (modal._dragCleanup) modal._dragCleanup();
      modal.remove();
    };
    modal.querySelector('#cancelAsociar').onclick = () => {
      if (modal._dragCleanup) modal._dragCleanup();
      modal.remove();
    };

    const searchInput = modal.querySelector('#buscarPedidoInput');
    const searchBtn = modal.querySelector('#buscarPedidoBtn');
    const resultsDiv = modal.querySelector('#buscarPedidoResults');

    async function doSearch() {
      const q = searchInput.value.trim();
      if (!q) return;
      try {
        const resp = await programacionService.buscarPedido(q, requerimientoId);
        const results = (resp && resp.data) || [];
        if (!results.length) {
          resultsDiv.innerHTML = '<p class="text-muted small">No se encontraron pedidos.</p>';
          return;
        }
        const assocIds = new Set(tempPedidos.map((p) => p.id));
        resultsDiv.innerHTML = `
          <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
            <thead class="table-light"><tr>
              <th>Año</th><th>Tipo</th><th>Pedido Sigamef</th><th>Centro</th><th>Código SIGAMEF</th>
              <th>Descripción</th><th>Cantidad</th><th>P.Unit.</th><th>Total</th><th></th>
            </tr></thead>
            <tbody>
              ${results.map((p) => `
                <tr>
                  <td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td>
                  <td>${esc(p.nro_pedido)}</td><td>${esc(p.centro)}</td><td class="small">${esc(p.codigo_sigamef || '')}</td>
                  <td class="small">${esc(p.descripcion)}</td>
                  <td class="text-end">${parseFloat(p.cant_solicitada || 0).toFixed(2)}</td>
                  <td class="text-end">${parseFloat(p.precio_unitario || 0).toFixed(2)}</td>
                  <td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td>
                  <td class="text-center">${pedidoSearchAction(p, assocIds)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`;
        resultsDiv.querySelectorAll('.add-ped-result').forEach((b) => {
          b.onclick = () => {
            const ped = JSON.parse(b.dataset.ped);
            if (ped.asignado_otro) {
              alert(`Este pedido ya está asignado a ${ped.requerimiento_codigo || 'otro requerimiento'}.`);
              return;
            }
            tempPedidos.push(ped);
            newPedidoIds.push(ped.id);
            renderModal();
          };
        });
      } catch (e) {
        resultsDiv.innerHTML = `<p class="text-danger small">Error: ${esc(e.message)}</p>`;
      }
    }

    searchBtn.onclick = doSearch;
    searchInput.onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };

    modal.querySelectorAll('.remove-ped').forEach((b) => {
      b.onclick = () => {
        const idx = Number(b.dataset.idx);
        const removed = tempPedidos.splice(idx, 1)[0];
        const nIdx = newPedidoIds.indexOf(removed.id);
        if (nIdx >= 0) newPedidoIds.splice(nIdx, 1);
        renderModal();
      };
    });

    modal.querySelector('#guardarAsociar').onclick = async () => {
      try {
        for (const orig of currentPedidos) {
          if (!tempPedidos.some((tp) => tp.id === orig.id)) {
            await programacionService.eliminarAsociacion(orig.asociacion_id);
          }
        }
        if (newPedidoIds.length) {
          const user = authService.getCurrentUser();
          await programacionService.asociarPedidos({
            requerimiento_id: requerimientoId,
            pedido_ids: newPedidoIds,
            usuario: user ? (user.nombre || user.dni || '') : '',
          });
        }
        if (modal._dragCleanup) modal._dragCleanup();
        modal.remove();
        alert('✅ Pedidos asociados correctamente.');
        loadBandeja();
      } catch (e) {
        alert('❌ Error al guardar: ' + e.message);
      }
    };
  }

  renderModal();
  document.body.appendChild(modal);
}

// ==================== MODAL: VER PEDIDOS ====================
async function openVerPedidosModal(requerimientoId) {
  const req = allRows.find((r) => r.id === requerimientoId);
  const reqLabel = req ? (req.codigo || 'REQ-' + String(req.id).padStart(5, '0')) : '#' + requerimientoId;
  let pedidos = [];
  try {
    const resp = await programacionService.getPedidos(requerimientoId);
    pedidos = (resp && resp.data) || [];
  } catch (_) {}

  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,0.5)';
  modal.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">📎 Pedidos Asociados — ${esc(reqLabel)}</h5>
          <button type="button" class="btn-close" id="closeVerPed"></button>
        </div>
        <div class="modal-body">
          ${pedidos.length === 0 ? '<p class="text-muted">No hay pedidos asociados.</p>' : `
            <table class="table table-sm table-bordered" style="font-size:10px; font-family:Arial;">
              <thead class="table-light"><tr>
                <th>Código</th><th>Año</th><th>Tipo</th><th>Nro Pedido</th><th>Centro</th><th>C. Costo</th>
                <th>Descripción</th><th>Cantidad</th><th>P.Unit.</th><th>Total</th>
              </tr></thead>
              <tbody>
                ${pedidos.map((p) => `
                  <tr>
                    <td>${esc(p.codigo_pedido)}</td><td>${esc(p.ano_eje)}</td><td>${esc(p.tipo)}</td>
                    <td>${esc(p.nro_pedido)}</td><td>${esc(p.centro)}</td><td class="small">${esc(p.centro_costo)}</td>
                    <td class="small">${esc(p.descripcion)}</td>
                    <td class="text-end">${parseFloat(p.cant_solicitada || 0).toFixed(2)}</td>
                    <td class="text-end">${parseFloat(p.precio_unitario || 0).toFixed(2)}</td>
                    <td class="text-end">${parseFloat(p.total_item || 0).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
          }
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" id="cerrarVerPed">Cerrar</button></div>
      </div>
    </div>`;
  modal.querySelector('#closeVerPed').onclick = () => modal.remove();
  modal.querySelector('#cerrarVerPed').onclick = () => modal.remove();
  document.body.appendChild(modal);
}

// ==================== CONSOLIDAR ====================
function openConsolidarModal() {
  const selReqs = allRows.filter((r) => selectedIds.has(r.id));
  if (selReqs.length < 2) { alert('Seleccione al menos 2 requerimientos.'); return; }

  for (const r of selReqs) {
    if (/anulad/i.test(String(r.estado || ''))) { alert(`${r.codigo} está anulado.`); return; }
    if (/programad/i.test(String(r.estado || ''))) { alert(`${r.codigo} ya fue programado.`); return; }
    if (r.codigo_paquete) { alert(`${r.codigo} ya pertenece a un paquete.`); return; }
    if (!(pedidosCountMap[r.id] > 0)) { alert(`${r.codigo} no tiene pedidos SIGAMEF asociados.`); return; }
  }

  const modal = document.createElement('div');
  modal.className = 'modal fade show d-block';
  modal.style.background = 'rgba(0,0,0,0.5)';
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header bg-success text-white">
          <h5 class="modal-title"><i class="bi bi-box-seam"></i> Consolidar Requerimientos</h5>
          <button type="button" class="btn-close btn-close-white" id="closeConsolidar"></button>
        </div>
        <div class="modal-body">
          <p><strong>Requerimientos seleccionados:</strong></p>
          <ul>${selReqs.map((r) => `<li>${esc(r.codigo || 'REQ-' + String(r.id).padStart(5, '0'))} — ${esc(r.denominacion || r.area || '')}</li>`).join('')}</ul>
          <p class="fw-bold">Cantidad: ${selReqs.length} requerimientos</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancelConsolidar">Cancelar</button>
          <button class="btn btn-success" id="crearPaquete"><i class="bi bi-box-seam"></i> Crear Paquete</button>
        </div>
      </div>
    </div>`;

  modal.querySelector('#closeConsolidar').onclick = () => modal.remove();
  modal.querySelector('#cancelConsolidar').onclick = () => modal.remove();
  modal.querySelector('#crearPaquete').onclick = async () => {
    try {
      const user = authService.getCurrentUser();
      const resp = await programacionService.crearPaquete({
        requerimiento_ids: [...selectedIds],
        usuario: user ? (user.nombre || user.dni || '') : '',
      });
      modal.remove();
      alert(`✅ Paquete ${resp.paquete.codigo_paquete} creado exitosamente.`);
      selectedIds = new Set();
      loadBandeja();
    } catch (e) {
      alert('❌ Error al crear paquete: ' + e.message);
    }
  };

  document.body.appendChild(modal);
}

function paquetePedidosFooter(peds) {
  const montoTotal = peds.reduce((s, p) => s + Number(p.total_item || 0), 0);
  const codigos = [...new Set(peds.map((p) => String(p.codigo_sigamef || '').trim()).filter(Boolean))];
  const mismoCodigo = codigos.length === 1 && peds.length > 0;
  const cantidadTotal = mismoCodigo
    ? peds.reduce((s, p) => s + Math.round(Number(p.cant_solicitada || 0)), 0)
    : null;
  const money = (n) => 'S/. ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return { montoTotal, cantidadTotal, money };
}

function paquetePedidosTableHtml(peds) {
  const fmtMoney = (n) => parseFloat(n || 0).toFixed(2);
  const fmtQty = (n) => String(Math.round(Number(n || 0)));
  const { montoTotal, cantidadTotal, money } = paquetePedidosFooter(peds);
  return `
    <table class="table table-sm table-bordered mb-0 req-list-table">
      <thead class="table-light"><tr>
        <th>Año</th><th>Tipo</th><th>Requerimiento</th><th>Pedido Sigamef</th><th>Centro</th><th>Área usuaria</th>
        <th>Meta</th><th>Clasificador</th><th>Código SIGAMEF</th><th>Descripción</th><th>Unidad medida</th>
        <th>Cantidad</th><th>Precio unitario</th><th>Precio total</th>
      </tr></thead>
      <tbody>
        ${peds.length ? peds.map((p) => `
          <tr>
            <td>${esc(p.ano_eje)}</td>
            <td>${esc(p.tipo)}</td>
            <td>${esc(p.requerimiento_codigo || ('REQ-' + String(p.requerimiento_id || '').padStart(5, '0')))}</td>
            <td>${esc(p.nro_pedido)}</td>
            <td>${esc(p.centro)}</td>
            <td class="small">${esc(p.area_usuaria || '')}</td>
            <td>${esc(p.sec_func || '')}</td>
            <td>${esc(p.especifica || '')}</td>
            <td class="small">${esc(p.codigo_sigamef || '')}</td>
            <td class="small">${esc(p.descripcion)}</td>
            <td>${esc(p.unidad_medida || '')}</td>
            <td class="text-end">${fmtQty(p.cant_solicitada)}</td>
            <td class="text-end">${fmtMoney(p.precio_unitario)}</td>
            <td class="text-end">${fmtMoney(p.total_item)}</td>
          </tr>
        `).join('') : '<tr><td colspan="14" class="text-center text-muted">No hay pedidos asociados.</td></tr>'}
        ${peds.length ? `<tr class="table-light"><td colspan="11"></td><td class="text-end">${cantidadTotal != null ? `<strong>${cantidadTotal}</strong>` : ''}</td><td class="text-end"><strong>Total</strong></td><td class="text-end"><strong>${money(montoTotal)}</strong></td></tr>` : ''}
      </tbody>
    </table>`;
}

// ==================== PAQUETE DETAIL ====================
async function openPaqueteDetail(paqueteId) {
  const cont = document.getElementById('progContent');
  if (!cont) return;
  try {
    const d = await programacionService.getPaquete(paqueteId);
    const p = d.paquete;
    const reqs = d.requerimientos || [];
    const peds = d.pedidos || [];

    cont.innerHTML = `
      <div class="mb-3">
        <button class="btn btn-sm btn-outline-secondary" id="backToBandeja"><i class="bi bi-arrow-left"></i> Volver a Bandeja</button>
      </div>
      <div class="card mb-3">
        <div class="card-header bg-primary text-white"><h5 class="mb-0">📦 ${esc(p.codigo_paquete)}</h5></div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-3"><strong>Estado:</strong> <span class="badge ${p.estado === 'Aprobado' ? 'bg-success' : 'bg-info'}">${esc(p.estado)}</span></div>
            <div class="col-md-3"><strong>Requerimientos:</strong> ${reqs.length}</div>
            <div class="col-md-3"><strong>Fecha creación:</strong> ${p.fecha_creacion ? String(p.fecha_creacion).slice(0, 10) : ''}</div>
            <div class="col-md-3"><strong>Creado por:</strong> ${esc(p.usuario_creacion)}</div>
          </div>
          ${p.estado === 'Aprobado' ? `
          <div class="row mt-2">
            <div class="col-md-3"><strong>Aprobado por:</strong> ${esc(p.usuario_aprobacion)}</div>
            <div class="col-md-3"><strong>Fecha aprobación:</strong> ${p.fecha_aprobacion ? String(p.fecha_aprobacion).slice(0, 10) : ''}</div>
          </div>` : ''}
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h6 class="mb-0">Pedidos SIGAMEF asociados a requerimientos (${peds.length})</h6></div>
        <div class="card-body p-0 table-responsive">
          ${paquetePedidosTableHtml(peds)}
        </div>
      </div>

      <div class="d-flex gap-2">
        ${p.estado === 'Pendiente' ? `<button class="btn btn-success" id="paqApproveDetail" data-id="${p.id}"><i class="bi bi-check-circle"></i> Aprobar Paquete</button>` : ''}
        <button class="btn btn-outline-dark" id="paqPrint" data-id="${p.id}"><i class="bi bi-printer"></i> Reporte</button>
      </div>
    `;

    cont.querySelector('#backToBandeja').onclick = () => { currentTab = 'bandeja'; loadBandeja(); };
    const approveBtn = cont.querySelector('#paqApproveDetail');
    if (approveBtn) approveBtn.onclick = () => aprobarPaquete(Number(approveBtn.dataset.id));
    const printBtn = cont.querySelector('#paqPrint');
    if (printBtn) printBtn.onclick = () => printPaquete(d);
  } catch (e) {
    cont.innerHTML = `<div class="alert alert-danger">Error: ${esc(e.message)}</div>`;
  }
}

async function aprobarPaquete(id) {
  if (!confirm('¿Aprobar este paquete? Los requerimientos serán enviados a Coordinación CM.')) return;
  try {
    const user = authService.getCurrentUser();
    await programacionService.aprobarPaquete(id, { usuario: user ? (user.nombre || user.dni || '') : '' });
    alert('✅ Paquete aprobado exitosamente.');
    if (currentTab === 'paquetes') loadPaquetesTab();
    else if (currentTab === 'pedidos') loadPedidosTab();
    else loadBandeja();
  } catch (e) {
    alert('❌ Error al aprobar: ' + e.message);
  }
}

async function eliminarPaquete(id) {
  if (!confirm('¿Eliminar este paquete? Los requerimientos quedarán libres.')) return;
  try {
    await programacionService.eliminarPaquete(id);
    alert('✅ Paquete eliminado.');
    if (currentTab === 'paquetes') loadPaquetesTab();
    else if (currentTab === 'pedidos') loadPedidosTab();
    else loadBandeja();
  } catch (e) {
    alert('❌ Error al eliminar: ' + e.message);
  }
}

function setTabChrome(tab) {
  const showBandeja = tab === 'bandeja';
  const summary = document.getElementById('progTrazaSummaryWrap');
  const filters = document.getElementById('progFilterWrap');
  const consolidar = document.getElementById('progConsolidar');
  const selBadge = document.getElementById('progSeleccionados');
  if (summary) summary.style.display = showBandeja ? '' : 'none';
  if (filters) filters.style.display = showBandeja ? '' : 'none';
  if (consolidar) consolidar.style.display = showBandeja ? '' : 'none';
  if (selBadge) selBadge.style.display = showBandeja ? '' : 'none';
}

async function goToPaqueteFromPedido(paqueteId, pedidoId) {
  document.querySelectorAll('#progTabs .nav-link').forEach((t) => t.classList.remove('active'));
  const tab = document.querySelector('#progTabs [data-tab="paquetes"]');
  if (tab) tab.classList.add('active');
  currentTab = 'paquetes';
  await loadPaquetesTab();
  openPaquetePanel(paqueteId);
  highlightPedidoInPaquetesMatriz(paqueteId, pedidoId);
}

async function loadPaquetesTab() {
  setTabChrome('paquetes');
  await loadPaquetesConsolidacionTab('progContent', {
    onApprove: aprobarPaquete,
    onDelete: eliminarPaquete,
  });
}

async function loadPedidosTab() {
  setTabChrome('pedidos');
  await loadPedidosConsolidacionTab('progContent', {
    onGoToPaquete: goToPaqueteFromPedido,
  });
}

// ==================== REPORT ====================
function printPaquete(detail) {
  const p = detail.paquete;
  const peds = detail.pedidos || [];
  const fmtMoney = (n) => parseFloat(n || 0).toFixed(2);
  const fmtQty = (n) => String(Math.round(Number(n || 0)));
  const { montoTotal, cantidadTotal, money } = paquetePedidosFooter(peds);

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>Reporte ${p.codigo_paquete}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 10pt; margin: 20px; }
      h2 { text-align: center; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
      th, td { border: 1px solid #999; padding: 4px 6px; font-size: 9pt; }
      th { background: #e9ecef; text-align: left; }
      .text-end { text-align: right; }
      .section { margin-top: 15px; font-weight: bold; font-size: 11pt; }
      @media print { button { display: none; } }
    </style></head><body>
    <h2>REPORTE DE PAQUETE DE CONSOLIDACIÓN</h2>
    <p><strong>Código:</strong> ${esc(p.codigo_paquete)} &nbsp;&nbsp;
       <strong>Estado:</strong> ${esc(p.estado)} &nbsp;&nbsp;
       <strong>Fecha:</strong> ${p.fecha_creacion ? String(p.fecha_creacion).slice(0, 10) : ''} &nbsp;&nbsp;
       <strong>Creado por:</strong> ${esc(p.usuario_creacion)}</p>
    ${p.estado === 'Aprobado' ? `<p><strong>Aprobado por:</strong> ${esc(p.usuario_aprobacion)} &nbsp;&nbsp; <strong>Fecha aprobación:</strong> ${p.fecha_aprobacion ? String(p.fecha_aprobacion).slice(0, 10) : ''}</p>` : ''}

    <p class="section">Pedidos SIGAMEF asociados a requerimientos (${peds.length})</p>
    <table>
      <tr>
        <th>Año</th><th>Tipo</th><th>Requerimiento</th><th>Pedido Sigamef</th><th>Centro</th><th>Área usuaria</th>
        <th>Meta</th><th>Clasificador</th><th>Código SIGAMEF</th><th>Descripción</th><th>Unidad medida</th>
        <th>Cantidad</th><th>Precio unitario</th><th>Precio total</th>
      </tr>
      ${peds.map((ped) => `<tr>
        <td>${esc(ped.ano_eje)}</td><td>${esc(ped.tipo)}</td>
        <td>${esc(ped.requerimiento_codigo || '')}</td><td>${esc(ped.nro_pedido)}</td><td>${esc(ped.centro)}</td>
        <td>${esc(ped.area_usuaria || '')}</td><td>${esc(ped.sec_func || '')}</td><td>${esc(ped.especifica || '')}</td>
        <td>${esc(ped.codigo_sigamef || '')}</td><td>${esc(ped.descripcion)}</td><td>${esc(ped.unidad_medida || '')}</td>
        <td class="text-end">${fmtQty(ped.cant_solicitada)}</td><td class="text-end">${fmtMoney(ped.precio_unitario)}</td>
        <td class="text-end">${fmtMoney(ped.total_item)}</td>
      </tr>`).join('')}
      <tr><td colspan="11"></td><td class="text-end">${cantidadTotal != null ? `<strong>${cantidadTotal}</strong>` : ''}</td><td class="text-end"><strong>Total</strong></td><td class="text-end"><strong>${money(montoTotal)}</strong></td></tr>
    </table>

    <br/><button onclick="window.print()">Imprimir</button>
  </body></html>`);
  w.document.close();
}

// ==================== INIT ====================
export function initProgramacionView() {
  try {
    const reload = document.getElementById('progReload');
    if (reload) reload.onclick = () => {
      if (currentTab === 'bandeja') loadBandeja();
      else if (currentTab === 'paquetes') loadPaquetesTab();
      else loadPedidosTab();
    };

    const consolidarBtn = document.getElementById('progConsolidar');
    if (consolidarBtn) consolidarBtn.onclick = () => openConsolidarModal();

    document.querySelectorAll('#progTabs .nav-link').forEach((tab) => {
      tab.onclick = (e) => {
        e.preventDefault();
        document.querySelectorAll('#progTabs .nav-link').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        currentTab = tab.dataset.tab;
        if (currentTab === 'bandeja') loadBandeja();
        else if (currentTab === 'paquetes') loadPaquetesTab();
        else loadPedidosTab();
      };
    });

    bindBandejaToolbar({
      prefix: 'prog',
      onFilter: () => { progListFilters = readFilterParams('prog'); if (currentTab === 'bandeja') loadBandeja(); },
      onClear: () => { progListFilters = {}; if (currentTab === 'bandeja') loadBandeja(); },
      onExecutiveToggle: () => { if (currentTab === 'bandeja') loadBandeja(); },
    });

    currentTab = 'bandeja';
    loadBandeja();
  } catch (e) {
    const cont = document.getElementById('progContent');
    if (cont) cont.innerHTML = `<div class="alert alert-danger">Error al iniciar Programación: ${esc(e.message)}</div>`;
    console.error('initProgramacionView:', e);
  }
}