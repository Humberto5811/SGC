/**
 * RC8.15.1 — API Ejecución → Presentación Entregables de Servicios.
 * Prefijo: /api/entregables-servicios
 */
import { Router } from 'express';
import {
  listarBandejaEntregablesServicios,
  listarBandejaOrdenesEntregablesServicios,
  getDetalleEntregableServicio,
  registrarRecepcionEntregable,
  modificarRecepcionEntregable,
  adjuntarDocumentosRecepcionEntregable,
  reemplazarDocumentoRecepcionEntregable,
  retirarDocumentoRecepcionEntregable,
  observarEntregable,
  observarEntregableDirigido,
  retirarObservacionEntregable,
  subsanarEntregable,
  listarCoordinadoresCMEntregable,
  derivarEntregableCoordinadorCM,
  listarAnalistasCMEntregable,
  derivarEntregableAnalistaCM,
  listarAnalistasPagoEntregable,
  observarEntregableAnalistaCM,
  derivarEntregablePago,
  listarTrazabilidadEntregable,
  getDocumentoRecepcionEntregable,
  getDocumentoRecepcionEntregableBytes,
  listarConformidadEntregable,
  generarActaConformidadEntregable,
  adjuntarActaConformidadFirmada,
  getActaConformidadGenerada,
  getActaConformidadGeneradaBytes,
  getActaConformidadFirmada,
  getActaConformidadFirmadaBytes,
} from '../lib/entregablesServicios.js';
import {
  CATALOGO_DESTINOS_OBSERVACION,
  listarDestinatariosObservacion,
  listarMisObservacionesDirigidas,
} from '../lib/observacionesEntregableRouting.js';

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
    cargo: u.cargo,
    username: u.username,
    nombre: u.nombre,
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

router.get('/bandeja-ordenes', async (req, res, next) => {
  try {
    const data = await listarBandejaOrdenesEntregablesServicios(req.esUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/observaciones-dirigidas/mias', async (req, res, next) => {
  try {
    const result = await listarMisObservacionesDirigidas({
      userCtx: req.esUserCtx,
      estado: req.query.estado || 'ABIERTAS',
      q: req.query.q || '',
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

router.get('/observaciones-dirigidas/destinos', async (req, res, next) => {
  try {
    res.json({ ok: true, data: CATALOGO_DESTINOS_OBSERVACION });
  } catch (err) { next(err); }
});

router.get('/observaciones-dirigidas/destinatarios', async (req, res, next) => {
  try {
    const data = await listarDestinatariosObservacion({
      submoduloDestino: req.query.submoduloDestino || req.query.destino_submodulo_codigo,
    });
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const data = await getDetalleEntregableServicio(req.params.id);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/coordinadores-cm', async (req, res, next) => {
  try {
    const data = await listarCoordinadoresCMEntregable(req.params.id, req.esUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/derivar-coordinador-cm', async (req, res, next) => {
  try {
    const data = await derivarEntregableCoordinadorCM(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/analistas-cm', async (req, res, next) => {
  try {
    const data = await listarAnalistasCMEntregable(req.params.id, req.esUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/derivar-analista-cm', async (req, res, next) => {
  try {
    const data = await derivarEntregableAnalistaCM(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/analistas-pago', async (req, res, next) => {
  try {
    const data = await listarAnalistasPagoEntregable(req.params.id, req.esUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/observaciones-analista-cm', async (req, res, next) => {
  try {
    const data = await observarEntregableAnalistaCM(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/derivar-pago', async (req, res, next) => {
  try {
    const data = await derivarEntregablePago(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/trazabilidad', async (req, res, next) => {
  try {
    const data = await listarTrazabilidadEntregable(req.params.id, req.esUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/registrar-recepcion', async (req, res, next) => {
  try {
    const data = await registrarRecepcionEntregable(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
      req.esRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.put('/:id/recepcion', async (req, res, next) => {
  try {
    const data = await modificarRecepcionEntregable(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
      req.esRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/recepcion/documentos', async (req, res, next) => {
  try {
    const data = await adjuntarDocumentosRecepcionEntregable(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.put('/:id/recepcion/documentos/:documentoId/reemplazar', async (req, res, next) => {
  try {
    const data = await reemplazarDocumentoRecepcionEntregable(
      req.params.id,
      req.params.documentoId,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id/recepcion/documentos/:documentoId', async (req, res, next) => {
  try {
    const data = await retirarDocumentoRecepcionEntregable(
      req.params.id,
      req.params.documentoId,
      req.esUserCtx,
      req.esUsuario,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/observaciones-dirigidas', async (req, res, next) => {
  try {
    const data = await observarEntregableDirigido(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/observaciones/:observacionId/retirar', async (req, res, next) => {
  try {
    const data = await retirarObservacionEntregable(
      req.params.id,
      req.params.observacionId,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/observaciones', async (req, res, next) => {
  try {
    const data = await observarEntregable(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/subsanaciones', async (req, res, next) => {
  try {
    const data = await subsanarEntregable(
      req.params.id,
      req.body || {},
      req.esUserCtx,
      req.esUsuario,
    );
    res.status(201).json({ ok: true, data });
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

router.get('/:id/conformidad', async (req, res, next) => {
  try {
    const data = await listarConformidadEntregable(req.params.id);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/conformidad/generar', async (req, res, next) => {
  try {
    const data = await generarActaConformidadEntregable(req.params.id, req.body || {}, req.esUserCtx, req.esUsuario);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/conformidad/firmada', async (req, res, next) => {
  try {
    const data = await adjuntarActaConformidadFirmada(req.params.id, req.body || {}, req.esUserCtx, req.esUsuario);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/conformidad/actas/:actaId', async (req, res, next) => {
  try {
    const data = await getActaConformidadGenerada(req.params.id, req.params.actaId);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/conformidad/actas/:actaId/preview', async (req, res, next) => {
  try {
    const file = await getActaConformidadGeneradaBytes(req.params.id, req.params.actaId);
    return sendDocumentoBytes(res, file, 'inline');
  } catch (err) { next(err); }
});

router.get('/:id/conformidad/actas/:actaId/download', async (req, res, next) => {
  try {
    const file = await getActaConformidadGeneradaBytes(req.params.id, req.params.actaId);
    return sendDocumentoBytes(res, file, 'attachment');
  } catch (err) { next(err); }
});

router.get('/:id/conformidad/firmadas/:visadoId', async (req, res, next) => {
  try {
    const data = await getActaConformidadFirmada(req.params.id, req.params.visadoId);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/conformidad/firmadas/:visadoId/preview', async (req, res, next) => {
  try {
    const file = await getActaConformidadFirmadaBytes(req.params.id, req.params.visadoId);
    return sendDocumentoBytes(res, file, 'inline');
  } catch (err) { next(err); }
});

router.get('/:id/conformidad/firmadas/:visadoId/download', async (req, res, next) => {
  try {
    const file = await getActaConformidadFirmadaBytes(req.params.id, req.params.visadoId);
    return sendDocumentoBytes(res, file, 'attachment');
  } catch (err) { next(err); }
});

export default router;