import { resolveUserPermissions, getActividadesForSubmodulo } from '../utils/permissionsCatalog.js';

export const authService = {
  getCurrentUser: () => {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
  },

  setCurrentUser: (user) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
  },

  mustChangePassword: () => {
    const u = authService.getCurrentUser();
    return !!(u && u.debeCambiarPassword);
  },

  login: (dni, password) => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find((u) => u.dni === dni);
    if (user) {
      authService.setCurrentUser(user);
      return { success: true, user };
    }
    return { success: false, error: 'Usuario no encontrado' };
  },

  logout: async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...((() => {
            try {
              const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
              const h = {};
              if (u?.id) h['x-user-id'] = String(u.id);
              if (u?.username || u?.dni) h['x-user-name'] = u.username || u.dni;
              return h;
            } catch (_) {
              return {};
            }
          })()),
        },
      });
    } catch (_) { /* ignore */ }
    localStorage.removeItem('currentUser');
    window.location.hash = '#/login';
  },

  /**
   * RC8.6E — refresca flags de sesión (p.ej. acceso_ccp_por_asignacion).
   * No altera permisos JSON locales salvo que el servidor los devuelva.
   */
  refreshSession: async () => {
    const current = authService.getCurrentUser();
    if (!current?.id) return { success: false };
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'x-user-id': String(current.id) },
      });
      if (!res.ok) return { success: false };
      const data = await res.json();
      if (data?.success && data.user) {
        authService.setCurrentUser({ ...current, ...data.user });
        return { success: true, user: data.user };
      }
    } catch (_) { /* ignore */ }
    return { success: false };
  },

  isAuthenticated: () => authService.getCurrentUser() !== null,

  restoreSession: () => {
    const user = authService.getCurrentUser();
    if (user) return { success: true, user };
    return { success: false };
  },

  hasRole: (role) => {
    const user = authService.getCurrentUser();
    return user && user.rol === role;
  },

  hasAnyRole: (roles) => {
    const user = authService.getCurrentUser();
    return user && roles.includes(user.rol);
  },

  /** RC119 — misma fuente que permissionsService / menú. */
  tieneActividad: (actividad, submoduloId) => {
    const user = authService.getCurrentUser();
    if (!user) return false;
    if (user.rol === 'admin') return true;
    const p = resolveUserPermissions(user);
    const act = String(actividad).toUpperCase();
    if (submoduloId) return getActividadesForSubmodulo(p, submoduloId).includes(act);
    if (p.actividadesPorSubmodulo && Object.keys(p.actividadesPorSubmodulo).length) {
      return Object.values(p.actividadesPorSubmodulo).some((acts) => (acts || []).includes(act));
    }
    return (p.actividades || []).includes(act);
  },
};
