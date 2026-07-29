/**
 * Cliente API — Ejecución → Recepción de Bienes
 */
import { api } from './apiService.js';

const BASE = '/recepcion-bienes';

export const recepcionBienesService = {
  listarBandeja() {
    return api.get(`${BASE}/bandeja`);
  },
  getDetalle(id) {
    return api.get(`${BASE}/${id}`);
  },
  registrarRecepcion(id, body) {
    return api.post(`${BASE}/${id}/registrar-recepcion`, body);
  },
  generarActa(id, body = {}) {
    return api.post(`${BASE}/${id}/generar-acta`, body);
  },
  derivarAu(id, body = {}) {
    return api.post(`${BASE}/${id}/derivar-area-usuaria`, body);
  },
  cargarActaFirmada(id, body) {
    return api.post(`${BASE}/${id}/cargar-acta-firmada`, body);
  },
  observar(id, body) {
    return api.post(`${BASE}/${id}/observar`, body);
  },
  derivarCm(id, body = {}) {
    return api.post(`${BASE}/${id}/derivar-coordinacion`, body);
  },
  derivarPago(id, body) {
    return api.post(`${BASE}/${id}/derivar-pago`, body);
  },
  historial(id) {
    return api.get(`${BASE}/${id}/historial`);
  },
};
