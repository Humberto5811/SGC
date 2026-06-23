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

  // Actos Preparatorios
  async listActos(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/contrataciones/actos${q ? `?${q}` : ''}`);
  },
  async listActosUsuarios(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/contrataciones/actos/usuarios${q ? `?${q}` : ''}`);
  },
  async asignarActos(id, analista, usuario = '', opts = {}) {
    return api.put(`/contrataciones/actos/asignar/${id}`, { analista, usuario, ...opts });
  },
  async reasignarActos(id, analista, usuario = '', opts = {}) {
    return api.put(`/contrataciones/actos/reasignar/${id}`, { analista, usuario, ...opts });
  },
  async observarActos(id, motivo, usuario = '', destino = {}) {
    return api.put(`/contrataciones/actos/observar/${id}`, { motivo, usuario, ...destino });
  },
  async derivarActos(id, body = {}) {
    return api.put(`/contrataciones/actos/derivar/${id}`, body);
  },
  async aprobarActosInvitaciones(id, responsableDestino, usuario = '') {
    return api.put(`/contrataciones/actos/aprobar/${id}`, { responsable_destino: responsableDestino, usuario });
  },
};