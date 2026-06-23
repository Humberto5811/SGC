import { authService } from './authService.js';
import { ROUTE_TO_SUBMODULO, normalizePermisos, permisosFromRol, getActividadesForSubmodulo } from '../utils/permissionsCatalog.js';

function getPermisos(user) {
  const u = user || authService.getCurrentUser();
  if (!u) return { modulos: [], submodulos: [], actividades: [] };
  if (u.rol === 'admin') return normalizePermisos(u.permisos, 'admin', { explicit: u.permisos != null });
  if (u.permisos != null && typeof u.permisos === 'object') {
    return normalizePermisos(u.permisos, u.rol, { explicit: true });
  }
  return permisosFromRol(u.rol);
}

export const permissionsService = {
  getPermisos,

  tieneModulo(moduloId, user) {
    const u = user || authService.getCurrentUser();
    if (u?.rol === 'admin') return true;
    return getPermisos(u).modulos.includes(moduloId);
  },

  tieneSubmodulo(subId, user) {
    const u = user || authService.getCurrentUser();
    if (u?.rol === 'admin') return true;
    return getPermisos(u).submodulos.includes(subId);
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
    if (route === 'login' || route === 'dashboard') return true;
    if (u.rol === 'admin') return true;
    const subId = ROUTE_TO_SUBMODULO[route];
    if (!subId) return true;
    const p = getPermisos(u);
    if (!(p.submodulos || []).includes(subId)) return false;
    return getActividadesForSubmodulo(p, subId).includes(String(actividad).toUpperCase());
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

export default permissionsService;
