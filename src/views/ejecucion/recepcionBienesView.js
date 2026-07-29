/**
 * Ejecución → Recepción de Bienes
 * Bandeja operativa multi-rol (Almacén / AU / Coordinación CM).
 * No modifica Contrataciones → Registro de Órdenes.
 */
import { recepcionBienesService } from '../../services/recepcionBienesService.js';
import { bandejaTableStyles } from '../../utils/trazabilidad.js';
import {
  renderActionMenuCell, bindActionMenus, closeBandejaActionMenus,
} from '../../utils/bandejaUi.js';
import { renderBadgeEstadoVigenteHtml } from '../../../shared/estadoExpedienteVigente.js';
import {
  createViewLifecycle,
  createRequestSequenceGuard,
  isAbortError,
  createBackgroundRefreshIndicator,
  captureScroll,
  restoreScroll,
} from '../../utils/uiState/index.js';

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
  const rol = currentRol();
  const isAlmacen = rol === 'dec' || rol === 'admin' || rol === 'almacen';
  const isAu = rol === 'au';
  const isCm = rol === 'dec' || rol === 'admin' || rol === 'cm';
  const items = [{ act: 'ver', label: 'Ver expediente', icon: 'bi-eye' }];

  if (isAlmacen && estado === 'RECEPCION_BIENES_PENDIENTE') {
    items.push({ act: 'registrar', label: 'Registrar recepción', icon: 'bi-box-arrow-in-down' });
  }
  if (isAlmacen && ['BIEN_RECIBIDO_ALMACEN', 'CONFORMIDAD_RECIBIDA_AU'].includes(estado)) {
    items.push({ act: 'registrar', label: 'Agregar recepción/guía', icon: 'bi-plus-circle' });
    items.push({ act: 'acta', label: 'Generar proyecto de acta', icon: 'bi-file-earmark-text' });
  }
  if (isAlmacen && estado === 'BIEN_RECIBIDO_ALMACEN') {
    items.push({ act: 'derivarAu', label: 'Derivar al Área Usuaria', icon: 'bi-send' });
  }
  if (isAu && estado === 'CONFORMIDAD_PENDIENTE_AU') {
    items.push({ act: 'actaFirmada', label: 'Cargar acta firmada', icon: 'bi-upload' });
  }
  if (isAlmacen && estado === 'CONFORMIDAD_RECIBIDA_AU') {
    items.push({ act: 'observar', label: 'Observar acta AU', icon: 'bi-exclamation-triangle' });
    items.push({ act: 'derivarCm', label: 'Derivar a Coordinación CM', icon: 'bi-diagram-3' });
  }
  if (isCm && estado === 'CONFORMIDAD_EN_COORDINACION_CM') {
    items.push({ act: 'observar', label: 'Observar', icon: 'bi-exclamation-triangle' });
    items.push({ act: 'derivarPago', label: 'Derivar a analista (pago)', icon: 'bi-credit-card' });
  }
  items.push({ act: 'historial', label: 'Historial', icon: 'bi-clock-history' });
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
      <td>${esc(row.numero_entrega ?? '—')}</td>
      <td>${esc(fmtFecha(row.fecha_entrega_almacen))}</td>
      <td class="small">${esc(row.responsable || '—')}</td>
      ${renderActionMenuCell(id, menuItems(row), '')}
    </tr>`;
}

export function renderRecepcionBienesView() {
  return `
    <style>
      ${bandejaTableStyles()}
      #${VIEW_ID} .table-responsive { overflow-x: auto; }
      #${VIEW_ID} table { min-width: 1600px; }
      #${VIEW_ID} th, #${VIEW_ID} td { white-space: nowrap; font-size: 0.85rem; }
    </style>
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
            <option value="CONFORMIDAD_PENDIENTE_AU">Conformidad pendiente AU</option>
            <option value="CONFORMIDAD_RECIBIDA_AU">Conformidad recibida del AU</option>
            <option value="CONFORMIDAD_EN_COORDINACION_CM">Conformidad en Coordinación CM</option>
            <option value="EXPEDIENTE_DERIVADO_PAGO">Expediente derivado a pago</option>
          </select>
        </div>
      </div>
      <div class="table-responsive border rounded" id="rbScrollWrap" style="max-height:70vh">
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
              <th>N.° entrega</th>
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
    </div>
  `;
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
  const acts = [
    'ver', 'registrar', 'acta', 'derivarAu', 'actaFirmada',
    'observar', 'derivarCm', 'derivarPago', 'historial',
  ];
  const map = {};
  acts.forEach((act) => {
    map[act] = (id) => { onAction(act, id); };
  });
  return map;
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
  // Igual que CCP / Registro de Órdenes: HTMLElement + mapa de acciones.
  bindActionMenus(tbody, buildActMap());
}

async function loadBandeja(opts = {}) {
  const request = loadGuard.begin();
  const scroll = captureScroll(SCROLL_SEL);
  try {
    if (!opts.silent && refreshIndicator) refreshIndicator.show('Actualizando…');
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
    const tbody = document.getElementById(LIST_ID);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="17" class="text-center text-danger py-4">${esc(err.message || err)}</td></tr>`;
    }
  }
}

async function promptRegistrar(row) {
  const numeroGuia = window.prompt('N.° Guía de Remisión:');
  if (!numeroGuia) return;
  const fecha = window.prompt('Fecha recepción guía (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
  if (!fecha) return;
  const monto = window.prompt('Monto a liquidar:', String(row.monto_total || '0'));
  if (monto == null) return;
  await recepcionBienesService.registrarRecepcion(row.id, {
    numero_guia: numeroGuia,
    fecha_recepcion_guia: fecha,
    fecha_entrega_almacen: fecha,
    monto_liquidar: Number(monto),
    idempotency_key: `ui-rec-${row.id}-${numeroGuia}`,
  });
  await loadBandeja({ silent: true });
}

async function onAction(act, id) {
  closeBandejaActionMenus();
  const row = rowsCache.find((r) => String(r.id) === String(id));
  if (!row) return;
  try {
    if (act === 'ver') {
      const det = await recepcionBienesService.getDetalle(id);
      const d = det?.data || det;
      window.alert([
        `OC: ${d.numero_orden || d.orden_id}`,
        `Estado: ${d.estado_vigente_label || d.etiqueta_estado}`,
        `Proveedor: ${d.proveedor_razon_social || ''}`,
        `Recepciones: ${(d.recepciones || []).length}`,
        `Actas: ${(d.actas || []).length}`,
        `Docs orden: ${(d.documentos_orden || []).length}`,
      ].join('\n'));
      return;
    }
    if (act === 'registrar') {
      await promptRegistrar(row);
      return;
    }
    if (act === 'acta') {
      await recepcionBienesService.generarActa(id, {});
      window.alert('Proyecto de acta generado');
      await loadBandeja({ silent: true });
      return;
    }
    if (act === 'derivarAu') {
      const dest = window.prompt('Responsable Área Usuaria (nombre):', row.responsable || '');
      await recepcionBienesService.derivarAu(id, {
        destinatario_nombre: dest || '',
        idempotency_key: `ui-au-${id}-${row.estado_vigente}`,
      });
      await loadBandeja({ silent: true });
      return;
    }
    if (act === 'actaFirmada') {
      const nombre = window.prompt('Nombre del archivo firmado:', 'acta-firmada.pdf');
      if (!nombre) return;
      // Placeholder: carga simbólica (base64 mínimo) — en producción usar input file
      const b64 = btoa(`Acta firmada placeholder ${id} ${new Date().toISOString()}`);
      await recepcionBienesService.cargarActaFirmada(id, {
        acta_firmada_nombre: nombre,
        acta_firmada_mime: 'application/pdf',
        acta_firmada_base64: b64,
        idempotency_key: `ui-firmada-${id}`,
      });
      await loadBandeja({ silent: true });
      return;
    }
    if (act === 'observar') {
      const motivo = window.prompt('Motivo de la observación:');
      if (!motivo) return;
      const destino = currentRol() === 'au' ? 'ALMACEN' : (window.prompt('Destino (AREA_USUARIA / ALMACEN):', 'AREA_USUARIA') || 'AREA_USUARIA');
      await recepcionBienesService.observar(id, { motivo, destino });
      await loadBandeja({ silent: true });
      return;
    }
    if (act === 'derivarCm') {
      await recepcionBienesService.derivarCm(id, { idempotency_key: `ui-cm-${id}` });
      await loadBandeja({ silent: true });
      return;
    }
    if (act === 'derivarPago') {
      const analista = window.prompt('Analista de pago (nombre):');
      if (!analista) return;
      await recepcionBienesService.derivarPago(id, {
        analista_nombre: analista,
        idempotency_key: `ui-pago-${id}`,
      });
      await loadBandeja({ silent: true });
      return;
    }
    if (act === 'historial') {
      const h = await recepcionBienesService.historial(id);
      const rows = h?.data || h || [];
      window.alert(rows.slice(0, 15).map((e) => `${String(e.created_at || '').slice(0, 19)} · ${e.tipo} · ${e.estado_nuevo || ''}`).join('\n') || 'Sin eventos');
    }
  } catch (err) {
    window.alert(err.message || String(err));
  }
}

export function initRecepcionBienesView() {
  // app.js agenda init antes de inyectar innerHTML; reintentar hasta tener el DOM.
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
  lifecycle.addCleanup(() => {
    closeBandejaActionMenus();
    rowsCache = [];
  });

  const tbody = document.getElementById(LIST_ID);
  if (tbody) tbody.dataset.rbReady = '1';
  loadBandeja();
}
