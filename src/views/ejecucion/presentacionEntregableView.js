/**
 * RC8.15.3 — Ejecución → Presentación Entregables de Servicios.
 * Bandeja con DOS pestañas: Órdenes (una fila por orden) y Entregables (una fila
 * por entregable ACTIVO). Reutiliza componentes centrales de estado/responsable
 * y el patrón de menú Acciones (bandejaUi) de Registro de Órdenes.
 * La recepción real se registra vía /api/entregables-servicios.
 */
import { entregablesServiciosService } from '../../services/entregablesServiciosService.js';
import { ordenesContratacionService } from '../../services/ordenesContratacionService.js';
import { renderEstadoBadgeFromRow, renderEstadoBadgeHtml } from '../../ui/workflow/EstadoBadge.js';
import {
  renderActionMenuCell, bindActionMenus, closeBandejaActionMenus, renderResponsableCellHtml,
} from '../../utils/bandejaUi.js';
import { openBase64Document, previewAdjuntoById } from '../../utils/documentViewer.js';
import { fmtFecha, fmtMonto } from '../../utils/ordenesUtils.js';
import { openExpedienteOrdenModal } from '../../utils/registroOrdenExpedienteModal.js';

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

export function ordenMenuItems(row) {
  return [
    { act: 'verExpedienteOrden', label: 'Ver expediente', icon: 'bi-folder2-open' },
  ];
}

export function entregableMenuItems(row) {
  const items = [
    { act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' },
  ];
  const etapa = String(row.estado_etapa_codigo || '').toUpperCase();
  if (etapa === 'REVISION_COORDINADOR_CM') {
    if (row.puede_observar_coordinador_cm) {
      items.push({ act: 'observarEntregable', label: 'Observar', icon: 'bi-exclamation-triangle' });
    }
    if (row.puede_derivar_analista_cm) {
      items.push({ act: 'derivarAnalistaCM', label: 'Derivar a Analista CM', icon: 'bi-send' });
    }
    if (row.puede_ver_trazabilidad) {
      items.push({ act: 'verTrazabilidad', label: 'Ver trazabilidad', icon: 'bi-clock-history' });
    }
    return items;
  }
  if (etapa === 'REVISION_ANALISTA_CM') {
    if (row.puede_observar_analista_cm) {
      items.push({ act: 'observarEntregable', label: 'Observar', icon: 'bi-exclamation-triangle' });
    }
    if (row.puede_derivar_pago) {
      items.push({ act: 'derivarPago', label: 'Derivar a Pago', icon: 'bi-credit-card' });
    }
    if (row.puede_ver_trazabilidad) {
      items.push({ act: 'verTrazabilidad', label: 'Ver trazabilidad', icon: 'bi-clock-history' });
    }
    return items;
  }
  if (etapa === 'DERIVACION_PAGO') {
    if (row.puede_ver_trazabilidad) {
      items.push({ act: 'verTrazabilidad', label: 'Ver trazabilidad', icon: 'bi-clock-history' });
    }
    return items;
  }
  if (row.solo_lectura_legacy_emisor || row.solo_lectura_routing_origen) {
    if (row.puede_ver_observacion_abierta || row.puede_ver_observacion_dirigida) {
      items.push({
        act: 'verObservacionDirigida',
        label: 'Ver observación',
        icon: 'bi-exclamation-triangle',
      });
    }
    if (row.puede_retirar_observacion) {
      items.push({
        act: 'retirarObservacion',
        label: 'Retirar observación',
        icon: 'bi-x-circle',
      });
    }
    if (row.puede_ver_trazabilidad) {
      items.push({ act: 'verTrazabilidad', label: 'Ver trazabilidad', icon: 'bi-clock-history' });
    }
    return items;
  }
  if (row.puede_registrar_recepcion) {
    items.push({
      act: 'registrarRecepcion',
      label: 'Registrar entregable',
      icon: 'bi-box-arrow-in-down',
    });
  }
  if (row.puede_modificar_entregable) {
    items.push({
      act: 'registrarRecepcion',
      label: 'Modificar entregable',
      icon: 'bi-pencil-square',
    });
  }
  if (row.puede_observar) {
    items.push({ act: 'observarEntregable', label: 'Observar', icon: 'bi-exclamation-triangle' });
  }
  if (row.puede_subsanar) {
    items.push({ act: 'subsanarEntregable', label: 'Subsanar observación', icon: 'bi-arrow-repeat' });
  }
  if (row.puede_gestionar_conformidad) {
    items.push({
      act: 'generarActa',
      label: 'Generar Acta de Conformidad',
      icon: 'bi-file-earmark-check',
    });
  } else if (row.puede_regenerar_acta) {
    items.push({
      act: 'generarActa',
      label: 'Regenerar Acta de Conformidad',
      icon: 'bi-file-earmark-check',
    });
  }
  if (row.puede_ver_acta_generada) {
    items.push({ act: 'verActaGenerada', label: 'Ver Acta de Conformidad', icon: 'bi-eye' });
    items.push({
      act: 'descargarActaGenerada',
      label: 'Descargar Acta de Conformidad',
      icon: 'bi-download',
    });
  }
  if (row.puede_adjuntar_acta_firmada) {
    items.push({
      act: 'adjuntarActaFirmada',
      label: 'Adjuntar Acta firmada',
      icon: 'bi-file-earmark-arrow-up',
    });
  }
  if (row.puede_ver_acta_firmada) {
    items.push({ act: 'verActaFirmada', label: 'Ver Acta firmada', icon: 'bi-eye' });
    items.push({
      act: 'descargarActaFirmada',
      label: 'Descargar Acta firmada',
      icon: 'bi-download',
    });
  }
  if (row.puede_derivar_coordinador_cm) {
    items.push({
      act: 'derivarCoordinadorCM',
      label: 'Derivar a Coordinador CM',
      icon: 'bi-send',
    });
  }
  if (row.puede_ver_trazabilidad) {
    items.push({ act: 'verTrazabilidad', label: 'Ver trazabilidad', icon: 'bi-clock-history' });
  }
  return items;
}

function renderEstadosOrden(row) {
  const estados = row.estados_entregables || [];
  if (!row.estado_agregado_heterogeneo && row.estado_responsable_vigente) {
    return renderEstadoBadgeFromRow(row);
  }
  if (!estados.length) return renderEstadoBadgeFromRow(row);
  return estados.map((estado) => `
    <div class="mb-1">${renderEstadoBadgeHtml({
      estadoCodigo: estado.codigo,
      estadoLabel: estado.label,
    })} <span class="text-muted small">(${esc(estado.cantidad)})</span></div>
  `).join('');
}

function renderResponsablesOrden(row) {
  const responsables = row.responsables_entregables || [];
  if (!row.estado_agregado_heterogeneo && row.estado_responsable_vigente) {
    return renderResponsableCellHtml(row, esc);
  }
  if (!responsables.length) return renderResponsableCellHtml(row, esc);
  return responsables.map((responsable) => `
    <div class="mb-1">${esc(responsable.nombre || 'Pendiente')}
      <span class="text-muted">(${esc(responsable.cantidad)})</span></div>
  `).join('');
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
      <td>${renderEstadosOrden(row)}</td>
      <td class="small">${renderResponsablesOrden(row)}</td>
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
  // Cierra la instancia activa antes de cambiar pestaña o reemplazar filas.
  closeBandejaActionMenus();
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
    verExpedienteOrden: (id) => {
      const row = ordenesCache.find((item) => String(item.orden_id) === String(id));
      if (row) return openExpedienteOrdenModal(row);
      return undefined;
    },
    verExpediente: (id) => openDetalle(id),
    registrarRecepcion: (id) => openRegistrarRecepcion(id),
    observarEntregable: (id) => openObservarEntregable(id),
    verObservacionDirigida: (id) => openVerObservacionDirigida(id),
    retirarObservacion: (id) => openRetirarObservacion(id),
    subsanarEntregable: (id) => openSubsanarEntregable(id),
    generarActa: (id) => openGenerarActa(id),
    adjuntarActaFirmada: (id) => openAdjuntarActaFirmada(id),
    derivarCoordinadorCM: (id) => openDerivarCoordinadorCM(id),
    derivarAnalistaCM: (id) => openDerivarAnalistaCM(id),
    derivarPago: (id) => openDerivarPago(id),
    verTrazabilidad: (id) => openTrazabilidad(id),
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
            <h5 class="modal-title" id="${PREFIX}ModalTitle"><i class="bi bi-box-arrow-in-down"></i> Registrar entregable</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}EntregableId">
            <div id="${PREFIX}MetaWrap">
              <div class="mb-2"><label class="form-label small mb-0">Fecha recepción Mesa de Partes <span class="text-danger">*</span></label>
                <input type="date" class="form-control form-control-sm" id="${PREFIX}Fecha" required></div>
              <div class="mb-2"><label class="form-label small mb-0">Expediente SGD <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" id="${PREFIX}Sgd" required></div>
              <div class="mb-2"><label class="form-label small mb-0">Observación</label>
                <textarea class="form-control form-control-sm" id="${PREFIX}Obs" rows="2"></textarea></div>
            </div>
            <div class="mb-2 d-none" id="${PREFIX}DocsSection"></div>
            <div class="mb-2" id="${PREFIX}FileWrap">
              <label class="form-label small mb-0" id="${PREFIX}FileLabel">Documento (PDF) <span class="text-danger">*</span></label>
              <input type="file" class="form-control form-control-sm" id="${PREFIX}File" accept="application/pdf">
            </div>
            <input type="file" class="d-none" id="${PREFIX}DocAttachInput" accept="application/pdf" multiple>
            <div id="${PREFIX}ModalErr" class="alert alert-danger d-none py-2 small"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-primary" id="${PREFIX}SubmitBtn">Registrar</button>
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

    <div class="modal fade" id="${PREFIX}ObservarModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog"><div class="modal-content">
        <form id="${PREFIX}ObservarForm">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-exclamation-triangle"></i> Observar entregable</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}ObservarEntregableId">
            <input type="hidden" id="${PREFIX}ObservarRecepcionId">
            <input type="hidden" id="${PREFIX}ObservarModo" value="dirigida">
            <div class="border rounded p-2 small mb-3" id="${PREFIX}ObservarResumen"></div>
            <div id="${PREFIX}ObservarRoutingFields">
              <div class="mb-2">
                <label class="form-label small mb-1">Origen</label>
                <input type="text" class="form-control form-control-sm" value="Presentación Entregables de Servicios" readonly>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-1" for="${PREFIX}ObservarDestinoSubmodulo">Submódulo destino <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="${PREFIX}ObservarDestinoSubmodulo" required></select>
              </div>
              <div class="mb-2">
                <label class="form-label small mb-1" for="${PREFIX}ObservarDestinoUsuario">Persona destino <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="${PREFIX}ObservarDestinoUsuario" required disabled>
                  <option value="">Seleccione submódulo destino…</option>
                </select>
              </div>
            </div>
            <div id="${PREFIX}ObservarAuFields" class="d-none">
              <div class="mb-2">
                <label class="form-label small mb-1" for="${PREFIX}ObservarDestinoAu">Destinatario <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="${PREFIX}ObservarDestinoAu" required disabled>
                  <option value="">Cargando usuarios Área Usuaria…</option>
                </select>
              </div>
            </div>
            <div class="mb-2">
              <label class="form-label small mb-1" for="${PREFIX}ObservarMotivo">Glosa / Motivo <span class="text-danger">*</span></label>
              <textarea class="form-control form-control-sm" id="${PREFIX}ObservarMotivo" rows="4" required></textarea>
            </div>
            <div id="${PREFIX}ObservarErr" class="alert alert-danger d-none py-2 small"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-warning" id="${PREFIX}ObservarBtn">Enviar observación</button>
          </div>
        </form>
      </div></div>
    </div>

    <div class="modal fade" id="${PREFIX}RetirarObsModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog"><div class="modal-content">
        <form id="${PREFIX}RetirarObsForm">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-x-circle"></i> Retirar observación</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}RetirarEntregableId">
            <input type="hidden" id="${PREFIX}RetirarObservacionId">
            <div class="border rounded p-2 small mb-3" id="${PREFIX}RetirarResumen"></div>
            <div class="mb-2">
              <label class="form-label small mb-1" for="${PREFIX}RetirarMotivo">Motivo del retiro <span class="text-danger">*</span></label>
              <textarea class="form-control form-control-sm" id="${PREFIX}RetirarMotivo" rows="3" required></textarea>
            </div>
            <div id="${PREFIX}RetirarErr" class="alert alert-danger d-none py-2 small"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-danger" id="${PREFIX}RetirarBtn">Retirar observación</button>
          </div>
        </form>
      </div></div>
    </div>

    <div class="modal fade" id="${PREFIX}SubsanarModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <form id="${PREFIX}SubsanarForm">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-arrow-repeat"></i> Subsanar observación</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}SubsanarEntregableId">
            <input type="hidden" id="${PREFIX}SubsanarObservacionId">
            <div class="border rounded p-2 small mb-3" id="${PREFIX}SubsanarResumen"></div>
            <div class="mb-2">
              <label class="form-label small mb-1">Nueva fecha recepción Mesa de Partes <span class="text-danger">*</span></label>
              <input type="date" class="form-control form-control-sm" id="${PREFIX}SubsanarFecha" required>
            </div>
            <div class="mb-2">
              <label class="form-label small mb-1">Nuevo expediente SGD <span class="text-danger">*</span></label>
              <input type="text" class="form-control form-control-sm" id="${PREFIX}SubsanarSgd" required>
            </div>
            <div class="mb-2">
              <label class="form-label small mb-1">Comentario de subsanación <span class="text-muted">(opcional)</span></label>
              <textarea class="form-control form-control-sm" id="${PREFIX}SubsanarComentario" rows="2"></textarea>
            </div>
            <div class="mb-2">
              <label class="form-label small mb-1">Nuevo PDF del entregable <span class="text-danger">*</span></label>
              <input type="file" class="form-control form-control-sm" id="${PREFIX}SubsanarFile" accept="application/pdf" required>
            </div>
            <div id="${PREFIX}SubsanarErr" class="alert alert-danger d-none py-2 small"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-primary" id="${PREFIX}SubsanarBtn">Registrar subsanación</button>
          </div>
        </form>
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
    </div>

    <div class="modal fade" id="${PREFIX}DerivarModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog"><div class="modal-content">
        <form id="${PREFIX}DerivarForm">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-send"></i> Derivar a Coordinador CM</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}DerivarEntregableId">
            <div class="border rounded p-2 small mb-3" id="${PREFIX}DerivarResumen"></div>
            <div class="mb-2">
              <label class="form-label small mb-1" for="${PREFIX}DerivarResponsable">
                Coordinador CM destino <span class="text-danger">*</span>
              </label>
              <select class="form-select form-select-sm" id="${PREFIX}DerivarResponsable" required>
                <option value="">Seleccione un coordinador</option>
              </select>
            </div>
            <div id="${PREFIX}DerivarErr" class="alert alert-danger d-none py-2 small"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-primary" id="${PREFIX}DerivarBtn" disabled>
              Derivar
            </button>
          </div>
        </form>
      </div></div>
    </div>

    <div class="modal fade" id="${PREFIX}AnalistaModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog"><div class="modal-content">
        <form id="${PREFIX}AnalistaForm">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-send"></i> Derivar a Analista CM</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}AnalistaEntregableId">
            <div class="border rounded p-2 small mb-3" id="${PREFIX}AnalistaResumen"></div>
            <div class="mb-2">
              <label class="form-label small mb-1" for="${PREFIX}AnalistaResponsable">
                Analista CM destino <span class="text-danger">*</span>
              </label>
              <select class="form-select form-select-sm" id="${PREFIX}AnalistaResponsable" required>
                <option value="">Seleccione un analista</option>
              </select>
            </div>
            <div id="${PREFIX}AnalistaErr" class="alert alert-danger d-none py-2 small"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-primary" id="${PREFIX}AnalistaBtn" disabled>
              Derivar
            </button>
          </div>
        </form>
      </div></div>
    </div>

    <div class="modal fade" id="${PREFIX}PagoModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog"><div class="modal-content">
        <form id="${PREFIX}PagoForm">
          <div class="modal-header">
            <h5 class="modal-title"><i class="bi bi-credit-card"></i> Derivar a Pago</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="${PREFIX}PagoEntregableId">
            <div class="border rounded p-2 small mb-3" id="${PREFIX}PagoResumen"></div>
            <div class="mb-2">
              <label class="form-label small mb-1" for="${PREFIX}PagoResponsable">
                Analista de Pago <span class="text-danger">*</span>
              </label>
              <select class="form-select form-select-sm" id="${PREFIX}PagoResponsable" required>
                <option value="">Seleccione un analista</option>
              </select>
            </div>
            <div id="${PREFIX}PagoErr" class="alert alert-danger d-none py-2 small"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="submit" class="btn btn-sm btn-primary" id="${PREFIX}PagoBtn" disabled>
              Derivar
            </button>
          </div>
        </form>
      </div></div>
    </div>

    <div class="modal fade" id="${PREFIX}TrazabilidadModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title"><i class="bi bi-clock-history"></i> Trazabilidad del entregable</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body" id="${PREFIX}TrazabilidadBody"></div>
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
  modalEl.dataset.mode = 'create';
  modalEl.dataset.entregaId = id;
  modalEl.dataset.puedeGestionar = '0';
  const docsSection = document.getElementById(`${PREFIX}DocsSection`);
  const fileWrap = document.getElementById(`${PREFIX}FileWrap`);
  const metaWrap = document.getElementById(`${PREFIX}MetaWrap`);
  docsSection?.classList.add('d-none');
  if (docsSection) docsSection.innerHTML = '';
  metaWrap?.classList.remove('d-none');
  fileWrap?.classList.remove('d-none');
  window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  try {
    const resp = await entregablesServiciosService.getDetalle(id);
    const data = resp?.data || resp || {};
    const recepcionInicial = data.recepcion_inicial || null;
    const editando = Boolean(recepcionInicial?.id);
    const row = entregablesCache.find((item) => String(item.orden_entrega_id) === String(id));
    const puedeGestionar = Boolean(row?.puede_modificar_entregable);
    modalEl.dataset.mode = editando ? 'edit' : 'create';
    modalEl.dataset.puedeGestionar = puedeGestionar ? '1' : '0';
    document.getElementById(`${PREFIX}ModalTitle`).innerHTML = editando
      ? '<i class="bi bi-pencil-square"></i> Modificar entregable'
      : '<i class="bi bi-box-arrow-in-down"></i> Registrar entregable';
    document.getElementById(`${PREFIX}SubmitBtn`).textContent = editando ? 'Guardar cambios' : 'Registrar';
    document.getElementById(`${PREFIX}FileLabel`).innerHTML = 'Documento (PDF) <span class="text-danger">*</span>';
    if (editando) {
      metaWrap?.classList.remove('d-none');
      fileWrap?.classList.add('d-none');
      document.getElementById(`${PREFIX}Fecha`).value = String(recepcionInicial.fecha_recepcion_mesa_partes || '').slice(0, 10);
      document.getElementById(`${PREFIX}Sgd`).value = recepcionInicial.numero_expediente_sgd || '';
      document.getElementById(`${PREFIX}Obs`).value = recepcionInicial.observacion || '';
      renderModificarDocumentosSection(data, puedeGestionar);
    }
  } catch (err) {
    const errBox = document.getElementById(`${PREFIX}ModalErr`);
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo consultar el entregable';
      errBox.classList.remove('d-none');
    }
  }
}

function renderModificarDocumentosSection(data, puedeGestionar) {
  const section = document.getElementById(`${PREFIX}DocsSection`);
  if (!section) return;
  const docs = data.documentos_entregable_gestionables || [];
  const numeroEntrega = data.numero_entrega ?? '—';
  section.classList.remove('d-none');
  section.innerHTML = `
    <div class="mb-3 small fw-semibold">Entregable N.° ${esc(numeroEntrega)}</div>
    ${docs.length ? docs.map((doc) => `
      <div class="border rounded p-2 mb-2 small d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div class="text-truncate" style="max-width:260px" title="${esc(doc.nombre_archivo || '')}">
          ${esc(doc.nombre_archivo || 'Documento')}
        </div>
        <div class="d-flex flex-wrap gap-1">
          <button type="button" class="btn btn-sm btn-outline-primary pe-doc-preview"
            data-recepcion="${esc(doc.recepcion_id)}" data-doc="${esc(doc.id)}">
            Ver
          </button>
          ${puedeGestionar ? `
            <button type="button" class="btn btn-sm btn-outline-danger pe-doc-retire"
              data-doc="${esc(doc.id)}">
              Eliminar
            </button>` : ''}
        </div>
      </div>`).join('') : '<p class="text-muted small mb-2">Sin documentos vigentes del entregable.</p>'}
    ${puedeGestionar ? `
      <button type="button" class="btn btn-sm btn-outline-success pe-doc-attach">
        <i class="bi bi-paperclip"></i> Adjuntar PDF
      </button>` : ''}`;
}

async function refreshModificarDocumentos(entregaId) {
  const resp = await entregablesServiciosService.getDetalle(entregaId);
  const data = resp?.data || resp || {};
  const modalEl = document.getElementById(`${PREFIX}Modal`);
  const puedeGestionar = modalEl?.dataset.puedeGestionar === '1';
  renderModificarDocumentosSection(data, puedeGestionar);
}

async function fileToDocumentoPayload(file) {
  const contenido_base64 = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
  return {
    nombre_archivo: file.name,
    mime_type: file.type || 'application/pdf',
    contenido_base64,
  };
}

async function onModificarDocumentoAction(e) {
  const modalEl = document.getElementById(`${PREFIX}Modal`);
  if (!modalEl || modalEl.dataset.mode !== 'edit') return;
  const entregaId = modalEl.dataset.entregaId || document.getElementById(`${PREFIX}EntregableId`)?.value;
  if (!entregaId) return;
  const errBox = document.getElementById(`${PREFIX}ModalErr`);

  const retireBtn = e.target.closest('.pe-doc-retire');
  if (retireBtn) {
    if (!window.confirm('¿Eliminar este documento del entregable?')) return;
    try {
      await entregablesServiciosService.retirarDocumentoRecepcion(entregaId, retireBtn.dataset.doc);
      await refreshModificarDocumentos(entregaId);
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message || 'No se pudo eliminar el documento';
        errBox.classList.remove('d-none');
      }
    }
    return;
  }

  const attachBtn = e.target.closest('.pe-doc-attach');
  if (attachBtn) {
    document.getElementById(`${PREFIX}DocAttachInput`)?.click();
  }
}

async function onDocAttachSelected(e) {
  const input = e.target;
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  const modalEl = document.getElementById(`${PREFIX}Modal`);
  const entregaId = modalEl?.dataset.entregaId || document.getElementById(`${PREFIX}EntregableId`)?.value;
  const errBox = document.getElementById(`${PREFIX}ModalErr`);
  if (!entregaId) return;
  try {
    const documentos = await Promise.all(files.map((file) => fileToDocumentoPayload(file)));
    await entregablesServiciosService.adjuntarDocumentosRecepcion(entregaId, { documentos });
    await refreshModificarDocumentos(entregaId);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudieron adjuntar documentos';
      errBox.classList.remove('d-none');
    }
  }
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
  const modalEl = document.getElementById(`${PREFIX}Modal`);
  const editando = modalEl?.dataset.mode === 'edit';
  if (!editando && !contenido) {
    if (errBox) {
      errBox.textContent = 'El documento PDF es obligatorio para registrar el entregable.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  try {
    const payload = {
      fecha_recepcion_mesa_partes: fecha,
      numero_expediente_sgd: sgd,
      observacion: obs,
      documentos: [],
    };
    if (editando) {
      await entregablesServiciosService.modificarRecepcion(id, payload);
    } else {
      if (!contenido) {
        if (errBox) {
          errBox.textContent = 'El documento PDF es obligatorio para registrar el entregable.';
          errBox.classList.remove('d-none');
        }
        return;
      }
      payload.documentos = [{ nombre_archivo: nombre, mime_type: mime, contenido_base64: contenido }];
      await entregablesServiciosService.registrarRecepcion(id, payload);
    }
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}Modal`))?.hide();
    await load();
  } catch (err) {
    if (errBox) { errBox.textContent = err.message || 'No se pudo guardar el entregable'; errBox.classList.remove('d-none'); }
  }
}

async function loadDestinatariosAreaUsuaria(entregableId) {
  const select = document.getElementById(`${PREFIX}ObservarDestinoAu`);
  if (!select) return;
  select.innerHTML = '<option value="">Cargando usuarios Área Usuaria…</option>';
  select.disabled = true;
  const resp = await entregablesServiciosService.listarDestinatariosAreaUsuaria(entregableId);
  const usuarios = resp?.data?.usuarios || resp?.usuarios || [];
  if (!usuarios.length) {
    select.innerHTML = '<option value="">Sin usuarios AU habilitados</option>';
    return;
  }
  select.innerHTML = [
    '<option value="">Seleccione destinatario…</option>',
    ...usuarios.map((item) => `<option value="${esc(item.id)}">${esc(item.nombre || item.username)}</option>`),
  ].join('');
  select.disabled = false;
}

async function loadDestinatariosObservacion(submoduloCodigo) {
  const select = document.getElementById(`${PREFIX}ObservarDestinoUsuario`);
  if (!select) return;
  select.innerHTML = '<option value="">Cargando destinatarios…</option>';
  select.disabled = true;
  if (!submoduloCodigo) {
    select.innerHTML = '<option value="">Seleccione submódulo destino…</option>';
    return;
  }
  const resp = await entregablesServiciosService.listarDestinatariosObservacionDirigida(submoduloCodigo);
  const destinatarios = resp?.data || resp || [];
  if (!destinatarios.length) {
    select.innerHTML = '<option value="">Sin destinatarios habilitados</option>';
    return;
  }
  select.innerHTML = [
    '<option value="">Seleccione persona destino…</option>',
    ...destinatarios.map((item) => `<option value="${esc(item.id)}">${esc(item.nombre || item.username)}</option>`),
  ].join('');
  select.disabled = false;
}

function openVerObservacionDirigida(id) {
  const row = entregablesCache.find((item) => String(item.orden_entrega_id) === String(id));
  const obs = row?.observacion_abierta;
  if (!obs?.id) {
    window.alert('No hay observación dirigida vigente para este entregable.');
    return;
  }
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="modal fade" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Observación dirigida</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
      </div>
      <div class="modal-body small">
        <div class="row g-2">
          <div class="col-md-6"><strong>Orden:</strong> ${esc(ordenLabel(row || {}))}</div>
          <div class="col-md-6"><strong>Entregable:</strong> N.° ${esc(row?.numero_entrega ?? '—')}</div>
          <div class="col-md-6"><strong>Estado:</strong> ${esc(obs.estado || '—')}</div>
          <div class="col-12 mt-2"><strong>Motivo:</strong>
            <div class="border rounded bg-light p-2 mt-1" style="white-space:pre-wrap">${esc(obs.motivo || '—')}</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cerrar</button>
      </div>
    </div></div></div>`;
  document.body.appendChild(wrap);
  const modalEl = wrap.firstElementChild;
  const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
  modalEl.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
  modal.show();
}

function openRetirarObservacion(id) {
  const row = entregablesCache.find((item) => String(item.orden_entrega_id) === String(id));
  const obs = row?.observacion_abierta;
  if (!obs?.id) {
    window.alert('No hay observación abierta para retirar.');
    return;
  }
  const errBox = document.getElementById(`${PREFIX}RetirarErr`);
  errBox?.classList.add('d-none');
  document.getElementById(`${PREFIX}RetirarMotivo`).value = '';
  document.getElementById(`${PREFIX}RetirarEntregableId`).value = id;
  document.getElementById(`${PREFIX}RetirarObservacionId`).value = obs.id;
  document.getElementById(`${PREFIX}RetirarResumen`).innerHTML = `
    <div><strong>Orden:</strong> ${esc(ordenLabel(row || {}))}</div>
    <div><strong>Entregable:</strong> N.° ${esc(row?.numero_entrega ?? '—')}</div>
    <div><strong>Clase:</strong> ${esc(row?.observacion_clase || '—')}</div>
    <div class="mt-2"><strong>Motivo original:</strong><br>${esc(obs.motivo || '—')}</div>`;
  window.bootstrap.Modal.getOrCreateInstance(document.getElementById(`${PREFIX}RetirarObsModal`)).show();
}

async function submitRetirarObservacion(e) {
  e.preventDefault();
  const id = document.getElementById(`${PREFIX}RetirarEntregableId`).value;
  const observacionId = document.getElementById(`${PREFIX}RetirarObservacionId`).value;
  const motivo = document.getElementById(`${PREFIX}RetirarMotivo`).value.trim();
  const errBox = document.getElementById(`${PREFIX}RetirarErr`);
  if (!motivo) {
    if (errBox) {
      errBox.textContent = 'El motivo del retiro es obligatorio.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  const submitBtn = document.getElementById(`${PREFIX}RetirarBtn`);
  try {
    if (submitBtn) submitBtn.disabled = true;
    await entregablesServiciosService.retirarObservacionEntregable(id, observacionId, { motivo });
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}RetirarObsModal`))?.hide();
    await load();
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo retirar la observación';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function openObservarEntregable(id) {
  const errBox = document.getElementById(`${PREFIX}ObservarErr`);
  errBox?.classList.add('d-none');
  document.getElementById(`${PREFIX}ObservarMotivo`).value = '';
  document.getElementById(`${PREFIX}ObservarEntregableId`).value = id;
  document.getElementById(`${PREFIX}ObservarRecepcionId`).value = '';
  const row = entregablesCache.find((item) => String(item.orden_entrega_id) === String(id)) || {};
  const etapa = String(row.estado_etapa_codigo || '').toUpperCase();
  const routingFields = document.getElementById(`${PREFIX}ObservarRoutingFields`);
  const auFields = document.getElementById(`${PREFIX}ObservarAuFields`);
  const destinoSelect = document.getElementById(`${PREFIX}ObservarDestinoSubmodulo`);
  const destinoUsuario = document.getElementById(`${PREFIX}ObservarDestinoUsuario`);
  const destinoAu = document.getElementById(`${PREFIX}ObservarDestinoAu`);
  const esDirigida = etapa === 'PRESENTACION_ENTREGABLES';
  const esDirigidaAu = etapa === 'REVISION_COORDINADOR_CM' || etapa === 'REVISION_ANALISTA_CM';
  document.getElementById(`${PREFIX}ObservarModo`).value = esDirigida
    ? 'dirigida'
    : (esDirigidaAu ? 'dirigida_au' : 'legacy');
  routingFields?.classList.toggle('d-none', !esDirigida);
  auFields?.classList.toggle('d-none', !esDirigidaAu);
  if (destinoSelect) destinoSelect.required = esDirigida;
  if (destinoUsuario) destinoUsuario.required = esDirigida;
  if (destinoAu) {
    destinoAu.required = esDirigidaAu;
    destinoAu.value = '';
  }
  const modalEl = document.getElementById(`${PREFIX}ObservarModal`);
  window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  try {
    const [resp, conformidad] = await Promise.all([
      entregablesServiciosService.getDetalle(id),
      confVigente(id).catch(() => ({ acta: null, firmada: null })),
    ]);
    const data = resp?.data || resp || {};
    const recepcion = data.recepcion_vigente || null;
    if (!recepcion?.id) throw new Error('El entregable no tiene una recepción vigente.');
    if (data.observacion_abierta) throw new Error('La recepción ya tiene una observación formal abierta.');
    document.getElementById(`${PREFIX}ObservarRecepcionId`).value = recepcion.id;
    document.getElementById(`${PREFIX}ObservarResumen`).innerHTML = `
      <div><strong>Orden:</strong> ${esc(ordenLabel(data))}</div>
      <div><strong>Entregable:</strong> N.° ${esc(data.numero_entrega ?? '—')}</div>
      <div><strong>Proveedor:</strong> ${esc(data.proveedor_razon_social || '—')}</div>
      <div><strong>Fecha recepción:</strong> ${esc(fmtFecha(recepcion.fecha_recepcion_mesa_partes))}</div>
      <div><strong>Expediente SGD:</strong> ${esc(recepcion.numero_expediente_sgd || '—')}</div>
      <div><strong>Acta vigente:</strong> ${esc(conformidad.acta ? `V${conformidad.acta.version || 1}` : '—')}</div>`;
    if (esDirigida && destinoSelect) {
      const destinosResp = await entregablesServiciosService.listarDestinosObservacionDirigida();
      const destinos = destinosResp?.data || destinosResp || [];
      destinoSelect.innerHTML = destinos.length
        ? ['<option value="">Seleccione submódulo destino…</option>',
          ...destinos.map((item) => `<option value="${esc(item.submodulo_codigo)}">${esc(item.label)}</option>`),
        ].join('')
        : '<option value="">Sin destinos habilitados</option>';
      destinoUsuario.innerHTML = '<option value="">Seleccione submódulo destino…</option>';
      destinoUsuario.disabled = true;
    }
    if (esDirigidaAu) {
      await loadDestinatariosAreaUsuaria(id);
    }
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo consultar el entregable';
      errBox.classList.remove('d-none');
    }
  }
}

async function submitObservarEntregable(e) {
  e.preventDefault();
  const id = document.getElementById(`${PREFIX}ObservarEntregableId`).value;
  const recepcionId = document.getElementById(`${PREFIX}ObservarRecepcionId`).value;
  const motivo = document.getElementById(`${PREFIX}ObservarMotivo`).value.trim();
  const modo = document.getElementById(`${PREFIX}ObservarModo`)?.value || 'dirigida';
  const destinoSubmodulo = document.getElementById(`${PREFIX}ObservarDestinoSubmodulo`)?.value || '';
  const destinoUsuario = document.getElementById(`${PREFIX}ObservarDestinoUsuario`)?.value || '';
  const destinoAu = document.getElementById(`${PREFIX}ObservarDestinoAu`)?.value || '';
  const errBox = document.getElementById(`${PREFIX}ObservarErr`);
  if (!motivo) {
    if (errBox) {
      errBox.textContent = 'La glosa de observación es obligatoria.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  if (modo === 'dirigida' && (!destinoSubmodulo || !destinoUsuario)) {
    if (errBox) {
      errBox.textContent = 'Debe seleccionar submódulo y persona destino.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  if (modo === 'dirigida_au' && !destinoAu) {
    if (errBox) {
      errBox.textContent = 'Debe seleccionar un destinatario del Área Usuaria.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  if (!recepcionId) {
    if (errBox) {
      errBox.textContent = 'No existe una recepción vigente para observar.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  const submitBtn = document.getElementById(`${PREFIX}ObservarBtn`);
  try {
    if (submitBtn) submitBtn.disabled = true;
    const row = entregablesCache.find(
      (item) => String(item.orden_entrega_id) === String(id),
    ) || {};
    if (String(row.estado_etapa_codigo || '').toUpperCase() === 'REVISION_ANALISTA_CM') {
      await entregablesServiciosService.observarAnalistaCM(id, {
        motivo,
        usuario_destino_id: Number(destinoAu),
      });
    } else if (modo === 'dirigida_au') {
      await entregablesServiciosService.observarEntregable(id, {
        recepcion_id: Number(recepcionId),
        motivo,
        usuario_destino_id: Number(destinoAu),
      });
    } else if (modo === 'dirigida') {
      await entregablesServiciosService.observarEntregableDirigido(id, {
        destino_submodulo_codigo: destinoSubmodulo,
        usuario_destino_id: Number(destinoUsuario),
        motivo,
      });
    } else {
      await entregablesServiciosService.observarEntregable(id, {
        recepcion_id: Number(recepcionId),
        motivo,
      });
    }
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}ObservarModal`))?.hide();
    await load();
    await openDetalle(id);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo registrar la observación';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function openSubsanarEntregable(id) {
  const errBox = document.getElementById(`${PREFIX}SubsanarErr`);
  errBox?.classList.add('d-none');
  document.getElementById(`${PREFIX}SubsanarEntregableId`).value = id;
  document.getElementById(`${PREFIX}SubsanarObservacionId`).value = '';
  document.getElementById(`${PREFIX}SubsanarFecha`).value = '';
  document.getElementById(`${PREFIX}SubsanarSgd`).value = '';
  document.getElementById(`${PREFIX}SubsanarComentario`).value = '';
  document.getElementById(`${PREFIX}SubsanarFile`).value = '';
  const modalEl = document.getElementById(`${PREFIX}SubsanarModal`);
  window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
  try {
    const resp = await entregablesServiciosService.getDetalle(id);
    const data = resp?.data || resp || {};
    const recepcion = data.recepcion_vigente || null;
    const observacion = data.observacion_abierta || null;
    if (!recepcion?.id || !observacion?.id) {
      throw new Error('El entregable no tiene una observación formal abierta para subsanar.');
    }
    document.getElementById(`${PREFIX}SubsanarObservacionId`).value = observacion.id;
    document.getElementById(`${PREFIX}SubsanarResumen`).innerHTML = `
      <div><strong>Orden:</strong> ${esc(ordenLabel(data))}</div>
      <div><strong>Entregable:</strong> N.° ${esc(data.numero_entrega ?? '—')}</div>
      <div><strong>Proveedor:</strong> ${esc(data.proveedor_razon_social || '—')}</div>
      <div><strong>Fecha de recepción anterior:</strong> ${esc(fmtFecha(recepcion.fecha_recepcion_mesa_partes))}</div>
      <div><strong>Expediente SGD anterior:</strong> ${esc(recepcion.numero_expediente_sgd || '—')}</div>
      <div class="mt-2"><strong>Motivo de observación:</strong><br>${esc(observacion.motivo || '—')}</div>`;
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo consultar la observación';
      errBox.classList.remove('d-none');
    }
  }
}

async function submitSubsanarEntregable(e) {
  e.preventDefault();
  const id = document.getElementById(`${PREFIX}SubsanarEntregableId`).value;
  const observacionId = document.getElementById(`${PREFIX}SubsanarObservacionId`).value;
  const fecha = document.getElementById(`${PREFIX}SubsanarFecha`).value;
  const sgd = document.getElementById(`${PREFIX}SubsanarSgd`).value.trim();
  const comentario = document.getElementById(`${PREFIX}SubsanarComentario`).value.trim();
  const fileInput = document.getElementById(`${PREFIX}SubsanarFile`);
  const errBox = document.getElementById(`${PREFIX}SubsanarErr`);
  if (!observacionId || !fecha || !sgd || !fileInput?.files?.length) {
    if (errBox) {
      errBox.textContent = 'Fecha, Expediente SGD y nuevo PDF son obligatorios.';
      errBox.classList.remove('d-none');
    }
    return;
  }
  const file = fileInput.files[0];
  const contenido = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
  const submitBtn = document.getElementById(`${PREFIX}SubsanarBtn`);
  try {
    if (submitBtn) submitBtn.disabled = true;
    await entregablesServiciosService.subsanarEntregable(id, {
      observacion_id: Number(observacionId),
      fecha_recepcion_mesa_partes: fecha,
      numero_expediente_sgd: sgd,
      observacion: comentario,
      documentos: [{
        nombre_archivo: file.name,
        mime_type: file.type || 'application/pdf',
        contenido_base64: contenido,
      }],
    });
    window.bootstrap.Modal.getInstance(document.getElementById(`${PREFIX}SubsanarModal`))?.hide();
    await load();
    await openDetalle(id);
  } catch (err) {
    if (errBox) {
      errBox.textContent = err.message || 'No se pudo registrar la subsanación';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
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
    const { acta } = await confVigente(id);
    if (!acta?.id) throw new Error('No existe un Acta de Conformidad vigente para firmar');
    await entregablesServiciosService.adjuntarActaConformidadFirmada(id, {
      acta_id: acta.id,
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

async function openDerivarCoordinadorCM(id) {
  const row = entregablesCache.find(
    (item) => String(item.orden_entrega_id) === String(id),
  ) || {};
  const select = document.getElementById(`${PREFIX}DerivarResponsable`);
  const submit = document.getElementById(`${PREFIX}DerivarBtn`);
  const errBox = document.getElementById(`${PREFIX}DerivarErr`);
  document.getElementById(`${PREFIX}DerivarEntregableId`).value = id;
  document.getElementById(`${PREFIX}DerivarResumen`).innerHTML = `
    <div><strong>Orden:</strong> ${esc(ordenLabel(row))}</div>
    <div><strong>Entregable:</strong> N.° ${esc(row.numero_entrega ?? '—')}</div>
    <div><strong>Proveedor:</strong> ${esc(row.proveedor_razon_social || '—')}</div>
    <div><strong>Área usuaria / Centro:</strong> ${esc(row.area_usuaria || '—')}</div>
    <div><strong>Responsable actual:</strong> ${esc(row.responsable || 'Pendiente')}</div>`;
  if (select) select.innerHTML = '<option value="">Cargando coordinadores…</option>';
  if (submit) submit.disabled = true;
  errBox?.classList.add('d-none');
  window.bootstrap.Modal.getOrCreateInstance(
    document.getElementById(`${PREFIX}DerivarModal`),
  ).show();
  try {
    const response = await entregablesServiciosService.listarCoordinadoresCM(id);
    const coordinadores = response?.data || response || [];
    if (select) {
      select.innerHTML = [
        '<option value="">Seleccione un coordinador</option>',
        ...coordinadores.map((coordinador) => `
          <option value="${esc(coordinador.id)}">
            ${esc(coordinador.nombre || coordinador.username || `Usuario ${coordinador.id}`)}
            ${coordinador.cargo ? ` — ${esc(coordinador.cargo)}` : ''}
          </option>`),
      ].join('');
    }
    if (!coordinadores.length) {
      throw new Error('No existen Coordinadores CM activos disponibles.');
    }
  } catch (error) {
    if (select) select.innerHTML = '<option value="">Sin coordinadores disponibles</option>';
    if (errBox) {
      errBox.textContent = error.message || 'No se pudieron cargar los Coordinadores CM';
      errBox.classList.remove('d-none');
    }
  }
}

async function submitDerivarCoordinadorCM(event) {
  event.preventDefault();
  const id = document.getElementById(`${PREFIX}DerivarEntregableId`).value;
  const responsableId = document.getElementById(`${PREFIX}DerivarResponsable`).value;
  const submit = document.getElementById(`${PREFIX}DerivarBtn`);
  const errBox = document.getElementById(`${PREFIX}DerivarErr`);
  if (!responsableId) return;
  try {
    if (submit) submit.disabled = true;
    await entregablesServiciosService.derivarCoordinadorCM(id, Number(responsableId));
    window.bootstrap.Modal.getInstance(
      document.getElementById(`${PREFIX}DerivarModal`),
    )?.hide();
    await load();
  } catch (error) {
    if (errBox) {
      errBox.textContent = error.message || 'No se pudo derivar el entregable';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (submit) submit.disabled = !document.getElementById(`${PREFIX}DerivarResponsable`).value;
  }
}

async function openDerivarAnalistaCM(id) {
  const row = entregablesCache.find(
    (item) => String(item.orden_entrega_id) === String(id),
  ) || {};
  const select = document.getElementById(`${PREFIX}AnalistaResponsable`);
  const submit = document.getElementById(`${PREFIX}AnalistaBtn`);
  const errBox = document.getElementById(`${PREFIX}AnalistaErr`);
  document.getElementById(`${PREFIX}AnalistaEntregableId`).value = id;
  document.getElementById(`${PREFIX}AnalistaResumen`).innerHTML = `
    <div><strong>Orden:</strong> ${esc(ordenLabel(row))}</div>
    <div><strong>Entregable:</strong> N.° ${esc(row.numero_entrega ?? '—')}</div>
    <div><strong>Proveedor:</strong> ${esc(row.proveedor_razon_social || '—')}</div>
    <div><strong>Coordinador actual:</strong> ${esc(row.responsable || '—')}</div>`;
  if (select) select.innerHTML = '<option value="">Cargando analistas…</option>';
  if (submit) submit.disabled = true;
  errBox?.classList.add('d-none');
  window.bootstrap.Modal.getOrCreateInstance(
    document.getElementById(`${PREFIX}AnalistaModal`),
  ).show();
  try {
    const response = await entregablesServiciosService.listarAnalistasCM(id);
    const analistas = response?.data || response || [];
    if (select) {
      select.innerHTML = [
        '<option value="">Seleccione un analista</option>',
        ...analistas.map((analista) => `
          <option value="${esc(analista.id)}">
            ${esc(analista.nombre || analista.username || `Usuario ${analista.id}`)}
            ${analista.cargo ? ` — ${esc(analista.cargo)}` : ''}
          </option>`),
      ].join('');
    }
    if (!analistas.length) throw new Error('No existen Analistas CM activos disponibles.');
  } catch (error) {
    if (select) select.innerHTML = '<option value="">Sin analistas disponibles</option>';
    if (errBox) {
      errBox.textContent = error.message || 'No se pudieron cargar los Analistas CM';
      errBox.classList.remove('d-none');
    }
  }
}

async function submitDerivarAnalistaCM(event) {
  event.preventDefault();
  const id = document.getElementById(`${PREFIX}AnalistaEntregableId`).value;
  const responsableId = document.getElementById(`${PREFIX}AnalistaResponsable`).value;
  const submit = document.getElementById(`${PREFIX}AnalistaBtn`);
  const errBox = document.getElementById(`${PREFIX}AnalistaErr`);
  if (!responsableId) return;
  try {
    if (submit) submit.disabled = true;
    await entregablesServiciosService.derivarAnalistaCM(id, Number(responsableId));
    window.bootstrap.Modal.getInstance(
      document.getElementById(`${PREFIX}AnalistaModal`),
    )?.hide();
    await load();
  } catch (error) {
    if (errBox) {
      errBox.textContent = error.message || 'No se pudo derivar el entregable al Analista CM';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (submit) submit.disabled = !document.getElementById(`${PREFIX}AnalistaResponsable`).value;
  }
}

async function openDerivarPago(id) {
  const row = entregablesCache.find(
    (item) => String(item.orden_entrega_id) === String(id),
  ) || {};
  const select = document.getElementById(`${PREFIX}PagoResponsable`);
  const submit = document.getElementById(`${PREFIX}PagoBtn`);
  const errBox = document.getElementById(`${PREFIX}PagoErr`);
  document.getElementById(`${PREFIX}PagoEntregableId`).value = id;
  if (select) select.innerHTML = '<option value="">Cargando analistas…</option>';
  if (submit) submit.disabled = true;
  errBox?.classList.add('d-none');
  window.bootstrap.Modal.getOrCreateInstance(
    document.getElementById(`${PREFIX}PagoModal`),
  ).show();
  try {
    const [detalleResponse, conformidad, analistasResponse] = await Promise.all([
      entregablesServiciosService.getDetalle(id),
      confVigente(id),
      entregablesServiciosService.listarAnalistasPago(id),
    ]);
    const detalle = detalleResponse?.data || detalleResponse || {};
    const recepcion = detalle.recepcion_vigente || {};
    const analistas = analistasResponse?.data || analistasResponse || [];
    document.getElementById(`${PREFIX}PagoResumen`).innerHTML = `
      <div><strong>Orden:</strong> ${esc(ordenLabel(row))}</div>
      <div><strong>Entregable:</strong> N.° ${esc(row.numero_entrega ?? '—')}</div>
      <div><strong>Proveedor:</strong> ${esc(row.proveedor_razon_social || '—')}</div>
      <div><strong>Importe:</strong> ${esc(row.precio_total != null ? fmtMonto(row.precio_total) : '—')}</div>
      <div><strong>Presentación vigente:</strong> ${esc(recepcion.id ? `Recepción N.° ${recepcion.numero_recepcion || '—'}` : '—')}</div>
      <div><strong>Acta de Conformidad vigente:</strong> ${esc(conformidad.acta ? `V${conformidad.acta.version || 1}` : '—')}</div>
      <div><strong>Acta firmada vigente:</strong> ${esc(conformidad.firmada ? `V${conformidad.firmada.version || 1}` : '—')}</div>`;
    if (select) {
      select.innerHTML = [
        '<option value="">Seleccione un analista</option>',
        ...analistas.map((analista) => `
          <option value="${esc(analista.id)}">
            ${esc(analista.nombre || analista.username || `Usuario ${analista.id}`)}
            ${analista.cargo ? ` — ${esc(analista.cargo)}` : ''}
          </option>`),
      ].join('');
    }
    if (!analistas.length) throw new Error('No existen Analistas de Pago activos disponibles.');
  } catch (error) {
    if (select) select.innerHTML = '<option value="">Sin analistas disponibles</option>';
    if (errBox) {
      errBox.textContent = error.message || 'No se pudieron cargar los Analistas de Pago';
      errBox.classList.remove('d-none');
    }
  }
}

async function submitDerivarPago(event) {
  event.preventDefault();
  const id = document.getElementById(`${PREFIX}PagoEntregableId`).value;
  const usuarioDestinoId = document.getElementById(`${PREFIX}PagoResponsable`).value;
  const submit = document.getElementById(`${PREFIX}PagoBtn`);
  const errBox = document.getElementById(`${PREFIX}PagoErr`);
  if (!usuarioDestinoId) return;
  try {
    if (submit) submit.disabled = true;
    await entregablesServiciosService.derivarPago(id, Number(usuarioDestinoId));
    window.bootstrap.Modal.getInstance(
      document.getElementById(`${PREFIX}PagoModal`),
    )?.hide();
    await load();
  } catch (error) {
    if (errBox) {
      errBox.textContent = error.message || 'No se pudo derivar el entregable a Pago';
      errBox.classList.remove('d-none');
    }
  } finally {
    if (submit) submit.disabled = !document.getElementById(`${PREFIX}PagoResponsable`).value;
  }
}

async function openTrazabilidad(id) {
  const body = document.getElementById(`${PREFIX}TrazabilidadBody`);
  if (body) body.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm"></span></div>';
  window.bootstrap.Modal.getOrCreateInstance(
    document.getElementById(`${PREFIX}TrazabilidadModal`),
  ).show();
  try {
    const response = await entregablesServiciosService.listarTrazabilidad(id);
    const eventos = response?.data || response || [];
    if (body) {
      body.innerHTML = eventos.length ? eventos.map((evento) => `
        <div class="border rounded p-3 mb-2 small">
          <div class="d-flex justify-content-between gap-2">
            <strong>${esc(evento.evento_codigo || 'Evento')}</strong>
            <span class="text-muted">${esc(fmtFecha(evento.ocurrido_at))}</span>
          </div>
          <div class="mt-1">
            ${esc(evento.etapa_anterior_codigo || '—')}
            <i class="bi bi-arrow-right"></i>
            ${esc(evento.etapa_nueva_codigo || '—')}
          </div>
          <div class="text-muted">
            ${esc(evento.responsable_anterior_nombre || evento.responsable_anterior_unidad || '—')}
            → ${esc(evento.responsable_nuevo_nombre || evento.responsable_nuevo_unidad || '—')}
          </div>
          <div class="text-muted">Ejecutado por: ${esc(evento.ejecutado_usuario_nombre || evento.ejecutado_por || '—')}</div>
          ${evento.motivo ? `<div class="mt-2">${esc(evento.motivo)}</div>` : ''}
        </div>
      `).join('') : '<p class="text-muted mb-0">Sin eventos registrados.</p>';
    }
  } catch (error) {
    if (body) body.innerHTML = `<div class="alert alert-danger mb-0">${esc(error.message || 'No se pudo cargar la trazabilidad')}</div>`;
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
  const vigenciaBadge = (item) => item.vigente_operativa
    ? '<span class="badge bg-success">Vigente</span>'
    : '<span class="badge bg-light text-muted">Histórica</span>';
  const actaRow = (a) => `
    <div class="border rounded p-2 mb-2 small d-flex justify-content-between align-items-center">
      <div>
        <div class="fw-semibold">Acta de Conformidad <span class="badge bg-secondary">V${esc(a.version)}</span> ${vigenciaBadge(a)}</div>
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
        <div class="fw-semibold">Acta firmada <span class="badge bg-secondary">V${esc(v.acta_version || v.version)}</span> ${vigenciaBadge(v)}</div>
        <div class="text-muted">${esc(v.nombre || '')} · ${esc(fmtFecha(v.created_at))} · ${esc(v.created_by || '')}</div>
      </div>
      <div class="text-nowrap">
        <button type="button" class="btn btn-sm btn-outline-primary pe-firmada-ver" data-entrega="${esc(entregaId)}" data-id="${esc(v.id)}"><i class="bi bi-eye"></i> Ver</button>
        <button type="button" class="btn btn-sm btn-outline-secondary pe-firmada-dl" data-entrega="${esc(entregaId)}" data-id="${esc(v.id)}" data-name="${esc(v.nombre || 'acta-firmada.pdf')}"><i class="bi bi-download"></i> Descargar</button>
      </div>
    </div>`;
  const grupos = new Map();
  const agregar = (item, tipo) => {
    const key = item.recepcion_id == null ? 'legacy' : String(item.recepcion_id);
    if (!grupos.has(key)) {
      grupos.set(key, {
        recepcion_id: item.recepcion_id,
        numero_recepcion: item.numero_recepcion,
        tipo_recepcion: item.tipo_recepcion,
        fecha_recepcion_mesa_partes: item.fecha_recepcion_mesa_partes,
        numero_expediente_sgd: item.numero_expediente_sgd,
        actas: [],
        visados: [],
      });
    }
    grupos.get(key)[tipo].push(item);
  };
  actas.forEach((acta) => agregar(acta, 'actas'));
  visados.forEach((visado) => agregar(visado, 'visados'));
  const gruposOrdenados = [...grupos.values()].sort((a, b) => {
    if (a.recepcion_id == null) return 1;
    if (b.recepcion_id == null) return -1;
    return Number(a.numero_recepcion || 0) - Number(b.numero_recepcion || 0);
  });
  const renderGrupo = (grupo) => {
    const esLegacy = grupo.recepcion_id == null;
    const esInicial = String(grupo.tipo_recepcion || '').toUpperCase() === 'INICIAL';
    const titulo = esLegacy
      ? 'ACTAS LEGACY SIN PRESENTACIÓN VINCULADA'
      : (esInicial
        ? 'PRESENTACIÓN INICIAL'
        : `SUBSANACIÓN ${Math.max(1, Number(grupo.numero_recepcion || 1) - 1)}`);
    return `
      <div class="border rounded p-3 mb-3">
        <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
          <div>
            <div class="fw-semibold small">${esc(titulo)}</div>
            <div class="text-muted small">${esLegacy
              ? 'Documento histórico'
              : `Recepción ${esc(grupo.recepcion_id)} · Presentación N.° ${esc(grupo.numero_recepcion || '—')}`}</div>
          </div>
          ${esLegacy ? '' : `<div class="text-muted small text-end">${esc(fmtFecha(grupo.fecha_recepcion_mesa_partes))}<br>SGD: ${esc(grupo.numero_expediente_sgd || '—')}</div>`}
        </div>
        ${grupo.actas.map(actaRow).join('')}
        ${grupo.visados.map(visadoRow).join('')}
      </div>`;
  };
  return `
    <div class="col-12"><div class="card"><div class="card-body">
      <h6 class="text-muted text-uppercase small mb-2">Conformidad del entregable</h6>
      ${gruposOrdenados.length
        ? gruposOrdenados.map(renderGrupo).join('')
        : '<p class="text-muted small mb-0">Sin actas de conformidad.</p>'}
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
    const observaciones = data.observaciones || [];
    const subsanaciones = recepciones
      .filter((r) => r.tipo_recepcion === 'SUBSANACION')
      .sort((a, b) => Number(a.numero_recepcion) - Number(b.numero_recepcion));
    const numeroSubsanacion = new Map(
      subsanaciones.map((r, index) => [Number(r.id), index + 1]),
    );
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
          <h6 class="text-muted text-uppercase small mb-3">Presentaciones / Recepciones</h6>
          ${recepciones.length ? recepciones.map((r) => `
            <div class="border rounded p-2 mb-2 small">
              <div class="d-flex justify-content-between">
                <strong>Presentación N.° ${esc(r.numero_recepcion)}</strong>
                <span class="badge bg-secondary">${r.tipo_recepcion === 'SUBSANACION'
                  ? `SUBSANACIÓN ${esc(numeroSubsanacion.get(Number(r.id)) || '')}`
                  : 'INICIAL'}</span>
              </div>
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
        <div class="col-12"><div class="card"><div class="card-body">
          <h6 class="text-muted text-uppercase small mb-2">Observaciones</h6>
          ${observaciones.length ? observaciones.map((obs) => {
            const recepcionObservada = recepciones.find(
              (r) => Number(r.id) === Number(obs.recepcion_id),
            );
            const recepcionSubsanacion = recepciones.find(
              (r) => Number(r.id) === Number(obs.recepcion_subsanacion_id),
            );
            return `
              <div class="border rounded p-2 mb-2 small">
                <div class="d-flex justify-content-between gap-2">
                  <strong>${esc(fmtFecha(obs.observado_at))}</strong>
                  <span class="badge bg-secondary">${esc(obs.estado || '—')}</span>
                </div>
                <div class="mt-1">${esc(obs.motivo || '—')}</div>
                <div class="text-muted">Usuario observador: ${esc(obs.observado_por || '—')} · Recepción observada: N.° ${esc(recepcionObservada?.numero_recepcion ?? obs.recepcion_id ?? '—')}</div>
                ${recepcionSubsanacion ? `<div class="text-muted">→ Subsanación vinculada: Presentación N.° ${esc(recepcionSubsanacion.numero_recepcion)} · ${esc(fmtFecha(obs.subsanado_at))} · ${esc(obs.subsanado_por || '—')}</div>` : ''}
              </div>`;
          }).join('') : '<p class="text-muted small mb-0">Sin observaciones formales.</p>'}
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
  document.getElementById(`${PREFIX}DocsSection`)?.addEventListener('click', onModificarDocumentoAction);
  document.getElementById(`${PREFIX}DocAttachInput`)?.addEventListener('change', onDocAttachSelected);
  document.getElementById(`${PREFIX}ObservarForm`)?.addEventListener('submit', submitObservarEntregable);
  document.getElementById(`${PREFIX}ObservarDestinoSubmodulo`)?.addEventListener('change', (event) => {
    loadDestinatariosObservacion(event.target.value).catch((err) => {
      const errBox = document.getElementById(`${PREFIX}ObservarErr`);
      if (errBox) {
        errBox.textContent = err.message || 'No se pudieron cargar destinatarios';
        errBox.classList.remove('d-none');
      }
    });
  });
  document.getElementById(`${PREFIX}RetirarObsForm`)?.addEventListener('submit', submitRetirarObservacion);
  document.getElementById(`${PREFIX}SubsanarForm`)?.addEventListener('submit', submitSubsanarEntregable);
  document.getElementById(`${PREFIX}DerivarForm`)?.addEventListener('submit', submitDerivarCoordinadorCM);
  document.getElementById(`${PREFIX}DerivarResponsable`)?.addEventListener('change', (event) => {
    const submit = document.getElementById(`${PREFIX}DerivarBtn`);
    if (submit) submit.disabled = !event.target.value;
  });
  document.getElementById(`${PREFIX}AnalistaForm`)?.addEventListener('submit', submitDerivarAnalistaCM);
  document.getElementById(`${PREFIX}AnalistaResponsable`)?.addEventListener('change', (event) => {
    const submit = document.getElementById(`${PREFIX}AnalistaBtn`);
    if (submit) submit.disabled = !event.target.value;
  });
  document.getElementById(`${PREFIX}PagoForm`)?.addEventListener('submit', submitDerivarPago);
  document.getElementById(`${PREFIX}PagoResponsable`)?.addEventListener('change', (event) => {
    const submit = document.getElementById(`${PREFIX}PagoBtn`);
    if (submit) submit.disabled = !event.target.value;
  });
  document.getElementById(`${PREFIX}ActaGenerarBtn`)?.addEventListener('click', () => generarActa(document.getElementById(`${PREFIX}ActaEntregableId`).value));
  document.getElementById(`${PREFIX}FirmadaAdjBtn`)?.addEventListener('click', adjuntarActaFirmada);
  document.body.addEventListener('click', onDetalleDocPreview);
  document.body.addEventListener('click', onOrdenDocVer);
  document.body.addEventListener('click', onConformidadVer);
}

export { renderPresentacionEntregableView as renderPresentacionEntregable, initPresentacionEntregableView as initPresentacionEntregable };