// API — Compras Históricas (SIGAMEF real)
import express from 'express';
import {
  listarComprasHistoricas,
  obtenerCompraHistoricaPorId,
} from '../lib/comprasHistoricas.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const data = await listarComprasHistoricas({
      page: req.query.page,
      pageSize: req.query.pageSize || req.query.limit,
      anio: req.query.anio,
      tipo: req.query.tipo,
      numero: req.query.numero,
      proveedor: req.query.proveedor,
      item: req.query.item,
      descripcion: req.query.descripcion,
      centro_costo: req.query.centro_costo,
      desde: req.query.desde,
      hasta: req.query.hasta,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await obtenerCompraHistoricaPorId(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

export default router;
