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
  
  let content = '';
  try {
    // Login
    if (currentRoute === 'login') {
      const module = await import('./views/loginView.js');
      content = module.renderLoginView();
      setTimeout(() => module.initLoginView(), 50);
    }
    // Dashboard
    else if (currentRoute === 'dashboard') {
      const module = await import('./views/dashboardView.js');
      content = module.renderDashboardView();
      setTimeout(() => module.initDashboardView(), 50);
    }
    // NUEVO MÓDULO: Catálogos IGAMEF
    else if (currentRoute === 'mantenimiento/catalogosigamef') {
      const module = await import('./views/registroDatos/ctlgIGAMEFView.js');
      content = module.renderCatalogosIGAMEFView();
      setTimeout(() => module.initCatalogosIGAMEFView(), 50);
    }
    // Mantenimiento general
    else if (currentRoute === 'mantenimiento' || 
             currentRoute === 'mantenimiento/usuarios' ||
             currentRoute === 'mantenimiento/catalogo' ||
             currentRoute === 'mantenimiento/fichas' ||
             currentRoute === 'mantenimiento/configuracion' ||
             currentRoute === 'mantenimiento/metas' ||
             currentRoute === 'mantenimiento/ordenes' ||
             currentRoute === 'mantenimiento/siaf' ||
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
    // Otras rutas...
    else {
      content = `<div class="card"><div class="card-title">Módulo en desarrollo: ${currentRoute}</div></div>`;
    }
  } catch(e) {
    console.error('Error:', e);
    content = `<div class="alert alert-danger">Error: ${e.message}</div>`;
  }
  
  const sidebarHtml = isLoginRoute ? '' : renderSidebar(currentRoute);
  const mainMargin = isLoginRoute ? '0' : '280px';
  
  appEl.innerHTML = `
    ${renderNavbar()}
    ${sidebarHtml}
    <main style="margin-left: ${mainMargin}; padding: 24px;">
      <div class="container-fluid">${content}</div>
    </main>
  `;
  
  if (!isLoginRoute) {
    setTimeout(() => { if (typeof initSidebar === 'function') initSidebar(); }, 100);
  }
  
  const logoutBtn = document.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      authService.logout();
      window.location.hash = '#/login';
      renderApp();
    };
  }
  
  highlightActiveMenuItem();
}

function highlightActiveMenuItem() {
  const currentRoute = getCurrentRoute();
  document.querySelectorAll('.nav-link, .nav-sublink').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link[data-route], .nav-sublink[data-route]').forEach(el => {
    if (el.dataset.route === currentRoute) el.classList.add('active');
  });
}

function bootstrap() {
  storageService.initialize();
  authService.restoreSession();
  initRouter(() => renderApp());
  renderApp();
}

window.addEventListener('DOMContentLoaded', bootstrap);