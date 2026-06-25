import { portalService } from '../../services/portalService.js';
import {
  esc, fmtDt, renderProveedorShell, requireProveedorSession, bindProveedorLogout,
  PROVEEDOR_ROUTES, cleanupModalBackdrop, dismissProveedorModal, makeModalDraggable,
} from '../../utils/proveedorShared.js';
import { renderDocumentoLista, renderRequisitosTecnicos, bindDocumentoActions, attachSolicitudId } from '../../utils/proveedorDocumentos.js';

export function renderMisInvitacionesView() {
  if (!requireProveedorSession()) return '';
  return renderProveedorShell(PROVEEDOR_ROUTES.misInvitaciones, `
    <div class="card border-0 shadow-sm">
      <div class="card-header bg-white"><h5 class="mb-0"><i class="bi bi-envelope-open"></i> Mis Invitaciones</h5></div>
      <div class="card-body" id="provInvContent"><div class="text-muted">Cargando…</div></div>
    </div>
    <div class="modal fade" id="provInvDetModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header prov-draggable-header">
            <h5 class="modal-title" id="provInvDetTitle">Solicitud de cotización</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="provInvDetBody"><div class="text-muted">Cargando…</div></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-primary btn-sm d-none" id="provInvIrCot">Ir a presentar cotización</button>
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`);
}

async function showDetalleInvitacion(solicitudId, codigo) {
  const modal = document.getElementById('provInvDetModal');
  const body = document.getElementById('provInvDetBody');
  const title = document.getElementById('provInvDetTitle');
  const irCot = document.getElementById('provInvIrCot');
  title.textContent = `Solicitud ${codigo || ''}`;
  body.innerHTML = '<div class="text-muted">Cargando solicitud y documentos…</div>';
  makeModalDraggable(modal);
  bootstrap.Modal.getOrCreateInstance(modal).show();

  try {
    const resp = await portalService.getSolicitudDetalle(solicitudId);
    const sol = resp.solicitud || {};
    const docs = attachSolicitudId(resp.documentos || [], solicitudId);
    const items = sol.detalle_items || [];
    const requisitos = sol.requisitos_tecnicos || [];

    body.innerHTML = `
      <div class="mb-3">
        <h6 class="fw-bold mb-1">${esc(sol.codigo)}</h6>
        <p class="mb-1">${esc(sol.denominacion || sol.objeto || '—')}</p>
        <p class="small text-muted mb-0">Estado: <span class="badge bg-info">${esc(sol.estado)}</span>
          · Evaluación: ${esc(sol.tipo_evaluacion || '—')}</p>
      </div>
      <div class="card bg-light border-0 mb-3 prov-crono-wrap">
        <div class="card-body py-2 prov-crono-box">
          <div class="fw-semibold mb-1">Cronograma</div>
          <div class="prov-crono-line"><span class="text-muted me-1">Consultas:</span>${fmtDt(sol.consultas_inicio)} — ${fmtDt(sol.consultas_fin)}</div>
          <div class="prov-crono-line mt-1"><span class="text-muted me-1">Cotización:</span>${fmtDt(sol.cotizaciones_inicio)} — ${fmtDt(sol.cotizaciones_fin)}</div>
        </div>
      </div>
      <h6 class="border-bottom pb-2">Documentos de la convocatoria</h6>
      <div class="mb-3" id="provInvDocs">${renderDocumentoLista(docs)}</div>
      <h6 class="border-bottom pb-2">Requisitos técnicos mínimos</h6>
      <div class="mb-3">${renderRequisitosTecnicos(requisitos)}</div>
      ${items.length ? `
        <h6 class="border-bottom pb-2">Ítems convocados (${items.length})</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered mb-0">
            <thead class="table-light"><tr>
              <th>Req.</th><th>Centro</th><th>Código SIGA</th><th>Descripción</th><th>Cant.</th>
            </tr></thead>
            <tbody>${items.map((it) => `
              <tr>
                <td>${esc(it.requerimiento_codigo || it.requerimiento_id)}</td>
                <td>${esc(it.paquete || '—')}</td>
                <td>${esc(it.codigo_sigamef || '—')}</td>
                <td>${esc(it.descripcion || '—')}</td>
                <td class="text-center">${esc(it.cantidad ?? 1)}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>` : ''}`;

    bindDocumentoActions(body, solicitudId);
    if (irCot) {
      irCot.classList.remove('d-none');
      irCot.onclick = () => {
        dismissProveedorModal(modal);
        sessionStorage.setItem('provCotSolId', String(solicitudId));
        sessionStorage.setItem('provCotAutoOpen', '1');
        window.location.hash = '#/proveedor/mis-cotizaciones';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      };
    }
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export async function initMisInvitacionesView() {
  bindProveedorLogout();
  cleanupModalBackdrop();
  const modal = document.getElementById('provInvDetModal');
  modal?.addEventListener('hidden.bs.modal', cleanupModalBackdrop);
  const cont = document.getElementById('provInvContent');
  try {
    const resp = await portalService.listMisInvitaciones();
    const rows = resp.data || [];
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No tiene invitaciones registradas.</div>';
      return;
    }
    cont.innerHTML = `
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light"><tr>
            <th>N° Solicitud</th><th>Descripción</th><th>Estado</th><th>Consultas</th><th>Cotización</th><th>Acciones</th>
          </tr></thead>
          <tbody>${rows.map((r) => `
            <tr>
              <td><strong>${esc(r.codigo)}</strong></td>
              <td>${esc(r.denominacion || r.objeto || '—')}</td>
              <td><span class="badge bg-info">${esc(r.estado_invitacion || r.estado)}</span></td>
              <td class="small">${fmtDt(r.consultas_inicio)} — ${fmtDt(r.consultas_fin)}</td>
              <td class="small">${fmtDt(r.cotizaciones_inicio)} — ${fmtDt(r.cotizaciones_fin)}</td>
              <td class="text-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary prov-inv-ver"
                  data-id="${r.solicitud_id}" data-codigo="${esc(r.codigo)}">Ver solicitud</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>
      </div>`;

    cont.querySelectorAll('.prov-inv-ver').forEach((btn) => {
      btn.addEventListener('click', () => {
        showDetalleInvitacion(parseInt(btn.dataset.id, 10), btn.dataset.codigo);
      });
    });
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}
