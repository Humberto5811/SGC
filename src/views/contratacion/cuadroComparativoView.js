// Cuadro Comparativo — cotizaciones con validación técnica aprobada
import { contratacionesService } from '../../services/contratacionesService.js';
import { renderContratacionBandejaStub } from '../../utils/contratacionBandejaStub.js';
import { bindBandejaToolbar } from '../../utils/bandejaUi.js';
import { usePagination } from '../../utils/paginacion.js';

const API_BASE = 'http://localhost:3000/api';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
}

function fmtMonto(n, moneda = 'PEN') {
  const val = Number(n || 0);
  return `${moneda === 'PEN' ? 'S/' : moneda} ${val.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  description: 'Cotizaciones con validación técnica aprobada — listas para comparación.',
  listId: 'cuadroCompList',
};

const cuadroPagination = usePagination(
  'cuadros',
  (params) => contratacionesService.listCuadroComparativo(params),
  { defaultPageSize: 25, pageSizeOptions: [25, 50, 100] },
);

async function loadCuadro(resetPage = false) {
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  try {
    if (resetPage) cuadroPagination.resetPage();
    const result = await cuadroPagination.loadData({}, resetPage);
    const rows = result.data || [];
    if (!rows.length && !(result.allData || []).length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay cotizaciones validadas para el cuadro comparativo.</div>';
      return;
    }
    cont.innerHTML = `
      <div class="sgc-bandeja-wrap" id="cuadroCompOuter">
        <table class="table table-sm table-hover table-bordered mb-0">
          <thead class="table-light"><tr>
            <th>Solicitud</th><th>Proveedor</th><th>Monto ofertado</th><th>Validación</th><th>Validado por</th><th>Fecha</th><th>Acciones</th>
          </tr></thead>
          <tbody>${rows.map((c) => `
            <tr>
              <td>
                <strong>${esc(c.solicitud_codigo)}</strong>
                <div class="small text-muted">${esc((c.denominacion || c.objeto || '').slice(0, 50))}</div>
              </td>
              <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
              <td class="text-end">${fmtMonto(c.monto, c.moneda)}</td>
              <td><span class="badge bg-success">${esc(c.validacion_estado)}</span></td>
              <td class="small">${esc(c.validado_por || c.validacion_responsable || '—')}</td>
              <td class="small">${esc(fmtFecha(c.validado_at))}</td>
              <td class="text-nowrap">
                ${c.tiene_pdf_validacion
    ? `<button type="button" class="btn btn-sm btn-outline-primary cc-pdf" data-id="${c.id}">Ver validación PDF</button>`
    : '<span class="text-muted small">—</span>'}
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('.cc-pdf').forEach((btn) => {
      btn.onclick = async () => {
        try { await openPdfValidacion(btn.dataset.id); }
        catch (err) { alert(err.message); }
      };
    });
    cuadroPagination.renderControls('cuadroCompOuter', () => loadCuadro(false));
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export function renderCuadroComparativoView() {
  return renderContratacionBandejaStub(VIEW_CONFIG);
}

export function initCuadroComparativoView() {
  bindBandejaToolbar({
    prefix: VIEW_CONFIG.prefix,
    onFilter: () => loadCuadro(true),
    onClear: () => loadCuadro(true),
    onExecutiveToggle: () => loadCuadro(true),
  });
  const reload = document.getElementById(`${VIEW_CONFIG.prefix}Reload`);
  if (reload) reload.onclick = () => loadCuadro(true);
  loadCuadro();
}
