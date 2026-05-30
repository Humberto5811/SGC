import { initRouter, getCurrentRoute } from './router.js';
import { storageService } from './services/storageService.js';
import { authService } from './services/authService.js';
import { renderNavbar } from './components/Navbar.js';
import { renderSidebar, initSidebar } from './components/Sidebar.js';

const appEl = document.getElementById('app');

async function renderApp() {
  const currentRoute = getCurrentRoute();
  const currentUser = authService.getCurrentUser();
  const isLoginRoute = currentRoute === 'login';
  
  if (!currentUser && !isLoginRoute) {
    window.location.hash = '#/login';
    return;
  }
  
  // Cargar vista según la ruta (incluyendo todas las subrutas)
  let content = '';
  try {
    if (currentRoute === 'login') {
      const loginModule = await import('./views/loginView.js');
      content = loginModule.renderLoginView();
      setTimeout(() => loginModule.initLoginView(), 50);
    } 
    // Dashboard
    else if (currentRoute === 'dashboard') {
      const dashboardModule = await import('./views/dashboardView.js');
      content = dashboardModule.renderDashboardView();
      setTimeout(() => dashboardModule.initDashboardView(), 50);
    }
    // ========== REQUERIMIENTOS Y SUBRUTAS ==========
    else if (currentRoute === 'requerimientos' || 
             currentRoute === 'au/requerimientos/registro' || 
             currentRoute === 'au/requerimientos/evaluacion') {
      const module = await import('./views/requerimientosView.js');
      content = module.renderRequerimientosView(currentRoute);
      setTimeout(() => module.initRequerimientosView(currentRoute), 50);
    }
    // ========== CONTRATACIONES Y SUBRUTAS ==========
    else if (currentRoute === 'contrataciones' || 
             currentRoute === 'dec/actos' ||
             currentRoute === 'dec/invitaciones' ||
             currentRoute === 'dec/consultas' ||
             currentRoute === 'dec/cotizaciones' ||
             currentRoute === 'dec/ccp' ||
             currentRoute === 'dec/cuadro') {
      const module = await import('./views/contratacionesView.js');
      content = module.renderContratacionesView(currentRoute);
      setTimeout(() => module.initContratacionesView(currentRoute), 50);
    }
    // ========== EJECUCIÓN Y SUBRUTAS ==========
    else if (currentRoute === 'ejecucion' || 
             currentRoute === 'ejecucion/registro' ||
             currentRoute === 'ejecucion/presentacion' ||
             currentRoute === 'ejecucion/ampliacion' ||
             currentRoute === 'ejecucion/pago') {
      const module = await import('./views/ejecucionView.js');
      content = module.renderEjecucionView(currentRoute);
      setTimeout(() => module.initEjecucionView(currentRoute), 50);
    }
    // ========== MANTENIMIENTO Y SUBRUTAS ==========
    else if (currentRoute === 'mantenimiento' || 
             currentRoute === 'mantenimiento/usuarios' ||
             currentRoute === 'mantenimiento/catalogo' ||
             currentRoute === 'mantenimiento/fichas' ||
             currentRoute === 'mantenimiento/configuracion' ||
             currentRoute === 'mantenimiento/metas' ||
             currentRoute === 'mantenimiento/ordenes' ||
             currentRoute === 'mantenimiento/siaf' ||
             currentRoute === 'mantenimiento/fichanet' ||
             currentRoute === 'mantenimiento/bienes' ||
             currentRoute === 'mantenimiento/servicios' ||
             currentRoute === 'mantenimiento/locacion' ||
             currentRoute === 'mantenimiento/licitaciones' ||
             currentRoute === 'mantenimiento/concurso' ||
             currentRoute === 'mantenimiento/logotipos' ||
             currentRoute === 'mantenimiento/entidad') {
      const module = await import('./views/mantenimientoView.js');
      content = module.renderMantenimientoView(currentRoute);
      setTimeout(() => module.initMantenimientoView(currentRoute), 50);
    }
    // Vista genérica para rutas no implementadas
    else {
      content = `
        <div class="card">
          <div class="card-title">
            <i class="bi bi-tools"></i> Módulo en desarrollo
          </div>
          <p class="text-secondary">Vista: ${currentRoute}</p>
          <div class="alert alert-info">
            <i class="bi bi-info-circle"></i>
            Esta funcionalidad está siendo implementada.
          </div>
        </div>
      `;
    }
  } catch(e) {
    console.error('Error al cargar vista:', e);
    content = `
      <div class="card">
        <div class="card-title">
          <i class="bi bi-exclamation-triangle"></i> Error al cargar la página
        </div>
        <p class="text-secondary">Intente nuevamente más tarde.</p>
        <div class="alert alert-danger">
          <i class="bi bi-bug"></i>
          ${e.message}
        </div>
      </div>
    `;
  }
  
  const sidebarHtml = isLoginRoute ? '' : renderSidebar(currentRoute);
  const mainMargin = isLoginRoute ? '0' : '280px';
  
  appEl.innerHTML = `
    ${renderNavbar()}
    ${sidebarHtml}
    <main style="margin-left: ${mainMargin}; padding: 24px; transition: all 0.3s ease; min-height: 100vh; background: #f8f9fa;">
      <div class="container-fluid">
        ${content}
      </div>
    </main>
  `;
  
  // Inicializar el sidebar (para que funcionen los clics en submenús)
  if (!isLoginRoute) {
    setTimeout(() => {
      if (typeof initSidebar === 'function') {
        initSidebar();
      }
    }, 100);
  }
  
  // Configurar botón de logout global
  const logoutBtn = document.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      authService.logout();
      window.location.hash = '#/login';
      renderApp();
    };
  }
  
  // Cerrar sidebar en móvil después de navegar
  if (window.innerWidth <= 768) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }
  
  // Resaltar el item activo en el sidebar después de cargar
  highlightActiveMenuItem();
}

// Función para resaltar el item activo del menú
function highlightActiveMenuItem() {
  const currentRoute = getCurrentRoute();
  
  // Remover clase active de todos los items
  document.querySelectorAll('.nav-link, .nav-sublink').forEach(el => {
    el.classList.remove('active');
  });
  
  // Buscar y agregar clase active al elemento que coincide con la ruta
  document.querySelectorAll('.nav-link[data-route], .nav-sublink[data-route]').forEach(el => {
    if (el.dataset.route === currentRoute) {
      el.classList.add('active');
    }
  });
}

function bootstrap() {
  storageService.initialize();
  authService.restoreSession();
  initRouter(() => renderApp());
  renderApp();
}

window.addEventListener('DOMContentLoaded', bootstrap);