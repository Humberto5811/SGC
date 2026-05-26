export function renderEjecucionView() {
  return `
    <div class="dashboard-container">
      <div class="welcome-banner">
        <div class="welcome-banner-content">
          <h2>
            <i class="bi bi-graph-up"></i> 
            Ejecución de Contratos
          </h2>
          <p>Seguimiento y monitoreo de contratos activos</p>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="stat-item">
          <div class="stat-value">12</div>
          <div class="stat-label">Contratos activos</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">S/ 850K</div>
          <div class="stat-label">Monto ejecutado</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">78%</div>
          <div class="stat-label">Avance general</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <i class="bi bi-list-check"></i> Contratos en ejecución
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Proveedor</th>
                <th>Avance</th>
                <th>Estado</th>
                <th>Próximo hito</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>CON-001</strong></td>
                <td>Tech Solutions</td>
                <td>
                  <div style="background: #e8eaed; border-radius: 10px; height: 8px; width: 100%;">
                    <div style="background: #1a73e8; width: 65%; height: 8px; border-radius: 10px;"></div>
                  </div>
                  <small>65%</small>
                </td>
                <td><span class="badge-active">En progreso</span></td>
                <td>Entrega parcial - 15/02/2024</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

export function initEjecucionView() {
  console.log("Vista de ejecución inicializada");
}