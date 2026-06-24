// Consultas y Observaciones — bandeja analista CM
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { renderContratacionBandejaStub } from '../../utils/contratacionBandejaStub.js';
import { bindBandejaToolbar } from '../../utils/bandejaUi.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const VIEW_CONFIG = {
  prefix: 'consultasObs',
  title: 'Consultas y Observaciones',
  icon: 'bi-chat-square-text',
  description: 'Gestión de consultas y observaciones recibidas desde el Portal de Proveedores.',
  listId: 'consultasObsList',
};

export function renderConsultasObservacionesView() {
  return renderContratacionBandejaStub(VIEW_CONFIG);
}

async function loadConsultas() {
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  try {
    const resp = await contratacionesService.listConsultasAnalista();
    const rows = resp.data || [];
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay consultas pendientes.</div>';
      return;
    }
    cont.innerHTML = `
      <table class="table table-sm table-hover table-bordered">
        <thead class="table-light"><tr>
          <th>Solicitud</th><th>Proveedor</th><th>Asunto</th><th>Estado</th><th>Fecha</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows.map((c) => `
          <tr>
            <td>${esc(c.solicitud_codigo)}</td>
            <td><small>${esc(c.ruc)}</small><br>${esc(c.razon_social)}</td>
            <td>${esc(c.asunto)}<div class="small text-muted">${esc((c.consulta || '').slice(0, 80))}</div></td>
            <td><span class="badge bg-${c.estado === 'RESPONDIDA' ? 'success' : 'warning'}">${esc(c.estado)}</span></td>
            <td class="small">${esc(String(c.created_at || '').slice(0, 16).replace('T', ' '))}</td>
            <td>${c.estado === 'PENDIENTE' ? `<button class="btn btn-sm btn-primary co-responder" data-id="${c.id}">Responder</button>` : '—'}</td>
          </tr>`).join('')}</tbody>
      </table>`;

    cont.querySelectorAll('.co-responder').forEach((btn) => {
      btn.onclick = async () => {
        const respuesta = prompt('Respuesta al proveedor:');
        if (!respuesta) return;
        const publicar = confirm('¿Publicar absolución para TODOS los proveedores invitados?');
        const usuario = getUserDisplayName(authService.getCurrentUser());
        await contratacionesService.responderConsultaAnalista(btn.dataset.id, { respuesta, publicar, usuario });
        alert('Consulta respondida.');
        loadConsultas();
      };
    });
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export function initConsultasObservacionesView() {
  bindBandejaToolbar({
    prefix: VIEW_CONFIG.prefix,
    onFilter: () => loadConsultas(),
    onClear: () => loadConsultas(),
    onExecutiveToggle: () => loadConsultas(),
  });
  const reload = document.getElementById(`${VIEW_CONFIG.prefix}Reload`);
  if (reload) reload.onclick = () => loadConsultas();
  loadConsultas();
}
