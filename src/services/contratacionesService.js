// Servicio para el módulo Contrataciones (DEC y Programación)
import { api } from './apiService.js';

export const contratacionesService = {
  // DEC
  async listDEC(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/contrataciones/dec${q ? `?${q}` : ''}`);
  },
  async aprobarDEC(id, usuario = '') {
    return api.put(`/contrataciones/dec/aprobar/${id}`, { usuario });
  },
  async observarDEC(id, motivo, usuario = '', destino = {}) {
    return api.put(`/contrataciones/dec/observar/${id}`, { motivo, usuario, ...destino });
  },

  // Programación
  async listProgramacion(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/contrataciones/programacion${q ? `?${q}` : ''}`);
  },
  async aprobarProgramacion(id, usuario = '') {
    return api.put(`/contrataciones/programacion/aprobar/${id}`, { usuario });
  },
  async observarProgramacion(id, motivo, usuario = '', destino = {}) {
    return api.put(`/contrataciones/programacion/observar/${id}`, { motivo, usuario, ...destino });
  },
};