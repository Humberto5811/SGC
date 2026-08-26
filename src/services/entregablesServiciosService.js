/**
 * Cliente API — Ejecución → Presentación Entregables de Servicios.
 */
import { api } from './apiService.js';

const BASE = '/entregables-servicios';

export const entregablesServiciosService = {
  listarBandeja() {
    return api.get(`${BASE}/bandeja`);
  },
  listarBandejaPagos() {
    return api.get(`${BASE}/pagos/bandeja`);
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
  listarDestinatariosAreaUsuaria(id, params = {}) {
    const query = new URLSearchParams(params).toString();
    return api.get(`${BASE}/${id}/destinatarios-area-usuaria${query ? `?${query}` : ''}`);
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
  listarDocumentosTipificados(id) {
    return api.get(`${BASE}/${id}/documentos-tipificados`);
  },
  registrarRecepcion(id, body) {
    return api.post(`${BASE}/${id}/registrar-recepcion`, body);
  },
  modificarRecepcion(id, body) {
    return api.put(`${BASE}/${id}/recepcion`, body);
  },
  adjuntarDocumentosRecepcion(id, body) {
    return api.post(`${BASE}/${id}/recepcion/documentos`, body);
  },
  reemplazarDocumentoRecepcion(id, documentoId, body) {
    return api.put(`${BASE}/${id}/recepcion/documentos/${documentoId}/reemplazar`, body);
  },
  retirarDocumentoRecepcion(id, documentoId) {
    return api.del(`${BASE}/${id}/recepcion/documentos/${documentoId}`);
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
  observarAnalistaCM(id, body) {
    return api.post(`${BASE}/${id}/observaciones-analista-cm`, body);
  },
  obtenerPenalidadEvaluacion(id) {
    return api.get(`${BASE}/${id}/penalidad-evaluacion`);
  },
  obtenerContextoPenalidadPago(id) {
    return api.get(`${BASE}/${id}/penalidad-evaluacion?contexto=1`);
  },
  evaluarPenalidad(id, body) {
    return api.post(`${BASE}/${id}/penalidad-evaluacion`, body);
  },
  registrarAmpliacionPlazoPenalidad(id, body) {
    return api.post(`${BASE}/${id}/penalidad-ampliaciones`, body);
  },
  modificarAmpliacionPlazoPenalidad(id, ampliacionId, body) {
    return api.put(`${BASE}/${id}/penalidad-ampliaciones/${ampliacionId}`, body);
  },
  eliminarAmpliacionPlazoPenalidad(id, ampliacionId) {
    return api.del(`${BASE}/${id}/penalidad-ampliaciones/${ampliacionId}`);
  },
  documentoAmpliacionPlazoUrl(id, ampliacionId) {
    return `/api${BASE}/${id}/penalidad-ampliaciones/${ampliacionId}/documento`;
  },
  obtenerFichaCalculoPenalidad(id) {
    return api.get(`${BASE}/${id}/penalidad-calculo`);
  },
  calcularPenalidad(id) {
    return api.post(`${BASE}/${id}/penalidad-calculo`, {});
  },
  generarFormatoPenalidad(id) {
    return api.post(`${BASE}/${id}/penalidad-formato`, {});
  },
  adjuntarFormatoPenalidadFirmado(id, body) {
    return api.post(`${BASE}/${id}/penalidad-formato/firmado`, body);
  },
  generarCartaPenalidad(id) {
    return api.post(`${BASE}/${id}/penalidad-carta`, {});
  },
  documentoPenalidadUrl(id, documentoId) {
    return `/api${BASE}/${id}/penalidad-documentos/${documentoId}`;
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
  listarTrazabilidadPanel(id) {
    return api.get(`${BASE}/${id}/trazabilidad?panel=1`);
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
  obtenerChecklistPago(id) {
    return api.get(`${BASE}/${id}/checklist-pago`);
  },
  listarEntregablesChecklistPago(id) {
    return api.get(`${BASE}/${id}/checklist-pago/entregables`);
  },
  obtenerActaConformidadPago(id) {
    return api.get(`${BASE}/${id}/checklist-pago/acta-conformidad`);
  },
  adjuntarDocumentoChecklistPago(id, body) {
    return api.post(`${BASE}/${id}/checklist-pago/documentos`, body);
  },
  reemplazarDocumentoChecklistPago(id, documentoId, body) {
    return api.put(`${BASE}/${id}/checklist-pago/documentos/${documentoId}/reemplazar`, body);
  },
  retirarDocumentoChecklistPago(id, documentoId) {
    return api.del(`${BASE}/${id}/checklist-pago/documentos/${documentoId}`);
  },
  previewDocumentoChecklistPagoUrl(id, documentoId) {
    return `/api${BASE}/${id}/checklist-pago/documentos/${documentoId}/preview`;
  },
};

export default entregablesServiciosService;