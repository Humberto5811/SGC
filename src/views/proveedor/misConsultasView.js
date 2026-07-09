import { portalService } from '../../services/portalService.js';
import {
  esc, fmtDt, renderProveedorShell, requireProveedorSession, bindProveedorLogout,
  PROVEEDOR_ROUTES, cleanupModalBackdrop, makeModalDraggable,
} from '../../utils/proveedorShared.js';

export function renderMisConsultasView() {
  if (!requireProveedorSession()) return '';
  return renderProveedorShell(PROVEEDOR_ROUTES.misConsultas, `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-header bg-white d-flex justify-content-between align-items-center">
        <h5 class="mb-0"><i class="bi bi-chat-left-text"></i> Mis Consultas</h5>
        <button class="btn btn-sm btn-primary" id="provBtnNuevaConsulta"><i class="bi bi-plus"></i> Nueva consulta</button>
      </div>
      <div class="card-body" id="provConsContent"><div class="text-muted">Cargando…</div></div>
    </div>
    <div class="card border-0 shadow-sm d-none" id="provConsFormCard">
      <div class="card-body">
        <h6>Registrar consulta</h6>
        <div class="row g-2">
          <div class="col-md-3"><select class="form-select form-select-sm" id="provConsSol"></select></div>
          <div class="col-md-3"><input class="form-control form-control-sm" id="provConsAsunto" placeholder="Asunto"></div>
          <div class="col-md-6"><textarea class="form-control form-control-sm" id="provConsTexto" rows="2" placeholder="Consulta"></textarea></div>
          <div class="col-12"><button class="btn btn-sm btn-success" id="provConsEnviar">Enviar consulta</button></div>
        </div>
      </div>
    </div>
    <div class="modal fade" id="provConsRespModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header py-2 prov-draggable-header">
            <h6 class="modal-title" id="provConsRespTitle">Respuesta publicada</h6>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body small" id="provConsRespBody"></div>
          <div class="modal-footer py-2">
            <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cerrar</button>
          </div>
        </div>
      </div>
    </div>`);
}

function showRespuestaCompleta(c) {
  const modal = document.getElementById('provConsRespModal');
  const title = document.getElementById('provConsRespTitle');
  const body = document.getElementById('provConsRespBody');
  title.textContent = `Respuesta — ${c.asunto || 'Consulta'}`;
  body.innerHTML = `
    <p class="mb-2"><strong>Solicitud:</strong> ${esc(c.solicitud_codigo || '—')}</p>
    <p class="mb-2"><strong>Asunto:</strong> ${esc(c.asunto || '—')}</p>
    <p class="mb-2"><strong>Estado:</strong> ${esc(c.estado)}</p>
    <p class="mb-2"><strong>Fecha respuesta:</strong> ${fmtDt(c.updated_at || c.created_at)}</p>
    <hr>
    <p class="mb-1 fw-semibold">Respuesta publicada:</p>
    <div class="border rounded p-2 bg-light" style="white-space:pre-wrap;">${esc(c.respuesta || '—')}</div>`;
  makeModalDraggable(modal);
  bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function loadConsultas() {
  const cont = document.getElementById('provConsContent');
  const resp = await portalService.listConsultas();
  const rows = resp.data || [];
  if (!rows.length) {
    cont.innerHTML = '<div class="alert alert-light border">No ha registrado consultas.</div>';
    return;
  }
  cont.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm table-bordered table-hover mb-0">
        <thead class="table-light"><tr>
          <th>N° Solicitud de Cotización</th>
          <th>Descripción</th>
          <th>Asunto</th>
          <th>Fecha</th>
          <th>Estado</th>
          <th>Respuesta publicada</th>
          <th style="width:120px;">Acciones</th>
        </tr></thead>
        <tbody>${rows.map((c, i) => {
          const desc = c.denominacion || c.objeto || '—';
          const tieneResp = c.absolucion_publica && c.respuesta;
          const preview = tieneResp ? esc(String(c.respuesta).slice(0, 80)) : '—';
          return `
          <tr>
            <td class="small">${esc(c.solicitud_codigo || '—')}</td>
            <td class="small">${esc(desc)}</td>
            <td>${esc(c.asunto || '—')}</td>
            <td class="small text-nowrap">${fmtDt(c.created_at)}</td>
            <td><span class="badge bg-${c.estado === 'RESPONDIDA' ? 'success' : 'secondary'}">${esc(c.estado)}</span></td>
            <td class="small">${preview}${tieneResp && c.respuesta.length > 80 ? '…' : ''}</td>
            <td class="text-nowrap">
              ${tieneResp ? `<button type="button" class="btn btn-outline-primary btn-sm py-0 prov-cons-ver" data-i="${i}">Ver respuesta completa</button>` : '—'}
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;

  cont.querySelectorAll('.prov-cons-ver').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = rows[parseInt(btn.dataset.i, 10)];
      if (c) showRespuestaCompleta(c);
    });
  });
}

export async function initMisConsultasView() {
  bindProveedorLogout();
  cleanupModalBackdrop();
  const modal = document.getElementById('provConsRespModal');
  modal?.addEventListener('hidden.bs.modal', cleanupModalBackdrop);
  try {
    await loadConsultas();
    const inv = await portalService.listMisInvitaciones();
    const sel = document.getElementById('provConsSol');
    if (sel) {
      sel.innerHTML = (inv.data || []).map((i) =>
        `<option value="${i.solicitud_id}">${esc(i.codigo)} — ${esc(i.denominacion || '')}</option>`).join('')
        || '<option value="">Sin convocatorias</option>';
    }
  } catch (err) {
    document.getElementById('provConsContent').innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }

  document.getElementById('provBtnNuevaConsulta')?.addEventListener('click', () => {
    document.getElementById('provConsFormCard')?.classList.remove('d-none');
  });
  document.getElementById('provConsEnviar')?.addEventListener('click', async () => {
    try {
      await portalService.crearConsulta({
        solicitud_id: parseInt(document.getElementById('provConsSol')?.value, 10),
        asunto: document.getElementById('provConsAsunto')?.value,
        consulta: document.getElementById('provConsTexto')?.value,
      });
      document.getElementById('provConsFormCard')?.classList.add('d-none');
      await loadConsultas();
    } catch (err) { alert(err.message); }
  });
}
