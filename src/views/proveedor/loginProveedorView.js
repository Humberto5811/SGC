import { portalService } from '../../services/portalService.js';
import { esc, renderProveedorShell, PROVEEDOR_ROUTES } from '../../utils/proveedorShared.js';

export function renderLoginProveedorView() {
  const tokenHint = sessionStorage.getItem('provInvitacionToken') || '';
  return renderProveedorShell(PROVEEDOR_ROUTES.login, `
    <div class="row justify-content-center">
      <div class="col-md-5 col-lg-4">
        <div class="card shadow border-0">
          <div class="card-body p-4">
            <h4 class="text-center mb-1"><i class="bi bi-shield-lock text-primary"></i> Acceso Proveedores</h4>
            <p class="text-center text-muted small mb-4">Portal externo — sin acceso al sistema interno SGC</p>
            ${tokenHint ? `<div class="alert alert-info small py-2">Tiene un enlace de invitación activo. Ingrese con su RUC y contraseña temporal.</div>` : ''}
            <form id="provLoginForm">
              <div class="mb-3">
                <label class="form-label small">RUC (usuario portal)</label>
                <input type="text" class="form-control" id="provRuc" maxlength="11" required placeholder="20123456789">
              </div>
              <div class="mb-3">
                <label class="form-label small">Contraseña</label>
                <input type="password" class="form-control" id="provPass" required>
                <div class="form-text">En el primer ingreso use su RUC como contraseña temporal.</div>
              </div>
              <button type="submit" class="btn btn-primary w-100">Ingresar</button>
            </form>
          </div>
        </div>
      </div>
    </div>`, { showNav: false });
}

export function initLoginProveedorView() {
  document.getElementById('provLoginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ruc = document.getElementById('provRuc')?.value?.trim();
    const password = document.getElementById('provPass')?.value;
    try {
      const resp = await portalService.login(ruc, password);
      sessionStorage.removeItem('provInvitacionToken');
      if (resp.proveedor?.debeCambiarPassword || resp.proveedor?.primerIngreso) {
        window.location.hash = '#/proveedor/cambio-password';
      } else {
        window.location.hash = '#/proveedor/mis-invitaciones';
      }
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      alert(err.message);
    }
  });
}

export function renderInvitacionTokenView(token) {
  return renderProveedorShell(`proveedor/invitacion/${token}`, `
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="card shadow border-0">
          <div class="card-body p-4 text-center" id="provTokenBody">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted small">Validando invitación…</p>
          </div>
        </div>
      </div>
    </div>`, { showNav: false });
}

export async function initInvitacionTokenView(token) {
  const body = document.getElementById('provTokenBody');
  try {
    const resp = await portalService.getInvitacionByToken(token);
    const inv = resp.invitacion;
    sessionStorage.setItem('provInvitacionToken', token);
    body.innerHTML = `
      <h5 class="text-primary"><i class="bi bi-envelope-check"></i> Invitación válida</h5>
      <p class="mb-1"><strong>${esc(inv.razon_social)}</strong></p>
      <p class="small text-muted">Convocatoria: ${esc(inv.solicitud_codigo || '—')}</p>
      <p class="small">Estado: ${esc(inv.estado_invitacion || inv.estado)}</p>
      <a href="#/proveedor/login" class="btn btn-primary mt-3">Ir al login del portal</a>`;
  } catch (err) {
    body.innerHTML = `<div class="alert alert-danger">${esc(err.message)}</div>`;
  }
}
