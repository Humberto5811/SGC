// Rutas del Catálogo SIGAMEF — importación UPSERT vía ImportEngine.
import express from 'express';
import { crudRouter } from '../crud.js';
import { importEngineRouter } from '../bulkImport.js';
import { query } from '../db.js';
import { cleanString, normalizeRowKeys, normalizeNumber } from '../lib/importNormalize.js';

const COLUMNS = [
  'tipo_bien', 'item_bien', 'nombre_item', 'unidad_medida', 'precio_unitario',
  'ficha_tecnica', 'acuerdo_marco', 'producto_controlado', 'ficha_homologada',
];

const toBool = (v) => v === true || v === 1 || ['1', 'si', 'sí', 'x', 'true'].includes(String(v).toLowerCase());

const router = express.Router();

router.use('/', importEngineRouter({
  table: 'catalogo_sigamef',
  catalogo: 'catalogo_sigamef',
  columns: COLUMNS,
  conflictKeys: ['item_bien'],
  transform: (raw) => normalizeRowKeys(raw),
  validate: (row) => (!cleanString(row.item_bien) ? 'item_bien requerido' : null),
  coerce: (row) => ({
    tipo_bien: cleanString(row.tipo_bien) || 'B',
    item_bien: cleanString(row.item_bien),
    nombre_item: cleanString(row.nombre_item),
    unidad_medida: cleanString(row.unidad_medida),
    precio_unitario: normalizeNumber(row.precio_unitario, 0),
    ficha_tecnica: toBool(row.ficha_tecnica),
    acuerdo_marco: toBool(row.acuerdo_marco),
    producto_controlado: toBool(row.producto_controlado),
    ficha_homologada: toBool(row.ficha_homologada),
  }),
}));

router.get('/search', async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const tipoBien = (req.query.tipo_bien || '').trim();
    const limit = Math.min(300, Math.max(1, parseInt(req.query.limit || '200', 10)));
    const params = [];
    const conditions = [];
    if (tipoBien) {
      params.push(tipoBien);
      conditions.push(`tipo_bien = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(item_bien ILIKE $${params.length} OR nombre_item ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = search
      ? `CASE WHEN nombre_item ILIKE $${params.length + 1} OR item_bien ILIKE $${params.length + 1} THEN 0 ELSE 1 END, nombre_item ASC`
      : 'nombre_item ASC';
    if (search) params.push(`${search}%`);
    params.push(limit);
    const sql = `SELECT * FROM catalogo_sigamef ${where} ORDER BY ${orderClause} LIMIT $${params.length}`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.use('/', crudRouter({
  table: 'catalogo_sigamef',
  columns: COLUMNS,
  searchCols: ['item_bien', 'nombre_item', 'tipo_bien', 'unidad_medida'],
  orderBy: 'id',
}));

export default router;
