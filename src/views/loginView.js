import { authService } from '../services/authService.js';

function renderLoginView() {
  return `
    <div class="row justify-content-center mt-5">
      <div class="col-md-5">
        <div class="card shadow-sm">
          <div class="card-body">
            <h2 class="card-title mb-3">Ingreso SGC</h2>
            <form id="loginForm">
              <div class="mb-3">
                <label for="dni" class="form-label">DNI</label>
                <input id="dni" name="dni" type="text" class="form-control" required />
              </div>
              <div class="mb-3">
                <label for="password" class="form-label">Contraseña</label>
                <input id="password" name="password" type="password" class="form-control" required />
              </div>
              <button type="submit" class="btn btn-primary w-100">Ingresar</button>
            </form>
            <div id="loginError" class="alert alert-danger mt-3 d-none" role="alert"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function bindLoginActions() {
  const form = document.getElementById('loginForm');
  const errorEl = document.getElementById('loginError');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const dni = form.dni.value.trim();
    const password = form.password.value.trim();
    const user = authService.login(dni, password);
    if (user) {
      location.hash = '#/dashboard';
      return;
    }
    errorEl.textContent = 'DNI o contraseña incorrectos.';
    errorEl.classList.remove('d-none');
  });
}

function initLoginView() {
  bindLoginActions();
}

export { renderLoginView, initLoginView };