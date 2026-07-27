// Recepción de Cotizaciones — bandeja consolidada por Solicitud (RC8.0 refresh no destructivo)
import { contratacionesService } from '../../services/contratacionesService.js';
import { bandejaTableStyles } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { usePagination, getPaginationState, updatePaginationState } from '../../utils/paginacion.js';
import { showEnviarValidarModal } from '../../utils/derivarValidacionModal.js';
import { renderPropuestaTecnicaRecepcion, renderPropuestaEconomicaRecepcion } from '../../utils/recepcionPropuestaRows.js';
import { puedeEnviarValidarRecepcion } from '../../utils/recepcionCotizacionUtils.js';
import {
  formatRequerimientosBandeja,
  formatCentrosBandeja,
  consolidarExpedientesRecepcion,
  renderBadgeEstadoRecepcionHtml,
} from '../../utils/recepcionCotizacionUtils.js';
import { closeBandejaActionMenus } from '../../utils/bandejaUi.js';
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
const VIEW_ID = 'recepcion-cotizaciones';
const SCROLL_SEL = '#recepCotWrap';
const loadGuard = createRequestSequenceGuard();
let lifecycle = null;
let refreshIndicator = null;
let cotizacionesCache = [];
let expedientesCache = [];
let filtroEstado = '';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  const sym = moneda === 'PEN' ? 'S/' : moneda;
  return `${sym} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      return h;
    }
  } catch (_) { /* noop */ }
  return {};
}

function labelEstadoRecepcion(c) {
  return c.estado_recepcion || mapEstadoRecepcion(c.validacion_estado);
}

function mapEstadoRecepcion(validacionEstado) {
  const v = String(validacionEstado || '').toUpperCase();
  if (v === 'DERIVADA' || v === 'EN_PROCESO') return 'Enviada a validación AU';
  if (['APTO', 'NO_APTO', 'OBSERVADO'].includes(v)) return 'Validada por área usuaria';
  return 'Cotización presentada';
}

function badgeEstadoRecepcion(validacionEstado) {
  const label = mapEstadoRecepcion(validacionEstado);
  if (label === 'Enviada a validación AU') return 'info text-dark';
  if (label === 'Validada por área usuaria') return 'success';
  return 'primary';
}

async function openCotizacionDoc(cotId, ref, inline = false) {
  const url = `${API_BASE}/contrataciones/portal-analista/cotizaciones/${cotId}/documento/${encodeURIComponent(ref)}/${inline ? 'ver' : 'descargar'}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || 'No se pudo abrir el documento');
  }
  const blob = await res.blob();
  if (!(blob instanceof Blob) || !blob.size) throw new Error('Documento vacío o no disponible');
  const disp = res.headers.get('Content-Disposition') || '';
  let nombre = 'documento';
  const m = disp.match(/filename="([^"]+)"/);
  if (m) nombre = decodeURIComponent(m[1]);
  const objUrl = URL.createObjectURL(blob);
  if (inline) {
    window.open(objUrl, '_blank');
    setTimeout(() => URL.revokeObjectURL(objUrl), 60000);
    return;
  }
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
}

const VIEW_CONFIG = {
  prefix: 'recepCot',
  title: 'Recepción de Cotizaciones',
  icon: 'bi-inbox',
  description: 'Bandeja de expedientes en recepción y registro de cotizaciones.',
  listId: 'recepCotList',
};

const recepcionPagination = usePagination(
  'recepcion',
  (params) => contratacionesService.listRecepcionCotizaciones(params),
  { defaultPageSize: 25, pageSizeOptions: [25, 50, 100] },
);

function renderRecepcionSummaryCards(containerId) {
  return `
    <div id="${containerId}" class="row g-2 mb-3 traza-summary-cards">
      <div class="col-6 col-md">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Total expedientes</div>
          <div class="kpi-value text-dark" data-recep-kpi="total">0</div>
        </div>
      </div>
      <div class="col-6 col-md">
        <div class="sgc-kpi-card">
          <div class="kpi-label">En cotización</div>
          <div class="kpi-value text-primary" data-recep-kpi="enCotizacion">0</div>
        </div>
      </div>
      <div class="col-6 col-md">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Enviados a validar</div>
          <div class="kpi-value text-info" data-recep-kpi="enviadosValidar">0</div>
        </div>
      </div>
      <div class="col-6 col-md">
        <div class="sgc-kpi-card">
          <div class="kpi-label">Validados por usuario</div>
          <div class="kpi-value text-success" data-recep-kpi="validadosUsuario">0</div>
        </div>
      </div>
    </div>`;
}

function updateRecepcionSummaryCards(expedientes, containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const all = Array.isArray(expedientes) ? expedientes : [];
  const counts = {
    total: all.length,
    enCotizacion: all.filter((e) => e.validacion_estado === 'PENDIENTE' || !e.validacion_estado).length,
    enviadosValidar: all.filter((e) => e.validacion_estado === 'DERIVADA').length,
    validadosUsuario: all.filter((e) => e.validacion_estado === 'VALIDADA_AU').length,
  };
  Object.entries(counts).forEach(([k, v]) => {
    const el = root.querySelector(`[data-recep-kpi="${k}"]`);
    if (el) el.textContent = String(v);
  });
}

function renderRecepcionFilterBar(prefix) {
  return `
    <div class="sgc-search-bar mb-3">
      <div class="row g-2 align-items-end">
        <div class="col-md-3">
          <label class="form-label small mb-0">Estado</label>
          <select class="form-select form-select-sm" id="${prefix}FiltroEstado">
            <option value="">Todos</option>
            <option value="PENDIENTE">Cotización presentada</option>
            <option value="ENVIADA_VALIDACION">Enviada a validación AU</option>
            <option value="VALIDADA_AU">Validada por área usuaria</option>
          </select>
        </div>
        <div class="col-md-3 d-flex gap-2">
          <button type="button" class="btn btn-sm btn-primary" id="${prefix}FiltroBtn">
            <i class="bi bi-funnel"></i> Filtrar
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="${prefix}FiltroLimpiar">Limpiar</button>
        </div>
      </div>
    </div>`;
}

function renderDocumentosList(cotId, documentos) {
  if (!documentos?.length) {
    return '<div class="text-muted small">No hay documentos adjuntos en esta cotización.</div>';
  }
  const grupos = {};
  documentos.forEach((d) => {
    const g = d.grupo || 'Documentos';
    if (!grupos[g]) grupos[g] = [];
    grupos[g].push(d);
  });
  return Object.entries(grupos).map(([grupo, docs]) => `
    <div class="mb-3">
      <div class="fw-semibold small text-muted mb-1">${esc(grupo)}</div>
      <ul class="list-group list-group-flush border rounded">
        ${docs.map((d) => `
          <li class="list-group-item d-flex justify-content-between align-items-center py-2">
            <span class="small"><i class="bi bi-file-earmark-text text-primary"></i> ${esc(d.nombre)}</span>
            <span class="btn-group btn-group-sm">
              <button type="button" class="btn btn-outline-secondary rc-doc-ver" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Ver</button>
              <button type="button" class="btn btn-outline-primary rc-doc-dl" data-cot-id="${cotId}" data-ref="${esc(d.ref)}">Descargar</button>
            </span>
          </li>`).join('')}
      </ul>
    </div>`).join('');
}

function bindDocumentoButtons(container) {
  container.querySelectorAll('.rc-doc-ver').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, true);
      } catch (err) { alert(err.message); }
    };
  });
  container.querySelectorAll('.rc-doc-dl').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await openCotizacionDoc(btn.dataset.cotId, btn.dataset.ref, false);
      } catch (err) { alert(err.message); }
    };
  });
}

async function showCotizacionDetalleModal(cotId) {
  closeBandejaActionMenus();
  const id = `rcDetModal_${Date.now()}`;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title"><i class="bi bi-inbox"></i> Cotización recibida</h5>
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
  el.addEventListener('hidden.bs.modal', () => {
    closeBandejaActionMenus();
    wrap.remove();
  }, { once: true });
  modal.show();

  try {
    const resp = await contratacionesService.getRecepcionCotizacionDetalle(cotId);
    const c = resp.data || {};
    const datos = c.datos_proveedor || {};
    const body = document.getElementById(`${id}_body`);
    body.innerHTML = `
      <div class="card border-0 bg-light mb-3">
        <div class="card-body py-3">
          <div class="row g-2 small">
            <div class="col-md-4">
              <span class="text-muted d-block">Solicitud</span>
              <strong>${esc(c.solicitud_codigo)}</strong>
              <div class="text-muted">${esc(c.denominacion || c.objeto || '')}</div>
            </div>
            <div class="col-md-4">
              <span class="text-muted d-block">Proveedor</span>
              <strong>${esc(c.razon_social)}</strong>
              <div class="text-muted">RUC ${esc(c.ruc)}</div>
            </div>
            <div class="col-md-4">
              <span class="text-muted d-block">Fecha de envío</span>
              <strong>${esc(fmtFecha(c.fecha_presentacion))}</strong>
              <div class="mt-1">
                <span class="badge bg-${badgeEstadoRecepcion(c.validacion_estado)}">${esc(mapEstadoRecepcion(c.validacion_estado))}</span>
              </div>
              ${c.validacion_responsable ? `<div class="text-muted mt-1">Responsable AU: ${esc(c.validacion_responsable)}</div>` : ''}
            </div>
            <div class="col-md-4">
              <span class="text-muted d-block">Monto total ofertado</span>
              <strong>${fmtMonto(c.monto, c.moneda)}</strong>
            </div>
            <div class="col-md-8">
              <span class="text-muted d-block">Contacto proveedor</span>
              ${esc(datos.persona_contacto || '—')} · ${esc(datos.correo || '—')} · ${esc(datos.celular || '—')}
            </div>
          </div>
        </div>
      </div>
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#${id}_tabDocs" type="button">Documentos</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#${id}_tabTec" type="button">Propuesta técnica</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#${id}_tabEco" type="button">Propuesta económica</button></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="${id}_tabDocs">
          ${renderDocumentosList(c.id, c.documentos)}
        </div>
        <div class="tab-pane fade" id="${id}_tabTec">
          ${renderPropuestaTecnicaRecepcion(c, esc)}
        </div>
        <div class="tab-pane fade" id="${id}_tabEco">
          ${renderPropuestaEconomicaRecepcion(c, esc, fmtMonto)}
        </div>
      </div>`;
    bindDocumentoButtons(body);
  } catch (err) {
    document.getElementById(`${id}_body`).innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

function renderAccionCotizacion(c) {
  const v = String(c.validacion_estado || '').toUpperCase();
  const puedeDevolver = c.estado === 'COTIZACION_PRESENTADA' && ['OBSERVADO', 'NO_APTO', 'APTO'].includes(v);
  const buttons = [
    `<button type="button" class="btn btn-sm btn-outline-secondary rc-cot-ver" data-id="${c.id}">
      <i class="bi bi-eye"></i> Ver propuesta
    </button>`,
  ];
  if (puedeEnviarValidarRecepcion(c)) {
    buttons.push(`<button type="button" class="btn btn-sm btn-primary rc-cot-enviar" data-id="${c.id}">
      <i class="bi bi-send"></i> Enviar a validar
    </button>`);
  } else if (puedeDevolver) {
    buttons.push(`<button type="button" class="btn btn-sm btn-warning rc-cot-enviar" data-id="${c.id}">
      <i class="bi bi-arrow-counterclockwise"></i> Devolver a Validación AU
    </button>`);
  }
  return `<div class="d-flex flex-wrap gap-1 justify-content-center">${buttons.join('')}</div>`;
}

function showExpedienteDetalleModal(expediente) {
  closeBandejaActionMenus();
  const id = `rcExpModal_${Date.now()}`;
  const cots = expediente?.cotizaciones || [];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal fade" id="${id}" tabindex="-1">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header bg-light">
            <h5 class="modal-title">
              <i class="bi bi-collection"></i> Cotizaciones recibidas — ${esc(expediente.solicitud_codigo || '')}
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="${id}_body">
            <div class="mb-3 small">
              <div><strong>${esc(expediente.solicitud_codigo || '')}</strong> — ${esc(expediente.denominacion || expediente.objeto || '')}</div>
              <div class="text-muted mt-1">
                Requerimiento(s): ${esc(expediente.requerimientos_texto || '—')}
                · Centro: ${esc(expediente.centros_texto || '—')}
                · Cotizaciones: <strong>${cots.length}</strong>
              </div>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover table-bordered mb-0">
                <thead class="table-light"><tr>
                  <th>Proveedor</th><th>Monto ofertado</th>
                  <th>Fecha recepción</th><th>Estado</th><th class="text-center">Acciones</th>
                </tr></thead>
                <tbody>
                  ${cots.map((c) => {
                    const estadoLabel = labelEstadoRecepcion(c);
                    const responsableHint = c.validacion_responsable && estadoLabel === 'Enviada a validación AU'
                      ? `<div class="small text-muted">${esc(c.validacion_responsable)}</div>` : '';
                    return `
                    <tr>
                      <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
                      <td class="text-end">${fmtMonto(c.monto, c.moneda)}</td>
                      <td class="small">${esc(fmtFecha(c.fecha_presentacion || c.created_at))}</td>
                      <td>
                        <span class="badge bg-${badgeEstadoRecepcion(c.validacion_estado)}">${esc(estadoLabel)}</span>
                        ${responsableHint}
                      </td>
                      <td class="text-center">${renderAccionCotizacion(c)}</td>
                    </tr>`;
                  }).join('') || '<tr><td colspan="5" class="text-muted text-center">Sin cotizaciones</td></tr>'}
                </tbody>
              </table>
            </div>
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
  el.addEventListener('hidden.bs.modal', () => {
    closeBandejaActionMenus();
    wrap.remove();
  }, { once: true });
  modal.show();

  const body = document.getElementById(`${id}_body`);
  body?.querySelectorAll('.rc-cot-ver').forEach((btn) => {
    btn.onclick = () => showCotizacionDetalleModal(btn.dataset.id);
  });
  body?.querySelectorAll('.rc-cot-enviar').forEach((btn) => {
    btn.onclick = () => {
      const row = (cotizacionesCache || []).find((r) => String(r.id) === String(btn.dataset.id));
      const v = String(row?.validacion_estado || '').toUpperCase();
      const esDevolucion = ['OBSERVADO', 'NO_APTO', 'APTO'].includes(v);
      showEnviarValidarModal(btn.dataset.id, {
        title: esDevolucion ? 'Devolver a Validación AU' : 'Enviar a validar',
        submitLabel: esDevolucion ? 'Devolver a Área Usuaria' : 'Enviar a validar',
        requireObservacion: esDevolucion,
        onSuccess: () => {
          modal.hide();
          loadCotizaciones(true);
        },
      });
    };
  });
}

function buildLoadParams() {
  const params = {};
  if (filtroEstado) params.estado = filtroEstado;
  return params;
}

const RECEPCION_THEAD = `<tr>
  <th>Solicitud de cotización</th>
  <th>Requerimiento</th>
  <th>Centro</th>
  <th class="text-center">Cantidad</th>
  <th>Estado</th>
  <th class="text-center">Ver</th>
</tr>`;

function buildRecepcionRowHtml(exp) {
  const n = Number(exp.cantidad_cotizaciones) || (exp.cotizaciones || []).length || 0;
  return `
    <tr data-row-id="${esc(exp.solicitud_id)}">
      <td>
        <strong>${esc(exp.solicitud_codigo)}</strong>
        <div class="small text-muted">${esc((exp.denominacion || exp.objeto || '').slice(0, 80))}</div>
      </td>
      <td class="small">${formatRequerimientosBandeja(exp, esc)}</td>
      <td class="small">${formatCentrosBandeja(exp, esc)}</td>
      <td class="text-center small">${esc(String(n))} cotizaci${n === 1 ? 'ón' : 'ones'}</td>
      <td>
        ${renderBadgeEstadoRecepcionHtml(exp, esc)}
      </td>
      <td class="text-center">
        <button type="button" class="btn btn-sm btn-outline-primary rc-exp-ver"
          data-solicitud-id="${esc(exp.solicitud_id)}">
          <i class="bi bi-eye"></i> Ver
        </button>
      </td>
    </tr>`;
}

async function loadCotizaciones(resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;

  const hadShell = !!document.getElementById('recepCotBody');
  if (hadShell) captureScroll(VIEW_ID, SCROLL_SEL);
  closeBandejaActionMenus(cont);

  const shell = ensureBandejaTableShell(cont, {
    outerId: 'recepCotOuter',
    wrapId: 'recepCotWrap',
    theadId: 'recepCotHead',
    tbodyId: 'recepCotBody',
    emptyId: 'recepCotEmpty',
    outerClass: 'sgc-bandeja-wrap',
    wrapClass: 'table-responsive',
    tableClass: 'table table-sm table-hover table-bordered mb-0',
  });

  const request = loadGuard.begin();
  if (lifecycle) lifecycle.addAbortController(request.controller);
  const isBg = hadShell && expedientesCache.length > 0;
  if (isBg) refreshIndicator?.show('Actualizando…');

  try {
    if (resetPage) recepcionPagination.resetPage();
    const result = await recepcionPagination.loadData(buildLoadParams(), resetPage);
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    const flat = result.allData || result.data || [];
    cotizacionesCache = flat;
    expedientesCache = consolidarExpedientesRecepcion(flat);
    updateRecepcionSummaryCards(expedientesCache, `${VIEW_CONFIG.prefix}TrazaSummary`);

    if (!shell?.tbody || !shell?.thead) return;

    if (!expedientesCache.length) {
      shell.thead.innerHTML = RECEPCION_THEAD;
      shell.tbody.innerHTML = '';
      setEmptyState(shell, { empty: true, message: 'No hay cotizaciones recibidas de proveedores.' });
      refreshIndicator?.hide();
      return;
    }

    const state = getPaginationState('recepcion');
    const totalPages = Math.max(1, Math.ceil(expedientesCache.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    updatePaginationState('recepcion', {
      total: expedientesCache.length,
      totalPages,
      isVirtual: true,
    });
    const start = (state.page - 1) * state.pageSize;
    const pageExpedientes = expedientesCache.slice(start, start + state.pageSize);

    setEmptyState(shell, { empty: false });
    shell.thead.innerHTML = RECEPCION_THEAD;
    shell.tbody.innerHTML = pageExpedientes.map(buildRecepcionRowHtml).join('');

    cont.querySelectorAll('.rc-exp-ver').forEach((btn) => {
      btn.onclick = () => {
        const sid = btn.dataset.solicitudId;
        const exp = expedientesCache.find((e) => String(e.solicitud_id) === String(sid));
        if (exp) showExpedienteDetalleModal(exp);
      };
    });
    recepcionPagination.renderControls('recepCotOuter', () => loadCotizaciones(false));
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

export function renderRecepcionCotizacionesView() {
  const { prefix, title, icon, description, listId } = VIEW_CONFIG;
  return `
    <div class="container-fluid actos-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi ${esc(icon)}"></i> ${esc(title)}</h3>
          <p class="text-muted mb-0">${esc(description)}</p>
        </div>
        <div class="d-flex gap-2 align-items-center">
          <span id="recepCotBgRefreshHost"></span>
          <button id="${esc(prefix)}Reload" type="button" class="btn btn-sm btn-outline-secondary">
            <i class="bi bi-arrow-clockwise"></i> Actualizar
          </button>
        </div>
      </div>
      ${renderRecepcionSummaryCards(`${prefix}TrazaSummary`)}
      ${renderRecepcionFilterBar(prefix)}
      <hr/>
      <div id="${esc(listId)}" class="sgc-bandeja-wrap actos-bandeja-wrap">
        <div class="text-muted">Cargando…</div>
      </div>
    </div>
  `;
}

export function initRecepcionCotizacionesView() {
  lifecycle = createViewLifecycle(VIEW_ID);
  lifecycle.addCleanup(() => {
    loadGuard.abortCurrent();
    closeBandejaActionMenus();
  });
  refreshIndicator = createBackgroundRefreshIndicator('#recepCotBgRefreshHost', { id: 'recepCotBgRefresh' });

  const { prefix } = VIEW_CONFIG;
  document.getElementById(`${prefix}FiltroBtn`)?.addEventListener('click', () => {
    filtroEstado = document.getElementById(`${prefix}FiltroEstado`)?.value || '';
    loadCotizaciones(true);
  });
  document.getElementById(`${prefix}FiltroLimpiar`)?.addEventListener('click', () => {
    filtroEstado = '';
    const sel = document.getElementById(`${prefix}FiltroEstado`);
    if (sel) sel.value = '';
    loadCotizaciones(true);
  });
  const reload = document.getElementById(`${prefix}Reload`);
  if (reload) reload.onclick = () => loadCotizaciones(true);
  loadCotizaciones();
}
