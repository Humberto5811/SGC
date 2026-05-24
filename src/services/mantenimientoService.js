export const mantenimientoService = {
  getAll: () => JSON.parse(localStorage.getItem('mantenimientoService') || '[]'),
  save: (data) => { localStorage.setItem('mantenimientoService', JSON.stringify(data)); }
};
