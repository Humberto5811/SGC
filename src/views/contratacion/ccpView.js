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
import { renderEstadoBadgeFromRow } from '../../ui/workflow/EstadoBadge.js';
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
/** RC8.9 — '' = Todos | operativo | historico */
let filtroModoBandeja = '';
/** @type {{ modo?: string, acceso_por_asignacion?: boolean, puede_consolidar?: boolean }} */
let bandejaMeta = { modo: 'GLOBAL', acceso_por_asignacion: false, puede_consolidar: true };

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function canManageCcp() {
  // RC8.6E — GLOBAL puede gestionar; ASIGNACION puede registrar/editar código en lo propio
  if (bandejaMeta.modo === 'ASIGNACION') return true;
  if (bandejaMeta.modo === 'GLOBAL') return true;
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
    if (u.acceso_ccp_por_asignacion || u.acceso_ccp) return true;
    const rol = String(u.rol || u.role || '').toLowerCase();
    return rol === 'dec' || rol === 'admin';
  } catch (_) { return false; }
}

function canConsolidarCcp() {
  if (bandejaMeta.puede_consolidar === false) return false;
  if (bandejaMeta.modo === 'ASIGNACION' || bandejaMeta.acceso_por_asignacion) return false;
  return true;
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
  if (btn) {
    const allowConsol = canConsolidarCcp();
    btn.classList.toggle('d-none', !allowConsol);
    btn.disabled = !allowConsol || n < 1;
  }
  const master = document.getElementById(`${PREFIX}SelectAll`);
  if (master) {
    const visibles = rowsCache.filter((r) => r.puede_seleccionar);
    master.checked = visibles.length > 0 && visibles.every((r) => selectedIds.has(r.requerimiento_id));
    master.indeterminate = selectedIds.size > 0 && !master.checked;
  }
  const modoEl = document.getElementById(`${PREFIX}ModoAsignacion`);
  if (modoEl) {
    const show = !!bandejaMeta.acceso_por_asignacion || bandejaMeta.modo === 'ASIGNACION';
    modoEl.classList.toggle('d-none', !show);
  }
}

function renderEstadoCell(row) {
  // RC8.10 — solo EstadoBadge canónico; sin texto auxiliar bajo el estado.
  return renderEstadoBadgeFromRow(row);
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
    ccpMenuItems(row, {
      canManage: canManageCcp(),
      modo: bandejaMeta.modo,
      accesoPorAsignacion: !!bandejaMeta.acceso_por_asignacion,
    }),
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
  <th>Responsable</th>
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
          <div id="${PREFIX}ModoAsignacion" class="d-none mt-2">
            <span class="badge bg-info text-dark border">Expedientes asignados</span>
            <span class="text-muted small ms-1">Solo ve y tramita los expedientes CCP asignados a usted.</span>
          </div>
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
          <div class="col-md-2">
            <label class="form-label small mb-0">Visibilidad</label>
            <select class="form-select form-select-sm" id="${PREFIX}FiltroModo">
              <option value="">Todos</option>
              <option value="operativo">Pendientes / Activos</option>
              <option value="historico">Procesados / Históricos</option>
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
    showAlert('warning', 'Consolide el requerimiento antes de descargar el Word consolidado');
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

async function actionGenerarWord(rid) {
  const row = findRow(rid);
  if (!row?.codigo_ccp && !row?.tiene_codigo) {
    showAlert('warning', 'Registre primero el código CCP.');
    return;
  }
  try {
    const { blob, contentDisposition } = await contratacionesService.generarWordCcpIndividual(rid);
    let nombre = `CCP-${row?.requerimiento_codigo || rid}.docx`;
    const m = String(contentDisposition || '').match(/filename="([^"]+)"/i);
    if (m) nombre = decodeURIComponent(m[1]);
    downloadBlobFile(blob, nombre);
    showAlert('success', `Documento generado: ${nombre}`);
  } catch (err) {
    const msg = err?.message || 'No se pudo generar el Word';
    if (/código CCP|CCP_CODIGO|primero/i.test(msg)) {
      showAlert('warning', 'Registre primero el código CCP.');
    } else {
      showAlert('danger', msg);
    }
  }
}

async function actionDerivarOrdenes(rid) {
  const row = findRow(rid);
  if (!row?.codigo_ccp && !row?.tiene_codigo) {
    showAlert('warning', 'Registre primero el código CCP.');
    return;
  }
  const codigo = row?.requerimiento_codigo || rid;
  if (!window.confirm(`¿Derivar ${codigo} a Registro de Órdenes?`)) return;
  try {
    const resp = await contratacionesService.derivarCcpARegistroOrdenes(rid, {
      client_request_id: `ccp-derivar-ui:${rid}:${Date.now()}`,
    });
    if (resp?.idempotente) {
      showAlert('info', 'El expediente ya fue derivado.');
    } else {
      showAlert('success', `${codigo} derivado a Registro de Órdenes`);
    }
    await loadBandeja(true);
  } catch (err) {
    const msg = err?.message || 'No se pudo derivar';
    if (/ya fue derivado|ya derivado/i.test(msg)) {
      showAlert('info', 'El expediente ya fue derivado.');
    } else if (/código CCP|primero/i.test(msg)) {
      showAlert('warning', 'Registre primero el código CCP.');
    } else if (/no compatible|Estado no compatible/i.test(msg)) {
      showAlert('warning', 'Estado no compatible.');
    } else if (/autoriz|asignación|FORBIDDEN/i.test(msg)) {
      showAlert('warning', 'Sin autorización sobre el expediente.');
    } else {
      showAlert('danger', msg);
    }
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
      generarWord: (id) => actionGenerarWord(id),
      descargarWord: (id) => actionDescargarWord(id),
      derivarOrdenes: (id) => actionDerivarOrdenes(id),
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
    if (filtroModoBandeja === 'operativo') {
      rowsCache = rowsCache.filter((r) => r.bandeja_modo !== 'historico' && !r.tramite_ccp_concluido);
    } else if (filtroModoBandeja === 'historico') {
      rowsCache = rowsCache.filter((r) => r.bandeja_modo === 'historico' || r.tramite_ccp_concluido);
    }
    bandejaMeta = {
      modo: resp?.meta?.modo || 'GLOBAL',
      acceso_por_asignacion: !!resp?.meta?.acceso_por_asignacion,
      puede_consolidar: resp?.meta?.puede_consolidar !== false
        && resp?.meta?.modo !== 'ASIGNACION',
    };
    selectedIds = new Set([...selectedIds].filter((id) => {
      const r = rowsCache.find((x) => x.requerimiento_id === id);
      return r && r.puede_seleccionar;
    }));

    const shell = getCcpShell();
    paintTable(shell);
    updateSelectionUi();
    restoreScroll(VIEW_ID, SCROLL_SEL);
    refreshIndicator?.hide();
    showAlert('', '');
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    // Un solo mensaje: alert local O vacío en tabla — no ambos
    const msg = err.message || 'Error al cargar bandeja CCP';
    if (hadShell && rowsCache.length) {
      showAlert('danger', msg);
      refreshIndicator?.error('No se pudo actualizar. Se conservan los datos actuales.');
    } else {
      showAlert('', '');
      cont.innerHTML = `<div class="alert alert-danger">${esc(msg)}</div>`;
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
          <div class="modal-footer flex-wrap gap-2" id="${id}_footer">
            <button type="button" class="btn btn-outline-primary btn-sm d-none" id="${id}_word">
              <i class="bi bi-file-earmark-word"></i> Generar Word
            </button>
            <button type="button" class="btn btn-primary btn-sm d-none" id="${id}_derivar">
              <i class="bi bi-box-arrow-right"></i> Derivar a Registro de Órdenes
            </button>
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
    const erv = d.estado_responsable_vigente || {};
    const historico = !!(d.solo_lectura || d.tramite_ccp_concluido || d.bandeja_modo === 'historico');
    const docs = Array.isArray(d.documentos) ? d.documentos : [];
    const docsHtml = docs.length
      ? `<ul class="small mb-2">${docs.map((doc) => `<li>${esc(doc.label || doc.tipo)}${doc.valor ? `: <strong>${esc(doc.valor)}</strong>` : ''}${doc.nombre ? ` — ${esc(doc.nombre)}` : ''}</li>`).join('')}</ul>`
      : '<p class="small text-muted mb-2">Sin documentos adicionales.</p>';
    const regAt = d.registrado_at
      ? String(d.registrado_at).slice(0, 16).replace('T', ' ')
      : '—';
    document.getElementById(`${id}_body`).innerHTML = `
      <div class="mb-3 small">
        <strong>${esc(d.requerimiento_codigo)}</strong> · SC ${esc(d.solicitud_codigo || '—')}
        · Tipo: <strong>${esc(d.origen_ccp === 'RECEPCION_COTIZACION_LOCACION' ? 'Locación' : (d.tipo || '—'))}</strong>
        · Origen: <strong>${esc(d.origen_ccp_label || (d.origen_ccp === 'RECEPCION_COTIZACION_LOCACION' ? 'Recepción de Cotización' : 'Cuadro Comparativo'))}</strong>
        · Cuadro: <strong>${d.cuadro_id == null ? 'No aplica' : esc(String(d.cuadro_id))}</strong>
        · CCP: <strong>${esc(d.codigo_ccp || 'Pendiente')}</strong>
        · Registrado: <strong>${esc(regAt)}</strong>${d.registrado_por ? ` por ${esc(d.registrado_por)}` : ''}
        · ${d.origen_ccp === 'RECEPCION_COTIZACION_LOCACION' ? 'Propuesta' : 'Adjudicado'}:
          <strong>${fmtMonto(d.monto_adjudicado, d.moneda)}</strong>
        ${d.proveedor_nombre ? ` · Proveedor: <strong>${esc(d.proveedor_nombre)}</strong>` : ''}
      </div>
      <div class="mb-3 p-2 border rounded bg-light small">
        <div><strong>Estado vigente:</strong> ${esc(erv.estadoLabel || '—')}</div>
        <div><strong>Responsable:</strong> ${esc(erv.responsableNombre || erv.responsableUnidad || '—')}</div>
        <div><strong>Etapa:</strong> ${esc(erv.etapaLabel || '—')}</div>
        ${historico ? '<div class="text-muted mt-1"><i class="bi bi-lock"></i> Expediente histórico CCP — solo consulta</div>' : ''}
      </div>
      <div class="mb-2"><strong class="small">Documentos / evidencia CCP</strong>${docsHtml}</div>
      ${renderFilasTable(d.filas, d.moneda)}`;
    const btnWord = document.getElementById(`${id}_word`);
    const btnDerivar = document.getElementById(`${id}_derivar`);
    if (btnWord) {
      const canWord = !historico && d.puede_generar_word !== false && !!d.codigo_ccp;
      btnWord.classList.toggle('d-none', !canWord);
      btnWord.onclick = async () => {
        modal.hide();
        await actionGenerarWord(requerimientoId);
      };
    }
    if (btnDerivar) {
      const canDerivar = !historico && d.puede_derivar_ordenes === true && !!d.codigo_ccp;
      btnDerivar.classList.toggle('d-none', !canDerivar);
      btnDerivar.title = d.motivo_derivar_ordenes
        || (!d.codigo_ccp ? 'Registre primero el código CCP.' : 'Derivar a Registro de Órdenes');
      btnDerivar.onclick = async () => {
        if (!d.codigo_ccp) {
          showAlert('warning', 'Registre primero el código CCP.');
          return;
        }
        if (!canDerivar) {
          showAlert('warning', d.motivo_derivar_ordenes || 'Expediente histórico CCP — solo consulta.');
          return;
        }
        modal.hide();
        await actionDerivarOrdenes(requerimientoId);
      };
    }
  } catch (err) {
    document.getElementById(`${id}_body`).innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    document.getElementById(`${id}_word`)?.classList.add('d-none');
    document.getElementById(`${id}_derivar`)?.classList.add('d-none');
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
  if (!canConsolidarCcp()) {
    showAlert('warning', 'Consolidar requiere acceso global CCP');
    return;
  }
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
  filtroModoBandeja = '';
  rowsCache = [];
  bandejaMeta = { modo: 'GLOBAL', acceso_por_asignacion: false, puede_consolidar: true };
  closeBandejaActionMenus();
  showAlert('', '');

  document.getElementById(`${PREFIX}RefreshBtn`)?.addEventListener('click', () => loadBandeja(true));
  document.getElementById(`${PREFIX}ConsolidarBtn`)?.addEventListener('click', consolidarSeleccion);
  document.getElementById(`${PREFIX}FiltroBtn`)?.addEventListener('click', () => {
    filtroQ = document.getElementById(`${PREFIX}Search`)?.value?.trim() || '';
    filtroEstado = document.getElementById(`${PREFIX}FiltroEstado`)?.value || '';
    filtroModoBandeja = document.getElementById(`${PREFIX}FiltroModo`)?.value || '';
    loadBandeja();
  });
  document.getElementById(`${PREFIX}FiltroLimpiar`)?.addEventListener('click', () => {
    const s = document.getElementById(`${PREFIX}Search`);
    const e = document.getElementById(`${PREFIX}FiltroEstado`);
    const m = document.getElementById(`${PREFIX}FiltroModo`);
    if (s) s.value = '';
    if (e) e.value = '';
    if (m) m.value = '';
    filtroQ = '';
    filtroEstado = '';
    filtroModoBandeja = '';
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
