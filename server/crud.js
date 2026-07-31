// Fábrica de rutas CRUD genéricas con paginación y búsqueda server-side.
// Las columnas se pasan en una lista blanca para evitar inyección SQL.
import express from 'express';
import { query } from './db.js';

/**
 * @param {object} cfg
 * @param {string} cfg.table        nombre de tabla (validado contra lista blanca interna)
 * @param {string[]} cfg.columns    columnas escribibles (insert/update)
 * @param {string[]} cfg.searchCols columnas usadas en la búsqueda ILIKE
 * @param {string} [cfg.orderBy]    columna de orden por defecto
 */
export function crudRouter(cfg) {
  const router = express.Router();
  const {
    table, columns, searchCols = [], orderBy = 'id',
    afterCreate, afterUpdate,
    /** @type {(req, ctx) => Promise<void>|void} */
    beforeCreate,
    /** @type {(req, row) => Promise<void>|void} */
    authorizeRow,
  } = cfg;

  function sendAuthError(res, err) {
    if (err && err.status && err.status < 500) {
      return res.status(err.status).json({
        error: err.message || 'No autorizado',
        message: err.message || 'No autorizado',
        ...(err.code ? { code: err.code } : {}),
      });
    }
    throw err;
  }

  // LISTAR con ?page=&pageSize=&search=
  router.get('/', async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page || '1', 10));
      const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '50', 10)));
      const offset = (page - 1) * pageSize;
      const search = (req.query.search || '').trim();

      const params = [];
      let where = '';
      if (search && searchCols.length) {
        const likes = searchCols.map((c) => {
          params.push(`%${search}%`);
          return `${c} ILIKE $${params.length}`;
        });
        where = `WHERE ${likes.join(' OR ')}`;
      }

      const countSql = `SELECT COUNT(*)::int AS total FROM ${table} ${where}`;
      const { rows: countRows } = await query(countSql, params);
      const total = countRows[0].total;

      params.push(pageSize);
      params.push(offset);
      const dataSql = `SELECT * FROM ${table} ${where} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`;
      const { rows } = await query(dataSql, params);

      res.json({ data: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
    } catch (err) { next(err); }
  });

  // OBTENER por id
  router.get('/:id', async (req, res, next) => {
    try {
      const { rows } = await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      if (authorizeRow) {
        try { await authorizeRow(req, rows[0]); } catch (e) { return sendAuthError(res, e); }
      }
      res.json(rows[0]);
    } catch (err) { next(err); }
  });

  // CREAR
  router.post('/', async (req, res, next) => {
    try {
      if (beforeCreate) {
        try { await beforeCreate(req, { body: req.body }); } catch (e) { return sendAuthError(res, e); }
      }
      const keys = columns.filter((c) => req.body[c] !== undefined);
      if (!keys.length) return res.status(400).json({ error: 'Sin datos válidos' });
      const values = keys.map((k) => req.body[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
      const { rows } = await query(sql, values);
      if (afterCreate) await afterCreate(rows[0], req.body, req);
      res.status(201).json(rows[0]);
    } catch (err) { next(err); }
  });

  // ACTUALIZAR
  router.put('/:id', async (req, res, next) => {
    try {
      let prev = null;
      const prevRes = await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      prev = prevRes.rows[0] || null;
      if (!prev) return res.status(404).json({ error: 'No encontrado' });
      if (authorizeRow) {
        try { await authorizeRow(req, prev); } catch (e) { return sendAuthError(res, e); }
      }
      const keys = columns.filter((c) => req.body[c] !== undefined);
      if (!keys.length) return res.status(400).json({ error: 'Sin datos válidos' });
      const values = keys.map((k) => req.body[k]);
      const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const sql = `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`;
      const { rows } = await query(sql, [req.params.id, ...values]);
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      if (afterUpdate && prev) await afterUpdate(rows[0], prev, req.body);
      res.json(rows[0]);
    } catch (err) { next(err); }
  });

  // ELIMINAR
  router.delete('/:id', async (req, res, next) => {
    try {
      const prevRes = await query(`SELECT * FROM ${table} WHERE id = $1`, [req.params.id]);
      const prev = prevRes.rows[0];
      if (!prev) return res.status(404).json({ error: 'No encontrado' });
      if (authorizeRow) {
        try { await authorizeRow(req, prev); } catch (e) { return sendAuthError(res, e); }
      }
      const { rows } = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
      res.json({ ok: true, deleted: rows[0] });
    } catch (err) { next(err); }
  });

  return router;
}
