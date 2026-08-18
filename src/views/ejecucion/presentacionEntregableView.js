/**
 * RC8.15.3 — Ejecución → Presentación Entregables de Servicios.
 * Bandeja con DOS pestañas: Órdenes (una fila por orden) y Entregables (una fila
 * por entregable ACTIVO). Reutiliza componentes centrales de estado/responsable
 * y el patrón de menú Acciones (bandejaUi) de Registro de Órdenes.
 * La recepción real se registra vía /api/entregables-servicios.
 */
import { entregablesServiciosService } from '../../services/entregablesServiciosService.js';
import { ordenesContratacionService } from '../../services/ordenesContratacionService.js';
import { renderEstadoBadgeFromRow } from '../../ui/workflow/EstadoBadge.js';
import {
  renderActionMenuCell, bindActionMenus, closeBandejaActionMenus, renderResponsableCellHtml,
} from '../../utils/bandejaUi.js';
import { openBase64Document, previewAdjuntoById } from '../../utils/documentViewer.js';
import { fmtFecha, fmtMonto } from '../../utils/ordenesUtils.js';

const VIEW_ID = 'presentacion-entregables-servicios';
const LIST_ID = 'peList';
const LIST_ORD_ID = 'peListOrdenes';
const PREFIX = 'pe';
const TAB_ORDENES = 'ordenes';
const TAB_ENTREGABLES = 'entregables';

let currentTab = TAB_ORDENES;
let ordenesCache = [];
let entregablesCache = [];
let filtroQ = '';

const ESC_MAP = {
  '&': `${String.fromCharCode(38)}amp;`,
  '<': `${String.fromCharCode(38)}lt;`,
  '>': `${String.fromCharCode(38)}gt;`,
  '"': `${String.fromCharCode(38)}quot;`,
  "'": `${String.fromCharCode(38)}#39;`,
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

/** N.° Orden: solo prefijo + número, sin "/anio". */
function ordenLabel(row) {
  return `${row.tipo_orden || 'OS'} ${row.numero_orden || ''}`;
}

/** Situación a nivel de orden (NO es estado workflow). */
function situacionBadge(row) {
  const codigo = row.situacion_codigo || 'PENDIENTE_RECEPCION';
  const label = row.situacion_label || 'Pendiente de recepción';
  let bg = '#0d6efd';
  let fg = '#fff';
  if (codigo === 'RECIBIDO_PARCIAL') { bg = '#ffc107'; fg = '#212529'; }
  else if (codigo === 'RECIBIDO') { bg = '#198754'; fg = '#fff'; }
  return `<span class="badge" style="background:${bg};color:${fg};">${esc(label)}</span>`;
}

function plazoLabel(dias) {
  const d = Number(dias || 0);
  return d > 0 ? `${d} día${d === 1 ? '' : 's'}` : '—';
}

function ordenMenuItems(row) {
  return [
    { act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' },
  ];
}

function entregableMenuItems(row) {
  const items = [
    { act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' },
  ];
  const situacion = row.situacion_codigo || row.estado_ejecucion || 'PENDIENTE_RECEPCION';
  if (situacion === 'PENDIENTE_RECEPCION' || situacion === 'RECIBIDO') {
    items.push({ act: 'registrarRecepcion', label: 'Registrar recepción', icon: 'bi-box-arrow-in-down' });
  }
  if (situacion === 'RECIBIDO' && row.puede_gestionar_conformidad) {
    items.push({ act: 'generarActa', label: 'Generar Acta de Conformidad', icon: 'bi-file-earmark-check' });
  }
  if (situacion === 'ACTA_GENERADA') {
    items.push({ act: 'verActaGenerada', label: 'Ver Acta de Conformidad', icon: 'bi-eye' });
    items.push({ act: 'descargarActaGenerada', label: 'Descargar Acta de Conformidad', icon: 'bi-download' });
    if (row.puede_gestionar_conformidad) {
      items.push({ act: 'adjuntarActaFirmada', label: 'Adjuntar Acta firmada', icon: 'bi-file-earmark-arrow-up' });
    }
  }
  if (situacion === 'CONFORME') {
    items.push({ act: 'verActaFirmada', label: 'Ver Acta firmada', icon: 'bi-eye' });
    items.push({ act: 'descargarActaFirmada', label: 'Descargar Acta firmada', icon: 'bi-download' });
  }
  return items;
}

// ── Fila pestaña Órdenes ─────────────────────────────────────────────────────
function renderOrdenRow(row) {
  const id = row.orden_id;
  return `
    <tr data-id="${id}">
      <td class="text-nowrap"><strong>${esc(ordenLabel(row))}</strong></td>
      <td class="text-nowrap small">${esc(fmtFecha(row.fecha_orden))}</td>
      <td class="small text-nowrap">${esc(row.requerimiento_codigo || '—')}</td>
      <td class="small text-truncate" style="max-width:180px" title="${esc(row.proveedor_razon_social || '')}">${esc(row.proveedor_razon_social || '—')}</td>
      <td class="small text-nowrap">${esc(row.centro || '—')}</td>
      <td class="text-end small">${esc(fmtMonto(row.monto_total))}</td>
      <td class="small text-nowrap">${esc(plazoLabel(row.plazo_total_dias))}</td>
      <td>${situacionBadge(row)}</td>
      <td>${renderEstadoBadgeFromRow(row)}</td>
      <td class="small">${renderResponsableCellHtml(row, esc)}</td>
      ${renderActionMenuCell(id, ordenMenuItems(row))}
    </tr>`;
}

// ── Fila pestaña Entregables ─────────────────────────────────────────────────
function renderEntregableRow(row) {
  const id = row.orden_entrega_id;
  return `
    <tr data-id="${id}">
      <td class="text-nowrap"><strong>${esc(ordenLabel(row))}</strong></td>
      <td class="text-nowrap small">${esc(fmtFecha(row.fecha_orden))}</td>
      <td class="small text-truncate" style="max-width:160px" title="${esc(row.proveedor_razon_social || '')}">${esc(row.proveedor_razon_social || '—')}</td>
      <td class="text-center small">${esc(row.numero_entrega ?? '—')}</td>
      <td class="small text-nowrap">${esc(plazoLabel(row.dias_plazo))}</td>
      <td class="text-center small">${row.cantidad != null ? esc(String(row.cantidad)) : '—'}</td>
      <td class="text-end small">${row.precio_unitario != null ? esc(fmtMonto(row.precio_unitario)) : '—'}</td>
      <td class="text-end small">${row.precio_total != null ? esc(fmtMonto(row.precio_total)) : '—'}</td>
      <td class="small text-nowrap">${esc(fmtFecha(row.fecha_maxima))}</td>
      <td class="small text-nowrap">${esc(fmtFecha(row.fecha_recepcion_mesa_partes))}</td>
      <td>${renderEstadoBadgeFromRow(row)}</td>
      <td class="small">${renderResponsableCellHtml(row, esc)}</td>
      ${renderActionMenuCell(id, entregableMenuItems(row))}
    </tr>`;
}

function renderTabs() {
  return `
    <ul class="nav nav-tabs mb-3" id="${PREFIX}Tabs" role="tablist">
      <li class="nav-item"><button class="nav-link ${currentTab === TAB_ORDENES ? 'active' : ''}" data-tab="${TAB_ORDENES}" type="button">Órdenes</button></li>
      <li class="nav-item"><button class="nav-link ${currentTab === TAB_ENTREGABLES ? 'active' : ''}" data-tab="${TAB_ENTREGABLES}" type="button">Entregables</button></li>
    </ul>`;
}

function filteredEntregables() {
  const q = filtroQ.trim().toLowerCase();
  if (!q) return entregablesCache;
  return entregablesCache.filter((r) => [
    r.requerimiento_codigo, r.numero_orden, r.proveedor_razon_social, r.proveedor_ruc,
    r.etiqueta_entrega, r.numero_expediente_sgd,
  ].join(' ').toLowerCase().includes(q));
}

function renderCurrent() {
  const panelOrdenes = document.getElementById(`${PREFIX}TabOrdenesPanel`);
  const panelEntregables = document.getElementById(`${PREFIX}TabEntregablesPanel`);
  if (panelOrdenes) panelOrdenes.classList.toggle('d-none', currentTab !== TAB_ORDENES);
  if (panelEntregables) panelEntregables.classList.toggle('d-none', currentTab !== TAB_ENTREGABLES);
  if (currentTab === TAB_ORDENES) {
    const tbody = document.getElementById(`${LIST_ORD_ID}Body`);
    if (tbody) {
      tbody.innerHTML = ordenesCache.length
        ? ordenesCache.map(renderOrdenRow).join('')
        : `<tr><td colspan="11" class="text-center text-muted py-4">No hay órdenes de servicio/locación pendientes.</td></tr>`;
      bindActionMenus(tbody, buildActMap());
    }
  } else {
    const tbody = document.getElementById(`${LIST_ID}Body`);
    if (tbody) {
      const list = filteredEntregables();
      tbody.innerHTML = list.length
        ? list.map(renderEntregableRow).join('')
        : `<tr><td colspan="13" class="text-center text-muted py-4">No hay entregables activos.</td></tr>`;
      bindActionMenus(tbody, buildActMap());
    }
  }
}

async function load() {
  try {
    const [ordRes, entRes] = await Promise.all([
      entregablesServiciosService.listarBandejaOrdenes(),
      entregablesServiciosService.listarBandeja(),
    ]);
    ordenesCache = (ordRes?.data || ordRes || []);
    entregablesCache = (entRes?.data || entRes || []);
    renderCurrent();
  } catch (err) {
    const tbody = document.getElementById(`${LIST_ORD_ID}Body`);
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger py-4">${esc(err.message || 'Error al cargar')}</td></tr>`;
  }
}

function buildActMap() {
  return {
    verExpediente: (id) => openDetalle(id),
    registrarRecepcion: (id) => openRegistrarRecepcion(id),
    generarActa: (id) => openGenerarActa(id),
    adjuntarActaFirmada: (id) => openAdjuntarActaFirmada(id),
    verActaGenerada: (id) => verActaGenerada(id),
    descargarActaGenerada: (id) => descargarActaGenerada(id),
    verActaFirmada: (id) => verActaFirmada(id),
    descargarActaFirmada: (id) => descargarActaFirmada(id),
  };
}

function render() {
  const root = document.getElementById(VIEW_ID);
  if (!root) return;
  root.innerHTML = `
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
      <div>
        <h1 class="h3 mb-1"><i class="bi bi-file-earmark-check"></i> Presentación Entregables de Servicios</h1>
        <p class="text-muted mb-0 small">Recepción de entregables contractuales de órdenes de servicio y locación.</p>
      </div>
      <button type="button" class="btn btn-sm btn-outline-secondary" id="${PREFIX}Reload" title="Actualizar"><i class="bi bi-arrow-clockwise"></i> Actualizar</button>
    </div>
    ${renderTabs()}
    <div class="mb-3 row g-2 align-items-end">
      <div class="col-md-4"><label class="form-label small mb-0">Buscar</label>
        <input type="text" class="form-control form-control-sm" id="${PREFIX}Buscar" placeholder="OS, requerimiento, proveedor…"></div>
    </div>
    <div class="card"><div class="card-body">
      <div class="table-responsive" id="${PREFIX}TabOrdenesPanel">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light"><tr>
            <th>N.° Orden</th><th>Fecha orden</th><th>Requerimiento</th><th>Proveedor</th>
            <th>Centro</th><th class="text-end">Monto total</th><th>Plazo total</th>
            <th>Situación</th><th>Estado</th><th>Responsable</th><th>Acciones</th>
          </tr></thead>
          <tbody id="${LIST_ORD_ID}Body"></tbody>
        </table>
      </div>
      <div class="table-responsive d-none" id="${PREFIX}TabEntregablesPanel">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light"><tr>
            <th>N.° Orden</th><th>Fecha orden</th><th>Proveedor</th><th class="text-center">N.° entregable</th>
            <th>Plazo entregable</th><th class="text-center">Cantidad</th><th class="text-end">Precio unitario</th>
            <th class="text-end">Precio total</th><th>Fecha máxima</th><th>Fecha recepción</th>
            <th>Estado</th><th>Responsable</th><th>Acciones</th>
          </tr></thead>
          <tbody id="${LIST_ID}Body"></tbody>
        </table>
      </div>
    </div></div>

    <div class="modal fade" id="${PREFIX}Modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <form id="${PREFIX}Form">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-box-arrow-in-down"></i> Registrar recepción</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}EntregableId">
            <div class="mb-2"><label class="form-label small mb-0">Fecha recepción Mesa de Partes <span class="text-danger">*</span></label>
              <input type="date" class="form-control form-control-sm" id="${PREFIX}Fecha" required></div>
            <div class="mb-2"><label class="form-label small mb-0">Expediente SGD <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm" id="${PREFIX}Sgd" required></div>
            <div class="mb-2"><label class="form-label small mb-0">Observación</label>
              <textarea class="form-control form-control-sm" id="${PREFIX}Obs" rows="2"></textarea></div>
            <div class="mb-2"><label class="form-label small mb-0">Documento (PDF)</label>
              <input type="file" class="form-control form-control-sm" id="${PREFIX}File" accept="application/pdf"></div>
            <div id="${PREFIX}ModalErr" class="alert alert-danger d-none py-2 small"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-primary">Registrar</button>
          </div>
        </form>
      </div></div>
    </div>

    <div class="modal fade" id="${PREFIX}DetalleModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi bi-folder2-open"></i> Expediente del entregable</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body" id="${PREFIX}DetalleBody"></div>
      </div></div>
    </div>

    <div class="modal fade" id="${PREFIX}ActaModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi bi-file-earmark-check"></i> Acta de Conformidad</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="${PREFIX}ActaEntregableId">
          <div class="border rounded p-2 small mb-3" id="${PREFIX}ActaResumen"></div>
          <div class="mb-2"><label class="form-label small mb-0">Conclusión</label>
            <div class="form-control-plaintext small fw-semibold">CONFORME</div>
          </div>
          <div class="alert alert-warning small mb-0">Al generar el Acta de Conformidad se declara conforme el entregable seleccionado.</div>
          <div id="${PREFIX}ActaErr" class="alert alert-danger d-none py-2 small mt-2"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-sm btn-primary" id="${PREFIX}ActaGenerarBtn">Generar Acta</button>
        </div>
      </div></div>
    </div>

    <div class="modal fade" id="${PREFIX}FirmadaModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog"><div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi bi-file-earmark-arrow-up"></i> Adjuntar Acta firmada</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="${PREFIX}FirmadaEntregableId">
          <div class="mb-2"><label class="form-label small mb-0">Acta firmada (PDF) <span class="text-danger">*</span></label>
            <input type="file" class="form-control form-control-sm" id="${PREFIX}FirmadaFile" accept="application/pdf"></div>
          <div id="${PREFIX}FirmadaErr" class="alert alert-danger d-none py-2 small"></div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
          <button type="button" class="btn btn-sm btn-primary" id="${PREFIX}FirmadaAdjBtn">Adjuntar</button>
        </div>
      </div></div>
    </div>`;
}

async function openRegistrarRecepcion(id) {
  document.getElementById(`${PREFIX}EntregableId`).value = id;
  document.getElementById(`${PREFIX}Fecha`).value = '';
  document.getElementById(`${PREFIX}Sgd`).value = '';
  document.getElementById(`${PREFIX}Obs`).value = '';
  document.getElementById(`${PREFIX}File`).value = '';
  document.getElementById(`${PREFIX}ModalErr`)?.classList.add('d-none');
  const modalEl = document.getElementById(`${PREFIX}Modal`);
  window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function submitRegistrarRecepcion(e) {
  e.preventDefault();
  const id = document.getElementById(`${PREFIX}EntregableId`).value;
  const fecha = document.getElementById(`${PREFIX}Fecha`).value;
  const sgd = document.getElementById(`${PREFIX}Sgd`).value.trim();
  const obs = document.getElementById(`${PREFIX}Obs`).value.trim();
  const fileInput = document.getElementById(`${PREFIX}File`);
  const errBox = document.getElementById(`${PREFIX}ModalErr`);
  if (!fecha || !sgd) {
    if (errBox) { errBox.textContent = 'Fecha y Expediente SGD son obligatorios.'; errBox.classList.remove('d-none'); }
    return;
  }
  let contenido = null; let nombre = null; let mime = null;
  if (fileInput?.files?.length) {
    const f = fileInput.files[0];
    nombre = f.name; mime = f.type || 'application/pdf';
    contenido = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.readAsDataURL(f);
    });
  }
  try {
    await entregablesServiciosService.registrarRecepcion(id, {
      fecha_recepcion_mesa_partes: fecha,
      numero_expediente_sgd: sgd,
      observacion: obs,
      archivos: contenido ? [{ nombre_archivo: nombre, mime_type: mime, contenido_base64: contenido }] : [],
    });
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}Modal`))?.hide();
    await load();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'No se pudo registrar'; errBox.classList.remove('d-none'); }
  }
}

// ── RC8.15.5B — Conformidad del entregable ──────────────────────────────────
function resumenActa(id) {
  return entregablesCache.find((r) => String(r.orden_entrega_id) === String(id)) || {};
}

async function confVigente(id) {
  const res = await entregablesServiciosService.listarConformidad(id);
  const c = res?.data || res || {};
  return {
    acta: c.acta_generada_vigente || (c.actas || [])[0] || null,
    firmada: c.acta_firmada_vigente || (c.visados || [])[0] || null,
  };
}

function triggerDownload(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre || 'documento.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function openActaGenerada(entregaId, actaId) {
  const d = await entregablesServiciosService.obtenerActaGenerada(entregaId, actaId);
  const a = d?.data || d || {};
  openBase64Document({
    nombre: a.documento_nombre || a.numero_acta || 'acta.pdf',
    mime_type: a.documento_mime || 'application/pdf',
    contenido_base64: a.documento_base64 || '',
  });
}

async function openActaFirmada(entregaId, visadoId) {
  const d = await entregablesServiciosService.obtenerActaFirmada(entregaId, visadoId);
  const v = d?.data || d || {};
  openBase64Document({
    nombre: v.nombre || 'acta-firmada.pdf',
    mime_type: v.mime_type || 'application/pdf',
    contenido_base64: v.contenido_base64 || '',
  });
}

async function openGenerarActa(id) {
  const row = resumenActa(id);
  document.getElementById(`${PREFIX}ActaEntregableId`).value = id;
  document.getElementById(`${PREFIX}ActaResumen`).innerHTML = `
    <div><strong>Orden:</strong> ${esc(ordenLabel(row))}</div>
    <div><strong>Proveedor:</strong> ${esc(row.proveedor_razon_social || '—')}</div>
    <div><strong>Entregable:</strong> N.° ${esc(row.numero_entrega ?? '—')}</div>
    <div><strong>Fecha recepción:</strong> ${esc(fmtFecha(row.fecha_recepcion_mesa_partes))}</div>
    <div><strong>Expediente SGD:</strong> ${esc(row.numero_expediente_sgd || '—')}</div>
    <div><strong>Importe:</strong> ${esc(fmtMonto(row.importe))}</div>`;
  document.getElementById(`${PREFIX}ActaErr`)?.classList.add('d-none');
  window.bootstrap.Modal.getOrCreateInstance(document.getElementById(`${PREFIX}ActaModal`)).show();
}

async function generarActa(id) {
  const errBox = document.getElementById(`${PREFIX}ActaErr`);
  try {
    await entregablesServiciosService.generarActaConformidad(id, { conclusion: 'CONFORME' });
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}ActaModal`))?.hide();
    await load();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'No se pudo generar el acta'; errBox.classList.remove('d-none'); }
  }
}

async function openAdjuntarActaFirmada(id) {
  document.getElementById(`${PREFIX}FirmadaEntregableId`).value = id;
  document.getElementById(`${PREFIX}FirmadaFile`).value = '';
  document.getElementById(`${PREFIX}FirmadaErr`)?.classList.add('d-none');
  window.bootstrap.Modal.getOrCreateInstance(document.getElementById(`${PREFIX}FirmadaModal`)).show();
}

async function adjuntarActaFirmada() {
  const id = document.getElementById(`${PREFIX}FirmadaEntregableId`).value;
  const fileInput = document.getElementById(`${PREFIX}FirmadaFile`);
  const errBox = document.getElementById(`${PREFIX}FirmadaErr`);
  if (!fileInput?.files?.length) {
    if (errBox) { errBox.textContent = 'Debe seleccionar el PDF del acta firmada.'; errBox.classList.remove('d-none'); }
    return;
  }
  const f = fileInput.files[0];
  const contenido = await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.readAsDataURL(f);
  });
  try {
    await entregablesServiciosService.adjuntarActaConformidadFirmada(id, {
      nombre: f.name,
      mime_type: f.type || 'application/pdf',
      contenido_base64: contenido,
      idempotency_key: `firmada-${id}-${Date.now()}`,
    });
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}FirmadaModal`))?.hide();
    await load();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'No se pudo adjuntar el acta firmada'; errBox.classList.remove('d-none'); }
  }
}

async function verActaGenerada(id) {
  try {
    const { acta } = await confVigente(id);
    if (!acta) throw new Error('No hay acta generada');
    await openActaGenerada(id, acta.id);
  } catch (err) { window.alert(err.message || 'No se pudo abrir el acta'); }
}

async function descargarActaGenerada(id) {
  try {
    const { acta } = await confVigente(id);
    if (!acta) throw new Error('No hay acta generada');
    const blob = await entregablesServiciosService.downloadActaGeneradaBlob(id, acta.id);
    triggerDownload(blob.blob, acta.documento_nombre || acta.numero_acta || 'acta.pdf');
  } catch (err) { window.alert(err.message || 'No se pudo descargar el acta'); }
}

async function verActaFirmada(id) {
  try {
    const { firmada } = await confVigente(id);
    if (!firmada) throw new Error('No hay acta firmada');
    await openActaFirmada(id, firmada.id);
  } catch (err) { window.alert(err.message || 'No se pudo abrir el acta firmada'); }
}

async function descargarActaFirmada(id) {
  try {
    const { firmada } = await confVigente(id);
    if (!firmada) throw new Error('No hay acta firmada');
    const blob = await entregablesServiciosService.downloadActaFirmadaBlob(id, firmada.id);
    triggerDownload(blob.blob, firmada.nombre || 'acta-firmada.pdf');
  } catch (err) { window.alert(err.message || 'No se pudo descargar el acta firmada'); }
}

function renderConformidadHtml(conf, entregaId) {
  const actas = conf?.actas || [];
  const visados = conf?.visados || [];
  const actaRow = (a) => `
    <div class="border rounded p-2 mb-2 small d-flex justify-content-between align-items-center">
      <div>
        <div class="fw-semibold">Acta generada <span class="badge bg-secondary">V${esc(a.version)}</span></div>
        <div class="text-muted">${esc(a.estado_documental || '')} · ${esc(fmtFecha(a.generado_at))} · ${esc(a.generado_por || '')}</div>
      </div>
      <div class="text-nowrap">
        <button type="button" class="btn btn-sm btn-outline-primary pe-acta-ver" data-entrega="${esc(entregaId)}" data-id="${esc(a.id)}"><i class="bi bi-eye"></i> Ver</button>
        <button type="button" class="btn btn-sm btn-outline-secondary pe-acta-dl" data-entrega="${esc(entregaId)}" data-id="${esc(a.id)}" data-name="${esc(a.documento_nombre || a.numero_acta || 'acta.pdf')}"><i class="bi bi-download"></i> Descargar</button>
      </div>
    </div>`;
  const visadoRow = (v) => `
    <div class="border rounded p-2 mb-2 small d-flex justify-content-between align-items-center">
      <div>
        <div class="fw-semibold">Acta firmada <span class="badge bg-secondary">V${esc(v.version)}</span> ${v.vigente ? '<span class="badge bg-success">Vigente</span>' : '<span class="badge bg-light text-muted">Histórica</span>'}</div>
        <div class="text-muted">${esc(v.nombre || '')} · ${esc(fmtFecha(v.created_at))} · ${esc(v.created_by || '')}</div>
      </div>
      <div class="text-nowrap">
        <button type="button" class="btn btn-sm btn-outline-primary pe-firmada-ver" data-entrega="${esc(entregaId)}" data-id="${esc(v.id)}"><i class="bi bi-eye"></i> Ver</button>
        <button type="button" class="btn btn-sm btn-outline-secondary pe-firmada-dl" data-entrega="${esc(entregaId)}" data-id="${esc(v.id)}" data-name="${esc(v.nombre || 'acta-firmada.pdf')}"><i class="bi bi-download"></i> Descargar</button>
      </div>
    </div>`;
  return `
    <div class="col-12"><div class="card"><div class="card-body">
      <h6 class="text-muted text-uppercase small mb-2">Conformidad del entregable</h6>
      ${actas.length ? '<div class="mb-1 mt-2"><strong class="small">ACTA GENERADA</strong></div>' + actas.map(actaRow).join('') : '<p class="text-muted small mb-0">Sin acta generada.</p>'}
      ${visados.length ? '<div class="mb-1 mt-2"><strong class="small">ACTA FIRMADA</strong></div>' + visados.map(visadoRow).join('') : ''}
    </div></div></div>`;
}

async function onConformidadVer(e) {
  const btn = e.target.closest('.pe-acta-ver, .pe-firmada-ver, .pe-acta-dl, .pe-firmada-dl');
  if (!btn) return;
  const entregaId = btn.dataset.entrega;
  const docId = btn.dataset.id;
  const nombre = btn.dataset.name || 'documento.pdf';
  try {
    if (btn.classList.contains('pe-acta-ver')) await openActaGenerada(entregaId, docId);
    else if (btn.classList.contains('pe-acta-dl')) {
      const blob = await entregablesServiciosService.downloadActaGeneradaBlob(entregaId, docId);
      triggerDownload(blob.blob, nombre);
    } else if (btn.classList.contains('pe-firmada-ver')) await openActaFirmada(entregaId, docId);
    else if (btn.classList.contains('pe-firmada-dl')) {
      const blob = await entregablesServiciosService.downloadActaFirmadaBlob(entregaId, docId);
      triggerDownload(blob.blob, nombre);
    }
  } catch (err) {
    window.alert(err.message || 'No se pudo abrir el documento');
  }
}

async function openDetalle(id) {
  // RC8.15.4/8.15.5B — Expediente organizado en secciones: Datos de la orden ·
  // Datos del entregable · Recepciones · Documentos del entregable · Documentos de la
  // orden · Conformidad del entregable (Acta generada + Acta firmada).
  const body = document.getElementById(`${PREFIX}DetalleBody`);
  if (body) body.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>';
  const modal = window.bootstrap.Modal.getOrCreateInstance(document.getElementById(`${PREFIX}DetalleModal`));
  modal.show();
  try {
    const resp = await entregablesServiciosService.getDetalle(id);
    const data = resp?.data || resp || {};
    const recepciones = data.recepciones || [];
    const docsEntregable = data.documentos_entregable || [];
    const docsOrden = data.expediente?.documentos || [];
    let conformidad = { actas: [], visados: [] };
    try {
      const confResp = await entregablesServiciosService.listarConformidad(id);
      conformidad = confResp?.data || confResp || { actas: [], visados: [] };
    } catch (_) { conformidad = { actas: [], visados: [] }; }
    body.innerHTML = `
      <div class="row g-3">
        <div class="col-12"><h6 class="text-muted text-uppercase small mb-2">Datos de la orden</h6>
          <div class="border rounded p-2 small">
            <strong>${esc(ordenLabel(data))}</strong>
            <div class="text-muted">Proveedor: ${esc(data.proveedor_razon_social || '—')}</div>
            <div class="text-muted">Área usuaria: ${esc(data.area_usuaria || '—')}</div>
          </div>
        </div>
        <div class="col-12"><h6 class="text-muted text-uppercase small mb-2">Datos del entregable</h6>
          <div class="border rounded p-2 small">
            <div><strong>${esc(data.etiqueta_entrega || `Entregable ${data.numero_entrega || ''}`)}</strong> <span class="text-muted">(N.° ${esc(data.numero_entrega ?? '—')})</span></div>
            <div class="text-muted">Plazo: ${esc(plazoLabel(data.dias_plazo))} · Fecha máxima: ${esc(fmtFecha(data.fecha_maxima))} · Importe: ${esc(fmtMonto(data.importe))}</div>
          </div>
        </div>
        <div class="col-md-6"><div class="card h-100"><div class="card-body">
          <h6 class="text-muted text-uppercase small mb-3">Recepciones registradas</h6>
          ${recepciones.length ? recepciones.map((r) => `
            <div class="border rounded p-2 mb-2 small">
              <div class="d-flex justify-content-between"><strong>Recepción N.° ${esc(r.numero_recepcion)}</strong><span class="badge bg-secondary">${esc(r.tipo_recepcion || '—')}</span></div>
              <div class="text-muted">Mesa de Partes: ${esc(fmtFecha(r.fecha_recepcion_mesa_partes))}</div>
              <div class="text-muted">Expediente SGD: ${esc(r.numero_expediente_sgd || '—')}</div>
            </div>`).join('') : '<p class="text-muted small mb-0">Sin recepciones registradas.</p>'}
        </div></div></div>
        <div class="col-md-6"><div class="card h-100"><div class="card-body">
          <h6 class="text-muted text-uppercase small mb-2">Documentos del entregable</h6>
          ${docsEntregable.length ? docsEntregable.map((doc) => `
            <div class="border rounded p-2 mb-2 small d-flex justify-content-between align-items-center">
              <div class="text-truncate" style="max-width:260px" title="${esc(doc.nombre_archivo)}">${esc(doc.nombre_archivo)}</div>
              <button type="button" class="btn btn-sm btn-outline-secondary pe-doc-preview" data-recepcion="${esc(doc.recepcion_id)}" data-doc="${esc(doc.id)}"><i class="bi bi-eye"></i></button>
            </div>`).join('') : '<p class="text-muted small mb-0">Sin documentos del entregable.</p>'}
        </div></div></div>
        <div class="col-12"><div class="card"><div class="card-body">
          <h6 class="text-muted text-uppercase small mb-2">Documentos de la orden</h6>
          ${docsOrden.length ? docsOrden.map((doc) => `
            <div class="border rounded p-2 mb-2 small d-flex justify-content-between align-items-center">
              <div>
                <div class="fw-semibold text-truncate" style="max-width:320px" title="${esc(doc.nombre || doc.tipo || 'Documento')}">${esc(doc.nombre || doc.tipo || 'Documento')}</div>
                <div class="text-muted">${esc(doc.tipo || doc.origen || '')}</div>
              </div>
              <button type="button" class="btn btn-sm btn-outline-primary pe-orden-doc" data-kind="${esc(doc.kind || 'orden')}" data-id="${esc(doc.id || doc.documentoId || '')}" data-name="${esc(doc.nombre || 'documento')}" data-orden="${esc(data.orden_id)}" ${doc.previewDisponible === false ? 'disabled' : ''}><i class="bi bi-eye"></i> Ver</button>
            </div>`).join('') : '<p class="text-muted small mb-0">Sin documentos de la orden.</p>'}
        </div></div></div>
        ${renderConformidadHtml(conformidad, id)}
      </div>`;
  } catch (err) {
    if (body) body.innerHTML = `<div class="alert alert-danger">${esc(err.message || 'No se pudo cargar el expediente')}</div>`;
  }
}

/** Reutiliza el visor documental institucional (openBase64Document / previewAdjuntoById). */
async function onOrdenDocVer(e) {
  const btn = e.target.closest('.pe-orden-doc');
  if (!btn) return;
  const kind = btn.dataset.kind;
  const id = btn.dataset.id;
  const name = btn.dataset.name || 'documento';
  try {
    if (!id) throw new Error('Documento sin identificador válido');
    if (kind === 'adjunto') {
      await previewAdjuntoById(id, name);
      return;
    }
    if (kind === 'orden') {
      const ordenId = btn.dataset.orden;
      const res = await ordenesContratacionService.getDocumento(ordenId, id, true);
      const doc = res?.data || res;
      if (!doc?.contenido_base64) throw new Error('Documento sin contenido');
      openBase64Document({
        nombre: doc.nombre_archivo || name,
        mime_type: doc.mime_type || 'application/pdf',
        contenido_base64: doc.contenido_base64,
      });
      return;
    }
    window.alert('Vista no disponible para este tipo de documento.');
  } catch (err) {
    window.alert(err.message || 'No se pudo abrir el documento');
  }
}

async function onDetalleDocPreview(e) {
  const btn = e.target.closest('.pe-doc-preview');
  if (!btn) return;
  try {
    const blob = await entregablesServiciosService.previewDocumentoBlob(btn.dataset.recepcion, btn.dataset.doc);
    const url = URL.createObjectURL(blob.blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    window.alert(err.message || 'No se pudo abrir el documento');
  }
}

function renderTabsInto() {
  const tabsEl = document.getElementById(`${PREFIX}Tabs`);
  if (!tabsEl) return;
  tabsEl.innerHTML = `
    <li class="nav-item"><button class="nav-link ${currentTab === TAB_ORDENES ? 'active' : ''}" data-tab="${TAB_ORDENES}" type="button">Órdenes</button></li>
    <li class="nav-item"><button class="nav-link ${currentTab === TAB_ENTREGABLES ? 'active' : ''}" data-tab="${TAB_ENTREGABLES}" type="button">Entregables</button></li>`;
}

export function renderPresentacionEntregableView() {
  return `<div id="${VIEW_ID}"></div>`;
}

export function initPresentacionEntregableView() {
  const root = document.getElementById(VIEW_ID);
  if (!root) return;
  render();
  load();
  document.getElementById(`${PREFIX}Tabs`)?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    currentTab = tab.dataset.tab;
    renderTabsInto();
    renderCurrent();
  });
  document.getElementById(`${PREFIX}Reload`)?.addEventListener('click', load);
  document.getElementById(`${PREFIX}Buscar`)?.addEventListener('change', (e) => {
    filtroQ = e.target.value.trim();
    renderCurrent();
  });
  document.getElementById(`${PREFIX}Form`)?.addEventListener('submit', submitRegistrarRecepcion);
  document.getElementById(`${PREFIX}ActaGenerarBtn`)?.addEventListener('click', () => generarActa(document.getElementById(`${PREFIX}ActaEntregableId`).value));
  document.getElementById(`${PREFIX}FirmadaAdjBtn`)?.addEventListener('click', adjuntarActaFirmada);
  document.body.addEventListener('click', onDetalleDocPreview);
  document.body.addEventListener('click', onOrdenDocVer);
  document.body.addEventListener('click', onConformidadVer);
}

export { renderPresentacionEntregableView as renderPresentacionEntregable, initPresentacionEntregableView as initPresentacionEntregable };