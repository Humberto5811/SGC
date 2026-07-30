/** Cliente API — Registro de Órdenes (Contrataciones) */
import { api } from './apiService.js';

const BASE = '/ordenes-contratacion';

export const ordenesContratacionService = {
  async listBandeja(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') q.set(k, v);
    });
    const qs = q.toString();
    return api.get(`${BASE}/bandeja${qs ? `?${qs}` : ''}`);
  },
  async getContexto(requerimientoId) {
    return api.get(`${BASE}/contexto/${requerimientoId}`);
  },
  async adjuntarCcpFirmado(requerimientoId, body) {
    return api.post(`${BASE}/ccp-firmado/${requerimientoId}`, body);
  },
  async getCcpFirmado(requerimientoId, includeContent = false) {
    return api.get(`${BASE}/ccp-firmado/${requerimientoId}${includeContent ? '?include=content' : ''}`);
  },
  async historialCcpFirmado(requerimientoId) {
    return api.get(`${BASE}/ccp-firmado/${requerimientoId}/historial`);
  },
  async eliminarCcpFirmado(requerimientoId, motivo) {
    return api.post(`${BASE}/ccp-firmado/${requerimientoId}/eliminar`, { motivo });
  },
  async guardarInicioActividad(body) {
    return api.post(`${BASE}/inicio-actividad`, body);
  },
  async previewInicioActividad(body) {
    return api.post(`${BASE}/inicio-actividad/preview`, body);
  },
  async getInicioActividad(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
    const qs = q.toString();
    return api.get(`${BASE}/inicio-actividad${qs ? `?${qs}` : ''}`);
  },
  async registrar(body) {
    return api.post(BASE, body);
  },
  async getDetalle(id) {
    return api.get(`${BASE}/${id}`);
  },
  async getExpediente(id) {
    return api.get(`${BASE}/${id}/expediente`);
  },
  async actualizar(id, body) {
    return api.put(`${BASE}/${id}`, body);
  },
  async anular(id, motivo) {
    return api.post(`${BASE}/${id}/anular`, { motivo });
  },
  async getItems(id) {
    return api.get(`${BASE}/${id}/items`);
  },
  async getEntregas(id) {
    return api.get(`${BASE}/${id}/entregas`);
  },
  async saveEntregas(id, entregas, inicioActividad = null) {
    const body = { entregas };
    if (inicioActividad) body.inicio_actividad = inicioActividad;
    return api.post(`${BASE}/${id}/entregas`, body);
  },
  async getDocsNotificacion(id) {
    return api.get(`${BASE}/${id}/docs-notificacion`);
  },
  async getDocNotificacion(id, tipo, includeContent = true) {
    return api.get(`${BASE}/${id}/docs-notificacion/${tipo}${includeContent ? '?include=content' : ''}`);
  },
  async adjuntarOrdenFirmada(id, body) {
    return api.post(`${BASE}/${id}/documentos`, body);
  },
  async getDocumento(id, documentoId, includeContent = true) {
    return api.get(`${BASE}/${id}/documentos/${documentoId}${includeContent ? '?include=content' : ''}`);
  },
  async enviarProveedor(id, body = {}) {
    return api.post(`${BASE}/${id}/enviar-proveedor`, body);
  },
  async reenviarProveedor(id, body = {}) {
    return api.post(`${BASE}/${id}/reenviar-proveedor`, body);
  },
  async listEnvios(id) {
    return api.get(`${BASE}/${id}/envios`);
  },
  async derivarEjecucion(id) {
    return api.post(`${BASE}/${id}/derivar-ejecucion`, {});
  },
  async historial(id) {
    return api.get(`${BASE}/${id}/historial`);
  },
  async getChecklist(id, etapa) {
    const q = etapa ? `?etapa=${encodeURIComponent(etapa)}` : '';
    return api.get(`${BASE}/${id}/checklist${q}`);
  },
  async getChecklistRequerimiento(requerimientoId, etapa) {
    const q = etapa ? `?etapa=${encodeURIComponent(etapa)}` : '';
    return api.get(`${BASE}/checklist/requerimiento/${requerimientoId}${q}`);
  },
};
