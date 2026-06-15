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

// GET /search — búsqueda con filtro por tipo_bien (B o S) y priorización
// PRIORIDAD 1: descripción comienza con el texto buscado (nombre_item ILIKE 'texto%')
// PRIORIDAD 2: descripción contiene el texto en cualquier posición
router.get('/search', async (req, res, next) => {
  try {
    const search = (req.query.search || '').trim();
    const tipoBien = (req.query.tipo_bien || '').trim();
    // Aumentamos el límite para devolver todas las coincidencias (máx 300)
    const limit = Math.min(300, Math.max(1, parseInt(req.query.limit || '200', 10)));
    const params = [];
    const conditions = [];
    if (tipoBien) {
      params.push(tipoBien);
      conditions.push(`tipo_bien = $${params.length}`);
    }
    if (search) {
      // Condición para búsqueda amplia (contiene)
      params.push(`%${search}%`);
      conditions.push(`(item_bien ILIKE $${params.length} OR nombre_item ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // Priorización:
    //   priority = 0: nombre_item o item_bien comienza con el texto buscado
    //   priority = 1: solo contiene el texto en otra posición
    // Luego orden alfabético por nombre_item dentro de cada grupo
    const orderClause = search
      ? `CASE WHEN nombre_item ILIKE $${params.length + 1} OR item_bien ILIKE $${params.length + 1} THEN 0 ELSE 1 END, nombre_item ASC`
      : 'nombre_item ASC';
    if (search) {
      params.push(`${search}%`);
    }
    params.push(limit);
    const sql = `SELECT * FROM catalogo_sigamef ${where} ORDER BY ${orderClause} LIMIT $${params.length}`;
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
