/**
 * RC8.15.1 — API Ejecución → Presentación Entregables de Servicios.
 * Prefijo: /api/entregables-servicios
 */
import { Router } from 'express';
import {
  listarBandejaEntregablesServicios,
  getDetalleEntregableServicio,
  registrarRecepcionEntregable,
  getDocumentoRecepcionEntregable,
  getDocumentoRecepcionEntregableBytes,
} from '../lib/entregablesServicios.js';

const router = Router();

function requireAuthContext(req, res, next) {
  const u = req.user && typeof req.user === 'object' ? req.user : null;
  if (!u || u.id == null) {
    return res.status(401).json({ error: 'Autenticación requerida', code: 'AUTH_REQUIRED' });
  }
  req.esUsuario = (req.headers['x-user-name'] || u.nombre || u.username || '');
  req.esRol = String(u.rol ?? u.role ?? '').toLowerCase();
  req.esUserCtx = {
    id: parseInt(u.id, 10),
    rol: req.esRol,
    centro: u.centro,
    codigo_centro_costo: u.codigo_centro_costo,
    alcance_datos: u.alcance_datos,
    area_id: u.area_id,
    permisos: u.permisos,
  };
  return next();
}

router.use(requireAuthContext);

router.get('/bandeja', async (req, res, next) => {
  try {
    const data = await listarBandejaEntregablesServicios(req.esUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const data = await getDetalleEntregableServicio(req.params.id);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/registrar-recepcion', async (req, res, next) => {
  try {
    const data = await registrarRecepcionEntregable(
      req.params.id,
      req.body || {},
      req.esUsuario,
      req.esRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/recepciones/:recepcionId/documentos/:documentoId', async (req, res, next) => {
  try {
    const data = await getDocumentoRecepcionEntregable(req.params.recepcionId, req.params.documentoId);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

function sendDocumentoBytes(res, file, disposition) {
  const safeName = String(file.nombre || 'documento.pdf').replace(/["\r\n]/g, '_');
  res.setHeader('Content-Type', file.mimeType || 'application/pdf');
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader(
    'Content-Disposition',
    `${disposition === 'attachment' ? 'attachment' : 'inline'}; filename="${safeName}"`,
  );
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(file.buffer);
}

router.get('/recepciones/:recepcionId/documentos/:documentoId/preview', async (req, res, next) => {
  try {
    const file = await getDocumentoRecepcionEntregableBytes(req.params.recepcionId, req.params.documentoId);
    return sendDocumentoBytes(res, file, 'inline');
  } catch (err) { next(err); }
});

router.get('/recepciones/:recepcionId/documentos/:documentoId/download', async (req, res, next) => {
  try {
    const file = await getDocumentoRecepcionEntregableBytes(req.params.recepcionId, req.params.documentoId);
    return sendDocumentoBytes(res, file, 'attachment');
  } catch (err) { next(err); }
});

export default router;