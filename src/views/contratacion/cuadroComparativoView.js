// Cuadro Comparativo — bandeja por Solicitud de Cotización (RC8.1)
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

const API_BASE = 'http://localhost:3000/api';

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

const VIEW_CONFIG = {
  prefix: 'cuadroComp',
  title: 'Cuadro Comparativo',
  icon: 'bi-table',
  description: 'Expedientes con validación técnica APTO — elaborados por Solicitud de Cotización.',
  listId: 'cuadroCompList',
};

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
  if (tipo && tipo !== 'bien' && tipo !== 'bienes') {
    alert(`RC8.2 elabora solo Bienes. Tipo actual: ${row?.tipo || '—'}. Servicios/Locadores se habilitarán después.`);
    return;
  }
  await showElaborarCuadroModal(solicitudId, () => loadCuadro(false));
}

async function loadCuadro(resetPage = false) {
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  try {
    if (resetPage) cuadroPagination.resetPage();
    const result = await cuadroPagination.loadData({}, resetPage);
    const rows = result.data || [];
    const allFiltered = result.allData || rows;
    updateCuadroStatsDom(allFiltered, 'cuadroCompStats');

    if (!allFiltered.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay solicitudes con cotizaciones APTO para el cuadro comparativo.</div>';
      return;
    }

    cont.innerHTML = `
      <div class="sgc-bandeja-wrap" id="cuadroCompOuter">
        <p class="small text-muted mb-2">Una fila por Solicitud de Cotización. La matriz económica y el Anexo 8A se elaboran en una etapa posterior.</p>
        <table class="table table-sm table-hover table-bordered mb-0 align-middle">
          <thead class="table-light"><tr>
            <th>Solicitud</th>
            <th>Requerimientos</th>
            <th>Denominación</th>
            <th>Tipo</th>
            <th>Área usuaria</th>
            <th class="text-center">Prov. presentados</th>
            <th class="text-center">Prov. APTO</th>
            <th>Estado del cuadro</th>
            <th>Fecha ingreso</th>
            <th>Acciones</th>
          </tr></thead>
          <tbody>${rows.map((c) => `
            <tr>
              <td><strong>${esc(c.solicitud_codigo)}</strong></td>
              <td>${formatRequerimientosCuadro(c, esc)}</td>
              <td class="small">${esc((c.denominacion || '').slice(0, 80))}</td>
              <td class="small">${esc(c.tipo || '—')}</td>
              <td class="small">${esc(c.area_usuaria || '—')}</td>
              <td class="text-center">${esc(c.total_proveedores)}</td>
              <td class="text-center"><span class="badge bg-success">${esc(c.proveedores_aptos)}</span></td>
              <td><span class="badge bg-${esc(c.estado_cuadro_badge || badgeClassCuadro(c.estado_cuadro))}">${esc(c.estado_cuadro_label || labelCuadroEstado(c.estado_cuadro))}</span></td>
              <td class="small">${esc(fmtFecha(c.fecha_ingreso_cuadro))}</td>
              ${renderActionMenuCell(c.solicitud_id, cuadroComparativoMenuItems(c), '')}
            </tr>`).join('')}</tbody>
        </table>
      </div>`;

    bindActionMenus(cont, {
      verExpediente: (id) => showVerExpediente(id),
      verValidaciones: (id) => showVerValidaciones(id),
      elaborarCuadro: (id) => openElaborarCuadro(id),
    });
    cuadroPagination.renderControls('cuadroCompOuter', () => loadCuadro(false));
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export function renderCuadroComparativoView() {
  const { prefix, title, icon, description, listId } = VIEW_CONFIG;
  const statsHtml = renderCuadroStatsHtml(buildCuadroStats([]), 'cuadroCompStats');
  return `
    <div class="container-fluid actos-bandeja-page">
      <style>${bandejaTableStyles()}${actosBandejaStyles()}</style>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h3 class="mb-1"><i class="bi ${esc(icon)}"></i> ${esc(title)}</h3>
          <p class="text-muted mb-0">${esc(description)}</p>
        </div>
        <button id="${esc(prefix)}Reload" type="button" class="btn btn-sm btn-outline-secondary">
          <i class="bi bi-arrow-clockwise"></i> Actualizar
        </button>
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
