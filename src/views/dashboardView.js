function renderDashboardView() {
  return `
    <div class="dashboard-container">
      <!-- Banner de bienvenida estilo Google -->
      <div class="welcome-banner">
        <div class="welcome-banner-content">
          <h2>
            <i class="bi bi-grid-3x3-gap-fill"></i> 
            Panel de Control
          </h2>
          <p>Bienvenido al Sistema de Gestión de Contrataciones</p>
        </div>
      </div>

      <!-- Grid de tarjetas principales estilo Google -->
      <div class="dashboard-grid">
        <!-- Tarjeta: Requerimientos y contrataciones -->
        <div class="google-card" onclick="window.location.hash='#/requerimientos'">
          <div class="google-card-icon" style="background: linear-gradient(135deg, #4285F4, #34A853);">
            <i class="bi bi-file-earmark-text"></i>
          </div>
          <h3 class="google-card-title">Requerimientos y contrataciones</h3>
          <p class="google-card-text">Desde la solicitud AU hasta la publicación DEC.</p>
          <div class="google-card-footer">
            <span>Gestionar <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

        <!-- Tarjeta: Resumen de usuarios -->
        <div class="google-card" onclick="window.location.hash='#/usuarios'">
          <div class="google-card-icon" style="background: linear-gradient(135deg, #FBBC04, #EA4335);">
            <i class="bi bi-people"></i>
          </div>
          <h3 class="google-card-title">Resumen de usuarios</h3>
          <p class="google-card-text">Gestión de usuarios, permisos y accesos por rol.</p>
          <div class="google-card-footer">
            <span>Administrar <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>

        <!-- Tarjeta: Indicadores -->
        <div class="google-card" onclick="window.location.hash='#/indicadores'">
          <div class="google-card-icon" style="background: linear-gradient(135deg, #34A853, #4285F4);">
            <i class="bi bi-graph-up"></i>
          </div>
          <h3 class="google-card-title">Indicadores</h3>
          <p class="google-card-text">Métricas y KPIs del sistema.</p>
          <div class="google-card-footer">
            <span>Ver detalles <i class="bi bi-arrow-right"></i></span>
          </div>
        </div>
      </div>

      <!-- Sección adicional con estadísticas rápidas -->
      <div class="stats-section">
        <div class="stats-header">
          <h3><i class="bi bi-bar-chart-steps"></i> Indicadores clave</h3>
          <span class="stats-subtitle">Últimos 30 días</span>
        </div>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">24</div>
            <div class="stat-label">Requerimientos activos</div>
            <div class="stat-trend positive">
              <i class="bi bi-arrow-up"></i> +12%
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-value">8</div>
            <div class="stat-label">Contrataciones en curso</div>
            <div class="stat-trend positive">
              <i class="bi bi-arrow-up"></i> +5%
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-value">S/ 1.2M</div>
            <div class="stat-label">Monto ejecutado</div>
            <div class="stat-trend neutral">
              <i class="bi bi-dash-circle"></i> Meta: S/ 2.5M
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-value">92%</div>
            <div class="stat-label">Cumplimiento de metas</div>
            <div class="stat-trend positive">
              <i class="bi bi-arrow-up"></i> +8%
            </div>
          </div>
        </div>
      </div>

      <!-- Tabla de actividades recientes -->
      <div class="recent-activities">
        <div class="activities-header">
          <h3><i class="bi bi-clock-history"></i> Actividades recientes</h3>
          <button class="btn-outline-sm" onclick="verTodasActividades()">
            Ver todas <i class="bi bi-chevron-right"></i>
          </button>
        </div>
        <div class="activities-list">
          <div class="activity-item">
            <div class="activity-icon" style="background: #e8f0fe;">
              <i class="bi bi-file-plus" style="color: #4285F4;"></i>
            </div>
            <div class="activity-details">
              <div class="activity-title">Nuevo requerimiento creado</div>
              <div class="activity-desc">Adquisición de equipos informáticos - Área TI</div>
              <div class="activity-time">Hace 2 horas</div>
            </div>
            <div class="activity-status">
              <span class="badge-pending">Pendiente</span>
            </div>
          </div>
          <div class="activity-item">
            <div class="activity-icon" style="background: #e6f4ea;">
              <i class="bi bi-check-circle" style="color: #34A853;"></i>
            </div>
            <div class="activity-details">
              <div class="activity-title">Contratación aprobada</div>
              <div class="activity-desc">Servicio de mantenimiento preventivo</div>
              <div class="activity-time">Ayer, 14:30</div>
            </div>
            <div class="activity-status">
              <span class="badge-approved">Aprobado</span>
            </div>
          </div>
          <div class="activity-item">
            <div class="activity-icon" style="background: #fef7e0;">
              <i class="bi bi-person-plus" style="color: #FBBC04;"></i>
            </div>
            <div class="activity-details">
              <div class="activity-title">Nuevo usuario registrado</div>
              <div class="activity-desc">María González - Rol: Supervisor</div>
              <div class="activity-time">Ayer, 09:15</div>
            </div>
            <div class="activity-status">
              <span class="badge-active">Activo</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function initDashboardView() {
  console.log("Dashboard inicializado con estilo Google");
  
  // Aquí puedes cargar datos reales desde tu API o storageService
  // Ejemplo: cargar estadísticas reales
  cargarEstadisticasReales();
}

// Función de ejemplo para cargar datos reales
function cargarEstadisticasReales() {
  // Si tienes un storageService, puedes usarlo así:
  // const requerimientos = storageService.getRequerimientos();
  // const contrataciones = storageService.getContrataciones();
  // Actualizar los valores en el DOM
  
  console.log("Estadísticas cargadas");
}

function verTodasActividades() {
  console.log("Ver todas las actividades");
  // window.location.hash = '#/actividades';
}

export { renderDashboardView, initDashboardView };