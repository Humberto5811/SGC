import { initRouter, getCurrentRoute } from './router.js';
import { state } from './state.js';
import { storageService } from './services/storageService.js';
import { authService } from './services/authService.js';
import { renderNavbar } from './components/Navbar.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderLoginView, initLoginView } from './views/loginView.js';
import { renderDashboardView, initDashboardView } from './views/dashboardView.js';
import { renderAuRequerimientosView, initAuRequerimientosView } from './views/auRequerimientosView.js';
import { renderDecContratacionesView, initDecContratacionesView } from './views/decContratacionesView.js';
import { renderAdminUsersView, initAdminUsersView } from './views/adminUsersView.js';

const routes = {
  login: { render: renderLoginView, init: initLoginView },
  dashboard: { render: renderDashboardView, init: initDashboardView },
  'au/requerimientos': { render: renderAuRequerimientosView, init: initAuRequerimientosView },
  'dec/contrataciones': { render: renderDecContratacionesView, init: initDecContratacionesView },
  'admin/usuarios': { render: renderAdminUsersView, init: initAdminUsersView },
};

const appEl = document.getElementById('app');

function renderApp() {
  const currentRoute = getCurrentRoute();
  const route = routes[currentRoute] || routes.dashboard;
  const content = route.render();

  const isLoginRoute = currentRoute === 'login';
  const sidebarHtml = isLoginRoute ? '' : renderSidebar(currentRoute);
  const mainClass = isLoginRoute ? 'col-12 px-4 py-4' : 'col-md-10 ms-sm-auto px-4 py-4';

  appEl.innerHTML = `
    ${renderNavbar()}
    <div class="container-fluid">
      <div class="row">
        ${sidebarHtml}
        <main class="${mainClass}">
          ${content}
        </main>
      </div>
    </div>
  `;

  bindGlobalActions();
  route.init && route.init();
}

function bindGlobalActions() {
  const logoutButton = document.querySelector('[data-action="logout"]');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      authService.logout();
      location.hash = '#/login';
    });
  }
}

function bootstrap() {
  storageService.initialize();
  authService.restoreSession();
  initRouter(() => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser && location.hash !== '#/login') {
      location.hash = '#/login';
      return;
    }
    if (currentUser && location.hash === '#/login') {
      location.hash = '#/dashboard';
      return;
    }
    renderApp();
  });
}

window.addEventListener('DOMContentLoaded', bootstrap);