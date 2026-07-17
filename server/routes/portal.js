// Rutas públicas y protegidas — Portal de Proveedores
import express from 'express';
import {
  portalLogin,
  portalChangePassword,
  requirePortalProveedor,
  listMisInvitaciones,
  getDocumentosConvocatoria,
  registrarConsulta,
  listConsultasProveedor,
  listAbsolucionesPublicas,
  registrarObservacion,
  presentarCotizacion,
  guardarBorradorCotizacion,
  listMisCotizaciones,
  getEstadoParticipacion,
  resolverInvitacionToken,
  listarConsultasBandeja,
  responderConsultaAnalista,
  listarRecepcionCotizaciones,
  listarValidacionesBandeja,
  validarCotizacion,
  ampliarPlazo,
} from '../lib/portalProveedores.js';
import {
  listarValidacionesPendientesDerivacion,
  listarValidacionesAsignadas,
  listarValidacionesExpedientes,
  getPreviewDerivacionValidacion,
  derivarValidacionCotizacion,
  devolverValidacionAAreaUsuaria,
  getValidacionTrabajoDetalle,
  guardarValidacionParcial,
  enviarValidacionUsuario,
  listUsuariosDerivacionValidacion,
  getSubmodulosValidacion,
  listarProveedoresSolicitudValidacion,
  getDestinosSalidaPorResultado,
  resolverPdfValidacionFirmada,
} from '../lib/validacionesCotizacion.js';
import {
  listarCuadroComparativo,
  listarCuadroComparativoExpedientes,
  getCuadroComparativoExpediente,
  obtenerDetalleCuadro,
  crearOBuscarBorrador,
  guardarBorradorCuadro,
  guardarAdjudicacionCuadro,
  listarVersionesCuadro,
  obtenerDatosPdfCuadro,
  guardarPdfCuadro,
  resolverPdfCuadro,
} from '../lib/cuadroComparativo.js';
import {
  getSolicitudDetalleProveedor,
  getCotizacionWorkspace,
  resolverDocumentoPortal,
  registrarDocumentoTraza,
  getCotizacionRecepcionDetalle,
  resolverDocumentoCotizacionAnalista,
} from '../lib/portalDocumentos.js';

function clientIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '').split(',')[0].trim();
}

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { ruc, password } = req.body || {};
    const proveedor = await portalLogin(ruc, password, req);
    res.json({ success: true, proveedor });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

router.get('/invitacion/:token', async (req, res, next) => {
  try {
    const data = await resolverInvitacionToken(req.params.token);
    res.json({ success: true, invitacion: data });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

router.post('/cambiar-password', requirePortalProveedor, async (req, res, next) => {
  try {
    await portalChangePassword(req.portalProveedor.id, req.body || {});
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/mis-invitaciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await listMisInvitaciones(req.portalProveedor.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/documentos', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await getDocumentosConvocatoria(req.portalProveedor.id, req.params.id);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/detalle', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await getSolicitudDetalleProveedor(req.portalProveedor.id, req.params.id);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/cotizacion-workspace', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await getCotizacionWorkspace(req.portalProveedor.id, req.params.id);
    res.json({ success: true, ...data });
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/documento/:ref/ver', requirePortalProveedor, async (req, res, next) => {
  try {
    const adj = await resolverDocumentoPortal(req.portalProveedor.id, req.params.id, req.params.ref);
    await registrarDocumentoTraza({
      solicitudId: parseInt(req.params.id, 10),
      proveedorId: req.portalProveedor.id,
      documentoRef: req.params.ref,
      evento: 'documento_visualizado',
      usuario: req.portalProveedor.ruc,
      ip: clientIp(req),
    });
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adj.nombre_archivo || 'documento.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/documento/:ref/descargar', requirePortalProveedor, async (req, res, next) => {
  try {
    const adj = await resolverDocumentoPortal(req.portalProveedor.id, req.params.id, req.params.ref);
    await registrarDocumentoTraza({
      solicitudId: parseInt(req.params.id, 10),
      proveedorId: req.portalProveedor.id,
      documentoRef: req.params.ref,
      evento: 'documento_descargado',
      usuario: req.portalProveedor.ruc,
      ip: clientIp(req),
    });
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(adj.nombre_archivo || 'documento.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

router.get('/solicitud/:id/absoluciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await listAbsolucionesPublicas(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/consultas', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await listConsultasProveedor(req.portalProveedor.id, req.query.solicitud_id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/consultas', requirePortalProveedor, async (req, res, next) => {
  try {
    const row = await registrarConsulta(req.portalProveedor.id, req.body, req);
    res.status(201).json({ success: true, consulta: row });
  } catch (err) { next(err); }
});

router.post('/observaciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const row = await registrarObservacion(req.portalProveedor.id, req.body, req);
    res.status(201).json({ success: true, observacion: row });
  } catch (err) { next(err); }
});

router.post('/cotizaciones/borrador', requirePortalProveedor, async (req, res, next) => {
  try {
    const row = await guardarBorradorCotizacion(req.portalProveedor.id, req.body, req);
    res.json({ success: true, cotizacion: row });
  } catch (err) { next(err); }
});

router.post('/cotizaciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const row = await presentarCotizacion(req.portalProveedor.id, req.body, req);
    res.status(201).json({ success: true, cotizacion: row });
  } catch (err) { next(err); }
});

router.get('/cotizaciones', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await listMisCotizaciones(req.portalProveedor.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/estado-participacion', requirePortalProveedor, async (req, res, next) => {
  try {
    const data = await getEstadoParticipacion(req.portalProveedor.id);
    res.json(data);
  } catch (err) { next(err); }
});

export default router;

export const portalAnalistaRouter = express.Router();

portalAnalistaRouter.get('/consultas', async (req, res, next) => {
  try {
    const data = await listarConsultasBandeja(req.query);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/consultas/:id/responder', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const row = await responderConsultaAnalista(req.params.id, req.body, usuario);
    res.json({ success: true, consulta: row });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cotizaciones', async (req, res, next) => {
  try {
    const data = await listarRecepcionCotizaciones(req.query);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cotizaciones/:id', async (req, res, next) => {
  try {
    const data = await getCotizacionRecepcionDetalle(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cotizaciones/:id/documento/:ref/ver', async (req, res, next) => {
  try {
    const adj = await resolverDocumentoCotizacionAnalista(req.params.id, req.params.ref);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(adj.nombre_archivo || 'documento.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cotizaciones/:id/documento/:ref/descargar', async (req, res, next) => {
  try {
    const adj = await resolverDocumentoCotizacionAnalista(req.params.id, req.params.ref);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    res.setHeader('Content-Type', adj.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(adj.nombre_archivo || 'documento')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones', async (_req, res, next) => {
  try {
    const data = await listarValidacionesPendientesDerivacion();
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/pendientes-derivacion', async (_req, res, next) => {
  try {
    const data = await listarValidacionesPendientesDerivacion();
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/expedientes', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.query.admin || '') === '1';
    const data = await listarValidacionesExpedientes(usuario, userId, { esAdmin, soloAsignadas: !esAdmin });
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/asignadas', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || '';
    const userId = req.headers['x-user-id'] || '';
    const data = await listarValidacionesAsignadas(usuario, userId);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/submodulos', async (_req, res, next) => {
  try {
    res.json({ data: getSubmodulosValidacion() });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/usuarios', async (req, res, next) => {
  try {
    const data = await listUsuariosDerivacionValidacion(req.query.submodulo, req.query.search);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/destinos-salida', async (req, res, next) => {
  try {
    const data = getDestinosSalidaPorResultado(req.query.resultado, req.query.cumple);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/solicitud/:solicitudId/proveedores', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.query.admin || '') === '1';
    const data = await listarProveedoresSolicitudValidacion(
      req.params.solicitudId,
      usuario,
      userId,
      { esAdmin },
    );
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/:id/preview-derivacion', async (req, res, next) => {
  try {
    const data = await getPreviewDerivacionValidacion(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/validaciones/:id/derivar', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    if (!usuario) return res.status(401).json({ error: 'No autenticado' });
    const row = await derivarValidacionCotizacion(req.params.id, req.body, usuario);
    res.json({
      success: true,
      cotizacion: row,
      idempotente: !!row?.idempotente,
      ok: true,
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (/obligatoria|obligatorios|no está presentada|ya fue|ya está|no permitido/i.test(msg)) {
      return res.status(409).json({ error: msg });
    }
    next(err);
  }
});

portalAnalistaRouter.post('/validaciones/:id/devolver', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    if (!usuario) return res.status(401).json({ error: 'No autenticado' });
    const row = await devolverValidacionAAreaUsuaria(req.params.id, req.body, usuario);
    res.json({
      success: true,
      cotizacion: row,
      idempotente: !!row?.idempotente,
      ok: true,
    });
  } catch (err) {
    const msg = String(err?.message || '');
    if (/obligatoria|Solo se puede|responsable|no permitido/i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    if (/permiso|No tiene/i.test(msg)) {
      return res.status(403).json({ error: msg });
    }
    if (/ya está|ya fue/i.test(msg)) {
      return res.status(409).json({ error: msg });
    }
    next(err);
  }
});

portalAnalistaRouter.get('/validaciones/:id/trabajo', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.query.admin || '') === '1';
    const data = await getValidacionTrabajoDetalle(req.params.id, usuario, userId, { esAdmin });
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/validaciones/:id/guardar', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.body?.admin || '') === '1';
    const row = await guardarValidacionParcial(req.params.id, req.body, usuario, userId, { esAdmin });
    res.json({ success: true, cotizacion: row });
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/validaciones/:id/enviar', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const userId = req.headers['x-user-id'] || '';
    const esAdmin = String(req.body?.admin || '') === '1';
    const row = await enviarValidacionUsuario(req.params.id, req.body, usuario, userId, { esAdmin });
    res.json({
      success: true,
      ok: row?.ok !== false,
      cotizacion: row,
      estado: row?.estado || row?.validacion_estado,
      destino: row?.destino || row?.destino_salida,
      responsable: row?.responsable,
      workflow: row?.workflow,
    });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/validaciones/:id/pdf-validacion', async (req, res, next) => {
  try {
    const adj = await resolverPdfValidacionFirmada(req.params.id);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    const inline = req.query.inline === '1';
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(adj.nombre_archivo || 'validacion.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/validaciones/:id', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const row = await validarCotizacion(req.params.id, req.body, usuario);
    res.json({ success: true, cotizacion: row });
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/solicitud/:id/ampliar-plazo', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const result = await ampliarPlazo(req.params.id, req.body, usuario);
    res.json(result);
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cuadro-comparativo', async (_req, res, next) => {
  try {
    const data = await listarCuadroComparativo();
    res.json({ data });
  } catch (err) { next(err); }
});

/** RC8.1 — bandeja por Solicitud de Cotización */
portalAnalistaRouter.get('/cuadro-comparativo/expedientes', async (_req, res, next) => {
  try {
    const data = await listarCuadroComparativoExpedientes();
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cuadro-comparativo/expedientes/:solicitudId', async (req, res, next) => {
  try {
    const data = await getCuadroComparativoExpediente(req.params.solicitudId);
    res.json({ data });
  } catch (err) { next(err); }
});

/** RC8.2 — matriz Bienes + borrador */
portalAnalistaRouter.get('/cuadro-comparativo/:solicitudId/detalle', async (req, res, next) => {
  try {
    const data = await obtenerDetalleCuadro(req.params.solicitudId);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/cuadro-comparativo/:solicitudId/borrador', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await crearOBuscarBorrador(req.params.solicitudId, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.put('/cuadro-comparativo/:cuadroId/borrador', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await guardarBorradorCuadro(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data });
  } catch (err) {
    if (err?.code === 'CONFLICT_VERSION' || err?.status === 409) {
      res.status(409).json({ error: err.message, code: 'CONFLICT_VERSION' });
      return;
    }
    next(err);
  }
});

portalAnalistaRouter.put('/cuadro-comparativo/:cuadroId/adjudicacion', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await guardarAdjudicacionCuadro(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data, derivado_ccp: false });
  } catch (err) {
    if (err?.code === 'CONFLICT_VERSION' || err?.status === 409) {
      res.status(409).json({ error: err.message, code: 'CONFLICT_VERSION' });
      return;
    }
    if (err?.code === 'ADJUDICACION_INVALIDA') {
      res.status(400).json({ error: err.message, code: err.code, errors: err.errors || [] });
      return;
    }
    next(err);
  }
});

portalAnalistaRouter.get('/cuadro-comparativo/:solicitudId/versiones', async (req, res, next) => {
  try {
    const data = await listarVersionesCuadro(req.params.solicitudId);
    res.json({ data });
  } catch (err) { next(err); }
});

/** RC8.4 — Anexo 8A PDF */
portalAnalistaRouter.get('/cuadro-comparativo/cuadro/:cuadroId/pdf-data', async (req, res, next) => {
  try {
    const data = await obtenerDatosPdfCuadro(req.params.cuadroId);
    res.json({ data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.post('/cuadro-comparativo/cuadro/:cuadroId/pdf', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const data = await guardarPdfCuadro(req.params.cuadroId, req.body || {}, usuario);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

portalAnalistaRouter.get('/cuadro-comparativo/cuadro/:cuadroId/pdf', async (req, res, next) => {
  try {
    const adj = await resolverPdfCuadro(req.params.cuadroId);
    const buf = Buffer.from(adj.contenido_base64 || '', 'base64');
    const inline = req.query.inline === '1';
    res.setHeader('Content-Type', adj.mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(adj.nombre_archivo || 'Anexo_08A.pdf')}"`);
    res.send(buf);
  } catch (err) { next(err); }
});
