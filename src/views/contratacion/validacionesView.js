// Validaciones — bandeja y flujo área usuaria (RC7.7.1)

import { contratacionesService } from '../../services/contratacionesService.js';

import { authService } from '../../services/authService.js';

import { renderFilterBarHtml, bandejaTableStyles } from '../../utils/trazabilidad.js';

import { actosBandejaStyles } from '../../utils/actosModals.js';

import { bindBandejaToolbar } from '../../utils/bandejaUi.js';

import { usePagination } from '../../utils/paginacion.js';

import { showValidarModal } from '../../utils/validacionesModal.js';

import {

  buildValidacionesStats,

  renderValidacionesStatsHtml,

  updateValidacionesStatsDom,

  isAdminUser,

} from '../../utils/validacionesUtils.js';



function esc(s) {

  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

}



function fmtFecha(iso) {

  return String(iso || '').slice(0, 16).replace('T', ' ');

}



const VIEW_CONFIG = {

  prefix: 'validaciones',

  title: 'Validaciones',

  icon: 'bi-shield-check',

  description: 'Validación técnica de cotizaciones enviadas desde Recepción de Cotizaciones.',

  listId: 'validacionesList',

};



const validacionesPagination = usePagination(

  'validaciones',

  async () => {

    const esAdmin = isAdminUser(authService.getCurrentUser());

    const resp = await contratacionesService.listValidacionesExpedientes(esAdmin);

    return { data: resp.data || [] };

  },

  { defaultPageSize: 25, pageSizeOptions: [25, 50, 100] },

);



function badgeClass(row) {

  return row.estado_bandeja_class || 'secondary';

}



function renderAccionFila(c) {

  if (c.sin_asignacion) {

    return '<span class="small text-muted">Pendiente de asignación</span>';

  }

  if (c.puede_validar) {

    return `<button type="button" class="btn btn-sm btn-primary val-validar" data-id="${c.id}"><i class="bi bi-clipboard-check"></i> Validar</button>`;

  }

  if (c.puede_ver) {

    return `<button type="button" class="btn btn-sm btn-outline-secondary val-ver" data-id="${c.id}"><i class="bi bi-eye"></i> Ver</button>`;

  }

  return '<span class="small text-muted">—</span>';

}



function renderTabla(rows) {

  if (!rows.length) return '<div class="alert alert-light border mb-0">No hay expedientes en validación.</div>';

  return `

    <h6 class="fw-bold text-primary mb-2"><i class="bi bi-inbox"></i> Cotizaciones en validación técnica</h6>

    <table class="table table-sm table-hover table-bordered mb-0">

      <thead class="table-light"><tr>

        <th>Solicitud</th><th>Requerimiento</th><th>Proveedor</th><th>Tipo</th>

        <th>Fecha recepción</th><th>Estado</th><th>Responsable</th><th>Acciones</th>

      </tr></thead>

      <tbody>${rows.map((c) => `

        <tr>

          <td><strong>${esc(c.solicitud_codigo)}</strong></td>

          <td class="small">${esc(c.requerimientos || '—')}</td>

          <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>

          <td class="small">${esc(c.tipo_contratacion || '—')}</td>

          <td class="small">${esc(fmtFecha(c.fecha_presentacion))}</td>

          <td><span class="badge bg-${badgeClass(c)}">${esc(c.estado_bandeja || c.estado_display || '—')}</span></td>

          <td class="small">${esc(c.validacion_responsable || c.responsable_nombre || '—')}</td>

          <td>${renderAccionFila(c)}</td>

        </tr>`).join('')}</tbody>

    </table>`;

}



async function loadValidaciones(resetPage = false) {

  const cont = document.getElementById(VIEW_CONFIG.listId);

  if (!cont) return;

  try {

    if (resetPage) validacionesPagination.resetPage();

    const result = await validacionesPagination.loadData({}, resetPage);

    const pageRows = result.data || [];

    const allRows = result.allData || pageRows;



    updateValidacionesStatsDom(allRows, 'validacionesStats');



    if (!allRows.length) {

      cont.innerHTML = '<div class="alert alert-light border">No hay expedientes enviados a validación.</div>';

      return;

    }



    cont.innerHTML = `

      <div class="sgc-bandeja-wrap" id="validacionesOuter">

        <p class="small text-muted mb-2">Expedientes derivados desde Recepción de Cotizaciones. La propuesta económica no se envía al área usuaria.</p>

        ${renderTabla(pageRows)}

      </div>`;



    const esAdmin = isAdminUser(authService.getCurrentUser());

    cont.querySelectorAll('.val-validar, .val-ver').forEach((btn) => {

      btn.onclick = () => showValidarModal(btn.dataset.id, () => loadValidaciones(false), { esAdmin });

    });

    validacionesPagination.renderControls('validacionesOuter', () => loadValidaciones(false));

  } catch (err) {

    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;

  }

}



export function renderValidacionesView() {

  const { prefix, title, icon, description, listId } = VIEW_CONFIG;

  const statsHtml = renderValidacionesStatsHtml(buildValidacionesStats([]), 'validacionesStats');

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

      ${renderFilterBarHtml(prefix, { hideExecutive: true })}

      <hr/>

      <div id="${esc(listId)}" class="sgc-bandeja-wrap actos-bandeja-wrap">

        <div class="text-muted">Cargando…</div>

      </div>

    </div>

  `;

}



export function initValidacionesView() {

  bindBandejaToolbar({

    prefix: VIEW_CONFIG.prefix,

    onFilter: () => loadValidaciones(true),

    onClear: () => loadValidaciones(true),

    onExecutiveToggle: () => loadValidaciones(true),

  });

  const reload = document.getElementById(`${VIEW_CONFIG.prefix}Reload`);

  if (reload) reload.onclick = () => loadValidaciones(true);

  loadValidaciones();

}


