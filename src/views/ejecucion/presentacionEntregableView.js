/**
 * RC8.15.1 — Ejecución → Presentación Entregables de Servicios.
 * Bandeja real (SERVICIO / LOCACIÓN). Reutiliza la ruta/menú "Presentación Entregable".
 *
 * NO se registra ningún entregable ficticio: la bandeja deriva los entregables
 * ACTIVOS de órdenes OS notificadas (o estados posteriores compatibles) desde
 * orden_entregas. La recepción real se registra vía /api/entregables-servicios.
 */
import { entregablesServiciosService } from '../../services/entregablesServiciosService.js';

const VIEW_ID = 'presentacion-entregables-servicios';
const LIST_ID = 'peList';
const PREFIX = 'pe';

let rowsCache = [];
let filtroEstado = '';
let filtroQ = '';
let filtroArea = '';
let page = 1;
const PAGE_SIZE = 15;

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

function fmtFecha(iso) {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  return s || '—';
}

function fmtMonto(n) {
  const v = Number(n || 0);
  return `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ordenLabel(row) {
  return `${row.tipo_orden || 'OS'} ${row.numero_orden || ''}${row.anio_orden ? ` / ${row.anio_orden}` : ''}`;
}

function estadoBadge(row) {
  // RC8.15.1F — columna Estado = etapa del expediente (no situación).
  const label = row.estado_etapa_label || row.etapa_label || row.estado_ejecucion_label || 'Presentación de Entregables';
  return `<span class="badge" style="background:#495057;color:#fff;">${esc(label)}</span>`;
}

function situacionBadge(row) {
  const codigo = row.situacion_codigo || row.estado_ejecucion || 'PENDIENTE_RECEPCION';
  const label = row.situacion_label || row.estado_ejecucion_label || 'Pendiente de recepción';
  const bg = codigo === 'PENDIENTE_RECEPCION' ? '#0d6efd' : '#198754';
  return `<span class="badge" style="background:${bg};color:#fff;">${esc(label)}</span>`;
}

function responsableLabel(row) {
  // RC8.15.1F — Responsable: si no hay usuario asignado, se muestra la etiqueta "Área Usuaria".
  if (row.responsable_usuario_id) return row.responsable || 'Pendiente';
  return 'Área Usuaria';
}

function renderRows() {
  const tbody = document.getElementById(`${LIST_ID}Body`);
  if (!tbody) return;
  if (!rowsCache.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="14" class="text-center text-muted py-4">
          <i class="bi bi-inbox d-block mb-2" style="font-size:1.8rem;"></i>
          No hay entregables de servicios pendientes.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = rowsCache.map((row) => {
    const id = row.orden_entrega_id;
    const req = row.requerimiento_codigo || `#${row.requerimiento_id || ''}`;
    const recibido = row.numero_recepciones > 0;
    return `
      <tr data-id="${id}">
        <td class="small fw-semibold text-nowrap">${esc(req || '—')}</td>
        <td class="text-nowrap"><strong>${esc(ordenLabel(row))}</strong></td>
        <td>
          <div class="small fw-semibold text-truncate" style="max-width:180px" title="${esc(row.proveedor_razon_social || '')}">${esc(row.proveedor_razon_social || '—')}</div>
          <div class="text-muted small">${esc(row.proveedor_ruc || '')}</div>
        </td>
        <td class="small text-truncate" style="max-width:140px" title="${esc(row.area_usuaria || '')}">${esc(row.area_usuaria || '—')}</td>
        <td class="text-center small">${esc(row.numero_entrega ?? '—')}</td>
        <td class="small text-truncate" style="max-width:160px" title="${esc(row.etiqueta_entrega || '')}">${esc(row.etiqueta_entrega || '—')}</td>
        <td class="small text-nowrap">${esc(fmtFecha(row.fecha_maxima))}</td>
        <td class="text-end small">${esc(fmtMonto(row.importe))}</td>
        <td class="small text-nowrap">${esc(fmtFecha(row.fecha_recepcion_mesa_partes))}</td>
        <td class="small">${esc(row.numero_expediente_sgd || '—')}</td>
        <td>${estadoBadge(row)}</td>
        <td>${situacionBadge(row)}</td>
        <td class="small">${esc(responsableLabel(row))}</td>
        <td class="text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-secondary pe-ver" data-id="${id}" title="Ver expediente"><i class="bi bi-folder2-open"></i></button>
          <button type="button" class="btn btn-sm btn-outline-primary pe-registrar" data-id="${id}" title="Registrar recepción" ${recibido ? '' : ''}><i class="bi bi-box-arrow-in-down"></i></button>
        </td>
      </tr>`;
  }).join('');
}

function filteredRows() {
  let list = rowsCache.slice();
  if (filtroEstado) list = list.filter((r) => (r.estado_ejecucion || '') === filtroEstado);
  if (filtroArea) {
    list = list.filter((r) => String(r.area_usuaria || '').toLowerCase().includes(filtroArea.toLowerCase()));
  }
  const q = filtroQ.trim().toLowerCase();
  if (q) {
    list = list.filter((r) => [
      r.requerimiento_codigo, r.numero_orden, r.proveedor_razon_social, r.proveedor_ruc,
      r.etiqueta_entrega, r.numero_expediente_sgd, r.responsable, r.area_usuaria,
    ].join(' ').toLowerCase().includes(q));
  }
  return list;
}

function renderPagination() {
  const total = filteredRows().length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) page = pages;
  const start = (page - 1) * PAGE_SIZE;
  const slice = filteredRows().slice(start, start + PAGE_SIZE);
  const visible = slice;

  const tbody = document.getElementById(`${LIST_ID}Body`);
  if (tbody) {
    if (!visible.length) {
      tbody.innerHTML = `<tr><td colspan="14" class="text-center text-muted py-4">Sin resultados para los filtros.</td></tr>`;
    } else {
      tbody.innerHTML = visible.map(renderSingleRow).join('');
    }
  }

  const info = document.getElementById(`${PREFIX}PaginationInfo`);
  if (info) info.textContent = `${total} entregable(s) · página ${page} de ${pages}`;
  const prev = document.getElementById(`${PREFIX}Prev`);
  const next = document.getElementById(`${PREFIX}Next`);
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= pages;
}

function renderSingleRow(row) {
  const id = row.orden_entrega_id;
  const req = row.requerimiento_codigo || `#${row.requerimiento_id || ''}`;
  return `
    <tr data-id="${id}">
      <td class="small fw-semibold text-nowrap">${esc(req || '—')}</td>
      <td class="text-nowrap"><strong>${esc(ordenLabel(row))}</strong></td>
      <td>
        <div class="small fw-semibold text-truncate" style="max-width:180px" title="${esc(row.proveedor_razon_social || '')}">${esc(row.proveedor_razon_social || '—')}</div>
        <div class="text-muted small">${esc(row.proveedor_ruc || '')}</div>
      </td>
      <td class="small text-truncate" style="max-width:140px" title="${esc(row.area_usuaria || '')}">${esc(row.area_usuaria || '—')}</td>
      <td class="text-center small">${esc(row.numero_entrega ?? '—')}</td>
      <td class="small text-truncate" style="max-width:160px" title="${esc(row.etiqueta_entrega || '')}">${esc(row.etiqueta_entrega || '—')}</td>
      <td class="small text-nowrap">${esc(fmtFecha(row.fecha_maxima))}</td>
      <td class="text-end small">${esc(fmtMonto(row.importe))}</td>
      <td class="small text-nowrap">${esc(fmtFecha(row.fecha_recepcion_mesa_partes))}</td>
      <td class="small">${esc(row.numero_expediente_sgd || '—')}</td>
      <td>${estadoBadge(row)}</td>
      <td>${situacionBadge(row)}</td>
      <td class="small">${esc(responsableLabel(row))}</td>
      <td class="text-nowrap">
        <button type="button" class="btn btn-sm btn-outline-secondary pe-ver" data-id="${id}" title="Ver expediente"><i class="bi bi-folder2-open"></i></button>
        <button type="button" class="btn btn-sm btn-outline-primary pe-registrar" data-id="${id}" title="Registrar recepción"><i class="bi bi-box-arrow-in-down"></i></button>
      </td>
    </tr>`;
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
      <button type="button" class="btn btn-sm btn-outline-secondary" id="${PREFIX}Reload" title="Actualizar">
        <i class="bi bi-arrow-clockwise"></i> Actualizar
      </button>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="row g-2 align-items-end mb-3">
          <div class="col-lg-3 col-md-4">
            <label class="form-label small mb-0">Buscar</label>
            <input type="text" class="form-control form-control-sm" id="${PREFIX}Buscar" placeholder="OS, requerimiento, proveedor, SGD…">
          </div>
          <div class="col-lg-2 col-md-3">
            <label class="form-label small mb-0">Estado</label>
            <select class="form-select form-select-sm" id="${PREFIX}Estado">
              <option value="">Todos</option>
              <option value="PENDIENTE_RECEPCION">Pendiente de recepción</option>
              <option value="RECIBIDO">Recibido</option>
            </select>
          </div>
          <div class="col-lg-2 col-md-3">
            <label class="form-label small mb-0">Área usuaria</label>
            <input type="text" class="form-control form-control-sm" id="${PREFIX}Area" placeholder="Área…">
          </div>
          <div class="col-lg-2 col-md-2 d-flex gap-2">
            <button type="button" class="btn btn-sm btn-outline-dark" id="${PREFIX}FiltroBtn"><i class="bi bi-funnel"></i> Filtrar</button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="${PREFIX}Limpiar">Limpiar</button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Requerimiento</th>
                <th>Orden</th>
                <th>Proveedor</th>
                <th>Área Usuaria</th>
                <th class="text-center">N.°</th>
                <th>Entregable</th>
                <th>Fecha máxima</th>
                <th class="text-end">Importe</th>
                <th>Fecha recepción Mesa de Partes</th>
                <th>Expediente SGD</th>
                <th>Estado</th>
                <th>Situación</th>
                <th>Responsable</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="${LIST_ID}Body"></tbody>
          </table>
        </div>

        <div class="d-flex align-items-center justify-content-between mt-3">
          <small class="text-muted" id="${PREFIX}PaginationInfo"></small>
          <div class="btn-group">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="${PREFIX}Prev"><i class="bi bi-chevron-left"></i></button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="${PREFIX}Next"><i class="bi bi-chevron-right"></i></button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal registrar recepción -->
    <div class="modal fade" id="${PREFIX}Modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <form id="${PREFIX}Form">
            <div class="modal-header">
              <h5 class="modal-title"><i class="bi bi-box-arrow-in-down"></i> Registrar recepción</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-6">
                  <label class="form-label small">Orden</label>
                  <input type="text" class="form-control form-control-sm" id="${PREFIX}Orden" readonly>
                </div>
                <div class="col-6">
                  <label class="form-label small">Entregable</label>
                  <input type="text" class="form-control form-control-sm" id="${PREFIX}Entregable" readonly>
                </div>
                <div class="col-6">
                  <label class="form-label small">Fecha máxima</label>
                  <input type="text" class="form-control form-control-sm" id="${PREFIX}FechaMax" readonly>
                </div>
                <div class="col-6">
                  <label class="form-label small">Importe</label>
                  <input type="text" class="form-control form-control-sm" id="${PREFIX}Importe" readonly>
                </div>
                <div class="col-6">
                  <label class="form-label small">Fecha recepción Mesa de Partes <span class="text-danger">*</span></label>
                  <input type="date" class="form-control form-control-sm" id="${PREFIX}FechaMesa" required>
                </div>
                <div class="col-6">
                  <label class="form-label small">N.º Expediente SGD <span class="text-danger">*</span></label>
                  <input type="text" class="form-control form-control-sm" id="${PREFIX}ExpSgd" required maxlength="120">
                </div>
                <div class="col-12">
                  <label class="form-label small">Archivo del entregable <span class="text-danger">*</span></label>
                  <input type="file" class="form-control form-control-sm" id="${PREFIX}Archivo" required>
                  <div class="form-text">PDF, imagen, Word, Excel o ZIP (máx. 25 MB).</div>
                </div>
                <div class="col-12">
                  <label class="form-label small">Observación</label>
                  <textarea class="form-control form-control-sm" id="${PREFIX}Observacion" rows="2"></textarea>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="submit" class="btn btn-sm btn-primary">Guardar recepción</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Modal expediente -->
    <div class="modal fade" id="${PREFIX}DetalleModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-folder2-open"></i> Expediente del entregable</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body" id="${PREFIX}DetalleBody"></div>
        </div>
      </div>
    </div>
  `;

  bindEvents();
  renderPagination();
}

function bindEvents() {
  document.getElementById(`${PREFIX}Reload`)?.addEventListener('click', load);
  document.getElementById(`${PREFIX}Buscar`)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { filtroQ = e.target.value; page = 1; renderPagination(); } });
  document.getElementById(`${PREFIX}Area`)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { filtroArea = e.target.value; page = 1; renderPagination(); } });
  document.getElementById(`${PREFIX}FiltroBtn`)?.addEventListener('click', () => {
    filtroQ = document.getElementById(`${PREFIX}Buscar`)?.value || '';
    filtroEstado = document.getElementById(`${PREFIX}Estado`)?.value || '';
    filtroArea = document.getElementById(`${PREFIX}Area`)?.value || '';
    page = 1;
    renderPagination();
  });
  document.getElementById(`${PREFIX}Limpiar`)?.addEventListener('click', () => {
    filtroQ = ''; filtroEstado = ''; filtroArea = ''; page = 1;
    if (document.getElementById(`${PREFIX}Buscar`)) document.getElementById(`${PREFIX}Buscar`).value = '';
    if (document.getElementById(`${PREFIX}Estado`)) document.getElementById(`${PREFIX}Estado`).value = '';
    if (document.getElementById(`${PREFIX}Area`)) document.getElementById(`${PREFIX}Area`).value = '';
    renderPagination();
  });
  document.getElementById(`${PREFIX}Prev`)?.addEventListener('click', () => { if (page > 1) { page -= 1; renderPagination(); } });
  document.getElementById(`${PREFIX}Next`)?.addEventListener('click', () => { page += 1; renderPagination(); });

  const tbody = document.getElementById(`${LIST_ID}Body`);
  tbody?.addEventListener('click', (e) => {
    const btnVer = e.target.closest('.pe-ver');
    const btnReg = e.target.closest('.pe-registrar');
    const rowEl = e.target.closest('tr[data-id]');
    const id = rowEl?.dataset.id;
    if (btnVer && id) { openDetalle(id); return; }
    if (btnReg && id) { openRegistrar(id); }
  });

  document.getElementById(`${PREFIX}Form`)?.addEventListener('submit', onSubmitRecepcion);
}

async function load() {
  try {
    const res = await entregablesServiciosService.listarBandeja();
    rowsCache = Array.isArray(res?.data) ? res.data : [];
    renderPagination();
  } catch (err) {
    const tbody = document.getElementById(`${LIST_ID}Body`);
    if (tbody) tbody.innerHTML = `<tr><td colspan="14" class="text-center text-danger py-4">${esc(err.message)}</td></tr>`;
    console.error(err);
  }
}

function getRow(id) {
  return rowsCache.find((r) => String(r.orden_entrega_id) === String(id));
}

function openRegistrar(id) {
  const row = getRow(id);
  if (!row) return;
  document.getElementById(`${PREFIX}Orden`).value = ordenLabel(row);
  document.getElementById(`${PREFIX}Entregable`).value = row.etiqueta_entrega || '—';
  document.getElementById(`${PREFIX}FechaMax`).value = fmtFecha(row.fecha_maxima);
  document.getElementById(`${PREFIX}Importe`).value = fmtMonto(row.importe);
  document.getElementById(`${PREFIX}FechaMesa`).value = '';
  document.getElementById(`${PREFIX}ExpSgd`).value = '';
  document.getElementById(`${PREFIX}Archivo`).value = '';
  document.getElementById(`${PREFIX}Observacion`).value = '';
  document.getElementById(`${PREFIX}Form`).dataset.ordenEntregaId = id;
  const modal = new bootstrap.Modal(document.getElementById(`${PREFIX}Modal`));
  modal.show();
}

async function onSubmitRecepcion(ev) {
  ev.preventDefault();
  const form = ev.currentTarget;
  const ordenEntregaId = form.dataset.ordenEntregaId;
  const fecha = document.getElementById(`${PREFIX}FechaMesa`)?.value;
  const expediente = document.getElementById(`${PREFIX}ExpSgd`)?.value?.trim();
  const archivoInput = document.getElementById(`${PREFIX}Archivo`);
  const file = archivoInput?.files?.[0];
  const observacion = document.getElementById(`${PREFIX}Observacion`)?.value?.trim();

  if (!fecha || !expediente || !file) {
    window.alert('Fecha de Mesa de Partes, N.º de Expediente SGD y Archivo son obligatorios.');
    return;
  }

  const contenido_base64 = await readFileAsDataUrl(file);
  const payload = {
    fecha_recepcion_mesa_partes: fecha,
    numero_expediente_sgd: expediente,
    observacion: observacion || null,
    documentos: [{
      nombre_archivo: file.name,
      mime_type: file.type || 'application/pdf',
      contenido_base64,
    }],
  };

  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await entregablesServiciosService.registrarRecepcion(ordenEntregaId, payload);
    bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}Modal`))?.hide();
    await load();
  } catch (err) {
    window.alert(err.message || 'Error al registrar la recepción');
  } finally {
    btn.disabled = false;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

async function openDetalle(id) {
  const body = document.getElementById(`${PREFIX}DetalleBody`);
  if (body) body.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  const modal = new bootstrap.Modal(document.getElementById(`${PREFIX}DetalleModal`));
  modal.show();
  try {
    const res = await entregablesServiciosService.getDetalle(id);
    const d = res?.data || {};
    body.innerHTML = renderDetalle(d);
  } catch (err) {
    if (body) body.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

function renderDetalle(d) {
  const expediente = d.expediente || {};
  const resumen = expediente.resumen || {};
  const recepciones = Array.isArray(d.recepciones) ? d.recepciones : [];
  const docsEntregable = Array.isArray(d.documentos_entregable) ? d.documentos_entregable : [];
  const cronograma = Array.isArray(expediente.cronograma) ? expediente.cronograma : [];
  const docs = Array.isArray(expediente.documentos) ? expediente.documentos : [];

  return `
    <div class="row g-3">
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <h6 class="text-muted text-uppercase small mb-3">Datos de la orden</h6>
            <dl class="row mb-0 small">
              <dt class="col-4">Orden</dt><dd class="col-8">${esc(ordenLabel(d))}</dd>
              <dt class="col-4">Requerimiento</dt><dd class="col-8">${esc(d.requerimiento_codigo || resumen.requerimiento_codigo || '—')}</dd>
              <dt class="col-4">Proveedor</dt><dd class="col-8">${esc(d.proveedor_razon_social || resumen.proveedor_razon_social || '—')}</dd>
              <dt class="col-4">Área usuaria</dt><dd class="col-8">${esc(d.area_usuaria || resumen.area_usuaria || '—')}</dd>
            </dl>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <h6 class="text-muted text-uppercase small mb-3">Entregable</h6>
            <dl class="row mb-0 small">
              <dt class="col-4">N.º Entregable</dt><dd class="col-8">${esc(d.numero_entrega ?? '—')}</dd>
              <dt class="col-4">Entregable</dt><dd class="col-8">${esc(d.etiqueta_entrega || d.descripcion || '—')}</dd>
              <dt class="col-4">Plazo</dt><dd class="col-8">${esc(d.dias_plazo || 0)} días</dd>
              <dt class="col-4">Fecha máxima</dt><dd class="col-8">${esc(fmtFecha(d.fecha_maxima))}</dd>
              <dt class="col-4">Importe</dt><dd class="col-8">${esc(fmtMonto(d.importe))}</dd>
            </dl>
          </div>
        </div>
      </div>

      <div class="col-12">
        <div class="card">
          <div class="card-body">
            <h6 class="text-muted text-uppercase small mb-3">Cronograma contractual</h6>
            <div class="table-responsive">
              <table class="table table-sm align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th>N.°</th><th>Entregable</th><th>Plazo</th><th>Fecha máxima</th><th>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${cronograma.length ? cronograma.map((c) => `
                    <tr>
                      <td>${esc(c.numero_entrega ?? '—')}</td>
                      <td>${esc(c.etiqueta_entrega || c.descripcion || '—')}</td>
                      <td>${esc(c.dias_plazo || 0)} días</td>
                      <td>${esc(fmtFecha(c.fecha_maxima))}</td>
                      <td class="text-end">${esc(fmtMonto(c.importe))}</td>
                    </tr>`).join('') : '<tr><td colspan="5" class="text-muted text-center">Sin cronograma disponible</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <h6 class="text-muted text-uppercase small mb-3">Recepciones registradas</h6>
            ${recepciones.length ? recepciones.map((r) => `
              <div class="border rounded p-2 mb-2 small">
                <div class="d-flex justify-content-between">
                  <strong>Recepción N.° ${esc(r.numero_recepcion)}</strong>
                  <span class="badge bg-secondary">${esc(r.tipo_recepcion || '—')}</span>
                </div>
                <div class="text-muted">Mesa de Partes: ${esc(fmtFecha(r.fecha_recepcion_mesa_partes))}</div>
                <div class="text-muted">Expediente SGD: ${esc(r.numero_expediente_sgd || '—')}</div>
                ${r.observacion ? `<div class="text-muted">Obs.: ${esc(r.observacion)}</div>` : ''}
              </div>`).join('') : '<p class="text-muted small mb-0">Sin recepciones registradas.</p>'}
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <h6 class="text-muted text-uppercase small mb-3">Documentos del entregable</h6>
            ${docsEntregable.length ? docsEntregable.map((doc) => `
              <div class="border rounded p-2 mb-2 small d-flex justify-content-between align-items-center">
                <div>
                  <div class="fw-semibold text-truncate" style="max-width:300px" title="${esc(doc.nombre_archivo)}">${esc(doc.nombre_archivo)}</div>
                  <div class="text-muted">${esc(doc.mime_type || '')}</div>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary pe-doc-preview" data-recepcion="${esc(doc.recepcion_id)}" data-doc="${esc(doc.id)}" title="Ver"><i class="bi bi-eye"></i></button>
              </div>`).join('') : '<p class="text-muted small mb-0">Sin documentos del entregable.</p>'}
            <hr class="my-3">
            <h6 class="text-muted text-uppercase small mb-2">Documentos de la orden</h6>
            ${docs.length ? docs.map((doc) => `
              <div class="border rounded p-2 mb-2 small">
                <div class="fw-semibold text-truncate" style="max-width:300px" title="${esc(doc.nombre || doc.tipo)}">${esc(doc.nombre || doc.tipo || 'Documento')}</div>
                <div class="text-muted">${esc(doc.tipo || doc.origen || '')}</div>
              </div>`).join('') : '<p class="text-muted small mb-0">Sin documentos de la orden.</p>'}
          </div>
        </div>
      </div>
    </div>`;
}

export function renderPresentacionEntregableView() {
  return `<div id="${VIEW_ID}"></div>`;
}

export function initPresentacionEntregableView() {
  const root = document.getElementById(VIEW_ID);
  if (root) {
    render();
    load();
  }
  // Bind de preview de documento (delegado)
  document.body.addEventListener('click', onDetalleDocPreview, { once: false });
}

async function onDetalleDocPreview(e) {
  const btn = e.target.closest('.pe-doc-preview');
  if (!btn) return;
  const recepcion = btn.dataset.recepcion;
  const docId = btn.dataset.doc;
  try {
    const blob = await entregablesServiciosService.previewDocumentoBlob(recepcion, docId);
    const url = URL.createObjectURL(blob.blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    window.alert(err.message || 'No se pudo abrir el documento');
  }
}

export { renderPresentacionEntregableView as renderPresentacionEntregable, initPresentacionEntregableView as initPresentacionEntregable };