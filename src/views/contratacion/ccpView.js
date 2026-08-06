/**
 * Certificado de Crédito Presupuestal -CCP — bandeja, Acciones y consolidaciones.
 * Ruta: dec/ccp · OD35
 */
import { contratacionesService } from '../../services/contratacionesService.js';
import { bandejaTableStyles, getResponsableVigenteLabel } from '../../utils/trazabilidad.js';
import {
  renderActionMenuCell, bindActionMenus, closeBandejaActionMenus, renderResponsableCellHtml,
} from '../../utils/bandejaUi.js';
import { ccpMenuItems } from '../../utils/bandejaActions.js';
import { openCcpCodigoModal } from '../../utils/ccpCodigoModal.js';
import { renderBadgeEstadoVigenteHtml } from '../../../shared/estadoExpedienteVigente.js';
import {
  createViewLifecycle,
  createRequestSequenceGuard,
  isAbortError,
  createBackgroundRefreshIndicator,
  ensureBandejaTableShell,
  captureScroll,
  restoreScroll,
  setEmptyState,
} from '../../utils/uiState/index.js';

const VIEW_ID = 'ccp-certificacion';
const SCROLL_SEL = '#ccpScrollWrap';
const PREFIX = 'ccp';
const LIST_ID = 'ccpList';
const loadGuard = createRequestSequenceGuard();

let lifecycle = null;
let refreshIndicator = null;
let rowsCache = [];
let selectedIds = new Set();
let filtroEstado = '';
let filtroQ = '';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function canManageCcp() {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const rol = String(u.rol || u.role || '').toLowerCase();
    return rol === 'dec' || rol === 'admin';
  } catch (_) { return false; }
}

function currentUserLabel() {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return u.nombre || u.username || u.dni || '';
  } catch (_) { return ''; }
}

function updateSelectionUi() {
  const countEl = document.getElementById(`${PREFIX}SelCount`);
  const btn = document.getElementById(`${PREFIX}ConsolidarBtn`);
  const n = selectedIds.size;
  if (countEl) countEl.textContent = String(n);
  if (btn) btn.disabled = n < 1;
  const master = document.getElementById(`${PREFIX}SelectAll`);
  if (master) {
    const visibles = rowsCache.filter((r) => r.puede_seleccionar);
    master.checked = visibles.length > 0 && visibles.every((r) => selectedIds.has(r.requerimiento_id));
    master.indeterminate = selectedIds.size > 0 && !master.checked;
  }
}

function renderEstadoCell(row) {
  // Preferir contrato central; no reconstruir prioridad con solo flags CCP.
  if (row.estadoVigente?.codigo || row.estado_vigente) {
    return renderBadgeEstadoVigenteHtml({
      ...row,
      codigo_ccp: row.codigo_ccp || '',
      ccp_activo: !!row.ccp_activo || !!row.tiene_codigo,
      orden_estado: row.orden_estado || '',
      enviado_proveedor_at: row.enviado_proveedor_at || null,
      orden_id: row.orden_id || null,
      orden_resuelta: row.orden_resuelta,
      expediente_derivado_pago: row.expediente_derivado_pago,
      // RC8.1B — preservar evidencia de recepción de bienes para el badge global.
      recepcion_estado_global: row.recepcion_estado_global || '',
      recepcion_estado_interno: row.recepcion_estado_interno || '',
      recepcion_bienes_expediente_id: row.recepcion_bienes_expediente_id ?? null,
    }, esc);
  }
  const seed = {
    codigo_ccp: row.codigo_ccp || '',
    ccp_activo: !!row.ccp_activo || !!row.tiene_codigo,
    estado_cuadro: row.estado_cuadro || 'DERIVADO_CCP',
    solicitud_estado: row.solicitud_estado || 'EN_CCP',
    consolidacion_estado: row.consolidacion_estado || '',
    estado_ccp: row.estado_codigo || row.estado_ccp,
    orden_estado: row.orden_estado || '',
    enviado_proveedor_at: row.enviado_proveedor_at || null,
    orden_id: row.orden_id || null,
    orden_resuelta: row.orden_resuelta,
    expediente_derivado_pago: row.expediente_derivado_pago,
    // RC8.1B — preservar evidencia de recepción de bienes en el seed de fallback.
    recepcion_estado_global: row.recepcion_estado_global || '',
    recepcion_estado_interno: row.recepcion_estado_interno || '',
    recepcion_bienes_expediente_id: row.recepcion_bienes_expediente_id ?? null,
  };
  if (row.badge_style || row.ccp_registrado || row.tiene_codigo || row.orden_estado
    || row.enviado_proveedor_at || row.recepcion_estado_global) {
    return renderBadgeEstadoVigenteHtml(seed, esc);
  }
  const label = row.etiqueta_estado || row.estado_ccp_label || row.estado_ccp || '—';
  return `<span class="badge bg-secondary">${esc(label)}</span>`;
}

function renderRow(row) {
  const rid = row.requerimiento_id;
  const canSel = !!row.puede_seleccionar;
  const checked = selectedIds.has(rid) ? 'checked' : '';
  const centro = row.centro || '—';
  const ccpTxt = row.codigo_ccp ? esc(row.codigo_ccp) : '<span class="text-muted">Pendiente</span>';
  const esLocacion = row.origen_ccp === 'RECEPCION_COTIZACION_LOCACION';
  const tipoTxt = esLocacion
    ? 'Locación'
    : (row.tipo_label || row.tipo || '—');
  const origenTxt = esLocacion ? 'Recepción de Cotización' : (row.origen_ccp_label || 'Cuadro Comparativo');
  const menu = renderActionMenuCell(
    rid,
    ccpMenuItems(row, { canManage: canManageCcp() }),
    '',
  );
  return `
    <tr data-rid="${rid}" data-origen-ccp="${esc(row.origen_ccp || '')}">
      <td class="text-center">
        <input type="checkbox" class="form-check-input ccp-row-sel" data-rid="${rid}"
          ${canSel ? '' : 'disabled'} ${checked}
          title="${canSel ? 'Seleccionar' : (row.en_consolidacion_activa ? 'Ya consolidado' : 'No seleccionable')}" />
      </td>
      <td>
        <strong>${esc(row.requerimiento_codigo)}</strong>
        <div class="small text-muted text-truncate" style="max-width:220px" title="${esc(row.denominacion || '')}">${esc(row.denominacion || '')}</div>
        <div class="small mt-1">
          <span class="badge bg-light text-dark border">${esc(tipoTxt)}</span>
          <span class="text-muted">· ${esc(origenTxt)}</span>
          ${esLocacion ? '<span class="text-muted">· Cuadro: No aplica</span>' : ''}
        </div>
        ${row.proveedor_nombre ? `<div class="small text-muted mt-1">${esc(row.proveedor_nombre)}${row.monto_adjudicado != null ? ` · ${fmtMonto(row.monto_adjudicado, row.moneda)}` : ''}</div>` : ''}
      </td>
      <td><strong>${esc(row.solicitud_codigo || '—')}</strong></td>
      <td>${esc(centro)}</td>
      <td>${renderEstadoCell(row)}</td>
      <td class="small">${renderResponsableCellHtml(row, esc)}</td>
      <td class="small fw-semibold text-break" style="max-width:140px">${ccpTxt}</td>
      ${menu}
    </tr>`;
}

const THEAD = `<tr>
  <th class="text-center" style="width:36px">
    <input type="checkbox" class="form-check-input" id="${PREFIX}SelectAll" title="Seleccionar visibles" />
  </th>
  <th>Requerimiento</th>
  <th>Solicitud de Cotización</th>
  <th>Centro</th>
  <th>Estado</th>
  <th>Responsable actual</th>
  <th style="min-width:100px">CCP</th>
  <th class="text-center" style="width:70px">Acciones</th>
</tr>`;

function renderCcpView() {
  return `
    <style>
      ${bandejaTableStyles()}
      .ccp-codigo-cell .btn { white-space: nowrap; }
      #ccpScrollWrap { overflow: auto; }
      .ccp-toolbar { gap: .5rem; flex-wrap: wrap; }
      .ccp-filas-table th { font-size: .78rem; }
    </style>
    <div class="container-fluid mt-3" id="ccpRoot">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h2 class="mb-1"><i class="bi bi-journal-check"></i> Certificado de Crédito Presupuestal -CCP</h2>
          <p class="text-muted mb-0 small">Bandeja de requerimientos derivados a CCP. Registre el código, consolide y genere la solicitud Word.</p>
        </div>
        <div class="d-flex ccp-toolbar align-items-center">
          <span class="badge bg-light text-dark border">Seleccionados: <span id="${PREFIX}SelCount">0</span></span>
          <button type="button" class="btn btn-sm btn-success" id="${PREFIX}ConsolidarBtn" disabled>
            <i class="bi bi-layers"></i> Consolidar solicitud CCP
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="${PREFIX}RefreshBtn">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>
      </div>

      <div class="sgc-search-bar mb-3">
        <div class="row g-2 align-items-end">
          <div class="col-md-4">
            <label class="form-label small mb-0">Buscar</label>
            <input type="search" class="form-control form-control-sm" id="${PREFIX}Search"
              placeholder="Requerimiento, SC, centro, CCP…" />
          </div>
          <div class="col-md-3">
            <label class="form-label small mb-0">Estado</label>
            <select class="form-select form-select-sm" id="${PREFIX}FiltroEstado">
              <option value="">Todos</option>
              <option value="PENDIENTE_CONSOLIDACION">Pendiente de consolidación</option>
              <option value="SOLICITUD_PREPARADA">Solicitud CCP preparada</option>
              <option value="ENVIADA_OPPM">Solicitud enviada a OPPM</option>
              <option value="CCP_REGISTRADO">CCP registrado</option>
              <option value="OBSERVADO_OPPM">Observado por OPPM</option>
              <option value="ANULADO">CCP anulado</option>
            </select>
          </div>
          <div class="col-md-3 d-flex gap-2">
            <button type="button" class="btn btn-sm btn-primary" id="${PREFIX}FiltroBtn">
              <i class="bi bi-funnel"></i> Filtrar
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="${PREFIX}FiltroLimpiar">Limpiar</button>
          </div>
        </div>
      </div>

      <div id="${PREFIX}Alert" class="d-none"></div>
      <div id="${PREFIX}BgRefreshHost" class="mb-1"></div>
      <div id="${LIST_ID}">
        <div class="text-center text-muted py-4">
          <span class="spinner-border spinner-border-sm"></span> Cargando bandeja CCP…
        </div>
      </div>
    </div>`;
}

function showAlert(type, msg) {
  const el = document.getElementById(`${PREFIX}Alert`);
  if (!el) return;
  if (!msg) {
    el.className = 'd-none';
    el.innerHTML = '';
    return;
  }
  el.className = `alert alert-${type} py-2 small`;
  el.innerHTML = esc(msg);
}

function findRow(rid) {
  return rowsCache.find((r) => String(r.requerimiento_id) === String(rid));
}

async function actionRegistrarCcp(rid) {
  const row = findRow(rid);
  if (!row) return;
  openCcpCodigoModal(row, {
    mode: 'registrar',
    onSuccess: async () => {
      showAlert('success', 'Código CCP registrado — estado: CCP registrado');
      await loadBandeja(true);
    },
  });
}

async function actionEditarCcp(rid) {
  const row = findRow(rid);
  if (!row) return;
  openCcpCodigoModal(row, {
    mode: 'editar',
    onSuccess: async () => {
      showAlert('success', 'Código CCP actualizado');
      await loadBandeja(true);
    },
  });
}

async function actionEliminarCcp(rid) {
  const motivo = window.prompt('Motivo de anulación del código CCP:');
  if (motivo == null) return;
  if (String(motivo).trim().length < 3) {
    showAlert('danger', 'Indique un motivo de anulación (mín. 3 caracteres)');
    return;
  }
  if (!window.confirm('¿Anular el código CCP? Se conservará la trazabilidad.')) return;
  try {
    await contratacionesService.anularCodigoCcp(rid, { motivo: String(motivo).trim() });
    showAlert('success', 'Código CCP anulado — estado: Derivado a CCP');
    await loadBandeja(true);
  } catch (err) {
    showAlert('danger', err.message || 'Error al anular');
  }
}

async function actionDescargarWord(rid) {
  const row = findRow(rid);
  if (!row?.consolidacion_id) {
    showAlert('warning', 'Consolide el requerimiento antes de descargar el Word');
    return;
  }
  try {
    const { blob, contentDisposition } = await contratacionesService.generarWordCcp(row.consolidacion_id);
    let nombre = `${row.consolidacion_codigo || 'CCP-SOL'}.docx`;
    const m = String(contentDisposition || '').match(/filename="([^"]+)"/i);
    if (m) nombre = decodeURIComponent(m[1]);
    downloadBlobFile(blob, nombre);
    showAlert('success', `Documento descargado: ${nombre}`);
  } catch (err) {
    showAlert('danger', err.message || 'No se pudo generar el Word');
  }
}

function bindRowHandlers(root) {
  root.querySelectorAll('.ccp-row-sel').forEach((cb) => {
    cb.onchange = () => {
      const rid = parseInt(cb.dataset.rid, 10);
      if (cb.checked) selectedIds.add(rid);
      else selectedIds.delete(rid);
      updateSelectionUi();
    };
  });
}

function getCcpShell() {
  const cont = document.getElementById(LIST_ID);
  if (!cont) return null;
  return ensureBandejaTableShell(cont, {
    outerId: `${PREFIX}Outer`,
    wrapId: 'ccpScrollWrap',
    theadId: `${PREFIX}Head`,
    tbodyId: `${PREFIX}Tbody`,
    emptyId: `${PREFIX}Empty`,
    outerClass: 'sgc-bandeja-wrap',
    wrapClass: 'table-responsive',
    tableClass: 'table table-sm table-hover table-bordered align-middle mb-0 sgc-bandeja-table',
  });
}

function paintTable(shell = null) {
  const active = shell || getCcpShell();
  if (!active?.tbody || !active?.thead) return;
  active.thead.innerHTML = THEAD;

  if (!rowsCache.length) {
    active.tbody.innerHTML = '';
    setEmptyState(active, {
      empty: true,
      message: 'Sin requerimientos en CCP. Solo se listan expedientes derivados formalmente a Certificado de Crédito Presupuestal.',
    });
    updateSelectionUi();
    return;
  }

  setEmptyState(active, { empty: false });
  active.tbody.innerHTML = rowsCache.map(renderRow).join('');
  bindRowHandlers(active.tbody);
  const cont = document.getElementById(LIST_ID);
  if (cont) {
    bindActionMenus(cont, {
      registrarCcp: (id) => actionRegistrarCcp(id),
      editarCcp: (id) => actionEditarCcp(id),
      eliminarCcp: (id) => actionEliminarCcp(id),
      ver: (id) => {
        const row = findRow(id);
        if (row?.consolidacion_id) openConsolidacionModal(row.consolidacion_id);
        else openDetalleReqModal(id);
      },
      descargarWord: (id) => actionDescargarWord(id),
    });
  }
  const master = document.getElementById(`${PREFIX}SelectAll`);
  if (master) {
    master.onchange = () => {
      if (master.checked) {
        rowsCache.filter((r) => r.puede_seleccionar).forEach((r) => selectedIds.add(r.requerimiento_id));
      } else {
        selectedIds.clear();
      }
      paintTable(active);
    };
  }
  updateSelectionUi();
}

async function loadBandeja(silent = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  const cont = document.getElementById(LIST_ID);
  if (!cont) return;

  const hadShell = !!document.getElementById(`${PREFIX}Tbody`);
  if (hadShell) captureScroll(VIEW_ID, SCROLL_SEL);

  const request = loadGuard.begin();
  if (lifecycle) lifecycle.addAbortController(request.controller);

  const isBg = silent || (hadShell && rowsCache.length > 0);
  if (isBg) {
    refreshIndicator?.show('Actualizando…');
  } else if (!hadShell) {
    cont.innerHTML = `<div class="text-center text-muted py-4">
      <span class="spinner-border spinner-border-sm"></span> Cargando bandeja CCP…
    </div>`;
  }

  try {
    const resp = await contratacionesService.listCcpBandeja({
      q: filtroQ,
      estado: filtroEstado,
    });
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    rowsCache = Array.isArray(resp?.data) ? resp.data : [];
    selectedIds = new Set([...selectedIds].filter((id) => {
      const r = rowsCache.find((x) => x.requerimiento_id === id);
      return r && r.puede_seleccionar;
    }));

    const shell = getCcpShell();
    paintTable(shell);
    restoreScroll(VIEW_ID, SCROLL_SEL);
    refreshIndicator?.hide();
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    showAlert('danger', err.message || 'Error al cargar bandeja CCP');
    if (hadShell && rowsCache.length) {
      refreshIndicator?.error('No se pudo actualizar. Se conservan los datos actuales.');
    } else {
      cont.innerHTML = `<div class="alert alert-danger">${esc(err.message || 'Error al cargar bandeja CCP')}</div>`;
      refreshIndicator?.hide();
    }
  }
}

function renderFilasTable(filas, moneda) {
  if (!filas?.length) {
    return '<div class="text-muted small">Sin filas presupuestales.</div>';
  }
  const body = filas.map((f) => `
    <tr>
      <td>${esc(f.codigo_ccp || 'Pendiente')}</td>
      <td>${esc(f.centro || '—')}</td>
      <td class="small">${esc(f.descripcion || '—')}</td>
      <td>${esc(f.meta || '—')}</td>
      <td>${esc(f.fuente_fto || '—')}</td>
      <td>${esc(f.especifica || '—')}</td>
      <td>${esc(f.requerimiento || '—')}</td>
      <td class="text-end">${fmtMonto(f.monto, moneda)}</td>
    </tr>`).join('');
  const total = filas.reduce((a, f) => a + Number(f.monto || 0), 0);
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered ccp-filas-table mb-0">
        <thead class="table-light">
          <tr>
            <th>N.° CCP</th><th>Centro</th><th>Descripción</th><th>Meta</th>
            <th>Fte. Fto.</th><th>Específica de gasto</th><th>Requerimiento</th>
            <th class="text-end">Monto presupuestal</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        <tfoot>
          <tr class="table-warning">
            <td colspan="7" class="text-end fw-semibold">TOTAL GENERAL</td>
            <td class="text-end fw-semibold">${fmtMonto(total, moneda)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

async function openDetalleReqModal(requerimientoId) {
  const id = `ccpDet_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-eye"></i> Detalle CCP</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body">
            <div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm"></span> Cargando…</div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = window.bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  modal.show();
  try {
    const resp = await contratacionesService.getCcpRequerimiento(requerimientoId);
    const d = resp.data || {};
    document.getElementById(`${id}_body`).innerHTML = `
      <div class="mb-3 small">
        <strong>${esc(d.requerimiento_codigo)}</strong> · SC ${esc(d.solicitud_codigo || '—')}
        · Tipo: <strong>${esc(d.origen_ccp === 'RECEPCION_COTIZACION_LOCACION' ? 'Locación' : (d.tipo || '—'))}</strong>
        · Origen: <strong>${esc(d.origen_ccp_label || (d.origen_ccp === 'RECEPCION_COTIZACION_LOCACION' ? 'Recepción de Cotización' : 'Cuadro Comparativo'))}</strong>
        · Cuadro: <strong>${d.cuadro_id == null ? 'No aplica' : esc(String(d.cuadro_id))}</strong>
        · CCP: <strong>${esc(d.codigo_ccp || 'Pendiente')}</strong>
        · ${d.origen_ccp === 'RECEPCION_COTIZACION_LOCACION' ? 'Propuesta' : 'Adjudicado'}:
          <strong>${fmtMonto(d.monto_adjudicado, d.moneda)}</strong>
        ${d.proveedor_nombre ? ` · Proveedor: <strong>${esc(d.proveedor_nombre)}</strong>` : ''}
      </div>
      ${renderFilasTable(d.filas, d.moneda)}`;
  } catch (err) {
    document.getElementById(`${id}_body`).innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

function downloadBlobFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'documento.docx';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

async function openConsolidacionModal(solicitudId, { editable = true } = {}) {
  const id = `ccpSol_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-layers"></i> Certificado de Crédito Presupuestal - CCP</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body">
            <div class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm"></span> Cargando…</div>
          </div>
          <div class="modal-footer flex-wrap gap-2" id="${id}_footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  const el = document.getElementById(id);
  const modal = window.bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  modal.show();

  function modalAlert(type, msg) {
    const body = document.getElementById(`${id}_body`);
    if (!body) return;
    let box = body.querySelector('.ccp-modal-alert');
    if (!box) {
      box = document.createElement('div');
      box.className = 'ccp-modal-alert';
      body.prepend(box);
    }
    box.className = `ccp-modal-alert alert alert-${type} py-2 small`;
    box.textContent = msg || '';
  }

  async function paint() {
    const resp = await contratacionesService.getConsolidacionCcp(solicitudId);
    const d = resp.data || {};
    const enviada = String(d.estado || '').toUpperCase() === 'ENVIADA_OPPM';
    document.getElementById(`${id}_body`).innerHTML = `
      <div class="mb-3">
        <div class="fw-semibold">${esc(d.label_corto || d.codigo_interno)}</div>
        <div class="small text-muted">Estado: ${esc(d.estado_label || d.estado)} · Creado por ${esc(d.creado_por || '—')}</div>
        <div class="small mt-1"><strong>Asunto:</strong> ${esc(d.asunto || '')}</div>
      </div>
      ${d.requerimientos?.length ? `
        <div class="mb-3">
          <div class="fw-semibold small mb-1">Requerimientos incluidos</div>
          <ul class="list-group list-group-flush border rounded">
            ${d.requerimientos.map((r) => `
              <li class="list-group-item d-flex justify-content-between align-items-center py-2 small">
                <span>
                  <strong>${esc(r.requerimiento_codigo)}</strong>
                  ${r.codigo_ccp ? ` · CCP ${esc(r.codigo_ccp)}` : ' · CCP Pendiente'}
                  · ${fmtMonto(r.monto, d.moneda)}
                </span>
                ${editable && !enviada ? `
                  <button type="button" class="btn btn-sm btn-outline-danger ccp-retirar"
                    data-rid="${r.requerimiento_id}">Retirar</button>` : ''}
              </li>`).join('')}
          </ul>
        </div>` : '<div class="alert alert-warning">Sin requerimientos activos.</div>'}
      ${renderFilasTable(d.filas, d.moneda)}`;

    const footer = document.getElementById(`${id}_footer`);
    const wordBtnId = `${id}_word`;
    const enviarBtnId = `${id}_enviar`;
    footer.innerHTML = `
      ${d.filas?.length ? `
        <button type="button" class="btn btn-primary" id="${wordBtnId}">
          <i class="bi bi-file-earmark-word"></i> Descargar Word
        </button>` : ''}
      ${editable && !enviada && d.cantidad_requerimientos ? `
        <button type="button" class="btn btn-outline-primary" id="${enviarBtnId}">
          <i class="bi bi-send"></i> Enviar a OPPM
        </button>` : ''}
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>`;

    const wordBtn = document.getElementById(wordBtnId);
    if (wordBtn) {
      wordBtn.addEventListener('click', async () => {
        const prev = wordBtn.innerHTML;
        wordBtn.disabled = true;
        wordBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generando…';
        try {
          const { blob, contentDisposition } = await contratacionesService.generarWordCcp(d.id);
          let nombre = `${d.codigo_interno || 'CCP-SOL'}.docx`;
          const m = String(contentDisposition || '').match(/filename="([^"]+)"/i);
          if (m) nombre = decodeURIComponent(m[1]);
          downloadBlobFile(blob, nombre);
          modalAlert('success', `Documento descargado: ${nombre}`);
          showAlert('success', 'Documento Word generado');
        } catch (err) {
          modalAlert('danger', err.message || 'No se pudo generar el Word');
          showAlert('danger', err.message || 'No se pudo generar el Word');
        } finally {
          wordBtn.disabled = false;
          wordBtn.innerHTML = prev;
        }
      });
    }

    const enviarBtn = document.getElementById(enviarBtnId);
    if (enviarBtn) {
      enviarBtn.addEventListener('click', async () => {
        if (!window.confirm('¿Marcar la solicitud como enviada a OPPM?')) return;
        try {
          await contratacionesService.actualizarConsolidacionCcp(d.id, { enviar_oppm: true });
          showAlert('success', 'Solicitud enviada a OPPM');
          await paint();
          await loadBandeja(true);
        } catch (err) {
          modalAlert('danger', err.message || 'No se pudo enviar');
          showAlert('danger', err.message);
        }
      });
    }

    document.getElementById(`${id}_body`)?.querySelectorAll('.ccp-retirar').forEach((btn) => {
      btn.onclick = async () => {
        if (!window.confirm('¿Retirar este requerimiento del consolidado?')) return;
        try {
          await contratacionesService.retirarRequerimientoCcp(d.id, btn.dataset.rid);
          showAlert('success', 'Requerimiento retirado');
          await paint();
          await loadBandeja(true);
        } catch (err) {
          modalAlert('danger', err.message || 'No se pudo retirar');
          showAlert('danger', err.message);
        }
      };
    });
  }

  try {
    await paint();
  } catch (err) {
    document.getElementById(`${id}_body`).innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

async function consolidarSeleccion() {
  const ids = [...selectedIds];
  if (!ids.length) return;
  if (!window.confirm(`¿Consolidar ${ids.length} requerimiento(s) en una solicitud CCP?`)) return;
  try {
    const resp = await contratacionesService.crearConsolidacionCcp({
      requerimiento_ids: ids,
      observacion: `Consolidado por ${currentUserLabel()}`,
    });
    selectedIds.clear();
    showAlert('success', `Consolidación creada: ${resp.data?.codigo_interno || ''}`);
    await loadBandeja(true);
    if (resp.data?.id) openConsolidacionModal(resp.data.id);
  } catch (err) {
    showAlert('danger', err.message || 'No se pudo consolidar');
  }
}

function initCcpView() {
  lifecycle?.destroy?.();
  lifecycle = createViewLifecycle(VIEW_ID);
  refreshIndicator = createBackgroundRefreshIndicator(`#${PREFIX}BgRefreshHost`, { id: `${PREFIX}BgRefresh` });
  selectedIds = new Set();
  filtroEstado = '';
  filtroQ = '';
  rowsCache = [];
  closeBandejaActionMenus();

  document.getElementById(`${PREFIX}RefreshBtn`)?.addEventListener('click', () => loadBandeja(true));
  document.getElementById(`${PREFIX}ConsolidarBtn`)?.addEventListener('click', consolidarSeleccion);
  document.getElementById(`${PREFIX}FiltroBtn`)?.addEventListener('click', () => {
    filtroQ = document.getElementById(`${PREFIX}Search`)?.value?.trim() || '';
    filtroEstado = document.getElementById(`${PREFIX}FiltroEstado`)?.value || '';
    loadBandeja();
  });
  document.getElementById(`${PREFIX}FiltroLimpiar`)?.addEventListener('click', () => {
    const s = document.getElementById(`${PREFIX}Search`);
    const e = document.getElementById(`${PREFIX}FiltroEstado`);
    if (s) s.value = '';
    if (e) e.value = '';
    filtroQ = '';
    filtroEstado = '';
    loadBandeja();
  });
  document.getElementById(`${PREFIX}Search`)?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      document.getElementById(`${PREFIX}FiltroBtn`)?.click();
    }
  });

  loadBandeja();
}

export { renderCcpView, initCcpView };
