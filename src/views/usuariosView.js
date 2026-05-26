export function renderUsuariosView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner">
        <div class="welcome-banner-content">
          <h2>
            <i class="bi bi-people"></i> 
            Gestión de Usuarios
          </h2>
          <p>Administración de usuarios, roles y permisos</p>
        </div>
      </div>

      <div class="card">
        <div class="d-flex justify-between align-center" style="margin-bottom: 20px;">
          <button onclick="window.location.hash='#/usuarios/nuevo'">
            <i class="bi bi-person-plus"></i> Nuevo Usuario
          </button>
        </div>

        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>admin</td>
                <td>admin@sgc.com</td>
                <td>Administrador</td>
                <td><span class="badge-approved">Activo</span></td>
                <td>
                  <button class="btn-outline-sm">Editar</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function initUsuariosView() {
  console.log("Vista de usuarios inicializada");
}