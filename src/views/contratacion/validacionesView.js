// Validaciones — bandeja cotizaciones presentadas
import { contratacionesService } from '../../services/contratacionesService.js';
import { authService } from '../../services/authService.js';
import { getUserDisplayName } from '../../utils/userDisplay.js';
import { renderContratacionBandejaStub } from '../../utils/contratacionBandejaStub.js';
import { bindBandejaToolbar } from '../../utils/bandejaUi.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const VIEW_CONFIG = {
  prefix: 'validaciones',
  title: 'Validaciones',
  icon: 'bi-shield-check',
  description: 'Validación de cotizaciones presentadas — solo propuestas APTAS pasan a Cuadro Comparativo.',
  listId: 'validacionesList',
};

export function renderValidacionesView() {
  return renderContratacionBandejaStub(VIEW_CONFIG);
}

async function loadValidaciones() {
  const cont = document.getElementById(VIEW_CONFIG.listId);
  if (!cont) return;
  try {
    const resp = await contratacionesService.listValidaciones();
    const rows = resp.data || [];
    if (!rows.length) {
      cont.innerHTML = '<div class="alert alert-light border">No hay cotizaciones pendientes de validación.</div>';
      return;
    }
    cont.innerHTML = `
      <table class="table table-sm table-hover table-bordered">
        <thead class="table-light"><tr>
          <th>Solicitud</th><th>Proveedor</th><th>Fecha recepción</th><th>Estado</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows.map((c) => `
          <tr>
            <td>${esc(c.solicitud_codigo)}</td>
            <td>${esc(c.ruc)} — ${esc(c.razon_social)}</td>
            <td class="small">${esc(String(c.fecha_presentacion || '').slice(0, 16).replace('T', ' '))}</td>
            <td><span class="badge bg-info">${esc(c.validacion_estado || c.estado)}</span></td>
            <td><button class="btn btn-sm btn-outline-primary val-btn" data-id="${c.id}">Validar</button></td>
          </tr>`).join('')}</tbody>
      </table>`;

    cont.querySelectorAll('.val-btn').forEach((btn) => {
      btn.onclick = async () => {
        const resultado = prompt('Resultado: CONFORME / NO CONFORME / REQUIERE ACLARACION');
        if (!resultado) return;
        const observacion = prompt('Observación (obligatoria):');
        if (!observacion) { alert('Observación obligatoria'); return; }
        const usuario = getUserDisplayName(authService.getCurrentUser());
        await contratacionesService.validarCotizacion(btn.dataset.id, { resultado, observacion, usuario });
        alert('Validación registrada.');
        loadValidaciones();
      };
    });
  } catch (err) {
    cont.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}

export function initValidacionesView() {
  bindBandejaToolbar({
    prefix: VIEW_CONFIG.prefix,
    onFilter: () => loadValidaciones(),
    onClear: () => loadValidaciones(),
    onExecutiveToggle: () => loadValidaciones(),
  });
  const reload = document.getElementById(`${VIEW_CONFIG.prefix}Reload`);
  if (reload) reload.onclick = () => loadValidaciones();
  loadValidaciones();
}
