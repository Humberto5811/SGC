import { authService } from './services/authService.js';
import { permissionsService } from './services/permissionsService.js';
import { resolveCanonicalRoute } from './utils/permissionsCatalog.js';

// Vistas principales
import { renderLoginView, initLoginView } from './views/loginView.js';
import { renderCambioPasswordView, initCambioPasswordView } from './views/cambioPasswordView.js';
import { renderDashboardView, initDashboardView } from './views/dashboardView.js';

// Administración de usuarios (Registro de datos)
import { renderUsuariosPermisosView, initUsuariosPermisosView } from './views/registroDatos/usuariosPermisosView.js';

// Requerimientos
import { renderRegistroRequerimientoView, initRegistroRequerimientoView } from './views/requerimiento/registroRequerimientoView.js';
import { renderEvaluacionRequerimientoView, initEvaluacionRequerimientoView } from './views/requerimiento/evaluacionRequerimientoView.js';

// Contrataciones
import { renderDecView, initDecView } from './views/contratacion/decView.js';
import { renderActosPreparativosView, initActosPreparativosView } from './views/contratacion/actosPreparativosView.js';
import { renderInvitacionesView, initInvitacionesView } from './views/contratacion/invitacionesView.js';
import { renderConsultasObservacionesView, initConsultasObservacionesView } from './views/contratacion/consultasObservacionesView.js';
import { renderRecepcionCotizacionesView, initRecepcionCotizacionesView } from './views/contratacion/recepcionCotizacionesView.js';
import { renderValidacionesView, initValidacionesView } from './views/contratacion/validacionesView.js';
import { renderPortalProveedoresView, initPortalProveedoresView } from './views/portal/portalProveedoresView.js';
import { renderCcpView, initCcpView } from './views/contratacion/ccpView.js';
import { renderCuadroComparativoView, initCuadroComparativoView } from './views/contratacion/cuadroComparativoView.js';
import { renderRegistroOrdenesView, initRegistroOrdenesView } from './views/contratacion/registroOrdenesView.js';

// Ejecución
import { renderEjecucionView, initEjecucionView } from './views/ejecucion/ejecucionView.js';
import { renderRecepcionBienesView, initRecepcionBienesView } from './views/ejecucion/recepcionBienesView.js';
import { renderPresentacionEntregableView, initPresentacionEntregableView } from './views/ejecucion/presentacionEntregableView.js';
import { renderAmpliacionResolucionView, initAmpliacionResolucionView } from './views/ejecucion/ampliacionResolucionView.js';
import { renderDerivacionPagoView, initDerivacionPagoView } from './views/ejecucion/derivacionPagoView.js';

// Mantenimiento - Registros de datos
import { renderCatalogoSigamefView, initCatalogoSigamefView } from './views/registroDatos/catalogoSigamefView.js';
import { renderPedidosSigamefView, initPedidosSigamefView } from './views/registroDatos/pedidosSigamefView.js';
import { renderConfiguracionDocView, initConfiguracionDocView } from './views/registroDatos/configuracionDocView.js';
import { renderMetasAreasView, initMetasAreasView } from './views/registroDatos/metasAreasView.js';
import { renderOrdenesView, initOrdenesView } from './views/registroDatos/ordenesView.js';
import { renderSiafView, initSiafView } from './views/registroDatos/siafView.js';
import { renderFichaNetView, initFichaNetView } from './views/registroDatos/fichaNetView.js';
import { renderCarrerasProfesionalesView, initCarrerasProfesionalesView } from './views/registroDatos/carrerasProfesionalesView.js';

// Programación
import { renderProgramacionView, initProgramacionView } from './views/programacion/programacionView2.js';

// Mantenimiento - Glosas de Requerimientos
import { renderFormatoBienesView, initFormatoBienesView } from './views/glosasRequerimientos/formatoBienesView.js';
import { renderFormatoServiciosView, initFormatoServiciosView } from './views/glosasRequerimientos/formatoServiciosView.js';
import { renderFormatoLocacionView, initFormatoLocacionView } from './views/glosasRequerimientos/formatoLocacionView.js';
import { renderFormatoLicitacionesView, initFormatoLicitacionesView } from './views/glosasRequerimientos/formatoLicitacionesView.js';
import { renderFormatoConcursoView, initFormatoConcursoView } from './views/glosasRequerimientos/formatoConcursoView.js';

// Mantenimiento - Institucional
import { renderLogotiposView, initLogotiposView } from './views/institucional/logotiposView.js';
import { renderEntidadView, initEntidadView } from './views/institucional/entidadView.js';
import { renderProveedoresMaestroView, initProveedoresMaestroView } from './views/registroDatos/proveedoresMaestroView.js';

const defaultRoute = 'login';

// Todas las rutas del sistema
const routes = {
  // Autenticación
  login: { render: renderLoginView, init: initLoginView },
  'cambio-password': { render: renderCambioPasswordView, init: initCambioPasswordView },
  
  // Dashboard principal
  dashboard: { render: renderDashboardView, init: initDashboardView },

  // ========== REQUERIMIENTOS ==========
  'requerimientos': { render: renderRegistroRequerimientoView, init: initRegistroRequerimientoView },
  'au/requerimientos/registro': { render: renderRegistroRequerimientoView, init: initRegistroRequerimientoView },
  'au/requerimientos/evaluacion': { render: renderEvaluacionRequerimientoView, init: initEvaluacionRequerimientoView },

  // ========== CONTRATACIONES ==========
  'contrataciones': { render: renderActosPreparativosView, init: initActosPreparativosView },
  'dec/dec': { render: renderDecView, init: initDecView },
  'dec/programacion': { render: renderProgramacionView, init: initProgramacionView },
  'dec/actos': { render: renderActosPreparativosView, init: initActosPreparativosView },
  'dec/invitaciones': { render: renderInvitacionesView, init: initInvitacionesView },
  'contrataciones/consultas-observaciones': { render: renderConsultasObservacionesView, init: initConsultasObservacionesView },
  'contrataciones/recepcion-cotizaciones': { render: renderRecepcionCotizacionesView, init: initRecepcionCotizacionesView },
  'contrataciones/validaciones': { render: renderValidacionesView, init: initValidacionesView },
  'dec/consultas': { render: renderConsultasObservacionesView, init: initConsultasObservacionesView },
  'dec/cotizaciones': { render: renderRecepcionCotizacionesView, init: initRecepcionCotizacionesView },
  'dec/ccp': { render: renderCcpView, init: initCcpView },
  'dec/cuadro': { render: renderCuadroComparativoView, init: initCuadroComparativoView },
  'dec/registro-ordenes': { render: renderRegistroOrdenesView, init: initRegistroOrdenesView },

  // Portal de Proveedores (módulo independiente — acceso público con login propio)
  'portal-proveedores': { render: renderPortalProveedoresView, init: initPortalProveedoresView },

  // ========== EJECUCIÓN ==========
  'ejecucion': { render: renderEjecucionView, init: initEjecucionView },
  'ejecucion/registro': { render: renderRecepcionBienesView, init: initRecepcionBienesView },
  'ejecucion/recepcion-bienes': { render: renderRecepcionBienesView, init: initRecepcionBienesView },
  'ejecucion/presentacion': { render: renderPresentacionEntregableView, init: initPresentacionEntregableView },
  'ejecucion/ampliacion': { render: renderAmpliacionResolucionView, init: initAmpliacionResolucionView },
  'ejecucion/pago': { render: renderDerivacionPagoView, init: initDerivacionPagoView },

  // ========== PROGRAMACIÓN ==========
  'au/programacion': { render: renderProgramacionView, init: initProgramacionView },

  // ========== MANTENIMIENTO - REGISTRO DE DATOS ==========
  'mantenimiento': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },
  'admin/usuarios': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },
  'mantenimiento/usuarios': { render: renderUsuariosPermisosView, init: initUsuariosPermisosView },
  'mantenimiento/proveedores': { render: renderProveedoresMaestroView, init: initProveedoresMaestroView },
  'mantenimiento/catalogo': { render: renderCatalogoSigamefView, init: initCatalogoSigamefView },
  'mantenimiento/pedidos-sigamef': { render: renderPedidosSigamefView, init: initPedidosSigamefView },
  'mantenimiento/configuracion': { render: renderConfiguracionDocView, init: initConfiguracionDocView },
  'mantenimiento/metas': { render: renderMetasAreasView, init: initMetasAreasView },
  'mantenimiento/ordenes': { render: renderOrdenesView, init: initOrdenesView },
  'mantenimiento/siaf': { render: renderSiafView, init: initSiafView },
  'mantenimiento/fichanet': { render: renderFichaNetView, init: initFichaNetView },
  'mantenimiento/carreras': { render: renderCarrerasProfesionalesView, init: initCarrerasProfesionalesView },

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

function getProveedorSessionLocal() {
  try { return JSON.parse(localStorage.getItem('portalProveedor') || 'null'); } catch (_) { return null; }
}

function isProveedorRoute(route) {
  return String(route || '').startsWith('proveedor/');
}

function isProveedorPublicRoute(route) {
  return route === 'proveedor/login' || route.startsWith('proveedor/invitacion/');
}

function parseHash() {
  let hash = location.hash.replace(/^#\/?/, '');
  if (hash.includes('?')) hash = hash.slice(0, hash.indexOf('?'));
  if (!hash) {
    const prov = getProveedorSessionLocal();
    if (prov?.id) return 'proveedor/mis-invitaciones';
    const currentUser = authService.getCurrentUser();
    if (!currentUser) return 'login';
    if (currentUser.debeCambiarPassword) return 'cambio-password';
    return 'dashboard';
  }
  return hash;
}

function getCurrentRoute() {
  return parseHash();
}

function canAccessRoute(route, action = 'VER') {
  if (isProveedorRoute(route)) {
    if (isProveedorPublicRoute(route)) return true;
    const prov = getProveedorSessionLocal();
    if (!prov?.id) return route === 'proveedor/login';
    if ((prov.debeCambiarPassword || prov.primerIngreso) && route !== 'proveedor/cambio-password') {
      return route === 'proveedor/cambio-password';
    }
    return route.startsWith('proveedor/');
  }
  const currentUser = authService.getCurrentUser();
  if (route === 'portal-proveedores') return true;
  if (!currentUser) {
    return route === 'login';
  }
  if (currentUser.debeCambiarPassword) {
    return route === 'cambio-password';
  }
  if (route === 'login' || route === 'cambio-password') return false;
  if (route === 'dashboard') return true;
  // RC119: fuente única = usuarios.permisos (permissionsService). ROUTE_ROLES ya no bloquea.
  const canonical = resolveCanonicalRoute(route);
  return permissionsService.canAccessRoute(canonical, action, currentUser)
    || permissionsService.canAccessRoute(route, action, currentUser);
}

function redirectOnDenied(route) {
  if (isProveedorRoute(route)) {
    const prov = getProveedorSessionLocal();
    if (prov?.debeCambiarPassword || prov?.primerIngreso) {
      location.hash = '#/proveedor/cambio-password';
    } else {
      location.hash = '#/proveedor/login';
    }
    return;
  }
  const currentUser = authService.getCurrentUser();
  if (currentUser?.debeCambiarPassword) {
    location.hash = '#/cambio-password';
    return;
  }
  sessionStorage.setItem('sgc_access_denied', 'No tiene permisos para acceder a este módulo.');
  location.hash = currentUser ? '#/dashboard' : '#/login';
}

function initRouter(onRouteChange) {
  window.addEventListener('hashchange', () => {
    const route = getCurrentRoute();
    if (!canAccessRoute(route)) {
      redirectOnDenied(route);
      return;
    }
    
    const routeConfig = routes[route];
    if (routeConfig) {
      onRouteChange();
    } else if (isProveedorRoute(route)) {
      onRouteChange();
    } else {
      // Ruta no encontrada, ir a dashboard
      const currentUser = authService.getCurrentUser();
      location.hash = currentUser ? '#/dashboard' : '#/login';
    }
  });

  // Inicializar hash si no existe
  let hashWasSet = false;
  if (!location.hash || location.hash === '#') {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) location.hash = '#/login';
    else if (currentUser.debeCambiarPassword) location.hash = '#/cambio-password';
    else location.hash = '#/dashboard';
    hashWasSet = true;
  }

  // Verificar acceso a la ruta inicial.
  // Si acabamos de asignar el hash, hashchange disparará onRouteChange (evita doble render).
  if (hashWasSet) return;

  const route = getCurrentRoute();
  if (!canAccessRoute(route)) {
    redirectOnDenied(route);
  } else {
    const routeConfig = routes[route];
    if (routeConfig) {
      onRouteChange();
    } else if (isProveedorRoute(route)) {
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
export { initRouter, getCurrentRoute, canAccessRoute, routes, getRouteConfig, isProveedorRoute, isProveedorPublicRoute };