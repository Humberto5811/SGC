// API — Compras Históricas (SIGAMEF real)
import express from 'express';
import {
  listarComprasHistoricas,
  obtenerCompraHistoricaPorId,
} from '../lib/comprasHistoricas.js';
import {
  confirmarComprasHistoricasImport,
  previewComprasHistoricasImport,
  resolveImportRows,
} from '../lib/comprasHistoricasImport.js';

const router = express.Router();

function actor(req) {
  return req.headers['x-user-name'] || req.headers['x-user-id'] || 'Sistema';
}

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

router.post('/import/preview', async (req, res, next) => {
  try {
    const body = req.body || {};
    const rows = resolveImportRows(body);
    const data = await previewComprasHistoricasImport({
      anio: body.anio,
      archivo: body.archivo || body.fileName || '',
      rows,
    });
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.post('/import/confirm', async (req, res, next) => {
  try {
    const body = req.body || {};
    const rows = resolveImportRows(body);
    const data = await confirmarComprasHistoricasImport({
      anio: body.anio,
      archivo: body.archivo || body.fileName || '',
      rows,
      preview_token: body.preview_token || body.previewToken,
      usuario: body.usuario || actor(req),
    });
    res.json(data);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (/^import$/i.test(req.params.id)) {
      return res.status(404).json({ error: 'No encontrado' });
    }
    const row = await obtenerCompraHistoricaPorId(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

export default router;
