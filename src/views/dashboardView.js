function renderDashboardView() {
  return `
    <div class="container-fluid mt-4">
      <h2>Panel de Control</h2>
      <p class="text-muted">Bienvenido al Sistema de Gestión de Contrataciones.</p>
      
      <div class="row mt-4">
        <div class="col-md-6 col-lg-4 mb-3">
          <div class="card shadow-sm">
            <div class="card-body">
              <h5 class="card-title">Requerimientos y contrataciones</h5>
              <p class="card-text">Desde la solicitud AU hasta la publicación DEC.</p>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-lg-4 mb-3">
          <div class="card shadow-sm">
            <div class="card-body">
              <h5 class="card-title">Resumen de usuarios</h5>
              <p class="card-text">Gestión de usuarios, permisos y accesos por rol.</p>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-lg-4 mb-3">
          <div class="card shadow-sm">
            <div class="card-body">
              <h5 class="card-title">Indicadores</h5>
              <p class="card-text">Métricas y KPIs del sistema.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function initDashboardView() {
  console.log("Dashboard inicializado");
}

export { renderDashboardView, initDashboardView };
