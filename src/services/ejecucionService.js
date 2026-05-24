export const ejecucionService = {
  getAll: () => JSON.parse(localStorage.getItem('ejecucionService') || '[]'),
  save: (data) => { localStorage.setItem('ejecucionService', JSON.stringify(data)); }
};
