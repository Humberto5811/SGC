import { authService } from './authService.js';
import { ROUTE_TO_SUBMODULO, normalizePermisos, permisosFromRol } from '../utils/permissionsCatalog.js';

function getPermisos(user) {
  const u = user || authService.getCurrentUser();
  if (!u) return { modulos: [], submodulos: [], actividades: [] };
  if (u.rol === 'admin') return normalizePermisos(u.permisos, 'admin');
  return normalizePermisos(u.permisos, u.rol);
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

  tieneActividad(actividad, user) {
    const u = user || authService.getCurrentUser();
    if (u?.rol === 'admin') return true;
    return getPermisos(u).actividades.includes(String(actividad).toUpperCase());
  },

  canAccessRoute(route, actividad = 'VER', user) {
    const u = user || authService.getCurrentUser();
    if (!u) return route === 'login';
    if (route === 'login' || route === 'dashboard') return true;
    if (u.rol === 'admin') return true;
    const subId = ROUTE_TO_SUBMODULO[route];
    if (!subId) return true;
    const p = getPermisos(u);
    if (!p.submodulos.includes(subId)) return false;
    return p.actividades.includes(String(actividad).toUpperCase());
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
