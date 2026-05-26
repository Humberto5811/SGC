export function renderRequerimientosView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner">
        <div class="welcome-banner-content">
          <h2>
            <i class="bi bi-file-text"></i> 
            Gestión de Requerimientos
          </h2>
          <p>Administración de solicitudes y necesidades del sistema</p>
        </div>
      </div>

      <div class="card">
        <div class="d-flex justify-between align-center" style="margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <button onclick="window.location.hash='#/requerimientos/nuevo'">
            <i class="bi bi-plus-circle"></i> Nuevo Requerimiento
          </button>
          <div style="display: flex; gap: 8px;">
            <input type="text" placeholder="Buscar requerimientos..." id="searchInput" style="width: 250px;">
            <button class="btn-outline" onclick="buscarRequerimiento()">
              <i class="bi bi-search"></i> Buscar
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Área</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="requerimientosTable">
              <tr>
                <td colspan="6" style="text-align: center;">
                  <div class="text-secondary">Cargando requerimientos...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function initRequerimientosView() {
  console.log("Vista de requerimientos inicializada");
  
  // Datos de ejemplo
  const tbody = document.getElementById('requerimientosTable');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td><strong>REQ-001</strong></td>
        <td>Adquisición de equipos informáticos</td>
        <td>Tecnología</td>
        <td><span class="badge-pending">Pendiente</span></td>
        <td>2024-01-15</td>
        <td>
          <button class="btn-outline-sm" onclick="verRequerimiento('REQ-001')">
            <i class="bi bi-eye"></i> Ver
          </button>
        </td>
      </tr>
      <tr>
        <td><strong>REQ-002</strong></td>
        <td>Servicio de mantenimiento general</td>
        <td>Operaciones</td>
        <td><span class="badge-approved">Aprobado</span></td>
        <td>2024-01-20</td>
        <td>
          <button class="btn-outline-sm" onclick="verRequerimiento('REQ-002')">
            <i class="bi bi-eye"></i> Ver
          </button>
        </td>
      </tr>
      <tr>
        <td><strong>REQ-003</strong></td>
        <td>Capacitación de personal</td>
        <td>RRHH</td>
        <td><span class="badge-pending">Pendiente</span></td>
        <td>2024-01-25</td>
        <td>
          <button class="btn-outline-sm" onclick="verRequerimiento('REQ-003')">
            <i class="bi bi-eye"></i> Ver
          </button>
        </td>
      </tr>
    `;
  }
}

function buscarRequerimiento() {
  const searchTerm = document.getElementById('searchInput')?.value;
  console.log('Buscando:', searchTerm);
  alert('Funcionalidad de búsqueda en desarrollo');
}

function verRequerimiento(codigo) {
  console.log('Ver requerimiento:', codigo);
  alert(`Ver detalles del requerimiento ${codigo}`);
}

// Exportar funciones globales para usar en onclick
window.buscarRequerimiento = buscarRequerimiento;
window.verRequerimiento = verRequerimiento;