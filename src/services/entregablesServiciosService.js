/**
 * Cliente API — Ejecución → Presentación Entregables de Servicios.
 */
import { api } from './apiService.js';

const BASE = '/entregables-servicios';

export const entregablesServiciosService = {
  listarBandeja() {
    return api.get(`${BASE}/bandeja`);
  },
  listarBandejaOrdenes() {
    return api.get(`${BASE}/bandeja-ordenes`);
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
  // RC8.15.5B — Acta de Conformidad de Servicios
  listarConformidad(id) {
    return api.get(`${BASE}/${id}/conformidad`);
  },
  generarActaConformidad(id, body) {
    return api.post(`${BASE}/${id}/conformidad/generar`, body);
  },
  adjuntarActaConformidadFirmada(id, body) {
    return api.post(`${BASE}/${id}/conformidad/firmada`, body);
  },
  obtenerActaGenerada(id, actaId) {
    return api.get(`${BASE}/${id}/conformidad/actas/${actaId}`);
  },
  obtenerActaFirmada(id, visadoId) {
    return api.get(`${BASE}/${id}/conformidad/firmadas/${visadoId}`);
  },
  previewActaGeneradaBlob(id, actaId) {
    return api.getBlob(`${BASE}/${id}/conformidad/actas/${encodeURIComponent(actaId)}/preview`);
  },
  downloadActaGeneradaBlob(id, actaId) {
    return api.getBlob(`${BASE}/${id}/conformidad/actas/${encodeURIComponent(actaId)}/download`);
  },
  previewActaFirmadaBlob(id, visadoId) {
    return api.getBlob(`${BASE}/${id}/conformidad/firmadas/${encodeURIComponent(visadoId)}/preview`);
  },
  downloadActaFirmadaBlob(id, visadoId) {
    return api.getBlob(`${BASE}/${id}/conformidad/firmadas/${encodeURIComponent(visadoId)}/download`);
  },
};

export default entregablesServiciosService;