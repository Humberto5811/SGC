import { authService } from './services/authService.js';
import { ROUTE_ROLES } from './utils/constants.js';
import { userService } from './services/userService.js';

// Vistas principales
import { renderLoginView, initLoginView } from './views/loginView.js';
import { renderDashboardView, initDashboardView } from './views/dashboardView.js';

// Administración de usuarios (Registro de datos)
import { renderUsuariosPermisosView, initUsuariosPermisosView } from './views/registroDatos/usuariosPermisosView.js';

// Requerimientos
import { renderRegistroRequerimientoView, initRegistroRequerimientoView } from './views/requerimiento/registroRequerimientoView.js';
import { renderEvaluacionRequerimientoView, initEvaluacionRequerimientoView } from './views/requerimiento/evaluacionRequerimientoView.js';

// Contrataciones
import { renderActosPreparativosView, initActosPreparativosView } from './views/contratacion/actosPreparativosView.js';
import { renderInvitacionesView, initInvitacionesView } from './views/contratacion/invitacionesView.js';
import { renderConsultasView, initConsultasView } from './views/contratacion/consultasView.js';
import { renderCotizacionesView, initCotizacionesView } from './views/contratacion/cotizacionesView.js';
import { renderCcpView, initCcpView } from './views/contratacion/ccpView.js';
import { renderCuadroComparativoView, initCuadroComparativoView } from './views/contratacion/cuadroComparativoView.js';

// Ejecución
import { renderEjecucionView, initEjecucionView } from './views/ejecucion/ejecucionView.js';
import { renderRegistroOrdenView, initRegistroOrdenView } from './views/ejecucion/registroOrdenView.js';
import { renderPresentacionEntregableView, initPresentacionEntregableView } from './views/ejecucion/presentacionEntregableView.js';
import { renderAmpliacionResolucionView, initAmpliacionResolucionView } from './views/ejecucion/ampliacionResolucionView.js';
import { renderDerivacionPagoView, initDerivacionPagoView } from './views/ejecucion/derivacionPagoView.js';

// Mantenimiento - Registros de datos
import { renderCatalogoSigamefView, initCatalogoSigamefView } from './views/registroDatos/catalogoSigamefView.js';
import { renderFichasTecnicasView, initFichasTecnicasView } from './views/registroDatos/fichasTecnicasView.js';
import { renderConfiguracionDocView, initConfiguracionDocView } from './views/registroDatos/configuracionDocView.js';
import { renderMetasAreasView, initMetasAreasView } from './views/registroDatos/metasAreasView.js';
import { renderOrdenesView, initOrdenesView } from './views/registroDatos/ordenesView.js';
import { renderSiafView, initSiafView } from './views/registroDatos/siafView.js';

// Mantenimiento - Glosas de Requerimientos
import { renderFormatoBienesView, initFormatoBienesView } from './views/glosasRequerimientos/formatoBienesView.js';
import { renderFormatoServiciosView, initFormatoServiciosView } from './views/glosasRequerimientos/formatoServiciosView.js';
import { renderFormatoLocacionView, initFormatoLocacionView } from './views/glosasRequerimientos/formatoLocacionView.js';
import { renderFormatoLicitacionesView, initFormatoLicitacionesView } from './views/glosasRequerimientos/formatoLicitacionesView.js';
import { renderFormatoConcursoView, initFormatoConcursoView } from './views/glosasRequerimientos/formatoConcursoView.js';

// Mantenimiento - Institucional
import { renderLogotiposView, initLogotiposView } from './views/institucional/logotiposView.js';
import { renderEntidadView, initEntidadView } from './views/institucional/entidadView.js';

const defaultRoute = 'login';

const routes = {
  login: { render: renderLoginView, init: initLoginView },
  dashboard: { render: renderDashboardView, init: initDashboardView },

  // Administración
  'admin/usuarios': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },

  // Requerimientos
  'au/requerimientos/registro': { render: renderRegistroRequerimientoView, init: initRegistroRequerimientoView },
  'au/requerimientos/evaluacion': { render: renderEvaluacionRequerimientoView, init: initEvaluacionRequerimientoView },

  // Contrataciones
  'dec/actos': { render: renderActosPreparativosView, init: initActosPreparativosView },
  'dec/invitaciones': { render: renderInvitacionesView, init: initInvitacionesView },
  'dec/consultas': { render: renderConsultasView, init: initConsultasView },
  'dec/cotizaciones': { render: renderCotizacionesView, init: initCotizacionesView },
  'dec/ccp': { render: renderCcpView, init: initCcpView },
  'dec/cuadro': { render: renderCuadroComparativoView, init: initCuadroComparativoView },

  // Ejecución
  ejecucion: { render: renderEjecucionView, init: initEjecucionView },
  'ejecucion/registro': { render: renderRegistroOrdenView, init: initRegistroOrdenView },
  'ejecucion/presentacion': { render: renderPresentacionEntregableView, init: initPresentacionEntregableView },
  'ejecucion/ampliacion': { render: renderAmpliacionResolucionView, init: initAmpliacionResolucionView },
  'ejecucion/pago': { render: renderDerivacionPagoView, init: initDerivacionPagoView },

  // Mantenimiento - Registros de datos
  'mantenimiento/catalogo': { render: renderCatalogoSigamefView, init: initCatalogoSigamefView },
  'mantenimiento/fichas': { render: renderFichasTecnicasView, init: initFichasTecnicasView },
  'mantenimiento/configuracion': { render: renderConfiguracionDocView, init: initConfiguracionDocView },
  'mantenimiento/metas': { render: renderMetasAreasView, init: initMetasAreasView },
  'mantenimiento/usuarios': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },
  'mantenimiento/ordenes': { render: renderOrdenesView, init: initOrdenesView },
  'mantenimiento/siaf': { render: renderSiafView, init: initSiafView },

  // Mantenimiento - Glosas
  'mantenimiento/bienes': { render: renderFormatoBienesView, init: initFormatoBienesView },
  'mantenimiento/servicios': { render: renderFormatoServiciosView, init: initFormatoServiciosView },
  'mantenimiento/locacion': { render: renderFormatoLocacionView, init: initFormatoLocacionView },
  'mantenimiento/licitaciones': { render: renderFormatoLicitacionesView, init: initFormatoLicitacionesView },
  'mantenimiento/concurso': { render: renderFormatoConcursoView, init: initFormatoConcursoView },

  // Mantenimiento - Institucional
  'mantenimiento/logotipos': { render: renderLogotiposView, init: initLogotiposView },
  'mantenimiento/entidad': { render: renderEntidadView, init: initEntidadView }
};

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash || defaultRoute;
}

function getCurrentRoute() {
  return parseHash();
}

function canAccessRoute(route, action = 'view') {
  const currentUser = authService.getCurrentUser();
  if (!currentUser) {
    return route === 'login';
  }
  const allowedRoles = ROUTE_ROLES[route] || [];
  const roleOk = allowedRoles.length === 0 || allowedRoles.includes(currentUser.rol);
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

// 🔹 Exportar funciones y rutas
export { initRouter, getCurrentRoute, canAccessRoute, routes };
