import { authService } from '../services/authService.js';
import { requerimientoService } from '../services/requerimientoService.js';

function renderDashboardView() {
  const user = authService.getCurrentUser();
  const roleLabel = user ? user.rol : 'Invitado';
  return `
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3">Panel de Control</h1>
        <p class="text-muted">Bienvenido al Sistema de Gestión de Contrataciones.</p>
      </div>
      <div class="text-end">
        <span class="badge bg-secondary">Rol: ${roleLabel}</span>
      </div>
    </div>
    <div class="row g-4">
      <div class="col-md-6">
        <div class="card shadow-sm">
          <div class="card-body">
            <h5 class="card-title">Resumen de usuarios</h5>
            <p class="card-text">Gestión de usuarios, permisos y accesos por rol.</p>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card shadow-sm">
          <div class="card-body">
            <h5 class="card-title">Requerimientos y contrataciones</h5>
            <p class="card-text">Desde la solicitud AU hasta la publicación DEC.</p>
          </div>
        </div>
      </div>
      <div class="col-12">
        <div class="card shadow-sm">
          <div class="card-body">
            <h5 class="card-title">Indicadores</h5>
            <canvas id="dashboardChart" height="120"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}

function initDashboardView() {
  const ctx = document.getElementById('dashboardChart');
  if (!ctx || !window.Chart) return;

  // Obtenemos los requerimientos desde el servicio
  const requerimientos = requerimientoService.list();
  const bienes = requerimientos.filter(r => r.tipo === 'BIENES').length;
  const servicios = requerimientos.filter(r => r.tipo === 'SERVICIOS').length;
  const locacion = requerimientos.filter(r => r.tipo === 'LOCACION').length;

  new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Bienes', 'Servicios', 'Locación'],
      datasets: [
        {
          data: [bienes, servicios, locacion],
          backgroundColor: ['#0d6efd', '#198754', '#fd7e14'],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });
}

export { renderDashboardView, initDashboardView };
