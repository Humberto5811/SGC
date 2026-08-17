/**
 * Cliente API — Ejecución → Presentación Entregables de Servicios.
 */
import { api } from './apiService.js';

const BASE = '/entregables-servicios';

export const entregablesServiciosService = {
  listarBandeja() {
    return api.get(`${BASE}/bandeja`);
  },
  getDetalle(id) {
    return api.get(`${BASE}/${id}`);
  },
  registrarRecepcion(id, body) {
    return api.post(`${BASE}/${id}/registrar-recepcion`, body);
  },
  getDocumento(recepcionId, documentoId) {
    return api.get(`${BASE}/recepciones/${recepcionId}/documentos/${documentoId}`);
  },
  previewDocumentoBlob(recepcionId, documentoId) {
    return api.getBlob(`${BASE}/recepciones/${recepcionId}/documentos/${encodeURIComponent(documentoId)}/preview`);
  },
  downloadDocumentoBlob(recepcionId, documentoId) {
    return api.getBlob(`${BASE}/recepciones/${recepcionId}/documentos/${encodeURIComponent(documentoId)}/download`);
  },
};

export default entregablesServiciosService;