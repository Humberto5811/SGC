import { api } from './apiService.js';

// Servicio de Registro de Requerimientos (persistencia en /api/requerimientos).
export const requerimientosService = {
  list: ({ page = 1, pageSize = 100, search = '' } = {}) =>
    api.list('requerimientos', { page, pageSize, search }),
  listConDetalles: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/requerimientos/listar-con-detalles${q ? `?${q}` : ''}`);
  },
  getById: (id) => api.get(`/requerimientos/${id}`),
  create: (body) => api.create('requerimientos', body),
  update: (id, body) => api.update('requerimientos', id, body),
  aprobarEvaluacion: (id, usuario = '') =>
    api.put(`/requerimientos/${id}/aprobar-evaluacion`, { usuario }),
  subsanarConDestino: (id, body) =>
    api.put(`/requerimientos/${id}/subsanar`, body),
};
