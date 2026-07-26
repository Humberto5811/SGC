// Recepción de Cotizaciones — bandeja analista CM (RC8.0 refresh no destructivo)
import { contratacionesService } from '../../services/contratacionesService.js';
import { bandejaTableStyles, renderActionMenuCell, bindActionMenus } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { usePagination } from '../../utils/paginacion.js';
import { showEnviarValidarModal } from '../../utils/derivarValidacionModal.js';
import { renderPropuestaTecnicaRecepcion, renderPropuestaEconomicaRecepcion } from '../../utils/recepcionPropuestaRows.js';
import { recepcionCotizacionesMenuItems } from '../../utils/bandejaActions.js';
import { formatRequerimientosBandeja } from '../../utils/recepcionCotizacionUtils.js';
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

<<<<<<< HEAD
const API_BASE = 'http://localhost:3000/api';
const VIEW_ID = 'recepcion-cotizaciones';
const SCROLL_SEL = '#recepCotWrap';
const loadGuard = createRequestSequenceGuard();
let lifecycle = null;
let refreshIndicator = null;
=======
const API_BASE = '/api';
>>>>>>> 3fcfe8b (Respaldo local VPS antes de integrar RC8)

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

let cotizacionesCache = [];
let filtroEstado = '';
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

function updateRecepcionSummaryCards(rows, containerId) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const all = Array.isArray(rows) ? rows : [];
  const norm = (c) => String(c.validacion_estado || '').toUpperCase();
  const counts = {
    total: all.length,
    enCotizacion: all.filter((c) => !norm(c) || norm(c) === 'PENDIENTE').length,
    enviadosValidar: all.filter((c) => ['DERIVADA', 'EN_PROCESO'].includes(norm(c))).length,
    validadosUsuario: all.filter((c) => ['APTO', 'NO_APTO', 'OBSERVADO'].includes(norm(c))).length,
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
  el.addEventListener('hidden.bs.modal', () => wrap.remove(), { once: true });
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

function buildLoadParams() {
  const params = {};
  if (filtroEstado) params.estado = filtroEstado;
  return params;
}

const RECEPCION_THEAD = `<tr>
  <th>Solicitud</th><th>Requerimiento</th><th>Proveedor</th><th>Monto ofertado</th>
  <th>Fecha recepción</th><th>Estado</th><th>Acciones</th>
</tr>`;

function buildRecepcionRowHtml(c) {
  const estadoLabel = labelEstadoRecepcion(c);
  const responsableHint = c.validacion_responsable && estadoLabel === 'Enviada a validación AU'
    ? `<div class="small text-muted">${esc(c.validacion_responsable)}</div>` : '';
  return `
    <tr data-row-id="${c.id}">
      <td>
        <strong>${esc(c.solicitud_codigo)}</strong>
        <div class="small text-muted">${esc((c.denominacion || c.objeto || '').slice(0, 60))}</div>
      </td>
      <td class="small">${formatRequerimientosBandeja(c, esc)}</td>
      <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
      <td class="text-end">${fmtMonto(c.monto, c.moneda)}</td>
      <td class="small">${esc(fmtFecha(c.fecha_presentacion || c.created_at))}</td>
      <td>
        <span class="badge bg-${badgeEstadoRecepcion(c.validacion_estado)}">${esc(estadoLabel)}</span>
        ${responsableHint}
      </td>
      ${renderActionMenuCell(c.id, recepcionCotizacionesMenuItems(c), '')}
    </tr>`;
}

async function loadCotizaciones(resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;

  const hadShell = !!document.getElementById('recepCotBody');
  if (hadShell) captureScroll(VIEW_ID, SCROLL_SEL);

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
  const isBg = hadShell && cotizacionesCache.length > 0;
  if (isBg) refreshIndicator?.show('Actualizando…');

  try {
    if (resetPage) recepcionPagination.resetPage();
    const result = await recepcionPagination.loadData(buildLoadParams(), resetPage);
    if (!request.isCurrent() || (lifecycle && !lifecycle.isActive())) return;

    const rows = result.data || [];
    cotizacionesCache = result.allData || rows;
    updateRecepcionSummaryCards(cotizacionesCache, `${VIEW_CONFIG.prefix}TrazaSummary`);

    if (!shell?.tbody || !shell?.thead) return;

    if (!rows.length && !cotizacionesCache.length) {
      shell.thead.innerHTML = RECEPCION_THEAD;
      shell.tbody.innerHTML = '';
      setEmptyState(shell, { empty: true, message: 'No hay cotizaciones recibidas de proveedores.' });
      refreshIndicator?.hide();
      return;
    }

    setEmptyState(shell, { empty: false });
    shell.thead.innerHTML = RECEPCION_THEAD;
    shell.tbody.innerHTML = rows.map(buildRecepcionRowHtml).join('');

    bindActionMenus(cont, {
      verPropuesta: (id) => showCotizacionDetalleModal(id),
      enviarValidar: (id) => {
        const row = (cotizacionesCache || []).find((r) => String(r.id) === String(id));
        const v = String(row?.validacion_estado || '').toUpperCase();
        const esDevolucion = ['OBSERVADO', 'NO_APTO', 'APTO'].includes(v);
        showEnviarValidarModal(id, {
          title: esDevolucion ? 'Devolver a Validación AU' : 'Enviar a validar',
          submitLabel: esDevolucion ? 'Devolver a Área Usuaria' : 'Enviar a validar',
          requireObservacion: esDevolucion,
          onSuccess: () => loadCotizaciones(true),
        });
      },
    });
    recepcionPagination.renderControls('recepCotOuter', () => loadCotizaciones(false));
    restoreScroll(VIEW_ID, SCROLL_SEL);
    refreshIndicator?.hide();
  } catch (err) {
    if (isAbortError(err) || !request.isCurrent()) return;
    if (lifecycle && !lifecycle.isActive()) return;
    if (hadShell && cotizacionesCache.length) {
      refreshIndicator?.error('No se pudo actualizar. Se conservan los datos actuales.');
    } else {
      cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
    }
  }
}

export function initRecepcionCotizacionesView() {
  lifecycle = createViewLifecycle(VIEW_ID);
  lifecycle.addCleanup(() => loadGuard.abortCurrent());
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
