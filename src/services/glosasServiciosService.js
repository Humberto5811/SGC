import { api } from './apiService.js';

const BASE = '/glosas-servicios';

export const glosasServiciosService = {
  getAll: () => api.get(BASE),
  getById: (id) => api.get(`${BASE}/${id}`),
  create: (body) => api.post(BASE, body),
  update: (id, body) => api.put(`${BASE}/${id}`, body),
  remove: (id) => api.del(`${BASE}/${id}`),
};