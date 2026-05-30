// Rutas del Catálogo SIGAMEF.
// Reutiliza el CRUD genérico (lista paginada + búsqueda) y añade:
//  - POST /import  : carga masiva por lotes (reemplazar o agregar)
//  - DELETE /      : vaciar la tabla
import express from 'express';
import { crudRouter } from '../crud.js';
import pool, { query } from '../db.js';

const COLUMNS = [
  'tipo_bien', 'item_bien', 'nombre_item', 'unidad_medida', 'precio_unitario',
  'ficha_tecnica', 'acuerdo_marco', 'producto_controlado', 'ficha_homologada',
];

const router = express.Router();

// Importación masiva. body: { rows: [...], mode: 'replace' | 'append' }
router.post('/import', async (req, res, next) => {
  const { rows, mode = 'replace' } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No se recibieron filas para importar.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (mode === 'replace') {
      await client.query('TRUNCATE TABLE catalogo_sigamef RESTART IDENTITY');
    }

    const BATCH = 1000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values = [];
      const tuples = chunk.map((r, idx) => {
        const base = idx * COLUMNS.length;
        values.push(
          r.tipo_bien ?? 'B',
          String(r.item_bien ?? ''),
          String(r.nombre_item ?? ''),
          r.unidad_medida ?? '',
          Number(r.precio_unitario) || 0,
          !!r.ficha_tecnica,
          !!r.acuerdo_marco,
          !!r.producto_controlado,
          !!r.ficha_homologada,
        );
        const ph = COLUMNS.map((_, c) => `$${base + c + 1}`).join(', ');
        return `(${ph})`;
      });
      const sql = `INSERT INTO catalogo_sigamef (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}`;
      await client.query(sql, values);
      inserted += chunk.length;
    }

    await client.query('COMMIT');
    res.json({ ok: true, inserted, mode });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Vaciar catálogo
router.delete('/', async (_req, res, next) => {
  try {
    await query('TRUNCATE TABLE catalogo_sigamef RESTART IDENTITY');
    res.json({ ok: true });
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
