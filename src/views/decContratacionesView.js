function renderDecContratacionesView() {
  return `
    <div class="container mt-4">
      <h2>Gestión de Contrataciones</h2>
      <p class="text-muted">Módulo para la gestión de contrataciones - DEC</p>
      
      <div class="card mt-4">
        <div class="card-header bg-success text-white">
          <h5 class="mb-0">Procesos de Contratación</h5>
        </div>
        <div class="card-body">
          <button class="btn btn-success mb-3" onclick="alert(\'Nuevo proceso de contratación en desarrollo\')">
            + Nuevo Proceso
          </button>
          <table class="table table-striped">
            <thead>
              <tr><th>N° Proceso</th><th>Descripción</th><th>Tipo</th><th>Estado</th><th>Monto</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              <tr><td>CON-001</td><td>Compra de equipos</td><td>Bienes</td><td><span class="badge bg-info">En proceso</span></td><td>S/ 15,000</td><td><button class="btn btn-sm btn-primary">Ver</button></td></tr>
              <tr><td>CON-002</td><td>Servicio de limpieza</td><td>Servicios</td><td><span class="badge bg-success">Adjudicado</span></td><td>S/ 45,000</td><td><button class="btn btn-sm btn-primary">Ver</button></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function initDecContratacionesView() { 
  console.log("Vista de Contrataciones inicializada");
}

export { renderDecContratacionesView, initDecContratacionesView };
