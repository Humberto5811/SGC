import { authService } from './authService.js';
import {
  ROUTE_TO_SUBMODULO,
  SUBMODULO_ID_ALIASES,
  resolveCanonicalRoute,
  normalizePermisos,
  permisosFromRol,
  getActividadesForSubmodulo,
  resolveUserPermissions,
  CONTRATACIONES_NUEVOS_SUBMODULOS,
  CONTRATACIONES_NUEVOS_ACTIVIDADES,
} from '../utils/permissionsCatalog.js';

function resolveSubmoduloId(subId) {
  return SUBMODULO_ID_ALIASES[subId] || subId;
}

function resolveRouteSubmodulo(route) {
  const canonicalRoute = resolveCanonicalRoute(route);
  return ROUTE_TO_SUBMODULO[canonicalRoute] || ROUTE_TO_SUBMODULO[route];
}

function getPermisos(user) {
  return resolveUserPermissions(user || authService.getCurrentUser());
}

export const permissionsService = {
  /** Alias público del resolvedor único RC119. */
  resolveUserPermissions,

  getPermisos,

  tieneModulo(moduloId, user) {
    const u = user || authService.getCurrentUser();
    if (u?.rol === 'admin') return true;
    return getPermisos(u).modulos.includes(moduloId);
  },

  tieneSubmodulo(subId, user) {
    const u = user || authService.getCurrentUser();
    if (u?.rol === 'admin') return true;
    const canonical = resolveSubmoduloId(subId);
    return getPermisos(u).submodulos.includes(canonical);
  },

  tieneActividad(actividad, user, submoduloId) {
    const u = user || authService.getCurrentUser();
    if (u?.rol === 'admin') return true;
    const p = getPermisos(u);
    const act = String(actividad).toUpperCase();
    if (submoduloId) return getActividadesForSubmodulo(p, submoduloId).includes(act);
    if (p.actividadesPorSubmodulo && Object.keys(p.actividadesPorSubmodulo).length) {
      return Object.values(p.actividadesPorSubmodulo).some((acts) => (acts || []).includes(act));
    }
    return (p.actividades || []).includes(act);
  },

  canAccessRoute(route, actividad = 'VER', user) {
    const u = user || authService.getCurrentUser();
    if (!u) return route === 'login';
    const OPEN_ROUTES = new Set(['login', 'dashboard', 'cambio-password', 'portal-proveedores']);
    if (OPEN_ROUTES.has(route)) return true;
    if (u.rol === 'admin') return true;
    const canonical = resolveCanonicalRoute(route);
    const routeKey = canonical || route;
    // RC8.6E — CCP por asignación activa (flag de sesión, no solo permisos JSON)
    if ((routeKey === 'dec/ccp' || route === 'dec/ccp')
      && (u.acceso_ccp_por_asignacion === true || u.acceso_ccp === true)) {
      if (String(actividad).toUpperCase() === 'VER') return true;
    }
    const subId = resolveRouteSubmodulo(route);
    // Sin mapeo a submódulo: no abrir por defecto (evita fugas de menú Mantenimiento)
    if (!subId) return false;
    const p = getPermisos(u);
    const can = resolveSubmoduloId(subId);
    if (!(p.submodulos || []).includes(can)) {
      // Asignación CCP: permitir VER aunque no tenga submódulo CCP en JSON
      if ((can === 'CCP' || subId === 'CCP')
        && u.acceso_ccp_por_asignacion === true
        && String(actividad).toUpperCase() === 'VER') {
        return true;
      }
      return false;
    }
    return getActividadesForSubmodulo(p, can).includes(String(actividad).toUpperCase());
  },

  /** Actividades configurables para Consultas, Recepción de Cotizaciones y Validaciones. */
  getContratacionesNuevosSubmodulos() {
    return [...CONTRATACIONES_NUEVOS_SUBMODULOS];
  },

  getContratacionesNuevosActividades() {
    return [...CONTRATACIONES_NUEVOS_ACTIVIDADES];
  },

  /** Oculta botones con data-perm-act="APROBAR" si el usuario no tiene la actividad */
  applyActivityButtons(root = document) {
    const u = authService.getCurrentUser();
    if (!u || u.rol === 'admin') return;
    root.querySelectorAll('[data-perm-act]').forEach((el) => {
      const act = el.getAttribute('data-perm-act');
      if (!permissionsService.tieneActividad(act, u)) el.style.display = 'none';
    });
  },
};

export { resolveUserPermissions, normalizePermisos, permisosFromRol };
export default permissionsService;
