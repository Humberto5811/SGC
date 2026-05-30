// Datos de la Entidad: registro único (se obtiene/actualiza el primero).
import express from 'express';
import { query } from '../db.js';

const router = express.Router();
const COLUMNS = ['ruc', 'nombre', 'siglas', 'direccion', 'telefono', 'email', 'titular'];

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM entidad ORDER BY id LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) { next(err); }
});

router.put('/', async (req, res, next) => {
  try {
    const { rows: existing } = await query('SELECT id FROM entidad ORDER BY id LIMIT 1');
    const keys = COLUMNS.filter((c) => req.body[c] !== undefined);
    const values = keys.map((k) => req.body[k]);

    if (!existing.length) {
      const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await query(
        `INSERT INTO entidad (${keys.join(', ')}) VALUES (${ph}) RETURNING *`, values);
      return res.json(rows[0]);
    }
    if (!keys.length) {
      const { rows } = await query('SELECT * FROM entidad WHERE id = $1', [existing[0].id]);
      return res.json(rows[0]);
    }
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE entidad SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [existing[0].id, ...values]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
