export const catalogoService = {
  getAll: () => JSON.parse(localStorage.getItem('catalogoService') || '[]'),
  save: (data) => { localStorage.setItem('catalogoService', JSON.stringify(data)); }
};
