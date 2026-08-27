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
  remove: (id) => api.remove('requerimientos', id),
  aprobarEvaluacion: (id, usuario = '') =>
    api.put(`/requerimientos/${id}/aprobar-evaluacion`, { usuario }),
  observarEvaluacion: (id, body = {}) =>
    api.put(`/requerimientos/${id}/observar`, body),
  subsanarConDestino: (id, body) =>
    api.put(`/requerimientos/${id}/subsanar`, body),
};
