function renderLoginView() {
  return `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-4">
          <div class="card shadow">
            <div class="card-header bg-primary text-white text-center">
              <h4 class="mb-0">SGC - Sistema de Gesti?n de Contrataciones</h4>
              <small>Ley N? 32069</small>
            </div>
            <div class="card-body">
              <form id="loginForm">
                <div class="mb-3">
                  <label class="form-label">DNI / Usuario</label>
                  <input type="text" id="dni" class="form-control" placeholder="Ingrese su DNI" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Contrase?a</label>
                  <input type="password" id="password" class="form-control" placeholder="Ingrese su contrase?a" required>
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
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dni = document.getElementById('dni').value;
      const password = document.getElementById('password').value;
      
      // Obtener usuarios del localStorage
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      
      // Buscar usuario por DNI (sin validar contrase?a por ahora)
      const user = users.find(u => u.dni === dni);
      
      if (user) {
        // Guardar usuario actual
        localStorage.setItem('currentUser', JSON.stringify(user));
        console.log('Usuario autenticado:', user);
        // Redirigir al dashboard
        window.location.hash = '#/dashboard';
        // Forzar recarga de la aplicaci?n
        window.location.reload();
      } else {
        // Mostrar error
        const errorMsg = document.getElementById('errorMsg');
        errorMsg.textContent = 'Usuario no encontrado. Pruebe con: admin, au, o dec';
        errorMsg.classList.remove('d-none');
      }
    });
  }
}

export { renderLoginView, initLoginView };