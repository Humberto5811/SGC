/**
 * API — Ejecución → Recepción de Bienes
 */
import { Router } from 'express';
import {
  listarBandejaRecepcionBienes,
  getDetalleRecepcionBienes,
  getDocumentoRecepcionBienes,
  getDocumentoRecepcionBienesBytes,
  registrarRecepcion,
  generarActaRecepcion,
  editarActaRecepcion,
  eliminarActaRecepcion,
  adjuntarActaVisadaAlmacen,
  listarActaVisada,
  obtenerActaVisada,
  reemplazarActaVisada,
  eliminarActaVisada,
  listDestinatariosAreaUsuaria,
  derivarAreaUsuaria,
  cargarActaFirmada,
  observarActa,
  derivarCoordinacionCm,
  derivarPago,
  getHistorialRecepcionBienes,
  sincronizarOrdenesElegibles,
  asegurarExpedienteRecepcionDesdeOrden,
} from '../lib/recepcionBienes.js';
import {
  buildPaqueteDocumentalDerivacionAu,
  adjuntarAdjuntoDerivacionAu,
  eliminarAdjuntoDerivacionAu,
  listarPaqueteDerivado,
} from '../lib/recepcionPaqueteDerivacionAu.js';

const router = Router();
const ROLES = new Set(['dec', 'admin', 'au', 'almacen', 'cm', 'coordinador', 'analista']);

function requireRol(req, res, next) {
  const rol = String(
    req.headers['x-user-rol'] || req.headers['x-user-role'] || req.user?.rol || req.user?.role || 'dec',
  ).toLowerCase();
  req.rbRol = rol;
  req.rbUsuario = req.headers['x-user-name'] || req.user?.nombre || req.user?.username || 'usuario';
  req.rbUserId = req.headers['x-user-id'] || req.user?.id || null;
  return next();
}

router.use(requireRol);

router.get('/bandeja', async (req, res, next) => {
  try {
    const data = await listarBandejaRecepcionBienes({
      rol: req.rbRol,
      usuario: req.rbUsuario,
      userId: req.rbUserId,
    });
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/sincronizar', async (req, res, next) => {
  try {
    const data = await sincronizarOrdenesElegibles(req.rbUsuario);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/desde-orden/:ordenId', async (req, res, next) => {
  try {
    const data = await asegurarExpedienteRecepcionDesdeOrden(req.params.ordenId, req.rbUsuario);
    if (!data) return res.status(409).json({ error: 'Orden no elegible para Recepción de Bienes' });
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/destinatarios-au', async (req, res, next) => {
  try {
    const data = await listDestinatariosAreaUsuaria(req.query.search || '');
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const data = await getDetalleRecepcionBienes(req.params.id);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/historial', async (req, res, next) => {
  try {
    const data = await getHistorialRecepcionBienes(req.params.id);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/documentos/:tipo/:docId', async (req, res, next) => {
  try {
    const data = await getDocumentoRecepcionBienes(req.params.id, req.params.tipo, req.params.docId);
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

router.get('/:id/documentos/:tipo/:docId/preview', async (req, res, next) => {
  try {
    const file = await getDocumentoRecepcionBienesBytes(req.params.id, req.params.tipo, req.params.docId);
    return sendDocumentoBytes(res, file, 'inline');
  } catch (err) { next(err); }
});

router.get('/:id/documentos/:tipo/:docId/download', async (req, res, next) => {
  try {
    const file = await getDocumentoRecepcionBienesBytes(req.params.id, req.params.tipo, req.params.docId);
    return sendDocumentoBytes(res, file, 'attachment');
  } catch (err) { next(err); }
});

router.post('/:id/registrar-recepcion', async (req, res, next) => {
  try {
    const data = await registrarRecepcion(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/generar-acta', async (req, res, next) => {
  try {
    const data = await generarActaRecepcion(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.put('/:id/actas/:actaId', async (req, res, next) => {
  try {
    const data = await editarActaRecepcion(
      req.params.id, req.params.actaId, req.body || {}, req.rbUsuario, req.rbRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id/actas/:actaId', async (req, res, next) => {
  try {
    const data = await eliminarActaRecepcion(
      req.params.id, req.params.actaId, req.body || {}, req.rbUsuario, req.rbRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/acta-visada', async (req, res, next) => {
  try {
    const data = await adjuntarActaVisadaAlmacen(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/paquete-derivacion-au', async (req, res, next) => {
  try {
    const data = await buildPaqueteDocumentalDerivacionAu(req.params.id, {
      acta_id: req.query.acta_id || req.query.actaId,
      recepcion_id: req.query.recepcion_id || req.query.recepcionId,
    });
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/:id/paquete-derivado', async (req, res, next) => {
  try {
    const data = await listarPaqueteDerivado(req.params.id);
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/:id/adjunto-derivacion', async (req, res, next) => {
  try {
    const data = await adjuntarAdjuntoDerivacionAu(req.params.id, req.body || {}, req.rbUsuario);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id/adjunto-derivacion/:documentoId', async (req, res, next) => {
  try {
    const data = await eliminarAdjuntoDerivacionAu(
      req.params.id, req.params.documentoId, req.body || {}, req.rbUsuario,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/actas/:actaId/visado', async (req, res, next) => {
  try {
    const data = await adjuntarActaVisadaAlmacen(
      req.params.id,
      { ...(req.body || {}), acta_id: req.params.actaId },
      req.rbUsuario,
      req.rbRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/actas/:actaId/visado', async (req, res, next) => {
  try {
    const data = await listarActaVisada(req.params.id, req.params.actaId);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/:id/actas/:actaId/visado/:documentoId', async (req, res, next) => {
  try {
    const data = await obtenerActaVisada(req.params.id, req.params.actaId, req.params.documentoId);
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/:id/actas/:actaId/visado/:documentoId/reemplazar', async (req, res, next) => {
  try {
    const data = await reemplazarActaVisada(
      req.params.id, req.params.actaId, req.params.documentoId,
      req.body || {}, req.rbUsuario, req.rbRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id/actas/:actaId/visado/:documentoId', async (req, res, next) => {
  try {
    const data = await eliminarActaVisada(
      req.params.id, req.params.actaId, req.params.documentoId,
      req.body || {}, req.rbUsuario, req.rbRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/derivar-area-usuaria', async (req, res, next) => {
  try {
    const data = await derivarAreaUsuaria(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/cargar-acta-firmada', async (req, res, next) => {
  try {
    const data = await cargarActaFirmada(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/observar', async (req, res, next) => {
  try {
    const data = await observarActa(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/derivar-coordinacion', async (req, res, next) => {
  try {
    const data = await derivarCoordinacionCm(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/derivar-pago', async (req, res, next) => {
  try {
    const data = await derivarPago(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

export default router;
export { asegurarExpedienteRecepcionDesdeOrden };
