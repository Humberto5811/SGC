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
  listarMisObservacionesDirigidas(params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`${BASE}/observaciones-dirigidas/mias${query ? `?${query}` : ''}`);
  },
  listarDestinosObservacionDirigida() {
    return api.get(`${BASE}/observaciones-dirigidas/destinos`);
  },
  listarDestinatariosObservacionDirigida(submoduloDestino) {
    const query = new URLSearchParams({ submoduloDestino }).toString();
    return api.get(`${BASE}/observaciones-dirigidas/destinatarios?${query}`);
  },
  observarEntregableDirigido(id, body) {
    return api.post(`${BASE}/${id}/observaciones-dirigidas`, body);
  },
  retirarObservacionEntregable(id, observacionId, body) {
    return api.post(`${BASE}/${id}/observaciones/${observacionId}/retirar`, body);
  },
  getDetalle(id) {
    return api.get(`${BASE}/${id}`);
  },
  registrarRecepcion(id, body) {
    return api.post(`${BASE}/${id}/registrar-recepcion`, body);
  },
  modificarRecepcion(id, body) {
    return api.put(`${BASE}/${id}/recepcion`, body);
  },
  observarEntregable(id, body) {
    return api.post(`${BASE}/${id}/observaciones`, body);
  },
  subsanarEntregable(id, body) {
    return api.post(`${BASE}/${id}/subsanaciones`, body);
  },
  listarCoordinadoresCM(id) {
    return api.get(`${BASE}/${id}/coordinadores-cm`);
  },
  derivarCoordinadorCM(id, responsableId) {
    return api.post(`${BASE}/${id}/derivar-coordinador-cm`, {
      responsable_id: responsableId,
    });
  },
  listarAnalistasCM(id) {
    return api.get(`${BASE}/${id}/analistas-cm`);
  },
  derivarAnalistaCM(id, responsableId) {
    return api.post(`${BASE}/${id}/derivar-analista-cm`, {
      responsable_id: responsableId,
    });
  },
  observarAnalistaCM(id, motivo) {
    return api.post(`${BASE}/${id}/observaciones-analista-cm`, { motivo });
  },
  listarAnalistasPago(id) {
    return api.get(`${BASE}/${id}/analistas-pago`);
  },
  derivarPago(id, usuarioDestinoId) {
    return api.post(`${BASE}/${id}/derivar-pago`, { usuarioDestinoId });
  },
  listarTrazabilidad(id) {
    return api.get(`${BASE}/${id}/trazabilidad`);
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