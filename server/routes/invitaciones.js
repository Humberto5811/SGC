// Rutas API — Invitaciones y Solicitudes de Cotización
import express from 'express';
import {
  listarBandejaInvitaciones,
  crearSolicitudCotizacion,
  getCatalogosSolicitud,
  generarCodigoSolicitud,
  buscarProveedores,
  upsertProveedor,
  agregarProveedoresInvitacion,
  enviarInvitaciones,
  getSolicitudDetalle,
  listarSolicitudesPorRequerimiento,
  getTableroControl,
  seedProveedoresDemo,
  observarInvitaciones,
  listarSolicitudesBandeja,
  actualizarSolicitudCotizacion,
  eliminarSolicitudCotizacion,
  obtenerItemsRequerimientos,
  agregarProveedorSolicitud,
  listarProveedoresSolicitud,
  enviarCorreosSolicitud,
  eliminarInvitacionProveedor,
} from '../lib/invitaciones.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const soloMios = req.query.solo_mios === '1' || req.query.solo_mios === 'true';
    const usuarioNombre = req.headers['x-user-name'] || req.query.usuario || '';
    const result = await listarBandejaInvitaciones(page, pageSize, req.query, {
      soloAsignadosA: soloMios ? usuarioNombre : null,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/catalogos', (_req, res) => {
  res.json(getCatalogosSolicitud());
});

router.get('/solicitudes', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize || '50', 10)));
    const data = await listarSolicitudesBandeja(page, pageSize, req.query);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/solicitudes/preview-codigo', async (_req, res, next) => {
  try {
    const data = await generarCodigoSolicitud();
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/requerimientos/items', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
    const data = await obtenerItemsRequerimientos(ids);
    res.json({ data });
  } catch (err) { next(err); }
});

router.put('/solicitudes/:id', async (req, res, next) => {
  try {
    const solicitud = await actualizarSolicitudCotizacion(req.params.id, req.body || {});
    res.json({ success: true, solicitud });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.delete('/solicitudes/:id', async (req, res, next) => {
  try {
    await eliminarSolicitudCotizacion(req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/solicitudes/:id/proveedores', async (req, res, next) => {
  try {
    const data = await listarProveedoresSolicitud(req.params.id);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/solicitudes/:id/proveedores', async (req, res, next) => {
  try {
    const row = await agregarProveedorSolicitud(req.params.id, req.body || {});
    res.status(201).json({ success: true, invitacion: row });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.post('/solicitudes/:id/enviar-correos', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const result = await enviarCorreosSolicitud(req.params.id, req.body?.invitacion_ids || [], { usuario, ip });
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.delete('/solicitudes/:id/proveedores/:invitacionId', async (req, res, next) => {
  try {
    await eliminarInvitacionProveedor(req.params.invitacionId);
    res.json({ success: true });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/solicitudes/:id', async (req, res, next) => {
  try {
    const data = await getSolicitudDetalle(req.params.id);
    if (!data) return res.status(404).json({ error: 'Solicitud no encontrada' });
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/requerimiento/:requerimientoId/solicitudes', async (req, res, next) => {
  try {
    const data = await listarSolicitudesPorRequerimiento(req.params.requerimientoId);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/tablero', async (req, res, next) => {
  try {
    const data = await getTableroControl(null);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/tablero/:solicitudId', async (req, res, next) => {
  try {
    const data = await getTableroControl(parseInt(req.params.solicitudId, 10));
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/solicitudes', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const solicitud = await crearSolicitudCotizacion(req.body || {}, usuario);
    res.status(201).json({ success: true, solicitud });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'El código de solicitud ya existe. Actualice la página e intente de nuevo.' });
    }
    if (err.message) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/proveedores', async (req, res, next) => {
  try {
    const data = await buscarProveedores(req.query.search || req.query.q || '', req.query.limit);
    res.json({ data });
  } catch (err) { next(err); }
});

router.post('/proveedores', async (req, res, next) => {
  try {
    const proveedor = await upsertProveedor(req.body || {});
    res.status(201).json({ success: true, proveedor });
  } catch (err) { next(err); }
});

router.post('/proveedores/seed-demo', async (_req, res, next) => {
  try {
    const n = await seedProveedoresDemo();
    res.json({ success: true, inserted: n });
  } catch (err) { next(err); }
});

router.post('/requerimiento/:requerimientoId/proveedores', async (req, res, next) => {
  try {
    const { proveedores, solicitud_id } = req.body || {};
    const data = await agregarProveedoresInvitacion(
      parseInt(req.params.requerimientoId, 10),
      proveedores || [],
      solicitud_id || null,
    );
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/requerimiento/:requerimientoId/enviar', async (req, res, next) => {
  try {
    const usuario = req.headers['x-user-name'] || req.body?.usuario || '';
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const result = await enviarInvitaciones(parseInt(req.params.requerimientoId, 10), {
      solicitud_id: req.body?.solicitud_id,
      usuario,
      ip,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.put('/observar/:requerimientoId', async (req, res, next) => {
  try {
    const updated = await observarInvitaciones(req.params.requerimientoId, req.body || {});
    res.json({ success: true, requerimiento: updated });
  } catch (err) { next(err); }
});

export default router;
