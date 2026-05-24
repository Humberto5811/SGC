function renderMantenimientoView() {
  const users = JSON.parse(localStorage.getItem('users') || '[]');
  let tableRows = '';
  users.forEach(u => {
    tableRows += `<tr><td>${u.dni}</td><td>${u.nombre || ''}</td><td>${u.rol}</td><td>${u.email || ''}</td><td>
      <button class="btn btn-sm btn-warning" onclick="alert('Editar usuario: ${u.dni}')">Editar</button>
      <button class="btn btn-sm btn-danger" onclick="alert('Eliminar usuario: ${u.dni}')">Eliminar</button>
    </td></tr>`;
  });
  
  return `
    <div class="container mt-4">
      <h2>Mantenimiento del Sistema</h2>
      <p class="text-muted">Gestión de usuarios, roles y configuración del sistema</p>
      
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item"><a class="nav-link active" href="#" onclick="alert('Usuarios')">Usuarios</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="alert('Roles y Permisos')">Roles y Permisos</a></li>
        <li class="nav-item"><a class="nav-link" href="#" onclick="alert('Configuración')">Configuración</a></li>
      </ul>
      
      <div class="card">
        <div class="card-header bg-primary text-white">
          <h5 class="mb-0">Gestión de Usuarios</h5>
        </div>
        <div class="card-body">
          <button class="btn btn-success mb-3" onclick="alert('Formulario de nuevo usuario')">+ Nuevo Usuario</button>
          <table class="table table-striped">
            <thead>
              <tr><th>DNI</th><th>Nombre</th><th>Rol</th><th>Email</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function initMantenimientoView() { 
  console.log("Vista de Mantenimiento inicializada");
}

export { renderMantenimientoView, initMantenimientoView };
