// Cuadro Comparativo — bandeja por Solicitud de Cotización (RC8.0 refresh no destructivo)
import { contratacionesService } from '../../services/contratacionesService.js';
import { bandejaTableStyles, renderActionMenuCell, bindActionMenus } from '../../utils/trazabilidad.js';
import { actosBandejaStyles } from '../../utils/actosModals.js';
import { bindBandejaToolbar } from '../../utils/bandejaUi.js';
import { usePagination } from '../../utils/paginacion.js';
import {
  formatRequerimientosCuadro,
  buildCuadroStats,
  renderCuadroStatsHtml,
  updateCuadroStatsDom,
  labelCuadroEstado,
  badgeClassCuadro,
  cuadroComparativoMenuItems,
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
import {
  getActuarComoAdmin,
  setActuarComoAdmin,
  resolveActuarComoDesdeUi,
  renderBannerAdminPrueba,
} from '../../utils/cuadroComparativoAdminPrueba.js';
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
      title: 'Cuadro Comparativo — Supervisión',
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
                <span class="badge bg-${esc(badgeClassCuadro(det.estado_cuadro))}">${esc(det.estado_cuadro_label || labelCuadroEstado(det.estado_cuadro))}</span>
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

async function openElaborarCuadro(solicitudId) {
  const row = expedientesCache.find((e) => String(e.solicitud_id) === String(solicitudId));
  const tipo = String(row?.tipo || '').toLowerCase();
  const esBien = !tipo || tipo === 'bien' || tipo === 'bienes' || tipo === 'b';
  const esServicio = tipo === 'servicio' || tipo === 'servicios' || tipo === 's';
  if (tipo && !esBien && !esServicio) {
    alert(`El cuadro comparativo elabora Bienes (08-A) y Servicios (08-B). Tipo actual: ${row?.tipo || '—'}.`);
    return;
  }
  await showElaborarCuadroModal(solicitudId, () => loadCuadro(false));
}

async function openExpedienteCoordinador(solicitudId) {
  closeBandejaDropdowns();
  await showExpedienteCoordinadorModal(solicitudId, () => loadCuadro(false));
}

async function openExpedienteDec(solicitudId) {
  closeBandejaDropdowns();
  await showExpedienteDecModal(solicitudId, () => loadCuadro(false));
}

/** Admin RC8.5-G: modo prueba (actuar como) sin cambiar sesión ni rol real. */
async function openExpedienteAdmin(solicitudId) {
  closeBandejaDropdowns();
  const row = expedientesCache.find((e) => String(e.solicitud_id) === String(solicitudId));
  const estado = row?.estado_cuadro || row?.estado || '';
  const sugerido = resolveModoAperturaExpediente(estado, ROLES_REVISION.ADMINISTRADOR);
  const actuarComo = resolveActuarComoDesdeUi(getActuarComoAdmin() || sugerido) || sugerido;
  setActuarComoAdmin(actuarComo);

  if (actuarComo === ROLES_REVISION.ANALISTA && sugerido === ROLES_REVISION.ANALISTA) {
    await showElaborarCuadroModal(solicitudId, () => loadCuadro(false));
    return;
  }
  if (sugerido === ROLES_REVISION.ANALISTA && actuarComo !== ROLES_REVISION.ANALISTA) {
    // Etapa de elaboración: permitir abrir elaborar; el selector de contexto vive en revisión
    await showElaborarCuadroModal(solicitudId, () => loadCuadro(false));
    return;
  }
  await showExpedienteRevisionModal(solicitudId, () => loadCuadro(false), {
    modo: sugerido === ROLES_REVISION.DEC ? ROLES_REVISION.DEC : ROLES_REVISION.COORDINADOR_CM,
    adminPrueba: true,
    actuarComo: actuarComo === ROLES_REVISION.ANALISTA ? sugerido : actuarComo,
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

function buildCuadroTheadHtml({ modoCoord, modoDec, modoAdmin }) {
  if (modoCoord || modoDec || modoAdmin) {
    return `<tr>
      <th>Solicitud</th>
      <th>Requerimiento</th>
      <th>Proveedor</th>
      ${modoCoord ? '<th>Tipo</th>' : ''}
      <th class="text-center">Versión</th>
      <th>Estado</th>
      <th>Responsable</th>
      <th>Fecha</th>
      <th>Acciones</th>
    </tr>`;
  }
  return `<tr>
    <th>Solicitud</th>
    <th>Requerimiento</th>
    <th class="text-center">Versión</th>
    <th>Estado</th>
    <th>Responsable actual</th>
    <th>Fecha</th>
    <th>Acciones</th>
  </tr>`;
}

function buildCuadroRowHtml(c, { modoCoord, modoDec, modoAdmin, rolUi }) {
  const menu = cuadroComparativoMenuItems(c, { rol: rolUi || c.rol_revision });
  if (modoCoord || modoDec || modoAdmin) {
    return `
      <tr data-row-id="${c.solicitud_id}">
        <td><strong>${esc(c.solicitud_codigo)}</strong>
          <div class="small text-muted">${esc((c.denominacion || '').slice(0, 48))}</div>
        </td>
        <td>${formatRequerimientosCuadro(c, esc)}</td>
        <td class="small">${esc(c.proveedor_display || c.proveedores_nombres || '—')}</td>
        ${modoCoord ? `<td class="small">${esc(c.tipo || '—')}</td>` : ''}
        <td class="text-center small">${c.version != null ? `v${esc(c.version)}` : '—'}</td>
        <td><span class="badge bg-${esc(c.estado_cuadro_badge || badgeClassCuadro(c.estado_cuadro))}">${esc(c.estado_cuadro_label || labelCuadroEstado(c.estado_cuadro))}</span></td>
        <td class="small">${esc(c.responsable_actual || c.responsable_revision || '—')}</td>
        <td class="small">${esc(fmtFecha(c.fecha_actualizacion || c.fecha_ingreso_cuadro))}</td>
        ${renderActionMenuCell(c.solicitud_id, menu, '')}
      </tr>`;
  }
  return `
    <tr data-row-id="${c.solicitud_id}">
      <td><strong>${esc(c.solicitud_codigo)}</strong>
        <div class="small text-muted">${esc((c.denominacion || '').slice(0, 48))}</div>
      </td>
      <td>${formatRequerimientosCuadro(c, esc)}</td>
      <td class="text-center small">${c.version != null ? `v${esc(c.version)}` : '—'}</td>
      <td><span class="badge bg-${esc(c.estado_cuadro_badge || badgeClassCuadro(c.estado_cuadro))}">${esc(c.estado_cuadro_label || labelCuadroEstado(c.estado_cuadro))}</span></td>
      <td class="small">${esc(c.responsable_actual || c.responsable_revision || '—')}</td>
      <td class="small">${esc(fmtFecha(c.fecha_actualizacion || c.fecha_ingreso_cuadro))}</td>
      ${renderActionMenuCell(c.solicitud_id, menu, '')}
    </tr>`;
}

function cuadroEmptyMessage({ modoCoord, modoDec }) {
  if (modoCoord) return 'No hay expedientes derivados al Coordinador CM.';
  if (modoDec) return 'No hay expedientes derivados al DEC.';
  return 'No hay solicitudes con cotizaciones APTO para el cuadro comparativo.';
}

function cuadroHintText({ modoCoord, modoDec, modoAdmin }) {
  if (modoCoord) {
    return 'Expedientes derivados desde el Analista. Use Abrir expediente para firmar, observar, dar conformidad y derivar al DEC.';
  }
  if (modoDec) {
    return 'Expedientes derivados desde el Coordinador CM. Use Abrir expediente para la revisión DEC.';
  }
  if (modoAdmin) {
    return 'Modo Administrador (pruebas): abra el expediente y use «Actuar como» Analista / Coordinador CM / DEC sin cerrar sesión. El rol real no cambia.';
  }
  return 'Una fila por Solicitud de Cotización. La bandeja cambia según rol y etapa. En revisión externa: Ver / Descargar / Trazabilidad.';
}

function ensureCuadroChrome(shell, { modoAdmin, adminChrome, hint }) {
  if (!shell?.outer) return;
  let chromeHost = document.getElementById('cuadroCompChrome');
  if (!chromeHost) {
    chromeHost = document.createElement('div');
    chromeHost.id = 'cuadroCompChrome';
    shell.outer.insertBefore(chromeHost, shell.wrap);
  }
  if (modoAdmin) {
    if (!chromeHost.querySelector('#ccAdminActuarComo')) {
      chromeHost.innerHTML = adminChrome || '';
      chromeHost.querySelector('#ccAdminActuarComo')?.addEventListener('change', (ev) => {
        setActuarComoAdmin(ev.target.value);
        loadCuadro(false);
      });
    }
  } else if (chromeHost.innerHTML) {
    chromeHost.innerHTML = '';
  }

  let hintEl = document.getElementById('cuadroCompHint');
  if (!hintEl) {
    hintEl = document.createElement('p');
    hintEl.id = 'cuadroCompHint';
    hintEl.className = 'small text-muted mb-2';
    shell.outer.insertBefore(hintEl, shell.wrap);
  }
  hintEl.textContent = hint;
}

function bindCuadroActionMenus(cont, { modoCoord, modoDec, modoAdmin }) {
  bindActionMenus(cont, {
    verExpediente: (id) => showVerExpediente(id),
    verValidaciones: (id) => showVerValidaciones(id),
    elaborarCuadro: (id) => openElaborarCuadro(id),
    verCuadro: (id) => {
      if (modoCoord) return openExpedienteCoordinador(id);
      if (modoDec) return openExpedienteDec(id);
      if (modoAdmin) return openExpedienteAdmin(id);
      return openElaborarCuadro(id);
    },
    abrirExpedienteCoord: (id) => openExpedienteCoordinador(id),
    abrirExpedienteDec: (id) => openExpedienteDec(id),
    abrirExpedienteAdmin: (id) => openExpedienteAdmin(id),
    descargarCuadro: (id) => openDescargarCuadro(id),
    trazabilidadCuadro: (id) => openTrazabilidadCuadro(id),
  });
}

async function loadCuadro(resetPage = false) {
  if (lifecycle && !lifecycle.isActive()) return;
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  const modoCoord = isModoBandejaCoordinador();
  const modoDec = isModoBandejaDec();
  const modoAdmin = isModoBandejaAdmin();
  const rolSesion = rolBandejaActual();
  const rolUi = modoCoord ? 'COORDINADOR_CM'
    : (modoDec ? 'DEC' : (modoAdmin ? 'ADMINISTRADOR' : rolSesion));

  const hadShell = !!document.getElementById('cuadroCompBody');
  if (hadShell) captureScroll(VIEW_ID, SCROLL_SEL);

  const shell = ensureBandejaTableShell(cont, {
    outerId: 'cuadroCompOuter',
    wrapId: 'cuadroCompWrap',
    theadId: 'cuadroCompHead',
    tbodyId: 'cuadroCompBody',
    emptyId: 'cuadroCompEmpty',
    outerClass: 'sgc-bandeja-wrap',
    wrapClass: 'table-responsive',
    tableClass: 'table table-sm table-hover table-bordered mb-0 align-middle',
  });

  const adminChrome = modoAdmin
    ? renderBannerAdminPrueba(resolveActuarComoDesdeUi(getActuarComoAdmin()
      || ROLES_REVISION.COORDINADOR_CM) || ROLES_REVISION.COORDINADOR_CM)
    : '';
  ensureCuadroChrome(shell, {
    modoAdmin,
    adminChrome,
    hint: cuadroHintText({ modoCoord, modoDec, modoAdmin }),
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
      shell.thead.innerHTML = buildCuadroTheadHtml({ modoCoord, modoDec, modoAdmin });
      shell.tbody.innerHTML = '';
      setEmptyState(shell, {
        empty: true,
        message: cuadroEmptyMessage({ modoCoord, modoDec }),
      });
      refreshIndicator?.hide();
      return;
    }

    setEmptyState(shell, { empty: false });
    shell.thead.innerHTML = buildCuadroTheadHtml({ modoCoord, modoDec, modoAdmin });
    shell.tbody.innerHTML = rows.map((c) => buildCuadroRowHtml(c, {
      modoCoord, modoDec, modoAdmin, rolUi,
    })).join('');

    bindCuadroActionMenus(cont, { modoCoord, modoDec, modoAdmin });
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
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
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
  lifecycle.addCleanup(() => loadGuard.abortCurrent());
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
