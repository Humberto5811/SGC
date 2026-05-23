import { authService } from './services/authService.js';
import { ROUTE_ROLES } from './utils/constants.js';
import { userService } from './services/userService.js';

// Importar las vistas
import { renderLoginView, initLoginView } from './views/loginView.js';
import { renderDashboardView, initDashboardView } from './views/dashboardView.js';
import { renderUsuariosView, initUsuariosView } from './views/adminUsuariosView.js';
import { renderAuRequerimientosView, initAuRequerimientosView } from './views/auRequerimientosView.js';
import { renderDecContratacionesView, initDecContratacionesView } from './views/decContratacionesView.js';
import { renderEjecucionView, initEjecucionView } from './views/ejecucionView.js';
import { renderMantenimientoView, initMantenimientoView } from './views/mantenimientoView.js';

const defaultRoute = 'login';

// 🔹 Definición de rutas
const routes = {
  login: { render: renderLoginView, init: initLoginView },
  dashboard: { render: renderDashboardView, init: initDashboardView },
  'admin/usuarios': { render: renderUsuariosView, init: initUsuariosView },
  'au/requerimientos': { render: renderAuRequerimientosView, init: initAuRequerimientosView },
  'dec/contrataciones': { render: renderDecContratacionesView, init: initDecContratacionesView },
  ejecucion: { render: renderEjecucionView, init: initEjecucionView },
  mantenimiento: { render: renderMantenimientoView, init: initMantenimientoView }
};

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash || defaultRoute;
}

function getCurrentRoute() {
  return parseHash();
}

// 🔹 Validación de roles + permisos
function canAccessRoute(route, action = 'view') {
  const currentUser = authService.getCurrentUser();
  if (!currentUser) {
    return route === 'login';
  }

  // Validar rol
  const allowedRoles = ROUTE_ROLES[route] || [];
  const roleOk = allowedRoles.length === 0 || allowedRoles.includes(currentUser.rol);

  // Validar permisos
  const user = userService.findByDni(currentUser.dni);
  const permOk = userService.hasPermission(user, route, action);

  return roleOk && permOk;
}

function initRouter(onRouteChange) {
  window.addEventListener('hashchange', () => {
    const route = getCurrentRoute();
    if (!canAccessRoute(route)) {
      location.hash = '#/dashboard';
      return;
    }
    const routeConfig = routes[route];
    if (routeConfig) {
      onRouteChange(routeConfig.render, routeConfig.init);
    } else {
      location.hash = '#/dashboard';
    }
  });

  if (!location.hash) {
    location.hash = '#/login';
  }

  const route = getCurrentRoute();
  const routeConfig = routes[route];
  if (routeConfig) {
    onRouteChange(routeConfig.render, routeConfig.init);
  } else {
    location.hash = '#/dashboard';
  }
}

export { initRouter, getCurrentRoute, canAccessRoute, routes };
