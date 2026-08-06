/**
 * Ejecución → Recepción de Bienes
 * Bandeja operativa multi-rol (Almacén / AU / Coordinación CM).
 * UI operativa sin alert()/prompt() — patrón Validaciones / Registro de Órdenes.
 */
import { recepcionBienesService } from '../../services/recepcionBienesService.js';
import { bandejaTableStyles } from '../../utils/trazabilidad.js';
import {
  renderActionMenuCell, bindActionMenus, closeBandejaActionMenus, renderResponsableCellHtml,
} from '../../utils/bandejaUi.js';
import { renderBadgeEstadoVigenteHtml } from '../../ui/workflow/index.js';
import { resolveAccionesRecepcionBienes } from '../../../shared/recepcionSaldo.js';
import {
  createViewLifecycle,
  createRequestSequenceGuard,
  isAbortError,
  createBackgroundRefreshIndicator,
  captureScroll,
  restoreScroll,
} from '../../utils/uiState/index.js';
import {
  openExpedienteRecepcionModal,
  openRegistrarRecepcionModal,
  openHistorialRecepcionModal,
  openDerivarAuModal,
  openCargarActaFirmadaModal,
  openObservarAuModal,
  openRegistrarActaModal,
} from '../../utils/recepcionBienesModal.js';

const VIEW_ID = 'recepcion-bienes';
const SCROLL_SEL = '#rbScrollWrap';
const PREFIX = 'rb';
const LIST_ID = 'rbList';
const loadGuard = createRequestSequenceGuard();

let lifecycle = null;
let refreshIndicator = null;
let rowsCache = [];
let filtroEstado = '';
let filtroQ = '';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return String(iso || '').slice(0, 10) || '—';
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = String(moneda).toUpperCase() === 'USD' ? 'US$' : 'S/';
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currentRol() {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return String(u.rol || u.role || 'dec').toLowerCase();
  } catch (_) { return 'dec'; }
}

function menuItems(row) {
  const estado = row.estado_vigente || row.estadoVigente?.codigo || '';
  const acciones = resolveAccionesRecepcionBienes({
    estado,
    rol: currentRol(),
    puedeRegistrarRecepcion: row.puede_registrar_recepcion !== false
      && (row.puede_registrar_recepcion === true
        || (estado === 'RECEPCION_BIENES_PENDIENTE' && !row.tiene_recepcion)),
    tieneRecepcion: !!(row.tiene_recepcion || row.fecha_recepcion_guia || row.recepciones_count > 0),
    actaEstado: row.acta_estado_documental || null,
    actaVisada: !!(row.acta_visada || row.puede_derivar_au),
    derivadoAu: estado === 'CONFORMIDAD_PENDIENTE_AU'
      || estado === 'CONFORMIDAD_RECIBIDA_AU'
      || estado === 'CONFORMIDAD_EN_COORDINACION_CM'
      || estado === 'EXPEDIENTE_DERIVADO_PAGO',
  });

  // Preferir flags de bandeja cuando existen
  if (row.puede_registrar_recepcion === false) acciones.registrarRecepcion = false;
  if (row.puede_registrar_recepcion === true && ['RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA', 'BIEN_RECIBIDO_ALMACEN'].includes(estado)) {
    acciones.registrarRecepcion = true;
  }
  if (row.puede_derivar_au === true) {
    acciones.derivarAu = true;
    acciones.registrarActa = false;
    acciones.administrarActa = true;
  }
  if (row.acta_estado_documental && !row.acta_visada) {
    acciones.registrarActa = false;
    acciones.administrarActa = true;
    acciones.adjuntarActaVisada = true;
    acciones.derivarAu = false;
  }

  const items = [{ act: 'ver', label: 'Ver expediente', icon: 'bi-folder2-open' }];
  if (acciones.registrarRecepcion) {
    items.push({ act: 'registrar', label: 'Registrar recepción', icon: 'bi-box-arrow-in-down' });
  }
  if (acciones.registrarActa) {
    items.push({ act: 'registrarActa', label: 'Registrar acta', icon: 'bi-file-earmark-text' });
  } else if (acciones.administrarActa) {
    items.push({ act: 'registrarActa', label: 'Ver / administrar acta', icon: 'bi-file-earmark-text' });
  }
  if (acciones.derivarAu) {
    items.push({ act: 'derivarAu', label: 'Derivar al Área Usuaria', icon: 'bi-send' });
  }
  if (acciones.cargarActaAu) {
    items.push({ act: 'cargarActa', label: 'Firmar / adjuntar Acta', icon: 'bi-pen' });
  }
  if (acciones.observarAu) {
    items.push({ act: 'observarAu', label: 'Observar → Almacén', icon: 'bi-arrow-return-left' });
  }
  items.push({ act: 'historial', label: 'Ver historial', icon: 'bi-clock-history' });
  return items;
}

function renderEstado(row) {
  return renderBadgeEstadoVigenteHtml({
    ...row,
    recepcion_estado_global: row.estado_vigente || row.estadoVigente?.codigo,
    enviado_proveedor_at: row.fecha_notificacion,
    orden_id: row.orden_id,
  }, esc);
}

function renderRow(row) {
  const id = row.id;
  return `
    <tr data-id="${id}">
      <td><strong>${esc(row.numero_orden || row.orden_id)}</strong></td>
      <td>${esc(fmtFecha(row.fecha_emision))}</td>
      <td>
        <div class="small fw-semibold text-truncate" style="max-width:180px" title="${esc(row.proveedor_razon_social)}">${esc(row.proveedor_razon_social || '—')}</div>
        <div class="text-muted small">${esc(row.proveedor_ruc || '')}</div>
      </td>
      <td class="text-end">${esc(fmtMonto(row.monto_total, row.moneda))}</td>
      <td class="small">${esc(row.plazo_total || '—')}</td>
      <td>${esc(fmtFecha(row.fecha_notificacion))}</td>
      <td>${renderEstado(row)}</td>
      <td>${esc(fmtFecha(row.fecha_recepcion_guia))}</td>
      <td>${esc(row.numero_guia || '—')}</td>
      <td class="text-end">${esc(fmtMonto(row.monto_a_liquidar, row.moneda))}</td>
      <td>${esc(row.tipo_proceso || '—')}</td>
      <td>${esc(row.numero_contrato || '—')}</td>
      <td>${esc(fmtFecha(row.fecha_envio_au))}</td>
      <td title="${esc(row.entrega_tooltip || '')}">${esc(row.entrega_label || row.numero_entrega || '—')}</td>
      <td>${esc(fmtFecha(row.fecha_entrega_almacen))}</td>
      <td class="small">${renderResponsableCellHtml(row, esc)}</td>
      ${renderActionMenuCell(id, menuItems(row))}
    </tr>`;
}

function filteredRows() {
  let list = rowsCache.slice();
  if (filtroEstado) {
    list = list.filter((r) => (r.estado_vigente || r.estadoVigente?.codigo) === filtroEstado);
  }
  const q = filtroQ.trim().toLowerCase();
  if (q) {
    list = list.filter((r) => [
      r.numero_orden, r.proveedor_razon_social, r.proveedor_ruc, r.numero_guia, r.requerimiento_codigo,
    ].some((x) => String(x || '').toLowerCase().includes(q)));
  }
  return list;
}

function buildActMap() {
  return {
    ver: (id) => onAction('ver', id),
    registrar: (id) => onAction('registrar', id),
    registrarActa: (id) => onAction('registrarActa', id),
    generarActa: (id) => onAction('registrarActa', id),
    derivarAu: (id) => onAction('derivarAu', id),
    cargarActa: (id) => onAction('cargarActa', id),
    observarAu: (id) => onAction('observarAu', id),
    historial: (id) => onAction('historial', id),
  };
}

function paint() {
  const tbody = document.getElementById(LIST_ID);
  const count = document.getElementById(`${PREFIX}Count`);
  if (!tbody) return;
  const list = filteredRows();
  if (count) count.textContent = String(list.length);
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="17" class="text-center text-muted py-4">Sin expedientes</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(renderRow).join('');
  bindActionMenus(tbody, buildActMap());
}

function showBanner(msg) {
  const el = document.getElementById(`${PREFIX}BannerErr`);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('d-none', !msg);
}

async function loadBandeja(opts = {}) {
  const request = loadGuard.begin();
  const scroll = captureScroll(SCROLL_SEL);
  try {
    if (!opts.silent && refreshIndicator) refreshIndicator.show('Actualizando…');
    showBanner('');
    const res = await recepcionBienesService.listarBandeja();
    if (!request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    rowsCache = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    paint();
    restoreScroll(SCROLL_SEL, scroll);
    if (refreshIndicator) refreshIndicator.hide();
  } catch (err) {
    if (isAbortError(err)) return;
    if (!request.isCurrent()) return;
    if (refreshIndicator) refreshIndicator.error(err.message || 'Error al cargar');
    showBanner(err.message || String(err));
    const tbody = document.getElementById(LIST_ID);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="17" class="text-center text-danger py-4">${esc(err.message || err)}</td></tr>`;
    }
  }
}

async function onAction(act, id) {
  closeBandejaActionMenus();
  const row = rowsCache.find((r) => String(r.id) === String(id));
  if (!row) return;
  showBanner('');
  try {
    if (act === 'ver') {
      await openExpedienteRecepcionModal(row);
      return;
    }
    if (act === 'registrar') {
      if (row.puede_registrar_recepcion === false) {
        showBanner(row.puede_registrar_motivo || 'La entrega ya fue recibida completamente y no admite otra recepción.');
        return;
      }
      await openRegistrarRecepcionModal(row, { onDone: () => loadBandeja({ silent: true }) });
      return;
    }
    if (act === 'registrarActa' || act === 'generarActa') {
      await openRegistrarActaModal(row, { onDone: () => loadBandeja({ silent: true }) });
      return;
    }
    if (act === 'derivarAu') {
      await openDerivarAuModal(row, { onDone: () => loadBandeja({ silent: true }) });
      return;
    }
    if (act === 'cargarActa') {
      openCargarActaFirmadaModal(row, { onDone: () => loadBandeja({ silent: true }) });
      return;
    }
    if (act === 'observarAu') {
      openObservarAuModal(row, { onDone: () => loadBandeja({ silent: true }) });
      return;
    }
    if (act === 'historial') {
      await openHistorialRecepcionModal(row);
    }
  } catch (err) {
    showBanner(err.message || String(err));
  }
}

export function initRecepcionBienesView() {
  const root = document.getElementById(VIEW_ID);
  if (!root) {
    setTimeout(initRecepcionBienesView, 40);
    return;
  }

  lifecycle?.destroy?.();
  lifecycle = createViewLifecycle(VIEW_ID);
  refreshIndicator = createBackgroundRefreshIndicator(`#${PREFIX}RefreshHint`);
  filtroEstado = '';
  filtroQ = '';
  rowsCache = [];

  lifecycle.addEventListener(document.getElementById(`${PREFIX}Refresh`), 'click', () => loadBandeja());
  lifecycle.addEventListener(document.getElementById(`${PREFIX}Q`), 'input', (e) => {
    filtroQ = e.target.value || '';
    paint();
  });
  lifecycle.addEventListener(document.getElementById(`${PREFIX}Estado`), 'change', (e) => {
    filtroEstado = e.target.value || '';
    paint();
  });

  loadBandeja();
}

export function renderRecepcionBienesView() {
  return `
    <div class="container-fluid py-3" id="${VIEW_ID}">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h4 class="mb-0"><i class="bi bi-box-seam"></i> Recepción de Bienes</h4>
          <div class="text-muted small">Ejecución · órdenes de compra notificadas</div>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span class="badge bg-secondary" id="${PREFIX}Count">0</span>
          <span id="${PREFIX}RefreshHint" class="small text-muted"></span>
          <button type="button" class="btn btn-sm btn-outline-primary" id="${PREFIX}Refresh">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-4">
          <input type="search" class="form-control form-control-sm" id="${PREFIX}Q"
            placeholder="Buscar N.° OC, proveedor, guía…" />
        </div>
        <div class="col-md-3">
          <select class="form-select form-select-sm" id="${PREFIX}Estado">
            <option value="">Todos los estados</option>
            <option value="RECEPCION_BIENES_PENDIENTE">OC pendiente de recepción</option>
            <option value="BIEN_RECIBIDO_ALMACEN">Recibido por almacén</option>
            <option value="RECEPCION_BIENES_OBSERVADA">Recepción observada</option>
            <option value="CONFORMIDAD_PENDIENTE_AU">Conformidad pendiente AU</option>
            <option value="CONFORMIDAD_RECIBIDA_AU">Conformidad recibida del AU</option>
            <option value="CONFORMIDAD_EN_COORDINACION_CM">Conformidad en Coordinación CM</option>
            <option value="EXPEDIENTE_DERIVADO_PAGO">Expediente derivado a pago</option>
          </select>
        </div>
      </div>
      <div class="table-responsive border rounded" id="rbScrollWrap" style="max-height:70vh">
        <style>${bandejaTableStyles('rb')}</style>
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>N.° OC</th>
              <th>F. emisión</th>
              <th>Proveedor</th>
              <th>Monto OC</th>
              <th>Plazo</th>
              <th>F. notificación</th>
              <th>Estado</th>
              <th>F. recepción guía</th>
              <th>N.° guía</th>
              <th>Monto a liquidar</th>
              <th>Tipo proceso</th>
              <th>N.° contrato</th>
              <th>F. envío AU</th>
              <th>Entrega</th>
              <th>F. entrega almacén</th>
              <th>Responsable</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="${LIST_ID}">
            <tr><td colspan="17" class="text-center text-muted py-4">Cargando…</td></tr>
          </tbody>
        </table>
      </div>
      <div class="alert alert-danger d-none mt-2" id="${PREFIX}BannerErr"></div>
    </div>
  `;
}
