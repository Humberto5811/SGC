import { authService } from '../services/authService.js';

function renderNavbar() {
  const user = authService.getCurrentUser();
  return `
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary sticky-top">
      <div class="container-fluid">
        <a class="navbar-brand" href="#/dashboard">SGC</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarContent">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0"></ul>
          <span class="navbar-text text-white me-3">${user ? `Hola, ${user.nombre}` : 'Invitado'}</span>
          ${user ? '<button class="btn btn-outline-light btn-sm" data-action="logout">Cerrar sesión</button>' : ''}
        </div>
      </div>
    </nav>
  `;
}

export { renderNavbar };