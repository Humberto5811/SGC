// Rutas del Catálogo SIGAMEF.
// Reutiliza el CRUD genérico (lista paginada + búsqueda) y añade:
//  - POST /import  : carga masiva por lotes (reemplazar o agregar)
//  - DELETE /      : vaciar la tabla
import express from 'express';
import { crudRouter } from '../crud.js';
import { bulkImportRouter } from '../bulkImport.js';
import { query } from '../db.js';

const COLUMNS = [
  'tipo_bien', 'item_bien', 'nombre_item', 'unidad_medida', 'precio_unitario',
  'ficha_tecnica', 'acuerdo_marco', 'producto_controlado', 'ficha_homologada',
];

const router = express.Router();

// Bulk import + truncate via shared utility
router.use('/', bulkImportRouter({
  table: 'catalogo_sigamef',
  columns: COLUMNS,
  coerce: (r) => [
    r.tipo_bien ?? 'B',
    String(r.item_bien ?? ''),
    String(r.nombre_item ?? ''),
    r.unidad_medida ?? '',
    Number(r.precio_unitario) || 0,
    !!r.ficha_tecnica,
    !!r.acuerdo_marco,
    !!r.producto_controlado,
    !!r.ficha_homologada,
  ],
}));

// GET /search — búsqueda con filtro por tipo_bien (B o S)
router.get('/search', async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const tipoBien = (req.query.tipo_bien || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '15', 10)));
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
    params.push(limit);
    const sql = `SELECT * FROM catalogo_sigamef ${where} ORDER BY item_bien LIMIT $${params.length}`;
    const { rows } = await query(sql, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// CRUD genérico (GET lista/paginada, GET :id, POST, PUT, DELETE :id)
router.use('/', crudRouter({
  table: 'catalogo_sigamef',
  columns: COLUMNS,
  searchCols: ['item_bien', 'nombre_item', 'tipo_bien', 'unidad_medida'],
  orderBy: 'id',
}));

export default router;
