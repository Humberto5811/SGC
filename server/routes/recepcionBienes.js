/**
 * API — Ejecución → Recepción de Bienes
 */
import { Router } from 'express';
import {
  listarBandejaRecepcionBienes,
  getDetalleRecepcionBienes,
  registrarRecepcion,
  generarActaRecepcion,
  derivarAreaUsuaria,
  cargarActaFirmada,
  observarActa,
  derivarCoordinacionCm,
  derivarPago,
  getHistorialRecepcionBienes,
  sincronizarOrdenesElegibles,
  asegurarExpedienteRecepcionDesdeOrden,
} from '../lib/recepcionBienes.js';

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
