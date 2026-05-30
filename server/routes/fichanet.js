// Rutas de Ficha NET.
// Reutiliza el CRUD genérico (lista paginada + búsqueda) y añade:
//  - POST /import  : carga masiva por lotes (reemplazar o agregar)
//  - DELETE /      : vaciar la tabla
import express from 'express';
import { crudRouter } from '../crud.js';
import pool, { query } from '../db.js';

const COLUMNS = [
  'idfichanet', 'idcartcod', 'idcartcodigosiga', 'dscartnombre', 'dscclasdescripcion',
  'dscartpresentacion', 'dspesomolecular', 'dsporcentajepureza', 'dsformula', 'dsdensidad',
  'dsph', 'dstemperatura', 'idclase', 'dsclase', 'idsubclase', 'dssubclase',
  'dscartdocumentos', 'dscartcaracteristica', 'dscartfechavencimiento', 'stcartestado',
  'dscartobservaciones', 'dafechacreacion', 'dsusuariocrea', 'nu_version',
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
      await client.query('TRUNCATE TABLE ficha_net RESTART IDENTITY');
    }

    const BATCH = 1000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values = [];
      const tuples = chunk.map((r, idx) => {
        const base = idx * COLUMNS.length;
        COLUMNS.forEach((c) => {
          const v = r[c];
          values.push(v == null ? '' : String(v));
        });
        const ph = COLUMNS.map((_, c) => `$${base + c + 1}`).join(', ');
        return `(${ph})`;
      });
      const sql = `INSERT INTO ficha_net (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}`;
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

// Vaciar tabla
router.delete('/', async (_req, res, next) => {
  try {
    await query('TRUNCATE TABLE ficha_net RESTART IDENTITY');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// CRUD genérico (GET lista/paginada, GET :id, POST, PUT, DELETE :id)
router.use('/', crudRouter({
  table: 'ficha_net',
  columns: COLUMNS,
  searchCols: ['idfichanet', 'idcartcodigosiga', 'dscartnombre', 'dsclase'],
  orderBy: 'id',
}));

export default router;
