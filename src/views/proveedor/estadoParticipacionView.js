import { portalService } from '../../services/portalService.js';
import { esc, fmtDt, renderProveedorShell, requireProveedorSession, bindProveedorLogout, PROVEEDOR_ROUTES } from '../../utils/proveedorShared.js';

function badgeEstadoCot(estado, validacion) {
  if (validacion === 'APTO') return '<span class="badge bg-success">Apto</span>';
  if (validacion === 'NO_APTO') return '<span class="badge bg-danger">No apto</span>';
  if (validacion === 'OBSERVADO') return '<span class="badge bg-warning text-dark">Observado</span>';
  if (estado === 'COTIZACION_PRESENTADA') return '<span class="badge bg-primary">Presentada</span>';
  return '<span class="badge bg-secondary">Sin cotización</span>';
}

export function renderEstadoParticipacionView() {
  if (!requireProveedorSession()) return '';
  const s = requireProveedorSession();
  return renderProveedorShell(PROVEEDOR_ROUTES.estadoParticipacion, `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-header bg-white"><h5 class="mb-0"><i class="bi bi-activity"></i> Estado de Participación</h5></div>
      <div class="card-body">
        <p class="mb-2"><strong>${esc(s?.razon_social)}</strong> · RUC ${esc(s?.ruc)}</p>
        <div class="row g-2 mb-3" id="provEstResumen"></div>
        <div id="provEstDetalle"><div class="text-muted">Cargando…</div></div>
      </div>
    </div>`);
}

export async function initEstadoParticipacionView() {
  bindProveedorLogout();
  try {
    const data = await portalService.getEstadoParticipacion();
    const r = data.resumen || {};
    document.getElementById('provEstResumen').innerHTML = `
      <div class="col-md-3"><div class="border rounded p-2 text-center bg-white"><div class="fs-4 fw-bold">${r.total_invitaciones || 0}</div><div class="small text-muted">Invitaciones</div></div></div>
      <div class="col-md-3"><div class="border rounded p-2 text-center bg-white"><div class="fs-4 fw-bold">${r.consultas_realizadas || 0}</div><div class="small text-muted">Consultas</div></div></div>
      <div class="col-md-3"><div class="border rounded p-2 text-center bg-white"><div class="fs-4 fw-bold">${r.consultas_respondidas || 0}</div><div class="small text-muted">Respondidas</div></div></div>
      <div class="col-md-3"><div class="border rounded p-2 text-center bg-white"><div class="fs-4 fw-bold">${r.cotizaciones_enviadas || 0}</div><div class="small text-muted">Cotizaciones enviadas</div></div></div>`;

    const inv = data.invitaciones || [];
    document.getElementById('provEstDetalle').innerHTML = inv.length ? `
      <h6 class="border-bottom pb-2">Seguimiento por convocatoria</h6>
      <div class="table-responsive">
        <table class="table table-sm table-bordered mb-0">
          <thead class="table-light"><tr>
            <th>Convocatoria</th><th>Invitación</th><th>Cotización</th><th>Validación CM</th>
            <th>Envío cotización</th><th>Cierre</th><th></th>
          </tr></thead>
          <tbody>${inv.map((i) => `
            <tr>
              <td><strong>${esc(i.codigo)}</strong><br><small>${esc(i.denominacion || '')}</small></td>
              <td>${esc(i.estado_invitacion || i.estado)}</td>
              <td>${badgeEstadoCot(i.cotizacion_estado, i.validacion_estado)}</td>
              <td>${esc(i.validacion_estado || '—')}</td>
              <td class="small">${fmtDt(i.fecha_presentacion)}</td>
              <td class="small">${fmtDt(i.cotizaciones_fin)}</td>
              <td class="text-nowrap">
                ${!i.cotizacion_estado || i.cotizacion_estado !== 'COTIZACION_PRESENTADA' ? `
                  <button type="button" class="btn btn-sm btn-outline-primary prov-est-cotizar"
                    data-id="${i.solicitud_id}">Presentar cotización</button>` : '<span class="small text-muted">Enviada</span>'}
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>` : '<div class="alert alert-light border">Sin participaciones registradas.</div>';

    document.querySelectorAll('.prov-est-cotizar').forEach((btn) => {
      btn.addEventListener('click', () => {
        sessionStorage.setItem('provCotSolId', btn.dataset.id);
        sessionStorage.setItem('provCotAutoOpen', '1');
        window.location.hash = `#/proveedor/mis-cotizaciones?solicitud_id=${encodeURIComponent(btn.dataset.id)}`;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
    });
  } catch (err) {
    document.getElementById('provEstDetalle').innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}
