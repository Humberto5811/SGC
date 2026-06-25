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
  listarValidacionesBandeja,
  validarCotizacion,
  ampliarPlazo,
} from '../lib/portalProveedores.js';
import {
  getSolicitudDetalleProveedor,
  getCotizacionWorkspace,
  resolverDocumentoPortal,
  registrarDocumentoTraza,
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

portalAnalistaRouter.get('/validaciones', async (_req, res, next) => {
  try {
    const data = await listarValidacionesBandeja();
    res.json({ data });
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
