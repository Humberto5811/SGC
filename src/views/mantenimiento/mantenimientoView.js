export function renderMantenimientoView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner">
        <div class="welcome-banner-content">
          <h2>
            <i class="bi bi-wrench"></i> 
            Mantenimiento del Sistema
          </h2>
          <p>Gestión de incidencias y mantenimiento preventivo</p>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <i class="bi bi-exclamation-triangle"></i> Reportes de incidencias
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Prioridad</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>INC-001</td>
                <td>Software</td>
                <td>Error en módulo de reportes</td>
                <td><span class="badge-pending">Media</span></td>
                <td><span class="badge-active">En revisión</span></td>
              </tr>
              <tr>
                <td>INC-002</td>
                <td>Hardware</td>
                <td>Servidor de base de datos lento</td>
                <td><span class="badge-approved">Alta</span></td>
                <td><span class="badge-pending">Pendiente</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function initMantenimientoView() {
  console.log("Vista de mantenimiento inicializada");
}