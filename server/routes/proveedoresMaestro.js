// API — Maestro de Proveedores
import express from 'express';
import {
  listarProveedoresMaestro,
  buscarProveedoresMaestro,
  obtenerProveedorMaestro,
  crearProveedorMaestro,
  actualizarProveedorMaestro,
  eliminarProveedorLogico,
  importarProveedoresMaestro,
  RUBROS_PROVEEDOR,
  ESTADOS_PROVEEDOR,
} from '../lib/proveedoresMaestro.js';

const router = express.Router();

function actor(req) {
  return req.headers['x-user-name'] || req.headers['x-user-id'] || 'Sistema';
}

router.get('/rubros', (_req, res) => {
  res.json({ data: RUBROS_PROVEEDOR, estados: ESTADOS_PROVEEDOR });
});

router.get('/buscar', async (req, res, next) => {
  try {
    const data = await listarProveedoresMaestro({
      page: req.query.page,
      pageSize: req.query.pageSize || req.query.limit,
      ruc: req.query.ruc,
      razon_social: req.query.razon_social,
      correo: req.query.correo,
      telefono: req.query.telefono,
      rubro: req.query.rubro,
      estado: req.query.estado,
      search: req.query.search || req.query.q,
      sort: req.query.sort,
      sortDir: req.query.sortDir,
    });
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const data = await listarProveedoresMaestro({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: req.query.search,
      ruc: req.query.ruc,
      razon_social: req.query.razon_social,
      correo: req.query.correo,
      telefono: req.query.telefono,
      rubro: req.query.rubro,
      estado: req.query.estado,
    });
    res.json(data);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const proveedor = await obtenerProveedorMaestro(req.params.id);
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json({ proveedor });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const proveedor = await crearProveedorMaestro(req.body || {}, actor(req), 'Registro Manual');
    res.status(201).json({ success: true, proveedor });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const proveedor = await actualizarProveedorMaestro(req.params.id, req.body || {}, actor(req));
    res.json({ success: true, proveedor });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await eliminarProveedorLogico(req.params.id, actor(req));
    res.json({ success: true });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.post('/import', async (req, res, next) => {
  try {
    const rows = req.body?.rows || [];
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(400).json({ error: 'No hay filas para importar' });
    }
    const result = await importarProveedoresMaestro(rows, actor(req));
    res.json({ success: true, ...result });
  } catch (err) {
    if (err.message) return res.status(400).json({ error: err.message });
    next(err);
  }
});

export default router;
