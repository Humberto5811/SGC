import { api } from './apiService.js';

export const glosasBienesService = {
  getAll: () => api.get('/glosas-bienes'),
  getById: (id) => api.get(`/glosas-bienes/${id}`),
  create: (body) => api.post('/glosas-bienes', body),
  update: (id, body) => api.put(`/glosas-bienes/${id}`, body),
  remove: (id) => api.del(`/glosas-bienes/${id}`)
};
