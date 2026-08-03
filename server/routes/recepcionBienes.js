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
import { resolveCentroExpediente, assertAccesoRecepcionBienes } from '../lib/recepcionBienesAlcance.js';

const router = Router();
const ROLES = new Set(['dec', 'admin', 'au', 'almacen', 'cm', 'coordinador', 'analista']);

function requireRol(req, res, next) {
  // RB8.1D — Autorización estricta: SOLO desde req.user (poblado por requireAuth desde BD).
  // Sin req.user válido la petición responde 401; NUNCA se fabrica un rol DEC/global.
  const u = req.user && typeof req.user === 'object' ? req.user : null;
  if (!u || u.id == null) {
    return res.status(401).json({ error: 'Autenticación requerida', code: 'AUTH_REQUIRED' });
  }
  const rol = String(u.rol ?? u.role ?? '').toLowerCase();
  // x-user-name solo como dato VISUAL de compatibilidad; nunca autoriza.
  req.rbRol = rol;
  req.rbUsuario = req.headers['x-user-name'] || u.nombre || u.username || 'usuario';
  req.rbUserId = u.id != null ? parseInt(u.id, 10) : null;
  req.rbUserCtx = {
    id: req.rbUserId,
    rol,
    centro: u.centro,
    codigo_centro_costo: u.codigo_centro_costo,
    alcance_datos: u.alcance_datos,
    area_id: u.area_id,
    permisos: u.permisos,
  };
  return next();
}

/** RB8.1B.1 — Guard central por centro para rutas de actas (expediente_id en params). */
function assertAccesoExpediente(req, res, next) {
  (async () => {
    if (!req.rbUserCtx) {
      // RB8.1D — defensa en profundidad: sin contexto autenticado, 401 (nunca DEC/global).
      return res.status(401).json({ error: 'Autenticación requerida', code: 'AUTH_REQUIRED' });
    }
    const centro = await resolveCentroExpediente(req.params.id);
    assertAccesoRecepcionBienes(req.rbUserCtx, centro);
    return next();
  })().catch(next);
}

/** Mapea errores de alcance RB8.1B a HTTP. */
function buildErrorMapper() {
  return (err, req, res, next) => {
    const code = String(err?.code || '');
    if (code === 'ACCESO_CENTRO_DENEGADO') return res.status(403).json({ error: err.message || 'Acceso denegado', code });
    if (code === 'CENTRO_NO_RESUELTO' || code === 'RESPONSABLE_CENTRO_INVALIDO' || code === 'RESPONSABLE_AREA_INVALIDO') {
      return res.status(422).json({ error: err.message || 'No se pudo validar el centro', code });
    }
    return next(err);
  };
}

router.use(requireRol);

router.get('/bandeja', async (req, res, next) => {
  try {
    const data = await listarBandejaRecepcionBienes({
      rol: req.rbRol,
      usuario: req.rbUsuario,
      userId: req.rbUserId,
      userCtx: req.rbUserCtx,
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
    const expedienteId = req.query.expediente_id || req.query.expedienteId || req.query.id;
    if (!expedienteId) {
      return res.status(422).json({ error: 'expediente_id es obligatorio', code: 'EXPEDIENTE_ID_REQUERIDO' });
    }
    const data = await listDestinatariosAreaUsuaria(expedienteId, {
      search: req.query.search || req.query.q || '',
      userCtx: req.rbUserCtx,
    });
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const data = await getDetalleRecepcionBienes(req.params.id, req.rbUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/historial', async (req, res, next) => {
  try {
    const data = await getHistorialRecepcionBienes(req.params.id, req.rbUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/:id/documentos/:tipo/:docId', async (req, res, next) => {
  try {
    const data = await getDocumentoRecepcionBienes(req.params.id, req.params.tipo, req.params.docId, req.rbUserCtx);
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
    const file = await getDocumentoRecepcionBienesBytes(req.params.id, req.params.tipo, req.params.docId, req.rbUserCtx);
    return sendDocumentoBytes(res, file, 'inline');
  } catch (err) { next(err); }
});

router.get('/:id/documentos/:tipo/:docId/download', async (req, res, next) => {
  try {
    const file = await getDocumentoRecepcionBienesBytes(req.params.id, req.params.tipo, req.params.docId, req.rbUserCtx);
    return sendDocumentoBytes(res, file, 'attachment');
  } catch (err) { next(err); }
});

router.post('/:id/registrar-recepcion', async (req, res, next) => {
  try {
    const data = await registrarRecepcion(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/generar-acta', assertAccesoExpediente, async (req, res, next) => {
  try {
    const data = await generarActaRecepcion(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.put('/:id/actas/:actaId', assertAccesoExpediente, async (req, res, next) => {
  try {
    const data = await editarActaRecepcion(
      req.params.id, req.params.actaId, req.body || {}, req.rbUsuario, req.rbRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id/actas/:actaId', assertAccesoExpediente, async (req, res, next) => {
  try {
    const data = await eliminarActaRecepcion(
      req.params.id, req.params.actaId, req.body || {}, req.rbUsuario, req.rbRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/acta-visada', assertAccesoExpediente, async (req, res, next) => {
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
      userCtx: req.rbUserCtx,
    });
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/:id/paquete-derivado', async (req, res, next) => {
  try {
    const data = await listarPaqueteDerivado(req.params.id, req.rbUserCtx);
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/:id/adjunto-derivacion', async (req, res, next) => {
  try {
    const data = await adjuntarAdjuntoDerivacionAu(req.params.id, req.body || {}, req.rbUsuario, req.rbUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id/adjunto-derivacion/:documentoId', async (req, res, next) => {
  try {
    const data = await eliminarAdjuntoDerivacionAu(
      req.params.id, req.params.documentoId, req.body || {}, req.rbUsuario, req.rbUserCtx,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/actas/:actaId/visado', assertAccesoExpediente, async (req, res, next) => {
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

router.get('/:id/actas/:actaId/visado', assertAccesoExpediente, async (req, res, next) => {
  try {
    const data = await listarActaVisada(req.params.id, req.params.actaId);
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/:id/actas/:actaId/visado/:documentoId', assertAccesoExpediente, async (req, res, next) => {
  try {
    const data = await obtenerActaVisada(req.params.id, req.params.actaId, req.params.documentoId);
    res.json(data);
  } catch (err) { next(err); }
});

router.post('/:id/actas/:actaId/visado/:documentoId/reemplazar', assertAccesoExpediente, async (req, res, next) => {
  try {
    const data = await reemplazarActaVisada(
      req.params.id, req.params.actaId, req.params.documentoId,
      req.body || {}, req.rbUsuario, req.rbRol,
    );
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id/actas/:actaId/visado/:documentoId', assertAccesoExpediente, async (req, res, next) => {
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
    const data = await derivarAreaUsuaria(req.params.id, req.body || {}, req.rbUsuario, req.rbRol, req.rbUserCtx);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/cargar-acta-firmada', assertAccesoExpediente, async (req, res, next) => {
  try {
    const data = await cargarActaFirmada(req.params.id, req.body || {}, req.rbUsuario, req.rbRol);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/:id/observar', assertAccesoExpediente, async (req, res, next) => {
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

router.use(buildErrorMapper());
export default router;
export { asegurarExpedienteRecepcionDesdeOrden };
