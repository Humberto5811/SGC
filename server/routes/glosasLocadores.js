import express from 'express';
import { query } from '../db.js';

const router = express.Router();
const TABLE = 'glosas_locadores';
const ALLOWED_COLUMNS = ['titulo', 'contenido', 'estado', 'usuario_modificacion'];

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM ${TABLE} ORDER BY id ASC`);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const keys = ALLOWED_COLUMNS.filter(c => req.body[c] !== undefined);
    const values = keys.map(k => req.body[k]);
    const ph = keys.map((_, i) => `$${i + 1}`).join(', ');
    const cols = keys.join(', ');
    const { rows } = await query(`INSERT INTO ${TABLE} (${cols}) VALUES (${ph}) RETURNING *`, values);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const keys = ALLOWED_COLUMNS.filter(c => req.body[c] !== undefined);
    if (!keys.length) return res.status(400).json({ error: 'Sin datos válidos' });
    const values = keys.map(k => req.body[k]);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE ${TABLE} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`DELETE FROM ${TABLE} WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) { next(err); }
});

export default router;
