import { api } from './apiService.js';

// Servicio de Registro de Requerimientos (persistencia en /api/requerimientos).
export const requerimientosService = {
  list: ({ page = 1, pageSize = 100, search = '' } = {}) =>
    api.list('requerimientos', { page, pageSize, search }),
  getById: (id) => api.get(`/requerimientos/${id}`),
  create: (body) => api.create('requerimientos', body),
  update: (id, body) => api.update('requerimientos', id, body),
  remove: (id) => api.remove('requerimientos', id),
};
