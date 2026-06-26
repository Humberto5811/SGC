// Servicio — Maestro de Proveedores
import { api } from './apiService.js';

export const proveedoresMaestroService = {
  async list(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== '') q.set(k, String(v));
    });
    const qs = q.toString();
    return api.get(`/proveedores-maestro${qs ? `?${qs}` : ''}`);
  },

  async buscar(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== '') q.set(k, String(v));
    });
    return api.get(`/proveedores-maestro/buscar?${q.toString()}`);
  },

  async getRubros() {
    return api.get('/proveedores-maestro/rubros');
  },

  async get(id) {
    return api.get(`/proveedores-maestro/${id}`);
  },

  async create(body) {
    return api.post('/proveedores-maestro', body);
  },

  async update(id, body) {
    return api.put(`/proveedores-maestro/${id}`, body);
  },

  async remove(id) {
    return api.del(`/proveedores-maestro/${id}`);
  },

  async importRows(rows) {
    return api.post('/proveedores-maestro/import', { rows });
  },
};
