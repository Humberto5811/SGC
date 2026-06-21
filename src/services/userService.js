import { authService } from './authService.js';
import { ROUTE_TO_SUBMODULO, normalizePermisos } from '../utils/permissionsCatalog.js';

export const userService = {
  findAll: () => JSON.parse(localStorage.getItem('users') || '[]'),

  findByDni: (dni) => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    return users.find((u) => u.dni == dni);
  },

  /**
   * Valida permiso por ruta y actividad (VER, CREAR, APROBAR, etc.)
   */
  hasPermission(user, route, action = 'VER') {
    const u = user || authService.getCurrentUser();
    if (!u) return false;
    if (u.rol === 'admin') return true;
    const act = String(action).toUpperCase();
    const subId = ROUTE_TO_SUBMODULO[route];
    if (!subId) return true;
    const permisos = normalizePermisos(u.permisos, u.rol);
    if (!permisos.submodulos.includes(subId)) return false;
    return permisos.actividades.includes(act);
  },

  tieneActividad(actividad, user) {
    const u = user || authService.getCurrentUser();
    if (!u) return false;
    if (u.rol === 'admin') return true;
    return normalizePermisos(u.permisos, u.rol).actividades.includes(String(actividad).toUpperCase());
  },
};

export default userService;
