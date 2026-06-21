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
    const user = users.find(u => u.dni === dni);
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
        headers: { 'Content-Type': 'application/json', ...((() => {
          try {
            const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
            const h = {};
            if (u?.id) h['x-user-id'] = String(u.id);
            if (u?.username || u?.dni) h['x-user-name'] = u.username || u.dni;
            return h;
          } catch (_) { return {}; }
        })()) },
      });
    } catch (_) { /* ignore */ }
    localStorage.removeItem('currentUser');
    window.location.hash = '#/login';
  },
  
  isAuthenticated: () => {
    return authService.getCurrentUser() !== null;
  },
  
  restoreSession: () => {
    const user = authService.getCurrentUser();
    if (user) {
      return { success: true, user };
    }
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

  tieneActividad: (actividad) => {
    const user = authService.getCurrentUser();
    if (!user) return false;
    if (user.rol === 'admin') return true;
    const p = user.permisos || {};
    return (p.actividades || []).includes(String(actividad).toUpperCase());
  },
};