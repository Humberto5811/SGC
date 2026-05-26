export function renderContratacionesView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner">
        <div class="welcome-banner-content">
          <h2>
            <i class="bi bi-cart-check"></i> 
            Gestión de Contrataciones
          </h2>
          <p>Procesos de compra, licitaciones y contratos</p>
        </div>
      </div>

      <div class="card">
        <div class="d-flex justify-between align-center" style="margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <button onclick="window.location.hash='#/contrataciones/nuevo'">
            <i class="bi bi-plus-circle"></i> Nueva Contratación
          </button>
          <div style="display: flex; gap: 8px;">
            <input type="text" placeholder="Buscar contrataciones..." id="searchInput" style="width: 250px;">
            <button class="btn-outline" onclick="buscarContratacion()">
              <i class="bi bi-search"></i> Buscar
            </button>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>N° Contrato</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Estado</th>
                <th>Fecha Inicio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="contratacionesTable">
              <tr>
                <td colspan="6" style="text-align: center;">
                  <div class="text-secondary">Cargando contrataciones...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function initContratacionesView() {
  console.log("Vista de contrataciones inicializada");
  
  const tbody = document.getElementById('contratacionesTable');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td><strong>CON-001</strong></td>
        <td>Tech Solutions S.A.</td>
        <td>S/ 45,000.00</td>
        <td><span class="badge-pending">En proceso</span></td>
        <td>2024-01-10</td>
        <td>
          <button class="btn-outline-sm" onclick="verContratacion('CON-001')">
            <i class="bi bi-eye"></i> Ver
          </button>
        </td>
      </tr>
      <tr>
        <td><strong>CON-002</strong></td>
        <td>Servicios Generales EIRL</td>
        <td>S/ 128,000.00</td>
        <td><span class="badge-approved">Aprobado</span></td>
        <td>2024-01-15</td>
        <td>
          <button class="btn-outline-sm" onclick="verContratacion('CON-002')">
            <i class="bi bi-eye"></i> Ver
          </button>
        </td>
      </tr>
    `;
  }
}

function buscarContratacion() {
  const searchTerm = document.getElementById('searchInput')?.value;
  console.log('Buscando:', searchTerm);
  alert('Funcionalidad de búsqueda en desarrollo');
}

function verContratacion(codigo) {
  console.log('Ver contratación:', codigo);
  alert(`Ver detalles de la contratación ${codigo}`);
}

window.buscarContratacion = buscarContratacion;
window.verContratacion = verContratacion;