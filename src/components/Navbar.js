export function renderNavbar() {
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  return `
    <nav class="navbar navbar-dark bg-dark fixed-top">
      <div class="container-fluid">
        <span class="navbar-brand">
          SGC - Sistema de Gestión de Contrataciones
        </span>
        <div class="d-flex align-items-center">
          ${currentUser ? `<span class="text-white me-3 d-none d-sm-inline">Rol: ${currentUser.rol}</span>` : ''}
          ${currentUser ? `<span class="text-white me-3 d-none d-md-inline">${currentUser.nombre || currentUser.dni}</span>` : ''}
          ${currentUser ? `<button class="btn btn-outline-light btn-sm" data-action="logout">Salir</button>` : ''}
        </div>
      </div>
    </nav>
    <div style="height: 56px;"></div>
  `;
}
