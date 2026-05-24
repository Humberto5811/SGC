export const authService = {
  getCurrentUser: () => {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
  },
  
  setCurrentUser: (user) => {
    localStorage.setItem('currentUser', JSON.stringify(user));
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
  
  logout: () => {
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
  }
};