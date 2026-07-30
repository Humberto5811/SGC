import { authService } from './authService.js';
import { permissionsService } from './permissionsService.js';

export const userService = {
  findAll: () => JSON.parse(localStorage.getItem('users') || '[]'),

  findByDni: (dni) => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    return users.find((u) => u.dni == dni);
  },

  /**
   * RC119 — delega en permissionsService (misma fuente que menú / sidebar).
   */
  hasPermission(user, route, action = 'VER') {
    return permissionsService.canAccessRoute(route, action, user || authService.getCurrentUser());
  },

  tieneActividad(actividad, user) {
    return permissionsService.tieneActividad(actividad, user || authService.getCurrentUser());
  },
};

export default userService;
