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
import { renderCatalogosIGAMEFView, initCatalogosIGAMEFView } from './views/registroDatos/ctlgIGAMEFView.js';

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

// Todas las rutas del sistema
const routes = {
  // Autenticación
  login: { render: renderLoginView, init: initLoginView },
  
  // Dashboard principal
  dashboard: { render: renderDashboardView, init: initDashboardView },

  // ========== REQUERIMIENTOS ==========
  'requerimientos': { render: renderRegistroRequerimientoView, init: initRegistroRequerimientoView },
  'au/requerimientos/registro': { render: renderRegistroRequerimientoView, init: initRegistroRequerimientoView },
  'au/requerimientos/evaluacion': { render: renderEvaluacionRequerimientoView, init: initEvaluacionRequerimientoView },

  // ========== CONTRATACIONES ==========
  'contrataciones': { render: renderActosPreparativosView, init: initActosPreparativosView },
  'dec/actos': { render: renderActosPreparativosView, init: initActosPreparativosView },
  'dec/invitaciones': { render: renderInvitacionesView, init: initInvitacionesView },
  'dec/consultas': { render: renderConsultasView, init: initConsultasView },
  'dec/cotizaciones': { render: renderCotizacionesView, init: initCotizacionesView },
  'dec/ccp': { render: renderCcpView, init: initCcpView },
  'dec/cuadro': { render: renderCuadroComparativoView, init: initCuadroComparativoView },

  // ========== EJECUCIÓN ==========
  'ejecucion': { render: renderEjecucionView, init: initEjecucionView },
  'ejecucion/registro': { render: renderRegistroOrdenView, init: initRegistroOrdenView },
  'ejecucion/presentacion': { render: renderPresentacionEntregableView, init: initPresentacionEntregableView },
  'ejecucion/ampliacion': { render: renderAmpliacionResolucionView, init: initAmpliacionResolucionView },
  'ejecucion/pago': { render: renderDerivacionPagoView, init: initDerivacionPagoView },

  // ========== MANTENIMIENTO - REGISTRO DE DATOS ==========
  'mantenimiento': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },
  'admin/usuarios': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },
  'mantenimiento/usuarios': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },
  'mantenimiento/catalogo': { render: renderCatalogoSigamefView, init: initCatalogoSigamefView },
  'mantenimiento/fichas': { render: renderFichasTecnicasView, init: initFichasTecnicasView },
  'mantenimiento/configuracion': { render: renderConfiguracionDocView, init: initConfiguracionDocView },
  'mantenimiento/metas': { render: renderMetasAreasView, init: initMetasAreasView },
  'mantenimiento/ordenes': { render: renderOrdenesView, init: initOrdenesView },
  'mantenimiento/siaf': { render: renderSiafView, init: initSiafView },
  'mantenimiento/catalogosigamef': { render: renderCatalogosIGAMEFView, init: initCatalogosIGAMEFView },

  // ========== MANTENIMIENTO - GLOSAS DE REQUERIMIENTOS ==========
  'mantenimiento/bienes': { render: renderFormatoBienesView, init: initFormatoBienesView },
  'mantenimiento/servicios': { render: renderFormatoServiciosView, init: initFormatoServiciosView },
  'mantenimiento/locacion': { render: renderFormatoLocacionView, init: initFormatoLocacionView },
  'mantenimiento/licitaciones': { render: renderFormatoLicitacionesView, init: initFormatoLicitacionesView },
  'mantenimiento/concurso': { render: renderFormatoConcursoView, init: initFormatoConcursoView },

  // ========== MANTENIMIENTO - INSTITUCIONAL ==========
  'mantenimiento/logotipos': { render: renderLogotiposView, init: initLogotiposView },
  'mantenimiento/entidad': { render: renderEntidadView, init: initEntidadView }
};

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  // Si el hash está vacío, ir a dashboard (si hay usuario) o login
  if (!hash) {
    const currentUser = authService.getCurrentUser();
    return currentUser ? 'dashboard' : 'login';
  }
  return hash;
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
  // Manejar cambio de hash
  window.addEventListener('hashchange', () => {
    const route = getCurrentRoute();
    
    // Verificar acceso
    if (!canAccessRoute(route)) {
      const currentUser = authService.getCurrentUser();
      location.hash = currentUser ? '#/dashboard' : '#/login';
      return;
    }
    
    const routeConfig = routes[route];
    if (routeConfig) {
      onRouteChange();
    } else {
      // Ruta no encontrada, ir a dashboard
      const currentUser = authService.getCurrentUser();
      location.hash = currentUser ? '#/dashboard' : '#/login';
    }
  });

  // Inicializar hash si no existe
  if (!location.hash || location.hash === '#') {
    const currentUser = authService.getCurrentUser();
    location.hash = currentUser ? '#/dashboard' : '#/login';
  }

  // Verificar acceso a la ruta inicial
  const route = getCurrentRoute();
  if (!canAccessRoute(route)) {
    const currentUser = authService.getCurrentUser();
    location.hash = currentUser ? '#/dashboard' : '#/login';
  } else {
    const routeConfig = routes[route];
    if (routeConfig) {
      onRouteChange();
    } else {
      const currentUser = authService.getCurrentUser();
      location.hash = currentUser ? '#/dashboard' : '#/login';
    }
  }
}

// Función para obtener la configuración de una ruta
function getRouteConfig(route) {
  return routes[route] || null;
}

// Exportar funciones
export { initRouter, getCurrentRoute, canAccessRoute, routes, getRouteConfig };