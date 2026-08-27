import { api } from './apiService.js';

export const usuariosService = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/usuarios${q ? `?${q}` : ''}`);
  },
  exportAll: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return api.get(`/usuarios/export${q ? `?${q}` : ''}`);
  },
  get: (id) => api.get(`/usuarios/${id}`),
  getPermisos: (id) => api.get(`/usuarios/${id}/permisos`),
  create: (body) => api.post('/usuarios', body),
  update: (id, body) => api.put(`/usuarios/${id}`, body),
  setEstado: (id, estado, usuarioOperacion) => api.patch(`/usuarios/${id}/estado`, {
    estado,
    usuario_operacion: usuarioOperacion,
  }),
  remove: (id) => api.del(`/usuarios/${id}`),
  importBulk: (usuarios, usuarioOperacion) => api.post('/usuarios/import', {
    usuarios,
    usuario_operacion: usuarioOperacion,
  }),
  resetPassword: (id, body) => api.post(`/usuarios/${id}/reset-password`, body),
  buscarArea: (q) => api.get(`/usuarios/areas-buscar?q=${encodeURIComponent(q)}`),
  listCentros: () => api.get('/usuarios/catalogos/centros'),
  listAreasCentro: (centroId) => api.get(`/usuarios/catalogos/centros/${centroId}/areas`),
  getAlcance: (id) => api.get(`/usuarios/${id}/alcance-organizacional`),
  saveAlcance: (id, body) => api.put(`/usuarios/${id}/alcance-organizacional`, body),
};

export default usuariosService;
