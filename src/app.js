import { initRouter, getCurrentRoute } from './router.js';
import { storageService } from './services/storageService.js';
import { authService } from './services/authService.js';
import { renderNavbar } from './components/Navbar.js';
import { renderSidebar } from './components/Sidebar.js';

const appEl = document.getElementById('app');

async function renderApp() {
  const currentRoute = getCurrentRoute();
  const currentUser = authService.getCurrentUser();
  const isLoginRoute = currentRoute === 'login';
  
  if (!currentUser && !isLoginRoute) {
    window.location.hash = '#/login';
    return;
  }
  
  // Cargar vista según la ruta
  let content = '';
  try {
    if (currentRoute === 'login') {
      const loginModule = await import('./views/loginView.js');
      content = loginModule.renderLoginView();
      setTimeout(() => loginModule.initLoginView(), 50);
    } else if (currentRoute === 'dashboard') {
      const dashboardModule = await import('./views/dashboardView.js');
      content = dashboardModule.renderDashboardView();
      setTimeout(() => dashboardModule.initDashboardView(), 50);
    } else {
      // Vista genérica para rutas no implementadas
      content = `<div class="container mt-4">
        <h2>Módulo en desarrollo</h2>
        <p class="text-muted">Vista: ${currentRoute}</p>
        <div class="alert alert-info">Esta funcionalidad está siendo implementada.</div>
      </div>`;
    }
  } catch(e) {
    console.error('Error al cargar vista:', e);
    content = `<div class="container mt-4">
      <h2>Error al cargar la página</h2>
      <p class="text-muted">Intente nuevamente más tarde.</p>
    </div>`;
  }
  
  const sidebarHtml = isLoginRoute ? '' : renderSidebar(currentRoute);
  const mainMargin = isLoginRoute ? '0' : '260px';
  
  appEl.innerHTML = `
    ${renderNavbar()}
    ${sidebarHtml}
    <main style="margin-left: ${mainMargin}; padding: 20px; transition: all 0.3s;">
      ${content}
    </main>
  `;
  
  // Configurar botón de logout global
  const logoutBtn = document.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      authService.logout();
      window.location.hash = '#/login';
      renderApp();
    };
  }
}

function bootstrap() {
  storageService.initialize();
  authService.restoreSession();
  initRouter(() => renderApp());
  renderApp();
}

window.addEventListener('DOMContentLoaded', bootstrap);
