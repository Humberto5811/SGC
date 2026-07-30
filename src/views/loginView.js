import { permisosFromRol, normalizePermisos } from '../utils/permissionsCatalog.js';
import { authService } from '../services/authService.js';

function renderLoginView() {
  return `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-4">
          <div class="card shadow">
            <div class="card-header bg-primary text-white text-center">
              <h4 class="mb-0">SGC - Sistema de Gesti&oacute;n de Contrataciones</h4>
              <small>Ley N&ordm; 32069</small>
            </div>
            <div class="card-body">
              <form id="loginForm">
                <div class="mb-3">
                  <label class="form-label">Usuario</label>
                  <input type="text" id="username" class="form-control" placeholder="Ej. hnizama" required autocomplete="username">
                </div>
                <div class="mb-3">
                  <label class="form-label">Contrase&ntilde;a</label>
                  <input type="password" id="password" class="form-control" placeholder="Ingrese su contrase&ntilde;a" required autocomplete="current-password">
                </div>
                <div id="errorMsg" class="alert alert-danger d-none"></div>
                <button type="submit" class="btn btn-primary w-100">Ingresar</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function initLoginView() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMsg');

    const onSuccess = (user) => {
      // RC119: reemplaza sesión completa (invalida caché local de permisos anteriores)
      const raw = user.permisos;
      const hasGrants = raw && typeof raw === 'object' && (
        (Array.isArray(raw.modulos) && raw.modulos.length > 0)
        || (Array.isArray(raw.submodulos) && raw.submodulos.length > 0)
      );
      if (hasGrants) {
        user.permisos = normalizePermisos(raw, user.rol, { explicit: true });
      } else if (raw != null && typeof raw === 'object') {
        // Vacío explícito (usuario sin permisos) o plantilla ya resuelta en backend
        user.permisos = normalizePermisos(raw, user.rol, { explicit: true });
      } else {
        user.permisos = permisosFromRol(user.rol || 'usuario');
      }
      authService.setCurrentUser(user);
      window.location.hash = user.debeCambiarPassword ? '#/cambio-password' : '#/dashboard';
      window.location.reload();
    };

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess(data.user);
        return;
      }
      if (res.status === 401) {
        errorMsg.textContent = data.error || 'Credenciales inválidas.';
        errorMsg.classList.remove('d-none');
        return;
      }
    } catch (err) {
      console.warn('[login] Backend no disponible:', err.message);
    }

    errorMsg.textContent = 'No se pudo conectar con el servidor. Verifique que el backend esté activo.';
    errorMsg.classList.remove('d-none');
  });
}

export { renderLoginView, initLoginView };
