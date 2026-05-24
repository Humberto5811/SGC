export const userService = {
  findAll: () => JSON.parse(localStorage.getItem('users') || '[]'),
  findByDni: (dni) => { const users = JSON.parse(localStorage.getItem('users') || '[]'); return users.find(u => u.dni == dni); },
  hasPermission: (user, route, action) => true
};
