// Glosas de Requerimientos: una sola tabla filtrada por :tipo
// (bienes | servicios | locacion | licitaciones | concurso).
import express from 'express';
import { query } from '../db.js';

const router = express.Router({ mergeParams: true });
const TIPOS = ['bienes', 'servicios', 'locacion', 'licitaciones', 'concurso'];
const COLUMNS = ['codigo', 'titulo', 'contenido', 'estado'];

function validTipo(req, res, next) {
  if (!TIPOS.includes(req.params.tipo)) return res.status(400).json({ error: 'Tipo de glosa inválido' });
  next();
}

router.get('/:tipo', validTipo, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '50', 10)));
    const offset = (page - 1) * pageSize;
    const search = (req.query.search || '').trim();
    const params = [req.params.tipo];
    let where = 'WHERE tipo = $1';
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      where += ` AND (codigo ILIKE $${params.length - 1} OR titulo ILIKE $${params.length})`;
    }
    const { rows: cRows } = await query(`SELECT COUNT(*)::int AS total FROM glosas ${where}`, params);
    const total = cRows[0].total;
    params.push(pageSize, offset);
    const { rows } = await query(
      `SELECT * FROM glosas ${where} ORDER BY id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ data: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) { next(err); }
});

router.post('/:tipo', validTipo, async (req, res, next) => {
  try {
    const keys = COLUMNS.filter((c) => req.body[c] !== undefined);
    const values = keys.map((k) => req.body[k]);
    const allKeys = ['tipo', ...keys];
    const allValues = [req.params.tipo, ...values];
    const ph = allKeys.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(
      `INSERT INTO glosas (${allKeys.join(', ')}) VALUES (${ph}) RETURNING *`, allValues);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:tipo/:id', validTipo, async (req, res, next) => {
  try {
    const keys = COLUMNS.filter((c) => req.body[c] !== undefined);
    if (!keys.length) return res.status(400).json({ error: 'Sin datos válidos' });
    const values = keys.map((k) => req.body[k]);
    const setClause = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
    const { rows } = await query(
      `UPDATE glosas SET ${setClause}, updated_at = NOW() WHERE id = $1 AND tipo = $2 RETURNING *`,
      [req.params.id, req.params.tipo, ...values]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:tipo/:id', validTipo, async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM glosas WHERE id = $1 AND tipo = $2 RETURNING *',
      [req.params.id, req.params.tipo]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) { next(err); }
});

export default router;
