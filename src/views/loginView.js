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
                  <label class="form-label">DNI / Usuario</label>
                  <input type="text" id="dni" class="form-control" placeholder="Ingrese su DNI" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Contrase&ntilde;a</label>
                  <input type="password" id="password" class="form-control" placeholder="Ingrese su contrase&ntilde;a" required>
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
    const dni = document.getElementById('dni').value.trim();
    const password = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMsg');

    const onSuccess = (user) => {
      localStorage.setItem('currentUser', JSON.stringify(user));
      window.location.hash = '#/dashboard';
      window.location.reload();
    };

    // 1) Intentar autenticar contra el backend (multiusuario).
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni, password }),
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
    } catch (_) {
      // El backend no está disponible: usar respaldo local.
    }

    // 2) Respaldo: usuarios en localStorage (modo sin servidor).
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find((u) => u.dni === dni);
    if (user) {
      onSuccess(user);
    } else {
      errorMsg.textContent = 'Usuario no encontrado. Pruebe con: admin, au, o dec';
      errorMsg.classList.remove('d-none');
    }
  });
}

export { renderLoginView, initLoginView };