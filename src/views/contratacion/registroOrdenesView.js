/**
 * Contrataciones → Registro de Órdenes (OD36 / OD40)
 * Ruta: dec/registro-ordenes · permiso REGISTRO_ORDENES_CONTRATACION
 */
import { ordenesContratacionService } from '../../services/ordenesContratacionService.js';
import { bandejaTableStyles, getResponsableVigenteLabel, getEstadoVigenteLabel } from '../../utils/trazabilidad.js';
import {
  renderActionMenuCell, bindActionMenus, closeBandejaActionMenus,
} from '../../utils/bandejaUi.js';
import { renderBadgeEstadoVigenteHtml } from '../../../shared/estadoExpedienteVigente.js';
import {
  registroOrdenesMenuItems, fmtMonto, fmtFecha, fmtFechaHora,
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
const COLS = 22;
const loadGuard = createRequestSequenceGuard();

let lifecycle = null;
let refreshIndicator = null;
let rowsCache = [];
let filtroEstado = '';
let filtroQ = '';
let page = 1;
let pageSize = 25;
let metaTotal = 0;
let metaPages = 1;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function canManage() {
  try {
    const u = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const rol = String(u.rol || u.role || '').toLowerCase();
    return rol === 'dec' || rol === 'admin';
  } catch (_) { return false; }
}

const RO_BANDEJA_CSS = `
#${VIEW_ID} .ro-table-wrap { max-height: 68vh; overflow: auto; }
#${VIEW_ID} table.ro-bandeja {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10px;
  table-layout: fixed;
  width: 100%;
  min-width: 1580px;
  border-collapse: collapse;
}
#${VIEW_ID} table.ro-bandeja thead th {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
  vertical-align: middle;
  white-space: normal;
  height: 2.8em;
  padding: 4px 4px;
  background: #f8f9fa;
  text-align: center;
}
#${VIEW_ID} table.ro-bandeja tbody td {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10px;
  padding: 3px 4px;
  vertical-align: middle;
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
              <colgroup>
                <col style="width:55px">
                <col style="width:60px">
                <col style="width:90px">
                <col style="width:85px">
                <col style="width:95px">
                <col style="width:150px">
                <col style="width:100px">
                <col style="width:160px">
                <col style="width:58px">
                <col style="width:55px">
                <col style="width:75px">
                <col style="width:75px">
                <col style="width:70px">
                <col style="width:75px">
                <col style="width:70px">
                <col style="width:80px">
                <col style="width:70px">
                <col style="width:70px">
                <col style="width:80px">
                <col style="width:100px">
                <col style="width:100px">
                <col style="width:60px">
              </colgroup>
              <thead class="table-light sticky-top">
                <tr>
                  <th>CCP</th>
                  <th>CCP<br>firmado</th>
                  <th>Requerimiento</th>
                  <th>Pedido<br>SIGAMEF</th>
                  <th>RUC</th>
                  <th>Proveedor</th>
                  <th>Código<br>SIGAMEF</th>
                  <th>Descripción<br>del ítem</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Precio<br>unitario</th>
                  <th>Total</th>
                  <th>N.° de<br>orden</th>
                  <th>Fecha de<br>emisión</th>
                  <th>Entrega</th>
                  <th>Fecha de<br>notificación</th>
                  <th>Recepción</th>
                  <th>Plazo de<br>entrega</th>
                  <th>Fecha máxima<br>de entrega</th>
                  <th>Estado vigente</th>
                  <th>Responsable actual</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="${LIST_ID}">
                <tr><td colspan="${COLS}" class="text-center text-muted py-4">Cargando…</td></tr>
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

function renderEstado(row) {
  // Misma evidencia que el resolvedor central (no forzar solo orden_estado)
  return renderBadgeEstadoVigenteHtml({
    ...row,
    orden_id: row.orden_id,
    orden_estado: row.orden_estado || null,
    codigo_ccp: row.codigo_ccp,
    ccp_activo: true,
    ccp_firmado: row.ccp_firmado,
    en_registro_ordenes: true,
    estado_cuadro: row.estado_cuadro || 'DERIVADO_CCP',
    solicitud_estado: row.solicitud_estado || 'EN_CCP',
    enviado_proveedor_at: row.fecha_notificacion || row.fecha_envio_proveedor || row.enviado_proveedor_at,
    recepcion_estado_global: row.recepcion_estado_global
      || row.estadoVigente?.codigo
      || row.estado_vigente
      || null,
    recepcion_bienes_expediente_id: row.recepcion_bienes_expediente_id || null,
  }, esc);
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

function renderRow(row) {
  const key = row.orden_id || `r${row.requerimiento_id}`;
  const menu = renderActionMenuCell(
    key,
    registroOrdenesMenuItems(row, { canManage: canManage() }),
  );
  const cant = row.cantidad_display || '—';
  const pu = row.precio_unitario_display
    || (row.precio_unitario != null ? fmtMonto(row.precio_unitario) : '—');
  const tipCod = esc(row.codigo_sigamef_tooltip || row.codigo_sigamef || '');
  const tipDesc = esc(row.item_descripcion_tooltip || row.item_descripcion || '');
  const tipEnt = esc(row.entrega_tooltip || '');
  const estadoVigente = getEstadoVigenteLabel(row);
  const responsableVigente = getResponsableVigenteLabel(row);
  const checklistHtml = shouldShowChecklistBadge(row)
    ? ` ${renderChecklistBadge(row.checklist || row)}`
    : '';
  return `<tr data-rid="${row.requerimiento_id}" data-oid="${row.orden_id || ''}">
    <td title="${esc(row.codigo_ccp || '')}">${esc(row.codigo_ccp || '—')}</td>
    <td>${row.ccp_firmado ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-warning text-dark">No</span>'}</td>
    <td title="${esc(row.requerimiento_codigo)}"><strong>${esc(row.requerimiento_codigo)}</strong></td>
    <td title="${esc(row.pedido_sigamef || '')}">${esc(row.pedido_sigamef || '—')}</td>
    <td>${esc(row.proveedor_ruc || '—')}</td>
    <td class="ro-col-wide" title="${esc(row.proveedor_razon_social || '')}">${esc(row.proveedor_razon_social || '—')}</td>
    <td title="${tipCod}">${esc(row.codigo_sigamef || '—')}</td>
    <td class="ro-col-wide" title="${tipDesc}">${esc(row.item_descripcion || '—')}</td>
    <td>${esc(row.tipo || '—')}</td>
    <td class="text-end">${esc(cant)}</td>
    <td class="text-end">${typeof pu === 'string' && pu.startsWith('Ver') ? `<button type="button" class="btn btn-link btn-sm p-0 ro-ver-items" data-rid="${row.requerimiento_id}" style="font-size:9px">Ver detalle</button>` : esc(pu)}</td>
    <td class="text-end">${fmtMonto(row.precio_total)}</td>
    <td>${row.numero_orden ? `${esc(row.tipo_orden || '')} ${esc(row.numero_orden)}` : '—'}</td>
    <td>${fmtFecha(row.fecha_orden)}</td>
    <td title="${tipEnt}">${esc(row.entrega_label || '—')}</td>
    <td>${fmtFecha(row.fecha_notificacion || row.fecha_envio_proveedor)}</td>
    <td>${fmtFecha(row.fecha_recepcion_confirmada)}</td>
    <td title="${esc(row.condicion_inicio_label || '')}">${esc(row.plazo_entrega_label || (row.plazo_entrega ? `${row.plazo_entrega} días` : '—'))}</td>
    <td>${fmtFecha(row.fecha_maxima_entrega)}</td>
    <td class="ro-wrap" title="${esc(estadoVigente)}">${renderEstado(row)}${checklistHtml}</td>
    <td class="ro-wrap" title="${esc(responsableVigente)}">${esc(responsableVigente)}</td>
    ${menu}
  </tr>`;
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
  const tbody = document.getElementById(LIST_ID);
  if (!opts.silent && tbody) {
    tbody.innerHTML = `<tr><td colspan="${COLS}" class="text-center text-muted py-4">Cargando…</td></tr>`;
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
    if (page > metaPages) page = metaPages;
    updatePagerUi();
    if (!rowsCache.length) {
      tbody.innerHTML = `<tr><td colspan="${COLS}" class="text-center text-muted py-4">No hay expedientes en Registro de Órdenes</td></tr>`;
    } else {
      tbody.innerHTML = rowsCache.map(renderRow).join('');
      bindActionMenus(tbody, buildActMap());
      tbody.querySelectorAll('.ro-ver-items').forEach((btn) => {
        btn.onclick = async () => {
          try {
            const row = rowsCache.find((r) => String(r.requerimiento_id) === String(btn.dataset.rid));
            if (row?.orden_id) {
              await openExpedienteOrdenModal(row);
              return;
            }
            const ctx = await ordenesContratacionService.getContexto(btn.dataset.rid);
            const data = ctx?.data || ctx;
            const lines = (data.items_adjudicados || []).map((it, i) =>
              `${i + 1}. ${it.descripcion} · cant ${it.cantidad} · PU ${fmtMonto(it.precio_unitario)} · ${fmtMonto(it.precio_total)}`);
            // Modal ligero sin alert
            const wrap = document.createElement('div');
            wrap.innerHTML = `<div class="modal fade show d-block" style="background:rgba(0,0,0,.4)">
              <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header"><h6 class="modal-title">Ítems</h6>
                <button type="button" class="btn-close" id="roItClose"></button></div>
                <div class="modal-body" style="font-size:12px;font-family:Arial"><pre class="mb-0" style="white-space:pre-wrap">${esc(lines.join('\n') || 'Sin ítems')}</pre></div>
              </div></div></div>`;
            document.body.appendChild(wrap);
            wrap.querySelector('#roItClose').onclick = () => wrap.remove();
            wrap.querySelector('.modal').onclick = (ev) => { if (ev.target === wrap.querySelector('.modal')) wrap.remove(); };
          } catch (e) {
            const wrap = document.createElement('div');
            wrap.innerHTML = `<div class="modal fade show d-block" style="background:rgba(0,0,0,.4)">
              <div class="modal-dialog"><div class="modal-content"><div class="modal-body text-danger">${esc(e.message || 'Error')}</div>
              <div class="modal-footer"><button class="btn btn-sm btn-secondary" id="roItErr">Cerrar</button></div></div></div></div>`;
            document.body.appendChild(wrap);
            wrap.querySelector('#roItErr').onclick = () => wrap.remove();
          }
        };
      });
    }
    restoreScroll(VIEW_ID, SCROLL_SEL);
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${COLS}" class="text-danger text-center py-4">${esc(err.message || 'Error')}</td></tr>`;
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

  const runActionByName = async (action, row) => {
    const map = {
      adjuntarCcpFirmado: () => openAdjuntarCcpFirmadoModal(row, { onDone: afterSave(row) }),
      registrarOrden: () => openRegistrarOrdenModal(row, { onDone: afterSave(row) }),
      editarOrden: () => openRegistrarOrdenModal(row, {
        onDone: afterSave(row),
        editId: row.orden_id || null,
      }),
      adminEntregas: () => {
        if (!row.orden_id) return openRegistrarOrdenModal(row, { onDone: afterSave(row) });
        return openEntregasModal(row.orden_id, { onDone: afterSave(row) });
      },
      adjuntarOrdenFirmada: () => {
        if (!row.orden_id) return openRegistrarOrdenModal(row, { onDone: afterSave(row) });
        return openAdjuntarOrdenFirmadaModal(row.orden_id, { onDone: afterSave(row) });
      },
    };
    const fn = map[action];
    if (fn) await fn();
  };

  const afterSave = (row) => async () => {
    await reload();
    const fresh = findRow(row.orden_id || `r${row.requerimiento_id}`)
      || rowsCache.find((r) => r.requerimiento_id === row.requerimiento_id)
      || row;
    await validarYMostrarChecklist({
      ordenId: fresh.orden_id || null,
      requerimientoId: fresh.requerimiento_id,
      titulo: 'Validación del expediente',
      onCompletar: async (action) => runActionByName(action, fresh),
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
      onCompletar: async (action) => runActionByName(action, row),
    });
  };

  return {
    verExpediente: wrap((row) => openExpedienteOrdenModal(row)),
    adjuntarCcpFirmado: wrap((row) => openAdjuntarCcpFirmadoModal(row, { onDone: afterSave(row) })),
    verCcpFirmado: wrap((row) => openCcpFirmadoViewer(row)),
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
    adminEntregas: wrap((row) => openEntregasModal(row.orden_id, { onDone: afterSave(row) })),
    adjuntarOrdenFirmada: wrap((row) => openAdjuntarOrdenFirmadaModal(row.orden_id, { onDone: afterSave(row) })),
    notificarProveedor: wrap(async (row) => {
      const data = await fetchChecklistOrden(row.orden_id);
      const checklist = data.checklist || data;
      if (!checklist.completo) {
        openChecklistModal(checklist, {
          titulo: 'No se puede notificar — complete la información',
          forzar: true,
          onCompletar: async (action) => runActionByName(action, row),
        });
        return;
      }
      await openEnviarProveedorModal(row.orden_id, { onDone: reload });
    }),
    reenviar: wrap((row) => openEnviarProveedorModal(row.orden_id, { onDone: reload })),
    verChecklist: wrap((row) => openChecklistForRow(row)),
    inicioActividad: wrap((row) => openInicioActividadModal(row, { onDone: afterSave(row) })),
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
    verConfirmacion: wrap(async (row) => openExpedienteOrdenModal(row)),
    verFechasMaximas: wrap(async (row) => openExpedienteOrdenModal(row)),
    verCronograma: wrap(async (row) => openExpedienteOrdenModal(row)),
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
