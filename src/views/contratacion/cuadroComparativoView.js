// Cuadro Comparativo — bandeja por Solicitud de Cotización (RC8.0 refresh no destructivo)
import { contratacionesService } from '../../services/contratacionesService.js';
import { bandejaTableStyles, getResponsableVigenteLabel } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { bindBandejaToolbar, closeBandejaActionMenus } from '../../utils/bandejaUi.js';
import {
  bandejaExpedienteStandardStyles,
  renderBandejaCanonicoEtapaCell,
  renderBandejaCanonicoEstadoCell,
  renderBandejaCanonicoResponsableCell,
} from '../../utils/bandejaExpedienteColumns.js';
import { usePagination } from '../../utils/paginacion.js';
import {
  formatRequerimientosCuadro,
  formatCentroCuadro,
  formatCantidadCotizacionesCuadro,
  buildCuadroStats,
  renderCuadroStatsHtml,
  updateCuadroStatsDom,
  labelCuadroEstado,
  labelEstadoExpedienteUnificado,
  renderBadgeEstadoCuadroHtml,
  filterCuadroExpedientes,
  ESTADOS_CUADRO_LABEL,
} from '../../utils/cuadroComparativoUtils.js';
import { showElaborarCuadroModal } from '../../utils/cuadroComparativoModal.js';
import {
  showExpedienteCoordinadorModal,
  showExpedienteDecModal,
  showExpedienteRevisionModal,
} from '../../utils/cuadroComparativoCoordModal.js';
import {
  resolveRolRevisionCliente,
  resolveModoAperturaExpediente,
  ROLES_REVISION,
} from '../../utils/cuadroComparativoRevisionUi.js';
import { showTrazabilidadModal } from '../requerimiento/reqShared.js';
import { closeBandejaDropdowns } from '../../components/bandejaDetailPanel.js';
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

const API_BASE = '/api';
const VIEW_ID = 'cuadro-comparativo';
const SCROLL_SEL = '#cuadroCompWrap';
const loadGuard = createRequestSequenceGuard();
let lifecycle = null;
let refreshIndicator = null;

function currentUser() {
  try { return JSON.parse(localStorage.getItem('currentUser') || 'null') || {}; }
  catch (_) { return {}; }
}

function rolBandejaActual() {
  return resolveRolRevisionCliente(currentUser());
}

function isModoBandejaCoordinador() {
  return rolBandejaActual() === ROLES_REVISION.COORDINADOR_CM;
}

function isModoBandejaDec() {
  return rolBandejaActual() === ROLES_REVISION.DEC;
}

function isModoBandejaAdmin() {
  return rolBandejaActual() === ROLES_REVISION.ADMINISTRADOR;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
}

function authHeaders() {
  try {
    const raw = localStorage.getItem('currentUser');
    if (raw) {
      const user = JSON.parse(raw);
      const h = {};
      if (user?.id) h['x-user-id'] = String(user.id);
      if (user?.username || user?.nombre || user?.dni) {
        h['x-user-name'] = String(user.username || user.nombre || user.dni);
      }
      if (user?.cargo) h['x-user-cargo'] = String(user.cargo);
      if (user?.rol) h['x-user-rol'] = String(user.rol);
      if (user?.permisos) {
        try { h['x-user-permisos'] = JSON.stringify(user.permisos); } catch (_) { /* noop */ }
      }
      return h;
    }
  } catch (_) { /* noop */ }
  return {};
}

async function openPdfValidacion(cotId) {
  const url = `${API_BASE}/contrataciones/portal-analista/validaciones/${cotId}/pdf-validacion?inline=1`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error('PDF de validación no disponible');
  const blob = await res.blob();
  if (!(blob instanceof Blob) || !blob.size) throw new Error('PDF de validación vacío');
  const objUrl = URL.createObjectURL(blob);
  window.open(objUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
}

function getViewConfig() {
  if (isModoBandejaCoordinador()) {
    return {
      prefix: 'cuadroComp',
      title: 'Coordinación CM — Cuadro Comparativo',
      icon: 'bi-person-badge',
      description: 'Bandeja de revisión del Coordinador CM (ruta Cuadro Comparativo). Las acciones de firma y conformidad están en Abrir expediente.',
      listId: 'cuadroCompList',
      modo: 'COORDINADOR_CM',
    };
  }
  if (isModoBandejaDec()) {
    return {
      prefix: 'cuadroComp',
      title: 'DEC — Cuadro Comparativo',
      icon: 'bi-shield-check',
      description: 'Bandeja de revisión DEC. Segunda etapa documental tras el Coordinador CM.',
      listId: 'cuadroCompList',
      modo: 'DEC',
    };
  }
  if (isModoBandejaAdmin()) {
    return {
      prefix: 'cuadroComp',
      title: 'Cuadro Comparativo',
      icon: 'bi-shield-lock',
      description: 'Vista administrativa: todos los expedientes. Abrir expediente usa el modo de la etapa actual (solo visualización en revisión Coord/DEC).',
      listId: 'cuadroCompList',
      modo: 'ADMINISTRADOR',
    };
  }
  return {
    prefix: 'cuadroComp',
    title: 'Cuadro Comparativo',
    icon: 'bi-table',
    description: 'Expedientes con validación técnica APTO. La bandeja y acciones cambian según el rol operativo y la etapa del expediente.',
    listId: 'cuadroCompList',
    modo: 'ANALISTA',
  };
}

const VIEW_CONFIG = getViewConfig();

let expedientesCache = [];

const cuadroPagination = usePagination(
  'cuadros',
  async () => {
    const resp = await contratacionesService.listCuadroComparativoExpedientes();
    const all = resp.data || [];
    const filtros = readFiltros();
    const filtered = filterCuadroExpedientes(all, filtros);
    expedientesCache = all;
    return { data: filtered };
  },
  { defaultPageSize: 25, pageSizeOptions: [25, 50, 100] },
);

function readFiltros() {
  const p = VIEW_CONFIG.prefix;
  return {
    q: document.getElementById(`${p}FiltroQ`)?.value || '',
    tipo: document.getElementById(`${p}FiltroTipo`)?.value || '',
    estado: document.getElementById(`${p}FiltroEstado`)?.value || '',
    area: document.getElementById(`${p}FiltroArea`)?.value || '',
    desde: document.getElementById(`${p}FiltroDesde`)?.value || '',
    hasta: document.getElementById(`${p}FiltroHasta`)?.value || '',
  };
}

function renderFilterBar(prefix) {
  const estadoOpts = Object.entries(ESTADOS_CUADRO_LABEL)
    .map(([k, lab]) => `<option value="${esc(k)}">${esc(lab)}</option>`)
    .join('');
  return `
    <div class="sgc-search-bar mb-3">
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small mb-0">Búsqueda</label>
          <input type="search" class="form-control form-control-sm" id="${prefix}FiltroQ"
            placeholder="SC, REQ, denominación, proveedor, área…">
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-0">Tipo</label>
          <select class="form-select form-select-sm" id="${prefix}FiltroTipo">
            <option value="">Todos</option>
            <option value="bien">Bien</option>
            <option value="servicio">Servicio</option>
            <option value="locador">Locador</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-0">Estado</label>
          <select class="form-select form-select-sm" id="${prefix}FiltroEstado">
            <option value="">Todos</option>
            ${estadoOpts}
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small mb-0">Área usuaria</label>
          <input type="text" class="form-control form-control-sm" id="${prefix}FiltroArea" placeholder="Área…">
        </div>
        <div class="col-md-1">
          <label class="form-label small mb-0">Desde</label>
          <input type="date" class="form-control form-control-sm" id="${prefix}FiltroDesde">
        </div>
        <div class="col-md-1">
          <label class="form-label small mb-0">Hasta</label>
          <input type="date" class="form-control form-control-sm" id="${prefix}FiltroHasta">
        </div>
        <div class="col-md-1 d-flex gap-1">
          <button type="button" class="btn btn-sm btn-primary" id="${prefix}FiltroBtn" title="Filtrar">
            <i class="bi bi-funnel"></i>
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="${prefix}FiltroLimpiar" title="Limpiar">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>
    </div>`;
}

function showBootstrapModal(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const el = wrap.querySelector('.modal');
  const modal = window.bootstrap?.Modal
    ? new window.bootstrap.Modal(el)
    : null;
  el.addEventListener('hidden.bs.modal', () => wrap.remove());
  if (modal) modal.show();
  else {
    el.style.display = 'block';
    el.classList.add('show');
  }
  return { wrap, el, modal };
}

async function showVerExpediente(solicitudId) {
  let det;
  try {
    const resp = await contratacionesService.getCuadroComparativoExpediente(solicitudId);
    det = resp.data || resp;
  } catch (err) {
    alert(err.message || 'No se pudo cargar el expediente');
    return;
  }
  const reqs = (det.requerimientos || []).map((r) => `
    <tr>
      <td class="small">${esc(r.codigo || '—')}</td>
      <td class="small">${esc(r.descripcion || '—')}</td>
      <td class="small">${esc(r.centro || '—')}</td>
      <td class="small">${esc(r.area_usuaria || '—')}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="text-muted small">Sin requerimientos vinculados</td></tr>';

  const provs = (det.proveedores || []).map((p) => `
    <tr>
      <td class="small"><strong>${esc(p.razon_social)}</strong><div class="text-muted">${esc(p.ruc)}</div></td>
      <td class="small">${esc(p.validacion_estado || '—')}</td>
      <td class="small">${esc(p.validado_por || '—')}</td>
      <td class="small">${esc(fmtFecha(p.validado_at || p.fecha_presentacion))}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="text-muted small">Sin proveedores</td></tr>';

  showBootstrapModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-folder2-open"></i> Expediente ${esc(det.solicitud_codigo)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-2 mb-3">
              <div class="col-md-4"><div class="small text-muted">Solicitud</div><strong>${esc(det.solicitud_codigo)}</strong></div>
              <div class="col-md-4"><div class="small text-muted">Tipo</div><strong>${esc(det.tipo || '—')}</strong></div>
              <div class="col-md-4"><div class="small text-muted">Estado del cuadro</div>
                ${renderBadgeEstadoCuadroHtml(det, det.estado_cuadro_label || labelCuadroEstado(det.estado_cuadro), esc)}
              </div>
              <div class="col-12"><div class="small text-muted">Denominación</div><div>${esc(det.denominacion || '—')}</div></div>
              <div class="col-md-6"><div class="small text-muted">Área usuaria</div><div>${esc(det.area_usuaria || '—')}</div></div>
              <div class="col-md-6"><div class="small text-muted">Ingreso a cuadro</div><div>${esc(fmtFecha(det.fecha_ingreso_cuadro))}</div></div>
            </div>
            <h6 class="fw-bold">Requerimientos</h6>
            <table class="table table-sm table-bordered mb-3"><thead class="table-light"><tr>
              <th>Código</th><th>Descripción</th><th>Centro</th><th>Área</th>
            </tr></thead><tbody>${reqs}</tbody></table>
            <h6 class="fw-bold">Proveedores y estado técnico</h6>
            <p class="small text-muted mb-1">Solo estado de validación. La propuesta económica no se muestra en esta etapa.</p>
            <table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr>
              <th>Proveedor</th><th>Validación</th><th>Validado por</th><th>Fecha</th>
            </tr></thead><tbody>${provs}</tbody></table>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`);
}

async function showVerValidaciones(solicitudId) {
  let det;
  try {
    const resp = await contratacionesService.getCuadroComparativoExpediente(solicitudId);
    det = resp.data || resp;
  } catch (err) {
    alert(err.message || 'No se pudo cargar validaciones');
    return;
  }
  const aptos = (det.proveedores || []).filter((p) => String(p.validacion_estado || '').toUpperCase() === 'APTO');
  const rows = (aptos.length ? aptos : det.proveedores || []).map((p) => `
    <tr>
      <td class="small"><strong>${esc(p.razon_social)}</strong><div class="text-muted">${esc(p.ruc)}</div></td>
      <td><span class="badge bg-${String(p.validacion_estado).toUpperCase() === 'APTO' ? 'success' : 'secondary'}">${esc(p.validacion_estado || '—')}</span></td>
      <td class="small">${esc(p.validado_por || '—')}</td>
      <td class="text-nowrap">
        ${p.tiene_pdf_validacion
    ? `<button type="button" class="btn btn-sm btn-outline-primary cc-pdf-val" data-cot="${p.cotizacion_id}">Ver PDF</button>`
    : '<span class="text-muted small">Sin PDF firmado</span>'}
      </td>
    </tr>`).join('') || '<tr><td colspan="4" class="text-muted">Sin validaciones</td></tr>';

  const { el } = showBootstrapModal(`
    <div class="modal fade" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-file-earmark-check"></i> Validaciones — ${esc(det.solicitud_codigo)}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p class="small text-muted">PDF de validación técnica firmado por proveedor. No se muestra la propuesta económica.</p>
            <table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr>
              <th>Proveedor</th><th>Estado</th><th>Profesional</th><th>PDF</th>
            </tr></thead><tbody>${rows}</tbody></table>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`);

  el.querySelectorAll('.cc-pdf-val').forEach((btn) => {
    btn.onclick = async () => {
      try { await openPdfValidacion(btn.dataset.cot); }
      catch (err) { alert(err.message); }
    };
  });
}

async function openElaborarCuadro(solicitudId, nroInvitacion = null) {
  const row = expedientesCache.find((e) => String(e.solicitud_id) === String(solicitudId)
    && (nroInvitacion == null || String(e.nro_invitacion) === String(nroInvitacion)));
  const tipo = String(row?.tipo || '').toLowerCase();
  const esBien = !tipo || tipo === 'bien' || tipo === 'bienes' || tipo === 'b';
  const esServicio = tipo === 'servicio' || tipo === 'servicios' || tipo === 's';
  if (tipo && !esBien && !esServicio) {
    alert(`El cuadro comparativo elabora Bienes (08-A) y Servicios (08-B). Tipo actual: ${row?.tipo || '—'}.`);
    return;
  }
  await showElaborarCuadroModal(solicitudId, () => loadCuadro(false), {
    nroInvitacion: nroInvitacion ?? row?.nro_invitacion ?? undefined,
    invitacionId: row?.invitacion_id ?? undefined,
  });
}

function rondaCtxFromBandeja(solicitudId, nroInvitacion = null) {
  const row = expedientesCache.find((e) => String(e.solicitud_id) === String(solicitudId)
    && (nroInvitacion == null || String(e.nro_invitacion) === String(nroInvitacion)));
  return {
    nroInvitacion: nroInvitacion ?? row?.nro_invitacion ?? undefined,
    invitacionId: row?.invitacion_id ?? row?.invitacion_id_ancla ?? undefined,
  };
}

async function openExpedienteCoordinador(solicitudId, nroInvitacion = null) {
  closeBandejaDropdowns();
  closeBandejaActionMenus();
  await showExpedienteCoordinadorModal(solicitudId, () => loadCuadro(false), rondaCtxFromBandeja(solicitudId, nroInvitacion));
}

async function openExpedienteDec(solicitudId, nroInvitacion = null) {
  closeBandejaDropdowns();
  closeBandejaActionMenus();
  await showExpedienteDecModal(solicitudId, () => loadCuadro(false), rondaCtxFromBandeja(solicitudId, nroInvitacion));
}

/** Admin: abre según etapa real (sin simular rol). */
async function openExpedienteAdmin(solicitudId, nroInvitacion = null) {
  closeBandejaDropdowns();
  closeBandejaActionMenus();
  const row = expedientesCache.find((e) => String(e.solicitud_id) === String(solicitudId)
    && (nroInvitacion == null || String(e.nro_invitacion) === String(nroInvitacion)));
  const rondaCtx = rondaCtxFromBandeja(solicitudId, nroInvitacion);
  const estado = row?.estado_cuadro || row?.estado || '';
  const sugerido = resolveModoAperturaExpediente(estado, ROLES_REVISION.ADMINISTRADOR);
  if (sugerido === ROLES_REVISION.DEC) {
    await showExpedienteDecModal(solicitudId, () => loadCuadro(false), rondaCtx);
    return;
  }
  if (sugerido === ROLES_REVISION.COORDINADOR_CM) {
    await showExpedienteCoordinadorModal(solicitudId, () => loadCuadro(false), rondaCtx);
    return;
  }
  await showElaborarCuadroModal(solicitudId, () => loadCuadro(false), {
    invitacionId: row?.invitacion_id ?? undefined,
    nroInvitacion: rondaCtx.nroInvitacion,
  });
}

async function openDescargarCuadro(solicitudId) {
  const row = expedientesCache.find((e) => String(e.solicitud_id) === String(solicitudId));
  if (!row?.cuadro_id) {
    return alert('Aún no hay PDF del cuadro para descargar.');
  }
  try {
    const path = await contratacionesService.getCuadroPdfUrl(row.cuadro_id, false);
    const url = path.startsWith('http') ? path : `http://localhost:3000${path}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('PDF no disponible');
    const blob = await res.blob();
    if (!(blob instanceof Blob) || !blob.size) throw new Error('PDF vacío o no disponible');
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = `Cuadro_${row.solicitud_codigo || solicitudId}_v${row.version || 1}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
  } catch (err) {
    alert(err.message || 'No se pudo descargar el cuadro');
  }
}

async function openTrazabilidadCuadro(solicitudId) {
  const row = expedientesCache.find((e) => String(e.solicitud_id) === String(solicitudId));
  const reqId = row?.requerimientos?.[0]?.id;
  if (!reqId) {
    return alert('No hay requerimiento asociado para mostrar trazabilidad.');
  }
  await showTrazabilidadModal(reqId);
}

/** RC8.17.8H6-D10-B1 — tooltip centro (texto completo sin ensanchar columna). */
function resolveCentroTooltipCuadro(row = {}) {
  const raw = row.centros_texto || row.centro
    || (Array.isArray(row.requerimientos)
      ? row.requerimientos.map((r) => r?.centro).filter(Boolean).join(', ')
      : '');
  const t = String(raw || '').trim();
  return t || '—';
}

/** RC8.17.8H6-D10-B — columnas bandeja + ERV canónico (Etapa/Estado/Responsable). */
function buildCuadroTheadHtml() {
  return `<tr>
    <th class="cc-col-solicitud">Solicitud</th>
    <th class="cc-col-inv text-center">Invitación</th>
    <th class="cc-col-req">Requerimiento</th>
    <th class="cc-col-centro">Centro</th>
    <th class="cc-col-cot text-center">Cotizaciones</th>
    <th class="req-col-etapa">Etapa</th>
    <th class="req-col-estado-cell">Estado</th>
    <th class="req-col-resp">Responsable</th>
    <th class="cc-col-ver text-center">Ver</th>
  </tr>`;
}

function buildCuadroRowHtml(c) {
  const invLabel = c.invitacion_label || (c.nro_invitacion != null ? `Inv. ${c.nro_invitacion}` : '—');
  const denom = String(c.denominacion || '');
  const cotLabel = formatCantidadCotizacionesCuadro(c, esc);
  const centroTip = resolveCentroTooltipCuadro(c);
  // Multi-REQ: enrichEstadoResponsableForBandeja usa requerimiento_id (primer REQ de la SC).
  // D10-B no redefine esa regla; ver auditoría Obs. 15.
  return `
    <tr data-row-id="${c.solicitud_id}" data-invitacion-id="${esc(c.invitacion_id ?? '')}"
      data-nro-invitacion="${esc(c.nro_invitacion ?? '')}">
      <td class="cc-col-solicitud">
        <strong class="cc-bandeja-truncate d-block" title="${esc(c.solicitud_codigo || '')}">${esc(c.solicitud_codigo)}</strong>
        <div class="small text-muted cc-bandeja-truncate" title="${esc(denom)}">${esc(denom.slice(0, 48))}${denom.length > 48 ? '…' : ''}</div>
      </td>
      <td class="cc-col-inv text-center small fw-semibold text-primary" title="${esc(invLabel)}">${esc(invLabel)}</td>
      <td class="cc-col-req">${formatRequerimientosCuadro(c, esc)}</td>
      <td class="cc-col-centro small" title="${esc(centroTip)}">${formatCentroCuadro(c, esc)}</td>
      <td class="cc-col-cot text-center small cc-bandeja-truncate" title="${esc(cotLabel.replace(/<[^>]+>/g, ''))}">${cotLabel}</td>
      <td class="req-col-etapa">${renderBandejaCanonicoEtapaCell(c)}</td>
      <td class="req-col-estado-cell">${renderBandejaCanonicoEstadoCell(c)}</td>
      <td class="req-col-resp small">${renderBandejaCanonicoResponsableCell(c)}</td>
      <td class="cc-col-ver text-center">
        <button type="button" class="btn btn-sm btn-outline-primary cc-ver-exp cc-ver-btn"
          data-id="${esc(c.solicitud_id)}"
          data-nro-invitacion="${esc(c.nro_invitacion ?? '')}"
          title="Ver expediente">
          <i class="bi bi-eye" aria-hidden="true"></i><span class="visually-hidden"> Ver</span>
        </button>
      </td>
    </tr>`;
}

/** RC8.17.8H6-D10-B1 — bandeja compacta 9 cols, sin scroll horizontal en viewport típico con sidebar. */
function cuadroBandejaColumnStyles() {
  return `
    ${bandejaExpedienteStandardStyles()}
    #cuadroCompOuter .table-responsive { overflow-x: auto; }
    #cuadroCompWrap .req-list-table {
      table-layout: fixed;
      width: 100%;
      min-width: 0;
    }
    #cuadroCompWrap .req-list-table th,
    #cuadroCompWrap .req-list-table td {
      padding: 0.28rem 0.35rem;
      font-size: 0.78rem;
      line-height: 1.22;
      overflow: hidden;
      vertical-align: middle;
    }
    #cuadroCompWrap .req-list-table tbody tr {
      height: auto;
      min-height: 34px;
      max-height: none;
    }
    #cuadroCompWrap .cc-bandeja-truncate {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    /* Anchos 9 cols: 15+7+12+7+10+13+13+18+5 = 100% (Centro 7%; ERV 44%) */
    #cuadroCompWrap .cc-col-solicitud { width: 15%; }
    #cuadroCompWrap .cc-col-inv { width: 7%; white-space: nowrap; }
    #cuadroCompWrap .cc-col-req { width: 12%; font-size: 0.74rem; line-height: 1.2; }
    #cuadroCompWrap .cc-col-req .small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
    #cuadroCompWrap .cc-col-centro {
      width: 7%;
      font-size: 0.72rem;
      line-height: 1.15;
    }
    #cuadroCompWrap .cc-col-centro .small,
    #cuadroCompWrap .cc-col-centro .req-centro-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: block;
      max-width: 100%;
    }
    #cuadroCompWrap .cc-col-cot { width: 10%; font-size: 0.72rem; line-height: 1.15; }
    #cuadroCompWrap .req-col-etapa { width: 13%; }
    #cuadroCompWrap .req-col-estado-cell { width: 13%; }
    #cuadroCompWrap .req-col-resp { width: 18%; }
    #cuadroCompWrap .cc-col-ver { width: 5%; min-width: 2.25rem; }
    #cuadroCompWrap .cc-ver-btn { padding: 0.15rem 0.35rem; line-height: 1; }
    #cuadroCompWrap .sgc-etapa-badge,
    #cuadroCompWrap .sgc-estado-badge,
    #cuadroCompWrap .sgc-responsable-badge {
      max-width: 100%;
      min-height: 22px;
      max-height: 24px;
    }
    #cuadroCompWrap .sgc-etapa-badge__text,
    #cuadroCompWrap .sgc-estado-badge__text,
    #cuadroCompWrap .sgc-responsable-badge__text {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;
      vertical-align: bottom;
    }
    @media (max-width: 991.98px) {
      #cuadroCompWrap .req-list-table { min-width: 720px; }
    }
    @media (max-width: 767.98px) {
      #cuadroCompWrap .req-list-table { min-width: 640px; }
    }
  `;
}

function cuadroEmptyMessage({ modoCoord, modoDec }) {
  if (modoCoord) return 'No hay expedientes derivados al Coordinador CM.';
  if (modoDec) return 'No hay expedientes derivados al DEC.';
  return 'No hay solicitudes con cotizaciones APTO para el cuadro comparativo.';
}

function cuadroHintText({ modoCoord, modoDec }) {
  if (modoCoord) {
    return 'Expedientes derivados desde el Analista. Use Ver para revisar, observar o derivar al DEC.';
  }
  if (modoDec) {
    return 'Expedientes derivados desde el Coordinador CM. Use Ver para observar o aprobar y derivar a CCP.';
  }
  return 'Una fila por solicitud y contexto de invitación (cotizaciones elegibles APTO→Cuadro). Etapa, Estado y Responsable reflejan el ERV vigente del requerimiento.';
}

function ensureCuadroChrome(shell, { hint }) {
  if (!shell?.outer) return;
  const chromeHost = document.getElementById('cuadroCompChrome');
  if (chromeHost) chromeHost.innerHTML = '';

  let hintEl = document.getElementById('cuadroCompHint');
  if (!hintEl) {
    hintEl = document.createElement('p');
    hintEl.id = 'cuadroCompHint';
    hintEl.className = 'small text-muted mb-2';
    shell.outer.insertBefore(hintEl, shell.wrap);
  }
  hintEl.textContent = hint;
}

function openVerDesdeBandeja(id, nroInvitacion, { modoCoord, modoDec, modoAdmin }) {
  closeBandejaActionMenus();
  if (modoCoord) return openExpedienteCoordinador(id, nroInvitacion);
  if (modoDec) return openExpedienteDec(id, nroInvitacion);
  if (modoAdmin) return openExpedienteAdmin(id, nroInvitacion);
  return openElaborarCuadro(id, nroInvitacion);
}

function bindCuadroVerButtons(cont, { modoCoord, modoDec, modoAdmin }) {
  closeBandejaActionMenus(cont);
  cont.querySelectorAll('.cc-ver-exp').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const nro = btn.dataset.nroInvitacion || null;
      openVerDesdeBandeja(btn.dataset.id, nro || null, { modoCoord, modoDec, modoAdmin });
    };
  });
}

async function loadCuadro(resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  const modoCoord = isModoBandejaCoordinador();
  const modoDec = isModoBandejaDec();
  const modoAdmin = isModoBandejaAdmin();

  const hadShell = !!document.getElementById('cuadroCompBody');
  if (hadShell) captureScroll(VIEW_ID, SCROLL_SEL);
  closeBandejaActionMenus(cont);

  const shell = ensureBandejaTableShell(cont, {
    outerId: 'cuadroCompOuter',
    wrapId: 'cuadroCompWrap',
    theadId: 'cuadroCompHead',
    tbodyId: 'cuadroCompBody',
    emptyId: 'cuadroCompEmpty',
    outerClass: 'sgc-bandeja-wrap sgc-bandeja-standard',
    wrapClass: 'table-responsive',
    tableClass: 'table table-sm table-hover table-bordered req-list-table mb-0 align-middle',
  });

  ensureCuadroChrome(shell, {
    hint: cuadroHintText({ modoCoord, modoDec }),
  });

  const request = loadGuard.begin();
  if (lifecycle) lifecycle.addAbortController(request.controller);
  const isBg = hadShell && expedientesCache.length > 0;
  if (isBg) refreshIndicator?.show('Actualizando…');

  try {
    if (resetPage) cuadroPagination.resetPage();
    const result = await cuadroPagination.loadData({}, resetPage);
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    const rows = result.data || [];
    const allFiltered = result.allData || rows;
    updateCuadroStatsDom(allFiltered, 'cuadroCompStats');

    if (!shell?.tbody || !shell?.thead) return;

    if (!allFiltered.length) {
      shell.thead.innerHTML = buildCuadroTheadHtml();
      shell.tbody.innerHTML = '';
      setEmptyState(shell, {
        empty: true,
        message: cuadroEmptyMessage({ modoCoord, modoDec }),
      });
      refreshIndicator?.hide();
      return;
    }

    setEmptyState(shell, { empty: false });
    shell.thead.innerHTML = buildCuadroTheadHtml();
    shell.tbody.innerHTML = rows.map((c) => buildCuadroRowHtml(c)).join('');

    bindCuadroVerButtons(cont, { modoCoord, modoDec, modoAdmin });
    cuadroPagination.renderControls('cuadroCompOuter', () => loadCuadro(false));
    restoreScroll(VIEW_ID, SCROLL_SEL);
    refreshIndicator?.hide();
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    if (hadShell && expedientesCache.length) {
      refreshIndicator?.error('No se pudo actualizar. Se conservan los datos actuales.');
    } else {
      cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
  }
}

export function renderCuadroComparativoView() {
  const cfg = getViewConfig();
  Object.assign(VIEW_CONFIG, cfg);
  const { prefix, title, icon, description, listId } = cfg;
  const statsHtml = renderCuadroStatsHtml(buildCuadroStats([]), 'cuadroCompStats');
  return `
    <div class="container-fluid actos-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}${cuadroBandejaColumnStyles()}</style>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi ${esc(icon)}"></i> ${esc(title)}</h3>
          <p class="text-muted mb-0">${esc(description)}</p>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span id="cuadroCompBgRefreshHost"></span>
          <button id="${esc(prefix)}Reload" type="button" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>
      </div>
      ${statsHtml}
      ${renderFilterBar(prefix)}
      <hr/>
      <div id="${esc(listId)}" class="sgc-bandeja-wrap actos-bandeja-wrap">
        <div class="text-muted">Cargando…</div>
      </div>
    </div>
  `;
}

export function initCuadroComparativoView() {
  lifecycle = createViewLifecycle(VIEW_ID);
  lifecycle.addCleanup(() => {
    loadGuard.abortCurrent();
    closeBandejaActionMenus();
  });
  refreshIndicator = createBackgroundRefreshIndicator('#cuadroCompBgRefreshHost', { id: 'cuadroCompBgRefresh' });

  bindBandejaToolbar({
    prefix: VIEW_CONFIG.prefix,
    onFilter: () => loadCuadro(true),
    onClear: () => loadCuadro(true),
    onExecutiveToggle: () => loadCuadro(true),
  });
  const p = VIEW_CONFIG.prefix;
  const reload = document.getElementById(`${p}Reload`);
  if (reload) reload.onclick = () => loadCuadro(true);
  const filtroBtn = document.getElementById(`${p}FiltroBtn`);
  if (filtroBtn) filtroBtn.onclick = () => loadCuadro(true);
  const limpiar = document.getElementById(`${p}FiltroLimpiar`);
  if (limpiar) {
    limpiar.onclick = () => {
      ['FiltroQ', 'FiltroTipo', 'FiltroEstado', 'FiltroArea', 'FiltroDesde', 'FiltroHasta'].forEach((suf) => {
        const el = document.getElementById(`${p}${suf}`);
        if (el) el.value = '';
      });
      loadCuadro(true);
    };
  }
  const q = document.getElementById(`${p}FiltroQ`);
  if (q) {
    q.onkeydown = (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        loadCuadro(true);
      }
    };
  }
  loadCuadro(true);
}
