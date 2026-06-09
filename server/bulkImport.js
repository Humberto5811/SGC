/**
 * Factory that creates Express routes for bulk-import (POST /import) and
 * truncate (DELETE /) operations on a given table.
 *
 * @param {object}   cfg
 * @param {string}   cfg.table     - Target table name.
 * @param {string[]} cfg.columns   - Ordered column names for the INSERT.
 * @param {Function} [cfg.coerce]  - Optional (row, columns) => values[] mapper.
 *                                   Defaults to stringifying each column value.
 */
import express from 'express';
import pool, { query } from './db.js';

export function bulkImportRouter(cfg) {
  const { table, columns } = cfg;
  const coerce = cfg.coerce || ((row, cols) => cols.map((c) => {
    const v = row[c];
    return v == null ? '' : String(v);
  }));

  const router = express.Router();

  // Bulk import: body = { rows: [...], mode: 'replace' | 'append' }
  router.post('/import', async (req, res, next) => {
    const { rows, mode = 'replace' } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No se recibieron filas para importar.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (mode === 'replace') {
        await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY`);
      }

      const BATCH = 1000;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const values = [];
        const tuples = chunk.map((r, idx) => {
          const base = idx * columns.length;
          const rowValues = coerce(r, columns);
          values.push(...rowValues);
          const ph = columns.map((_, c) => `$${base + c + 1}`).join(', ');
          return `(${ph})`;
        });
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`;
        await client.query(sql, values);
        inserted += chunk.length;
      }

      await client.query('COMMIT');
      res.json({ ok: true, inserted, mode });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (rbErr) {
        console.error(`[bulkImport/${table}] ROLLBACK failed:`, rbErr.message);
      }
      next(err);
    } finally {
      client.release();
    }
  });

  // Truncate table
  router.delete('/', async (_req, res, next) => {
    try {
      await query(`TRUNCATE TABLE ${table} RESTART IDENTITY`);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
}
