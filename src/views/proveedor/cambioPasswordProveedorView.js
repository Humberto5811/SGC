import { portalService } from '../../services/portalService.js';
import { esc, renderProveedorShell, requireProveedorSession, PROVEEDOR_ROUTES } from '../../utils/proveedorShared.js';

export function renderCambioPasswordProveedorView() {
  const s = requireProveedorSession();
  if (!s) return '';
  return renderProveedorShell(PROVEEDOR_ROUTES.cambioPassword, `
    <div class="row justify-content-center">
      <div class="col-md-5">
        <div class="card shadow border-0">
          <div class="card-body p-4">
            <h5><i class="bi bi-key"></i> Cambio de contraseña obligatorio</h5>
            <p class="small text-muted">Primer ingreso — ${esc(s.razon_social || s.ruc)}</p>
            <form id="provCambioForm">
              <div class="mb-2"><label class="form-label small">Contraseña actual</label>
                <input type="password" class="form-control form-control-sm" id="provPassActual" required></div>
              <div class="mb-2"><label class="form-label small">Nueva contraseña</label>
                <input type="password" class="form-control form-control-sm" id="provPassNueva" minlength="6" required></div>
              <div class="mb-3"><label class="form-label small">Confirmar</label>
                <input type="password" class="form-control form-control-sm" id="provPassConf" minlength="6" required></div>
              <button type="submit" class="btn btn-primary">Guardar y continuar</button>
            </form>
          </div>
        </div>
      </div>
    </div>`, { showNav: false });
}

export function initCambioPasswordProveedorView() {
  document.getElementById('provCambioForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const actual = document.getElementById('provPassActual')?.value;
    const nueva = document.getElementById('provPassNueva')?.value;
    const conf = document.getElementById('provPassConf')?.value;
    if (nueva !== conf) { alert('Las contraseñas no coinciden'); return; }
    try {
      await portalService.changePassword(actual, nueva);
      const s = portalService.getSession();
      if (s) portalService.setSession({ ...s, debeCambiarPassword: false, primerIngreso: false });
      window.location.hash = '#/proveedor/mis-invitaciones';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) { alert(err.message); }
  });
}
