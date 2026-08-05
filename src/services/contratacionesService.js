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
  async derivarRecepcionACcp(id, body) {
    return api.post(`/contrataciones/portal-analista/cotizaciones/${id}/derivar-ccp`, body);
  },
  async devolverValidacion(id, body) {
    return api.post(`/contrataciones/portal-analista/validaciones/${id}/devolver`, body);
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
  /** RC8.1 — bandeja agrupada por Solicitud de Cotización */
  async listCuadroComparativoExpedientes() {
    return api.get('/contrataciones/portal-analista/cuadro-comparativo/expedientes');
  },
  async getCuadroComparativoExpediente(solicitudId) {
    return api.get(`/contrataciones/portal-analista/cuadro-comparativo/expedientes/${solicitudId}`);
  },
  async getCuadroComparativoDetalle(solicitudId) {
    return api.get(`/contrataciones/portal-analista/cuadro-comparativo/${solicitudId}/detalle`);
  },
  async crearCuadroBorrador(solicitudId, body = {}) {
    return api.post(`/contrataciones/portal-analista/cuadro-comparativo/${solicitudId}/borrador`, body);
  },
  async guardarCuadroBorrador(cuadroId, body = {}) {
    return api.put(`/contrataciones/portal-analista/cuadro-comparativo/${cuadroId}/borrador`, body);
  },
  async guardarCuadroAdjudicacion(cuadroId, body = {}) {
    return api.put(`/contrataciones/portal-analista/cuadro-comparativo/${cuadroId}/adjudicacion`, body);
  },
  async listCuadroVersiones(solicitudId) {
    return api.get(`/contrataciones/portal-analista/cuadro-comparativo/${solicitudId}/versiones`);
  },
  async getCuadroPdfData(cuadroId) {
    return api.get(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/pdf-data`);
  },
  async guardarCuadroPdf(cuadroId, body = {}) {
    return api.post(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/pdf`, body);
  },
  async getCuadroPdfUrl(cuadroId, inline = true) {
    return `/api/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/pdf${inline ? '?inline=1' : ''}`;
  },
  async adjuntarCuadroPdfFirmado(cuadroId, body = {}) {
    return api.post(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/firmado`, body);
  },
  async eliminarCuadroPdfFirmado(cuadroId) {
    return api.del(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/firmado`);
  },
  async getCuadroPdfFirmadoUrl(cuadroId, inline = true) {
    return `/api/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/firmado${inline ? '?inline=1' : ''}`;
  },
  /** Descarga el PDF firmado con autenticación (para Ver / Descargar en blob). */
  async fetchCuadroPdfFirmado(cuadroId, inline = true) {
    const q = inline ? '?inline=1' : '';
    return api.getBlob(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/firmado${q}`);
  },
  /** RC8.6 — PDF firmado DEC */
  async adjuntarCuadroPdfFirmadoDec(cuadroId, body = {}) {
    return api.post(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/firmado-dec`, body);
  },
  async eliminarCuadroPdfFirmadoDec(cuadroId) {
    return api.del(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/firmado-dec`);
  },
  async fetchCuadroPdfFirmadoDec(cuadroId, inline = true) {
    const q = inline ? '?inline=1' : '';
    return api.getBlob(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/firmado-dec${q}`);
  },
  async getCuadroPdfFirmadoDecUrl(cuadroId, inline = true) {
    return `/api/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/firmado-dec${inline ? '?inline=1' : ''}`;
  },
  async derivarCuadroACcp(cuadroId, body = {}) {
    return api.post(`/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/derivar-ccp`, body);
  },
  // —— Certificación Presupuestal (CCP) ——
  async listCcpBandeja(params = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
    const qs = q.toString();
    return api.get(`/ccp/bandeja${qs ? `?${qs}` : ''}`);
  },
  async getCcpRequerimiento(id) {
    return api.get(`/ccp/${id}`);
  },
  async registrarCodigoCcp(requerimientoId, body) {
    return api.post(`/ccp/${requerimientoId}/codigo`, body);
  },
  async editarCodigoCcp(requerimientoId, body) {
    return api.put(`/ccp/${requerimientoId}/codigo`, body);
  },
  async anularCodigoCcp(requerimientoId, body) {
    return api.del(`/ccp/${requerimientoId}/codigo`, body);
  },
  async crearConsolidacionCcp(body) {
    return api.post('/ccp/consolidaciones', body);
  },
  async getConsolidacionCcp(id) {
    return api.get(`/ccp/consolidaciones/${id}`);
  },
  async actualizarConsolidacionCcp(id, body) {
    return api.put(`/ccp/consolidaciones/${id}`, body);
  },
  async retirarRequerimientoCcp(solicitudId, requerimientoId) {
    return api.post(`/ccp/consolidaciones/${solicitudId}/retirar`, { requerimiento_id: requerimientoId });
  },
  async generarWordCcp(solicitudId) {
    return api.postBlob(`/ccp/consolidaciones/${solicitudId}/generar-word`, {});
  },
  async transitarRevisionCuadro(cuadroId, body = {}) {
    // RC8.5-G — no enviar cargo/rol en body (privilegios solo por headers de sesión).
    // actuar_como solo lo envía el FE en modo prueba Admin; el BE lo valida.
    const { cargo: _c, rol: _r, permisos: _p, ...safe } = body || {};
    return api.post(
      `/contrataciones/portal-analista/cuadro-comparativo/cuadro/${cuadroId}/revision`,
      safe,
    );
  },
  async listValidaciones(params = {}) {
    return api.get('/contrataciones/portal-analista/validaciones');
  },
  async validarCotizacion(id, body) {
    return api.put(`/contrataciones/portal-analista/validaciones/${id}`, body);
  },
};