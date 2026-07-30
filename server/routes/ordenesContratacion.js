/**
 * Registro de Órdenes — Contrataciones API.
 * Prefijo: /api/ordenes-contratacion
 */
import express from 'express';
import {
  listarBandejaOrdenes,
  loadContextoExpediente,
  adjuntarCcpFirmado,
  getCcpFirmadoActivo,
  listarHistorialCcpFirmado,
  eliminarCcpFirmado,
  registrarOrden,
  actualizarOrden,
  anularOrden,
  getDetalleOrden,
  getExpedienteOrdenCompleto,
  getOrdenItems,
  adjuntarOrdenFirmada,
  getDocumentoOrden,
  listarHistorialOrden,
  derivarAEjecucion,
  getPayloadEjecucion,
  guardarInicioActividad,
  getInicioActividad,
  calcularFechasInicioActividad,
  CONDICIONES_INICIO_LABEL,
  listarDocsNotificacion,
  getDocNotificacion,
  httpError,
} from '../lib/ordenesContratacion.js';
import {
  listarEntregas,
  guardarEntregas,
  recalcularFechasEntregas,
} from '../lib/ordenesEntregas.js';
import {
  obtenerChecklistOrden,
  obtenerChecklistRequerimiento,
  ETAPAS_CHECKLIST,
} from '../lib/ordenesChecklist.js';
import {
  enviarOrdenProveedor,
  reenviarOrdenProveedor,
  listarEnviosOrden,
} from '../lib/ordenesProveedor.js';

const router = express.Router();
const ROLES = new Set(['dec', 'admin']);

function actorFromReq(req) {
  const usuario = req.user?.nombre
    || req.headers['x-user-name']
    || req.body?.usuario
    || '';
  const rol = String(req.user?.rol || req.headers['x-user-rol'] || '').toLowerCase();
  return { usuario: String(usuario).slice(0, 150), rol };
}

function assertRol(req) {
  const rol = String(req.user?.rol || req.headers['x-user-rol'] || '').toLowerCase();
  if (!ROLES.has(rol)) {
    throw httpError('No autorizado para Registro de Órdenes', 403, 'ORDEN_FORBIDDEN');
  }
  return rol;
}

function sendLibError(res, err, next) {
  if (err?.status) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code || 'ORDEN_ERROR',
      detail: err.message,
    });
  }
  return next(err);
}

router.get('/bandeja', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await listarBandejaOrdenes();
    const q = String(req.query.q || req.query.search || '').trim().toLowerCase();
    const estado = String(req.query.estado || '').trim().toUpperCase();
    let filtered = data;
    if (estado) filtered = filtered.filter((r) => String(r.estado || '').toUpperCase() === estado);
    if (q) {
      filtered = filtered.filter((r) => {
        const hay = [
          r.requerimiento_codigo, r.pedido_sigamef, r.codigo_ccp,
          r.proveedor_ruc, r.proveedor_razon_social, r.numero_orden,
          r.denominacion, r.estado_label, r.centro,
        ].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(5, parseInt(req.query.pageSize || '25', 10) || 25));
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);
    res.json({
      data: slice,
      meta: { total: filtered.length, page, pageSize, pages: Math.ceil(filtered.length / pageSize) || 1 },
    });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/contexto/:requerimientoId', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await loadContextoExpediente(req.params.requerimientoId);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/ccp-firmado/:requerimientoId', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await adjuntarCcpFirmado(req.params.requerimientoId, req.body || {}, usuario, rol);
    res.status(201).json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/ccp-firmado/:requerimientoId', async (req, res, next) => {
  try {
    assertRol(req);
    const include = String(req.query.include || '') === 'content';
    const data = await getCcpFirmadoActivo(req.params.requerimientoId, { includeContent: include });
    if (!data) return res.status(404).json({ error: 'CCP firmado no encontrado' });
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/ccp-firmado/:requerimientoId/historial', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await listarHistorialCcpFirmado(req.params.requerimientoId);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.delete('/ccp-firmado/:requerimientoId', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await eliminarCcpFirmado(req.params.requerimientoId, {
      motivo: req.body?.motivo || req.query?.motivo || '',
      usuario,
      rol,
    });
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/ccp-firmado/:requerimientoId/eliminar', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await eliminarCcpFirmado(req.params.requerimientoId, {
      motivo: req.body?.motivo || '',
      usuario,
      rol,
    });
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/inicio-actividad', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await guardarInicioActividad(req.body || {}, usuario, rol);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/inicio-actividad', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await getInicioActividad({
      ordenId: req.query.orden_id,
      requerimientoId: req.query.requerimiento_id,
    });
    res.json({ data, condiciones: CONDICIONES_INICIO_LABEL });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/inicio-actividad/preview', async (req, res, next) => {
  try {
    assertRol(req);
    const body = req.body || {};
    const data = calcularFechasInicioActividad({ ...body, allowPending: true });
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await registrarOrden(req.body || {}, usuario, rol);
    res.status(201).json({ data });
  } catch (err) { sendLibError(res, err, next); }
});


router.get('/checklist/requerimiento/:requerimientoId', async (req, res, next) => {
  try {
    assertRol(req);
    const etapa = req.query.etapa || ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION;
    const data = await obtenerChecklistRequerimiento(req.params.requerimientoId, etapa);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id/checklist', async (req, res, next) => {
  try {
    assertRol(req);
    const etapa = req.query.etapa || ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION;
    const data = await obtenerChecklistOrden(req.params.id, etapa);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await getDetalleOrden(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id/expediente', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await getExpedienteOrdenCompleto(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.put('/:id', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await actualizarOrden(req.params.id, req.body || {}, usuario, rol);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/:id/anular', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await anularOrden(req.params.id, req.body?.motivo || req.body?.motivo_anulacion, usuario, rol);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id/items', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await getOrdenItems(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id/entregas', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await listarEntregas(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/:id/entregas', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const body = req.body || {};
    const payload = Array.isArray(body) ? body : (body.entregas || []);
    if (!Array.isArray(body) && body.inicio_actividad) payload._inicio_actividad = body.inicio_actividad;
    const data = await guardarEntregas(req.params.id, payload, usuario, rol);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.put('/:id/entregas', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await guardarEntregas(req.params.id, req.body?.entregas || req.body || [], usuario, rol);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/:id/entregas/recalcular-fechas', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await recalcularFechasEntregas(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/:id/documentos', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await adjuntarOrdenFirmada(req.params.id, req.body || {}, usuario, rol);
    res.status(201).json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id/documentos/:documentoId', async (req, res, next) => {
  try {
    assertRol(req);
    const include = String(req.query.include || '') === 'content' || req.query.download === '1';
    const data = await getDocumentoOrden(req.params.id, req.params.documentoId, { includeContent: include });
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});


router.get('/:id/docs-notificacion', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await listarDocsNotificacion(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id/docs-notificacion/:tipo', async (req, res, next) => {
  try {
    assertRol(req);
    const include = String(req.query.include || '') === 'content' || req.query.download === '1';
    const data = await getDocNotificacion(req.params.id, req.params.tipo, { includeContent: include });
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/:id/enviar-proveedor', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await enviarOrdenProveedor(req.params.id, req.body || {}, usuario, rol);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/:id/reenviar-proveedor', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await reenviarOrdenProveedor(req.params.id, req.body || {}, usuario, rol);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id/envios', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await listarEnviosOrden(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.post('/:id/derivar-ejecucion', async (req, res, next) => {
  try {
    assertRol(req);
    const { usuario, rol } = actorFromReq(req);
    const data = await derivarAEjecucion(req.params.id, usuario, rol);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

router.get('/:id/ejecucion-payload', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await getPayloadEjecucion(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});



router.get('/:id/historial', async (req, res, next) => {
  try {
    assertRol(req);
    const data = await listarHistorialOrden(req.params.id);
    res.json({ data });
  } catch (err) { sendLibError(res, err, next); }
});

export default router;
