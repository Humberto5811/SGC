import { authService } from '../services/authService.js';
import { permisosFromRol } from '../utils/permissionsCatalog.js';

function renderCambioPasswordView() {
  const user = authService.getCurrentUser() || {};
  return `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-5">
          <div class="card shadow border-warning">
            <div class="card-header bg-warning text-dark text-center">
              <h4 class="mb-0"><i class="bi bi-shield-lock"></i> Cambio de contraseña obligatorio</h4>
            </div>
            <div class="card-body">
              <p class="text-muted small">Por seguridad debe actualizar su contraseña temporal antes de acceder al sistema.</p>
              <p class="small mb-3">Usuario: <strong>${user.username || user.dni || ''}</strong></p>
              <form id="cambioPasswordForm">
                <div class="mb-3">
                  <label class="form-label">Contraseña actual</label>
                  <input type="password" id="cpActual" class="form-control" required autocomplete="current-password">
                </div>
                <div class="mb-3">
                  <label class="form-label">Nueva contraseña</label>
                  <input type="password" id="cpNueva" class="form-control" minlength="8" required autocomplete="new-password">
                  <div class="form-text">Mínimo 8 caracteres</div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Confirmar contraseña</label>
                  <input type="password" id="cpConfirm" class="form-control" minlength="8" required autocomplete="new-password">
                </div>
                <div id="cpError" class="alert alert-danger d-none"></div>
                <button type="submit" class="btn btn-primary w-100"><i class="bi bi-check2-circle"></i> Actualizar contraseña</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function initCambioPasswordView() {
  const form = document.getElementById('cambioPasswordForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('cpError');
    errEl.classList.add('d-none');

    const user = authService.getCurrentUser();
    if (!user) {
      window.location.hash = '#/login';
      return;
    }

    const body = {
      userId: user.id,
      password_actual: document.getElementById('cpActual').value,
      password_nueva: document.getElementById('cpNueva').value,
      password_confirmacion: document.getElementById('cpConfirm').value,
    };

    if (body.password_nueva.length < 8) {
      errEl.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.';
      errEl.classList.remove('d-none');
      return;
    }
    if (body.password_nueva !== body.password_confirmacion) {
      errEl.textContent = 'La confirmación no coincide con la nueva contraseña.';
      errEl.classList.remove('d-none');
      return;
    }

    try {
      const res = await fetch('/api/auth/cambio-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': String(user.id) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        errEl.textContent = data.error || 'No se pudo actualizar la contraseña';
        errEl.classList.remove('d-none');
        return;
      }
      const updated = data.user;
      if (!updated.permisos) updated.permisos = permisosFromRol(updated.rol || 'usuario');
      authService.setCurrentUser(updated);
      window.location.hash = '#/dashboard';
      window.location.reload();
    } catch (err) {
      errEl.textContent = err.message || 'Error de conexión';
      errEl.classList.remove('d-none');
    }
  });
}

export { renderCambioPasswordView, initCambioPasswordView };
