// Servicio para el módulo Contrataciones (DEC y Programación)
import { api } from './apiService.js';

export const contratacionesService = {
  // DEC
  async listDEC({ page = 1, pageSize = 200 } = {}) {
    return api.get(`/contrataciones/dec?page=${page}&pageSize=${pageSize}`);
  },
  async aprobarDEC(id, usuario = '') {
    return api.put(`/contrataciones/dec/aprobar/${id}`, { usuario });
  },
  async observarDEC(id, motivo, usuario = '') {
    return api.put(`/contrataciones/dec/observar/${id}`, { motivo, usuario });
  },

  // Programación
  async listProgramacion({ page = 1, pageSize = 200 } = {}) {
    return api.get(`/contrataciones/programacion?page=${page}&pageSize=${pageSize}`);
  },
  async aprobarProgramacion(id, usuario = '') {
    return api.put(`/contrataciones/programacion/aprobar/${id}`, { usuario });
  },
  async observarProgramacion(id, motivo, usuario = '') {
    return api.put(`/contrataciones/programacion/observar/${id}`, { motivo, usuario });
  },
};