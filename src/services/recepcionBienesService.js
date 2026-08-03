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
  editarActa(id, actaId, body = {}) {
    return api.put(`${BASE}/${id}/actas/${actaId}`, body);
  },
  eliminarActa(id, actaId, body = {}) {
    return api.del(`${BASE}/${id}/actas/${actaId}`, body);
  },
  /** Compat: POST /acta-visada */
  adjuntarActaVisada(id, body = {}) {
    if (body.acta_id || body.actaId) {
      const actaId = body.acta_id || body.actaId;
      return api.post(`${BASE}/${id}/actas/${actaId}/visado`, body);
    }
    return api.post(`${BASE}/${id}/acta-visada`, body);
  },
  listarActaVisada(id, actaId) {
    return api.get(`${BASE}/${id}/actas/${actaId}/visado`);
  },
  obtenerActaVisada(id, actaId, documentoId) {
    return api.get(`${BASE}/${id}/actas/${actaId}/visado/${documentoId}`);
  },
  reemplazarActaVisada(id, actaId, documentoId, body = {}) {
    return api.post(`${BASE}/${id}/actas/${actaId}/visado/${documentoId}/reemplazar`, body);
  },
  eliminarActaVisada(id, actaId, documentoId, body = {}) {
    return api.del(`${BASE}/${id}/actas/${actaId}/visado/${documentoId}`, body);
  },
  getPaqueteDerivacionAu(id, params = {}) {
    const q = new URLSearchParams();
    if (params.acta_id) q.set('acta_id', params.acta_id);
    if (params.recepcion_id) q.set('recepcion_id', params.recepcion_id);
    const qs = q.toString() ? `?${q}` : '';
    return api.get(`${BASE}/${id}/paquete-derivacion-au${qs}`);
  },
  getPaqueteDerivado(id) {
    return api.get(`${BASE}/${id}/paquete-derivado`);
  },
  adjuntarAdjuntoDerivacion(id, body = {}) {
    return api.post(`${BASE}/${id}/adjunto-derivacion`, body);
  },
  eliminarAdjuntoDerivacion(id, documentoId, body = {}) {
    return api.del(`${BASE}/${id}/adjunto-derivacion/${documentoId}`, body);
  },
  listDestinatariosAu(expedienteId, { search = '', area_id = null } = {}) {
    const q = new URLSearchParams();
    if (expedienteId != null) q.set('expediente_id', String(expedienteId));
    if (search) q.set('search', String(search));
    if (area_id != null) q.set('area_id', String(area_id));
    const qs = q.toString() ? `?${q}` : '';
    return api.get(`${BASE}/destinatarios-au${qs}`);
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
  getDocumento(id, tipo, docId) {
    return api.get(`${BASE}/${id}/documentos/${encodeURIComponent(tipo)}/${docId}`);
  },
  previewDocumentoBlob(id, tipo, docId) {
    return api.getBlob(`${BASE}/${id}/documentos/${encodeURIComponent(tipo)}/${encodeURIComponent(docId)}/preview`);
  },
  downloadDocumentoBlob(id, tipo, docId) {
    return api.getBlob(`${BASE}/${id}/documentos/${encodeURIComponent(tipo)}/${encodeURIComponent(docId)}/download`);
  },
};
