import { portalService } from '../../services/portalService.js';
import { esc, fmtDt, renderProveedorShell, requireProveedorSession, bindProveedorLogout, PROVEEDOR_ROUTES } from '../../utils/proveedorShared.js';

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
    </div>`);
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
    <table class="table table-sm table-bordered mb-0">
      <thead class="table-light"><tr>
        <th>Fecha</th><th>Asunto</th><th>Estado</th><th>Respuesta publicada</th>
      </tr></thead>
      <tbody>${rows.map((c) => `
        <tr>
          <td class="small">${fmtDt(c.created_at)}</td>
          <td>${esc(c.asunto)}</td>
          <td><span class="badge bg-${c.estado === 'RESPONDIDA' ? 'success' : 'secondary'}">${esc(c.estado)}</span></td>
          <td class="small">${c.absolucion_publica && c.respuesta ? esc(c.respuesta.slice(0, 120)) + '…' : '—'}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

export async function initMisConsultasView() {
  bindProveedorLogout();
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
