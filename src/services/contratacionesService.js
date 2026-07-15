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

  // Invitaciones
  async listInvitaciones(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/contrataciones/invitaciones${q ? `?${q}` : ''}`);
  },
  async listSolicitudesCotizacion(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/contrataciones/invitaciones/solicitudes${q ? `?${q}` : ''}`);
  },
  async previewCodigoSolicitud() {
    return api.get('/contrataciones/invitaciones/solicitudes/preview-codigo');
  },
  async getCatalogosInvitaciones() {
    return api.get('/contrataciones/invitaciones/catalogos');
  },
  async crearSolicitudCotizacion(body) {
    return api.post('/contrataciones/invitaciones/solicitudes', body);
  },
  async actualizarSolicitudCotizacion(id, body) {
    return api.put(`/contrataciones/invitaciones/solicitudes/${id}`, body);
  },
  async eliminarSolicitudCotizacion(id) {
    return api.del(`/contrataciones/invitaciones/solicitudes/${id}`);
  },
  async getSolicitudDetalle(id) {
    return api.get(`/contrataciones/invitaciones/solicitudes/${id}`);
  },
  async getItemsRequerimientos(ids) {
    const q = new URLSearchParams({ ids: ids.join(',') }).toString();
    return api.get(`/contrataciones/invitaciones/requerimientos/items?${q}`);
  },
  async listProveedoresSolicitud(solicitudId) {
    return api.get(`/contrataciones/invitaciones/solicitudes/${solicitudId}/proveedores`);
  },
  async agregarProveedorSolicitud(solicitudId, body) {
    return api.post(`/contrataciones/invitaciones/solicitudes/${solicitudId}/proveedores`, body);
  },
  async enviarCorreosSolicitud(solicitudId, invitacionIds) {
    return api.post(`/contrataciones/invitaciones/solicitudes/${solicitudId}/enviar-correos`, { invitacion_ids: invitacionIds });
  },
  async getHistorialProveedor(proveedorId) {
    return api.get(`/contrataciones/invitaciones/proveedores/${proveedorId}/historial`);
  },
  async eliminarProveedorSolicitud(solicitudId, invitacionId) {
    return api.del(`/contrataciones/invitaciones/solicitudes/${solicitudId}/proveedores/${invitacionId}`);
  },
  async buscarProveedores(search = '') {
    const q = new URLSearchParams({ search }).toString();
    return api.get(`/contrataciones/invitaciones/proveedores?${q}`);
  },
  async agregarProveedoresInvitacion(requerimientoId, proveedores, solicitudId) {
    return api.post(`/contrataciones/invitaciones/requerimiento/${requerimientoId}/proveedores`, { proveedores, solicitud_id: solicitudId });
  },
  async enviarInvitaciones(requerimientoId, solicitudId) {
    return api.post(`/contrataciones/invitaciones/requerimiento/${requerimientoId}/enviar`, { solicitud_id: solicitudId });
  },
  async observarInvitaciones(id, body) {
    return api.put(`/contrataciones/invitaciones/observar/${id}`, body);
  },
  async getTableroInvitaciones(solicitudId) {
    const path = solicitudId ? `/contrataciones/invitaciones/tablero/${solicitudId}` : '/contrataciones/invitaciones/tablero';
    return api.get(path);
  },
  async listConsultasAnalista(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/contrataciones/portal-analista/consultas${q ? `?${q}` : ''}`);
  },
  async responderConsultaAnalista(id, body) {
    return api.put(`/contrataciones/portal-analista/consultas/${id}/responder`, body);
  },
  async listRecepcionCotizaciones(params = {}) {
    const q = new URLSearchParams(params).toString();
    return api.get(`/contrataciones/portal-analista/cotizaciones${q ? `?${q}` : ''}`);
  },
  async getRecepcionCotizacionDetalle(id) {
    return api.get(`/contrataciones/portal-analista/cotizaciones/${id}`);
  },
  async listValidacionesPendientes() {
    return api.get('/contrataciones/portal-analista/validaciones/pendientes-derivacion');
  },
  async listValidacionesExpedientes(esAdmin = false) {
    return api.get(`/contrataciones/portal-analista/validaciones/expedientes${esAdmin ? '?admin=1' : ''}`);
  },
  async listValidacionesAsignadas() {
    return api.get('/contrataciones/portal-analista/validaciones/asignadas');
  },
  async getValidacionSubmodulos() {
    return api.get('/contrataciones/portal-analista/validaciones/submodulos');
  },
  async listValidacionUsuarios(submodulo, search = '') {
    const q = new URLSearchParams({ submodulo, search }).toString();
    return api.get(`/contrataciones/portal-analista/validaciones/usuarios?${q}`);
  },
  async getDestinosSalidaValidacion(resultado = '', cumple = '') {
    const q = new URLSearchParams({ resultado, cumple }).toString();
    return api.get(`/contrataciones/portal-analista/validaciones/destinos-salida?${q}`);
  },
  async listProveedoresValidacionSolicitud(solicitudId, esAdmin = false) {
    return api.get(`/contrataciones/portal-analista/validaciones/solicitud/${solicitudId}/proveedores${esAdmin ? '?admin=1' : ''}`);
  },
  async getPreviewDerivacionValidacion(id) {
    return api.get(`/contrataciones/portal-analista/validaciones/${id}/preview-derivacion`);
  },
  async derivarValidacion(id, body) {
    return api.post(`/contrataciones/portal-analista/validaciones/${id}/derivar`, body);
  },
  async getValidacionTrabajo(id, esAdmin = false) {
    return api.get(`/contrataciones/portal-analista/validaciones/${id}/trabajo${esAdmin ? '?admin=1' : ''}`);
  },
  async guardarValidacionParcial(id, body, esAdmin = false) {
    return api.put(`/contrataciones/portal-analista/validaciones/${id}/guardar`, { ...body, admin: esAdmin ? '1' : '0' });
  },
  async enviarValidacion(id, body, esAdmin = false) {
    return api.put(`/contrataciones/portal-analista/validaciones/${id}/enviar`, { ...body, admin: esAdmin ? '1' : '0' });
  },
  async listCuadroComparativo() {
    return api.get('/contrataciones/portal-analista/cuadro-comparativo');
  },
  async listValidaciones(params = {}) {
    return api.get('/contrataciones/portal-analista/validaciones');
  },
  async validarCotizacion(id, body) {
    return api.put(`/contrataciones/portal-analista/validaciones/${id}`, body);
  },
};