const requerimientoService = {
  getAll: () => {
    const data = localStorage.getItem('requerimientos');
    return data ? JSON.parse(data) : [];
  },
  getById: (id) => {
    const items = requerimientoService.getAll();
    return items.find(item => item.id == id);
  },
  save: (requerimiento) => {
    const items = requerimientoService.getAll();
    items.push(requerimiento);
    localStorage.setItem('requerimientos', JSON.stringify(items));
  },
  update: (id, data) => {
    const items = requerimientoService.getAll();
    const index = items.findIndex(item => item.id == id);
    if (index !== -1) {
      items[index] = { ...items[index], ...data };
      localStorage.setItem('requerimientos', JSON.stringify(items));
    }
  },
  delete: (id) => {
    const items = requerimientoService.getAll();
    const filtered = items.filter(item => item.id != id);
    localStorage.setItem('requerimientos', JSON.stringify(filtered));
  }
};

export { requerimientoService };
