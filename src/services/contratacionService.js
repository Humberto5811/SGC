export const contratacionService = {
  getAll: () => JSON.parse(localStorage.getItem('contratacionService') || '[]'),
  save: (data) => { localStorage.setItem('contratacionService', JSON.stringify(data)); }
};
