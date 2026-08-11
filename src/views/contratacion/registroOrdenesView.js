/**
 * Contrataciones → Registro de Órdenes (OD36 / OD40)
 * Ruta: dec/registro-ordenes · permiso REGISTRO_ORDENES_CONTRATACION
 */
import { ordenesContratacionService } from '../../services/ordenesContratacionService.js';
import { bandejaTableStyles, getResponsableVigenteLabel, getEstadoVigenteLabel } from '../../utils/trazabilidad.js';
import {
  renderActionMenuCell, bindActionMenus, closeBandejaActionMenus, renderResponsableCellHtml,
} from '../../utils/bandejaUi.js';
import { renderEstadoBadgeFromRow } from '../../ui/workflow/EstadoBadge.js';
import {
  registroOrdenesMenuItems, splitMenuItemsPorBandeja, fmtMonto, fmtFecha, fmtFechaHora,
  downloadPdfBase64,
} from '../../utils/ordenesUtils.js';
import {
  openAdjuntarCcpFirmadoModal,
  openRegistrarOrdenModal,
  openEntregasModal,
  openAdjuntarOrdenFirmadaModal,
  openEnviarProveedorModal,
  openInicioActividadModal,
  openHistorialOrdenModal,
  openBase64Document,
} from '../../utils/registroOrdenModal.js';
import { openExpedienteOrdenModal } from '../../utils/registroOrdenExpedienteModal.js';
import { openCcpCodigoModal } from '../../utils/ccpCodigoModal.js';
import {
  openChecklistModal,
  validarYMostrarChecklist,
  fetchChecklistOrden,
  fetchChecklistRequerimiento,
  renderChecklistBadge,
} from '../../utils/expedienteChecklistUi.js';
import { showTrazabilidadModal } from '../requerimiento/reqShared.js';
import {
  createViewLifecycle,
  createRequestSequenceGuard,
  isAbortError,
  createBackgroundRefreshIndicator,
  captureScroll,
  restoreScroll,
} from '../../utils/uiState/index.js';

const VIEW_ID = 'registro-ordenes';
const SCROLL_SEL = '#roScrollWrap';
const PREFIX = 'ro';
const LIST_ID = 'roList';
const loadGuard = createRequestSequenceGuard();

/**
 * RC8.13.1 Obs.49 — dos tabs (Registro de CCP / Registro de Orden) sobre la MISMA
 * bandeja (ordenesContratacionService.listBandeja → GET /bandeja). No hay una
 * segunda fuente de datos: cada tab solo proyecta un subconjunto de columnas y de
 * acciones (splitMenuItemsPorBandeja) sobre el mismo rowsCache. Patrón de tabs
 * tomado de src/views/contratacion/invitacionesView.js.
 */
const TAB_CCP = 'ccp';
const TAB_ORDEN = 'orden';
let currentTab = TAB_CCP;

const CCP_COLS = [
  { th: 'CCP', w: '90px' },
  { th: 'CCP<br>firmado', w: '70px' },
  { th: 'Requerimiento', w: '110px' },
  { th: 'Pedido<br>SIGAMEF', w: '100px' },
  { th: 'Código<br>SIGAMEF', w: '100px' },
  { th: 'Descripción', w: '260px' },
  { th: 'Estado', w: '160px' },
  { th: 'Responsable', w: '160px' },
  { th: 'Acciones', w: '60px' },
];

const ORDEN_COLS = [
  { th: 'Orden', w: '90px' },
  { th: 'Fecha<br>orden', w: '85px' },
  { th: 'RUC<br>proveedor', w: '95px' },
  { th: 'Nombre<br>proveedor', w: '220px' },
  { th: 'Monto total<br>orden', w: '100px' },
  { th: 'Cant.<br>entregables', w: '75px' },
  { th: 'Plazo total<br>orden', w: '90px' },
  { th: 'Fecha<br>notificación', w: '95px' },
  { th: 'Estado', w: '160px' },
  { th: 'Responsable', w: '160px' },
  { th: 'Acciones', w: '60px' },
];

function currentColsDef() {
  return currentTab === TAB_ORDEN ? ORDEN_COLS : CCP_COLS;
}

function currentColsCount() {
  return currentColsDef().length;
}

let lifecycle = null;
let refreshIndicator = null;
let rowsCache = [];
let filtroEstado = '';
let filtroQ = '';
let page = 1;
let pageSize = 25;
let metaTotal = 0;
let metaPages = 1;
/** RC8.10.3 — alcance RO desde meta de bandeja (GLOBAL | ASIGNACION). */
let bandejaMeta = { modo: 'GLOBAL', acceso_por_asignacion: false };

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function canManage() {
  // Filas ya filtradas por alcance server-side: ASIGNACION y GLOBAL pueden operar lo visible.
  if (bandejaMeta.modo === 'ASIGNACION' || bandejaMeta.modo === 'GLOBAL') return true;
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const rol = String(u.rol || u.role || '').toLowerCase();
    if (rol === 'dec' || rol === 'admin') return true;
    if (u.acceso_registro_ordenes || u.acceso_registro_ordenes_por_asignacion) return true;
  } catch (_) { /* ignore */ }
  return false;
}

/**
 * RC8.13.2 Obs.50 — ajuste visual scoped a #${VIEW_ID} (Registro de Órdenes) únicamente:
 * encabezados y valores centrados, Arial 9px, columnas con ancho mínimo dinámico por tab
 * (ver renderTableChrome) para evitar compresión excesiva. No afecta otras vistas.
 */
const RO_BANDEJA_CSS = `
#${VIEW_ID} .ro-table-wrap { max-height: 68vh; overflow: auto; }
#${VIEW_ID} table.ro-bandeja {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9px;
  table-layout: fixed;
  width: 100%;
  border-collapse: collapse;
}
#${VIEW_ID} table.ro-bandeja thead th {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.25;
  vertical-align: middle;
  white-space: normal;
  height: 2.8em;
  padding: 4px 6px;
  background: #f8f9fa;
  text-align: center;
}
#${VIEW_ID} table.ro-bandeja tbody td {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 9px;
  padding: 3px 6px;
  vertical-align: middle;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#${VIEW_ID} table.ro-bandeja .ro-wrap {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}
#${VIEW_ID} table.ro-bandeja .ro-col-wide {
  overflow: hidden;
  text-overflow: ellipsis;
}
`;

export function renderRegistroOrdenesView() {
  return `
    <style>${bandejaTableStyles()}${RO_BANDEJA_CSS}</style>
    <div class="container-fluid py-3" id="${VIEW_ID}">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h4 class="mb-0"><i class="bi bi-clipboard-check"></i> Registro de Órdenes</h4>
          <div class="text-muted small">Contrataciones · posterior al CCP firmado</div>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span class="badge bg-secondary" id="${PREFIX}Count">0</span>
          <button type="button" class="btn btn-sm btn-outline-primary" id="${PREFIX}Refresh">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>
      </div>
      <ul class="nav nav-tabs mb-3" id="roTabs">
        <li class="nav-item"><a class="nav-link active" href="#" data-tab="${TAB_CCP}">📄 Registro de CCP</a></li>
        <li class="nav-item"><a class="nav-link" href="#" data-tab="${TAB_ORDEN}">🧾 Registro de Orden</a></li>
      </ul>
      <div class="card border-0 shadow-sm">
        <div class="card-body py-2">
          <div class="row g-2 align-items-end mb-2">
            <div class="col-md-4">
              <label class="form-label small mb-0">Buscar</label>
              <input type="search" class="form-control form-control-sm" id="${PREFIX}Search"
                placeholder="Req., CCP, RUC, orden…">
            </div>
            <div class="col-md-3">
              <label class="form-label small mb-0">Estado</label>
              <select class="form-select form-select-sm" id="${PREFIX}Estado">
                <option value="">Todos</option>
                <option value="REGISTRO_ORDENES">Registro de órdenes</option>
                <option value="ORDEN_REGISTRADA">Orden registrada</option>
                <option value="ORDEN_LISTA_NOTIFICACION">Orden lista para notificación</option>
                <option value="ORDEN_NOTIFICADA">Orden notificada</option>
                <option value="RECEPCION_BIENES_PENDIENTE">OC pendiente de recepción</option>
                <option value="BIEN_RECIBIDO_ALMACEN">Recibido por almacén</option>
                <option value="CONFORMIDAD_PENDIENTE_AU">Conformidad pendiente AU</option>
                <option value="CONFORMIDAD_RECIBIDA_AU">Conformidad recibida del AU</option>
                <option value="ORDEN_RECEPCION_CONFIRMADA">Recepción de orden confirmada</option>
                <option value="EN_EJECUCION">En ejecución</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label small mb-0">Por página</label>
              <select class="form-select form-select-sm" id="${PREFIX}PageSize">
                <option value="10">10</option>
                <option value="25" selected>25</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
          <div id="${PREFIX}BgRefresh"></div>
          <div class="table-responsive ro-table-wrap" id="roScrollWrap">
            <table class="table table-sm table-hover align-middle mb-0 ro-bandeja" id="${PREFIX}Table">
              <colgroup id="${PREFIX}Colgroup"></colgroup>
              <thead class="table-light sticky-top" id="${PREFIX}Thead"></thead>
              <tbody id="${LIST_ID}">
                <tr><td class="text-center text-muted py-4">Cargando…</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
            <div class="small text-muted" id="${PREFIX}Meta"></div>
            <div class="btn-group btn-group-sm">
              <button type="button" class="btn btn-outline-secondary" id="${PREFIX}Prev" disabled>Anterior</button>
              <button type="button" class="btn btn-outline-secondary" id="${PREFIX}Next" disabled>Siguiente</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/** Pinta colgroup/thead según el tab activo (sin recargar datos). */
function renderTableChrome() {
  const cols = currentColsDef();
  const colgroupEl = document.getElementById(`${PREFIX}Colgroup`);
  const theadEl = document.getElementById(`${PREFIX}Thead`);
  const tableEl = document.getElementById(`${PREFIX}Table`);
  if (colgroupEl) {
    colgroupEl.innerHTML = cols.map((c) => `<col style="width:${c.w}">`).join('');
  }
  if (theadEl) {
    theadEl.innerHTML = `<tr>${cols.map((c) => `<th>${c.th}</th>`).join('')}</tr>`;
  }
  if (tableEl) {
    // RC8.13.1 Obs.49 — cada tab tiene menos columnas que la tabla mixta original
    // (22 → 9/11); el ancho mínimo se ajusta a la suma real de columnas del tab
    // activo para reducir el espacio en blanco/scroll horizontal innecesario.
    const totalPx = cols.reduce((sum, c) => sum + (parseInt(c.w, 10) || 0), 0);
    tableEl.style.minWidth = `${totalPx}px`;
  }
}

function renderEstado(row) {
  // RC8.8 — contrato canónico únicamente (sin ccp_activo / codigo_ccp reinferencia).
  return renderEstadoBadgeFromRow(row);
}

function shouldShowChecklistBadge(row) {
  const code = String(
    row?.estado_vigente
    || row?.estadoVigente?.codigo
    || row?.estado
    || '',
  ).toUpperCase();
  // El checklist solo aplica a la preparación de la orden, no al estado global posterior
  if (!code) return true;
  if (code.startsWith('RECEPCION_') || code.startsWith('CONFORMIDAD_')
    || code === 'BIEN_RECIBIDO_ALMACEN' || code === 'EXPEDIENTE_DERIVADO_PAGO'
    || code === 'ORDEN_NOTIFICADA' || code === 'ORDEN_RECEPCION_CONFIRMADA'
    || code === 'EN_EJECUCION' || code === 'ORDEN_RESUELTA' || code === 'ORDEN_ANULADA') {
    return false;
  }
  return true;
}

/** Tab 1 — Registro de CCP (Certificado de Crédito Presupuestal). */
function renderRowCcp(row) {
  const key = row.orden_id || `r${row.requerimiento_id}`;
  const { ccp } = splitMenuItemsPorBandeja(registroOrdenesMenuItems(row, { canManage: canManage() }));
  const menu = renderActionMenuCell(key, ccp);
  const tipCod = esc(row.codigo_sigamef_tooltip || row.codigo_sigamef || '');
  const tipDesc = esc(row.item_descripcion_tooltip || row.item_descripcion || '');
  const estadoVigente = getEstadoVigenteLabel(row);
  const checklistHtml = shouldShowChecklistBadge(row)
    ? ` ${renderChecklistBadge(row.checklist || row)}`
    : '';
  return `<tr data-rid="${row.requerimiento_id}" data-oid="${row.orden_id || ''}">
    <td title="${esc(row.codigo_ccp || '')}">${esc(row.codigo_ccp || '—')}</td>
    <td>${row.ccp_firmado ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-warning text-dark">No</span>'}</td>
    <td title="${esc(row.requerimiento_codigo)}"><strong>${esc(row.requerimiento_codigo)}</strong></td>
    <td title="${esc(row.pedido_sigamef || '')}">${esc(row.pedido_sigamef || '—')}</td>
    <td title="${tipCod}">${esc(row.codigo_sigamef || '—')}</td>
    <td class="ro-col-wide" title="${tipDesc}">${esc(row.item_descripcion || '—')}</td>
    <td class="ro-wrap" title="${esc(estadoVigente)}">${renderEstado(row)}${checklistHtml}</td>
    <td class="ro-wrap">${renderResponsableCellHtml(row, esc)}</td>
    ${menu}
  </tr>`;
}

/** Tab 2 — Registro de Orden. */
function renderRowOrden(row) {
  const key = row.orden_id || `r${row.requerimiento_id}`;
  const { orden } = splitMenuItemsPorBandeja(registroOrdenesMenuItems(row, { canManage: canManage() }));
  const menu = renderActionMenuCell(key, orden);
  const estadoVigente = getEstadoVigenteLabel(row);
  const checklistHtml = shouldShowChecklistBadge(row)
    ? ` ${renderChecklistBadge(row.checklist || row)}`
    : '';
  // RC8.13.1 Obs.49 — cantidad entregables = COUNT(orden_entregas) real (row.entregas_count,
  // server/lib/ordenesContratacion.js), nunca combinaciones ítem×entrega. Plazo total orden
  // = máximo contractual (row.plazo_total_orden_label, regla RC8.12 resolveOrdenPlazoContractual).
  return `<tr data-rid="${row.requerimiento_id}" data-oid="${row.orden_id || ''}">
    <td>${row.numero_orden ? `${esc(row.tipo_orden || '')} ${esc(row.numero_orden)}` : '—'}</td>
    <td>${fmtFecha(row.fecha_orden)}</td>
    <td>${esc(row.proveedor_ruc || '—')}</td>
    <td class="ro-col-wide" title="${esc(row.proveedor_razon_social || '')}">${esc(row.proveedor_razon_social || '—')}</td>
    <td class="text-end">${fmtMonto(row.precio_total)}</td>
    <td class="text-end">${row.orden_id ? esc(String(row.entregas_count ?? 0)) : '—'}</td>
    <td>${row.orden_id ? esc(row.plazo_total_orden_label || '—') : '—'}</td>
    <td>${fmtFecha(row.fecha_notificacion || row.fecha_envio_proveedor)}</td>
    <td class="ro-wrap" title="${esc(estadoVigente)}">${renderEstado(row)}${checklistHtml}</td>
    <td class="ro-wrap">${renderResponsableCellHtml(row, esc)}</td>
    ${menu}
  </tr>`;
}

function renderRow(row) {
  return currentTab === TAB_ORDEN ? renderRowOrden(row) : renderRowCcp(row);
}

/**
 * Etiqueta de etapa bajo el badge de responsable en Registro de Órdenes.
 * Prioriza estado_responsable_vigente; si hay orden y la etapa persistida
 * aún no es RO/recepción, muestra "Registro de Órdenes" (no Invitaciones).
 */
function resolveRegistroOrdenesEtapaLabel(row = {}) {
  const erv = row.estado_responsable_vigente || {};
  const etapa = String(erv.etapaCodigo || erv.etapa_codigo || '').toUpperCase();
  const label = String(erv.etapaLabel || erv.etapa_label || '').trim();
  if (etapa === 'REGISTRO_ORDEN' || etapa === 'REGISTRO_ORDENES' || etapa === 'ORDEN') {
    return label || 'Registro de Órdenes';
  }
  if (etapa === 'RECEPCION_BIENES' || etapa === 'EN_EJECUCION') {
    return label || 'Recepción de Bienes';
  }
  if (row.orden_id) return 'Registro de Órdenes';
  if (label && !/^invitaciones$/i.test(label)) return label;
  return 'Registro de Órdenes';
}

function updatePagerUi() {
  const metaEl = document.getElementById(`${PREFIX}Meta`);
  const prev = document.getElementById(`${PREFIX}Prev`);
  const next = document.getElementById(`${PREFIX}Next`);
  const countEl = document.getElementById(`${PREFIX}Count`);
  if (countEl) countEl.textContent = String(metaTotal);
  const from = metaTotal === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const to = Math.min(page * pageSize, metaTotal);
  if (metaEl) {
    metaEl.textContent = metaTotal
      ? `Mostrando ${from}–${to} de ${metaTotal} · Página ${page} de ${metaPages}`
      : 'Sin registros';
  }
  if (prev) prev.disabled = page <= 1;
  if (next) next.disabled = page >= metaPages || metaTotal === 0;
}

async function loadBandeja(opts = {}) {
  const request = loadGuard.begin();
  captureScroll(VIEW_ID, SCROLL_SEL);
  renderTableChrome();
  const tbody = document.getElementById(LIST_ID);
  if (!opts.silent && tbody) {
    tbody.innerHTML = `<tr><td colspan="${currentColsCount()}" class="text-center text-muted py-4">Cargando…</td></tr>`;
  }
  refreshIndicator?.show?.('Actualizando…');
  try {
    const resp = await ordenesContratacionService.listBandeja({
      q: filtroQ,
      estado: filtroEstado,
      page,
      pageSize,
    });
    if (!request.isCurrent()) return;
    rowsCache = resp?.data || [];
    metaTotal = resp?.meta?.total ?? rowsCache.length;
    metaPages = resp?.meta?.pages || Math.max(1, Math.ceil(metaTotal / pageSize) || 1);
    bandejaMeta = {
      modo: String(resp?.meta?.modo || 'GLOBAL').toUpperCase(),
      acceso_por_asignacion: !!resp?.meta?.acceso_por_asignacion,
    };
    if (page > metaPages) page = metaPages;
    updatePagerUi();
    if (!rowsCache.length) {
      tbody.innerHTML = `<tr><td colspan="${currentColsCount()}" class="text-center text-muted py-4">No hay expedientes en Registro de Órdenes</td></tr>`;
    } else {
      tbody.innerHTML = rowsCache.map(renderRow).join('');
      bindActionMenus(tbody, buildActMap());
    }
    restoreScroll(VIEW_ID, SCROLL_SEL);
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${currentColsCount()}" class="text-danger text-center py-4">${esc(err.message || 'Error')}</td></tr>`;
    }
  } finally {
    refreshIndicator?.hide?.();
  }
}

function findRow(key) {
  return rowsCache.find((r) => String(r.orden_id || `r${r.requerimiento_id}`) === String(key)
    || String(r.requerimiento_id) === String(key)
    || String(r.orden_id) === String(key));
}

async function openCcpFirmadoViewer(row) {
  const resp = await ordenesContratacionService.getCcpFirmado(row.requerimiento_id, true);
  const data = resp?.data || resp;
  if (!data?.contenido_base64) {
    throw new Error('No existe archivo de CCP firmado para este expediente');
  }
  openBase64Document({
    nombre: data.nombre_archivo || 'CCP-firmado.pdf',
    mime_type: data.mime_type || 'application/pdf',
    contenido_base64: data.contenido_base64,
  });
}

function buildActMap() {
  const wrap = (fn) => async (id) => {
    closeBandejaActionMenus();
    const row = findRow(id);
    if (!row) return;
    try { await fn(row); } catch (err) {
      const el = document.createElement('div');
      el.innerHTML = `<div class="modal fade show d-block" style="background:rgba(0,0,0,.4)">
        <div class="modal-dialog"><div class="modal-content">
          <div class="modal-body text-danger">${esc(err.message || 'Error en la acción')}</div>
          <div class="modal-footer"><button type="button" class="btn btn-sm btn-secondary" id="roActErrClose">Cerrar</button></div>
        </div></div></div>`;
      document.body.appendChild(el);
      el.querySelector('#roActErrClose').onclick = () => el.remove();
    }
  };
  const reload = () => loadBandeja({ silent: true });

  const resolveFreshRow = (seed) => {
    const rid = seed?.requerimiento_id;
    if (rid == null) return seed;
    return rowsCache.find((r) => Number(r.requerimiento_id) === Number(rid))
      || rowsCache.find((r) => seed.orden_id && Number(r.orden_id) === Number(seed.orden_id))
      || seed;
  };

  const runActionByName = async (action, row, item = null) => {
    const fresh = resolveFreshRow({
      ...row,
      requerimiento_id: item?.requerimientoId || item?.requerimiento_id || row.requerimiento_id,
      orden_id: item?.ordenId || item?.orden_id || row.orden_id,
    });
    const map = {
      adjuntarCcpFirmado: () => openAdjuntarCcpFirmadoModal(fresh, { onDone: afterSave(fresh) }),
      editarCcp: () => openCcpCodigoModal(fresh, { mode: 'editar', onSuccess: afterSave(fresh) }),
      registrarOrden: () => openRegistrarOrdenModal(fresh, { onDone: afterSave(fresh) }),
      editarOrden: () => openRegistrarOrdenModal(fresh, {
        onDone: afterSave(fresh),
        editId: fresh.orden_id || null,
      }),
      adminEntregas: () => {
        if (!fresh.orden_id) return openRegistrarOrdenModal(fresh, { onDone: afterSave(fresh) });
        return openEntregasModal(fresh.orden_id, { onDone: afterSave(fresh) });
      },
      inicioActividad: () => {
        if (!fresh.orden_id) return openRegistrarOrdenModal(fresh, { onDone: afterSave(fresh) });
        return openInicioActividadModal(fresh, { onDone: afterSave(fresh) });
      },
      adjuntarOrdenFirmada: () => {
        if (!fresh.orden_id) return openRegistrarOrdenModal(fresh, { onDone: afterSave(fresh) });
        return openAdjuntarOrdenFirmadaModal(fresh.orden_id, { onDone: afterSave(fresh) });
      },
    };
    const fn = map[action];
    if (fn) await fn();
  };

  const afterSave = (row) => async () => {
    const rid = row.requerimiento_id;
    await reload();
    const fresh = resolveFreshRow({ requerimiento_id: rid, orden_id: row.orden_id });
    await validarYMostrarChecklist({
      ordenId: fresh.orden_id || null,
      requerimientoId: fresh.requerimiento_id,
      titulo: 'Validación del expediente',
      onCompletar: async (action, item) => runActionByName(action, fresh, item),
    });
  };

  const openChecklistForRow = async (row) => {
    const data = row.orden_id
      ? await fetchChecklistOrden(row.orden_id)
      : await fetchChecklistRequerimiento(row.requerimiento_id);
    const checklist = data.checklist || data;
    openChecklistModal(checklist, {
      titulo: 'Checklist — Registro de Órdenes',
      forzar: true,
      requerimientoId: row.requerimiento_id,
      ordenId: row.orden_id || null,
      onCompletar: async (action, item) => runActionByName(action, row, item),
    });
  };

  return {
    verExpediente: wrap((row) => openExpedienteOrdenModal(row, {
      onAction: (act, item) => runActionByName(act, row, item),
    })),
    adjuntarCcpFirmado: wrap((row) => openAdjuntarCcpFirmadoModal(row, { onDone: afterSave(row) })),
    verCcpFirmado: wrap((row) => openCcpFirmadoViewer(row)),
    editarCcp: wrap((row) => openCcpCodigoModal(row, { mode: 'editar', onSuccess: afterSave(row) })),
    eliminarCcpFirmado: wrap(async (row) => {
      const motivoWrap = document.createElement('div');
      const motivo = await new Promise((resolve) => {
        motivoWrap.innerHTML = `<div class="modal fade show d-block" style="background:rgba(0,0,0,.4)">
          <div class="modal-dialog"><div class="modal-content">
            <div class="modal-header"><h6 class="modal-title">Eliminar CCP firmado</h6></div>
            <div class="modal-body"><label class="form-label">Motivo</label>
              <textarea class="form-control form-control-sm" id="roMotivoCcp" rows="3"></textarea></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-sm btn-outline-secondary" id="roMotivoCancel">Cancelar</button>
              <button type="button" class="btn btn-sm btn-danger" id="roMotivoOk">Eliminar</button>
            </div>
          </div></div></div>`;
        document.body.appendChild(motivoWrap);
        motivoWrap.querySelector('#roMotivoCancel').onclick = () => { motivoWrap.remove(); resolve(null); };
        motivoWrap.querySelector('#roMotivoOk').onclick = () => {
          const v = motivoWrap.querySelector('#roMotivoCcp').value.trim();
          motivoWrap.remove();
          resolve(v || null);
        };
      });
      if (!motivo) return;
      await ordenesContratacionService.eliminarCcpFirmado(row.requerimiento_id, motivo);
      await afterSave(row)();
    }),
    registrarOrden: wrap((row) => openRegistrarOrdenModal(row, { onDone: afterSave(row) })),
    editarOrden: wrap((row) => openRegistrarOrdenModal(row, { onDone: afterSave(row), editId: row.orden_id })),
    adminEntregas: wrap((row) => {
      if (!row.orden_id) return openRegistrarOrdenModal(row, { onDone: afterSave(row) });
      return openEntregasModal(row.orden_id, { onDone: afterSave(row) });
    }),
    inicioActividad: wrap((row) => {
      if (!row.orden_id) return openRegistrarOrdenModal(row, { onDone: afterSave(row) });
      return openInicioActividadModal(row, { onDone: afterSave(row) });
    }),
    adjuntarOrdenFirmada: wrap((row) => {
      if (!row.orden_id) return openRegistrarOrdenModal(row, { onDone: afterSave(row) });
      return openAdjuntarOrdenFirmadaModal(row.orden_id, { onDone: afterSave(row) });
    }),
    notificarProveedor: wrap(async (row) => {
      if (!row.orden_id) throw new Error('Registre primero la orden');
      const data = await fetchChecklistOrden(row.orden_id);
      const checklist = data.checklist || data;
      if (!checklist.completo) {
        openChecklistModal(checklist, {
          titulo: 'No se puede notificar — complete la información',
          forzar: true,
          requerimientoId: row.requerimiento_id,
          ordenId: row.orden_id,
          onCompletar: async (action, item) => runActionByName(action, row, item),
        });
        return;
      }
      await openEnviarProveedorModal(row.orden_id, { onDone: reload });
    }),
    reenviar: wrap((row) => openEnviarProveedorModal(row.orden_id, { onDone: reload })),
    verChecklist: wrap((row) => openChecklistForRow(row)),
    verOrdenFirmada: wrap(async (row) => {
      const det = await ordenesContratacionService.getDetalle(row.orden_id);
      const d = det?.data || det;
      const doc = (d.documentos || []).find((x) => x.activo && x.tipo_documento === 'ORDEN_FIRMADA');
      if (!doc) throw new Error('No hay orden firmada activa');
      const full = await ordenesContratacionService.getDocumento(row.orden_id, doc.id, true);
      const content = (full?.data || full)?.contenido_base64;
      if (!content) throw new Error('Documento sin contenido');
      openBase64Document({
        nombre: doc.nombre_archivo,
        mime_type: 'application/pdf',
        contenido_base64: content,
      });
    }),
    descargarOrden: wrap(async (row) => {
      const det = await ordenesContratacionService.getDetalle(row.orden_id);
      const d = det?.data || det;
      const doc = (d.documentos || []).find((x) => x.activo && x.tipo_documento === 'ORDEN_FIRMADA');
      if (!doc) throw new Error('Sin documento');
      const full = await ordenesContratacionService.getDocumento(row.orden_id, doc.id, true);
      downloadPdfBase64((full?.data || full)?.contenido_base64, doc.nombre_archivo);
    }),
    verHistorial: wrap(async (row) => {
      if (row.requerimiento_id) {
        await showTrazabilidadModal(row.requerimiento_id);
        return;
      }
      if (!row.orden_id) throw new Error('Sin historial de orden (aún no registrada).');
      await openHistorialOrdenModal(row.orden_id);
    }),
    verNotificacion: wrap(async (row) => {
      if (row.orden_id) {
        await openExpedienteOrdenModal(row);
        return;
      }
      throw new Error('Sin orden');
    }),
    verConfirmacion: wrap((row) => openExpedienteOrdenModal(row)),
    verFechasMaximas: wrap((row) => openExpedienteOrdenModal(row)),
    verCronograma: wrap((row) => openExpedienteOrdenModal(row)),
    derivarEjecucion: wrap(async (row) => {
      const ok = await new Promise((resolve) => {
        const w = document.createElement('div');
        w.innerHTML = `<div class="modal fade show d-block" style="background:rgba(0,0,0,.4)">
          <div class="modal-dialog"><div class="modal-content">
            <div class="modal-body">¿Derivar esta orden a Ejecución?</div>
            <div class="modal-footer">
              <button type="button" class="btn btn-sm btn-outline-secondary" id="n">No</button>
              <button type="button" class="btn btn-sm btn-primary" id="y">Sí</button>
            </div>
          </div></div></div>`;
        document.body.appendChild(w);
        w.querySelector('#n').onclick = () => { w.remove(); resolve(false); };
        w.querySelector('#y').onclick = () => { w.remove(); resolve(true); };
      });
      if (!ok) return;
      await ordenesContratacionService.derivarEjecucion(row.orden_id);
      await reload();
    }),
  };
}

export function initRegistroOrdenesView() {
  lifecycle?.destroy?.();
  lifecycle = createViewLifecycle(VIEW_ID);
  refreshIndicator = createBackgroundRefreshIndicator(`${PREFIX}BgRefresh`);
  page = 1;
  filtroQ = '';
  filtroEstado = '';
  currentTab = TAB_CCP;

  document.querySelectorAll('#roTabs .nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('#roTabs .nav-link').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      currentTab = link.dataset.tab || TAB_CCP;
      // RC8.13.1 Obs.49 — cambiar de tab solo re-proyecta rowsCache ya cargado
      // (misma fuente /bandeja); no dispara una segunda carga de red.
      renderTableChrome();
      const tbody = document.getElementById(LIST_ID);
      if (tbody) {
        tbody.innerHTML = rowsCache.length
          ? rowsCache.map(renderRow).join('')
          : `<tr><td colspan="${currentColsCount()}" class="text-center text-muted py-4">No hay expedientes en Registro de Órdenes</td></tr>`;
        bindActionMenus(tbody, buildActMap());
      }
    });
  });

  document.getElementById(`${PREFIX}Refresh`)?.addEventListener('click', () => loadBandeja());
  document.getElementById(`${PREFIX}Search`)?.addEventListener('change', (e) => {
    filtroQ = e.target.value.trim();
    page = 1;
    loadBandeja();
  });
  document.getElementById(`${PREFIX}Search`)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      filtroQ = e.target.value.trim();
      page = 1;
      loadBandeja();
    }
  });
  document.getElementById(`${PREFIX}Estado`)?.addEventListener('change', (e) => {
    filtroEstado = e.target.value;
    page = 1;
    loadBandeja();
  });
  document.getElementById(`${PREFIX}PageSize`)?.addEventListener('change', (e) => {
    pageSize = Number(e.target.value) || 25;
    page = 1;
    loadBandeja();
  });
  document.getElementById(`${PREFIX}Prev`)?.addEventListener('click', () => {
    if (page > 1) { page -= 1; loadBandeja(); }
  });
  document.getElementById(`${PREFIX}Next`)?.addEventListener('click', () => {
    if (page < metaPages) { page += 1; loadBandeja(); }
  });

  loadBandeja();
}
