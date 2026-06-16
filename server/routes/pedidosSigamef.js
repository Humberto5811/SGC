// Rutas de Pedidos SIGAMEF.
// CRUD con auto-generación de codigo_pedido (PED-000001) +
// import masivo + endpoints de búsqueda para integración futura.
import express from 'express';
import pool, { query } from '../db.js';

const TABLE = 'pedidos_sigamef';
const COLUMNS = [
  'codigo_pedido', 'ano_eje', 'tipo', 'nro_pedido', 'centro', 'centro_costo',
  'fecha_pedido', 'fuente_fto', 'sec_func', 'grupo_bien', 'clase_bien', 'familia_bien',
  'item_bien', 'codigo_sigamef', 'descripcion', 'especifica', 'unidad_medida',
  'cant_solicitada', 'precio_unitario', 'total_item', 'estado',
];
const IMPORT_COLS = COLUMNS.filter((c) => c !== 'codigo_pedido');
const NUMERIC_COLS = new Set(['cant_solicitada', 'precio_unitario', 'total_item']);
const SEARCH_COLS = ['nro_pedido', 'codigo_sigamef', 'descripcion', 'centro', 'codigo_pedido'];

const router = express.Router();

// Genera el siguiente codigo_pedido PED-XXXXXX
async function nextCodigoPedido(client) {
  const q = client || { query: (s, p) => query(s, p) };
  const { rows } = await q.query(
    `SELECT codigo_pedido FROM ${TABLE} WHERE codigo_pedido LIKE 'PED-%' ORDER BY codigo_pedido DESC LIMIT 1`
  );
  if (!rows.length) return 'PED-000001';
  const num = parseInt(rows[0].codigo_pedido.replace('PED-', ''), 10) || 0;
  return `PED-${String(num + 1).padStart(6, '0')}`;
}

// ---- Bulk import with auto-generated codigo_pedido ----
router.post('/import', async (req, res, next) => {
  const { rows: importRows, mode = 'replace' } = req.body || {};
  if (!Array.isArray(importRows) || importRows.length === 0) {
    return res.status(400).json({ error: 'No se recibieron filas para importar.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (mode === 'replace') {
      await client.query(`TRUNCATE TABLE ${TABLE} RESTART IDENTITY`);
    }

    const allCols = ['codigo_pedido', ...IMPORT_COLS];
    const placeholders = allCols.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO ${TABLE} (${allCols.join(', ')}) VALUES (${placeholders})`;
    let inserted = 0;
    let lastNum = 0;

    // Get current max codigo_pedido number
    if (mode !== 'replace') {
      const { rows: maxRows } = await client.query(
        `SELECT codigo_pedido FROM ${TABLE} WHERE codigo_pedido LIKE 'PED-%' ORDER BY codigo_pedido DESC LIMIT 1`
      );
      if (maxRows.length) lastNum = parseInt(maxRows[0].codigo_pedido.replace('PED-', ''), 10) || 0;
    }

    for (const r of importRows) {
      lastNum++;
      const codigo = `PED-${String(lastNum).padStart(6, '0')}`;
      const rowVals = [codigo];
      for (const c of IMPORT_COLS) {
        let v = r[c];
        if (c === 'total_item') {
          v = (parseFloat(r.cant_solicitada) || 0) * (parseFloat(r.precio_unitario) || 0);
        }
        if (NUMERIC_COLS.has(c)) {
          rowVals.push(parseFloat(v) || 0);
        } else {
          rowVals.push(v == null ? '' : String(v));
        }
      }
      await client.query(sql, rowVals);
      inserted++;
    }

    await client.query('COMMIT');
    res.json({ ok: true, inserted, mode });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    next(err);
  } finally {
    client.release();
  }
});

// Truncate table
router.delete('/', async (_req, res, next) => {
  try {
    await query(`TRUNCATE TABLE ${TABLE} RESTART IDENTITY`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// LISTAR con paginación + búsqueda
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '50', 10)));
    const offset = (page - 1) * pageSize;
    const search = (req.query.search || '').trim();

    const params = [];
    let where = '';
    if (search && SEARCH_COLS.length) {
      const likes = SEARCH_COLS.map((c) => { params.push(`%${search}%`); return `${c} ILIKE $${params.length}`; });
      where = `WHERE ${likes.join(' OR ')}`;
    }

    const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM ${TABLE} ${where}`, params);
    const total = countRows[0].total;

    params.push(pageSize);
    params.push(offset);
    const { rows } = await query(`SELECT * FROM ${TABLE} ${where} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

    res.json({ data: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) { next(err); }
});

// --- Endpoints de búsqueda para integración futura (Fase 8) ---

// GET /search — búsqueda flexible
router.get('/search', async (req, res, next) => {
  try {
    const { tipo, nro_pedido, codigo_sigamef, search } = req.query;
    const limit = Math.min(50, parseInt(req.query.limit || '15', 10));
    const params = [];
    const conds = [];
    if (tipo) { params.push(tipo); conds.push(`tipo = $${params.length}`); }
    if (nro_pedido) { params.push(nro_pedido); conds.push(`nro_pedido = $${params.length}`); }
    if (codigo_sigamef) { params.push(`%${codigo_sigamef}%`); conds.push(`codigo_sigamef ILIKE $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conds.push(`(descripcion ILIKE $${n} OR codigo_sigamef ILIKE $${n} OR nro_pedido ILIKE $${n} OR codigo_pedido ILIKE $${n})`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit);
    const { rows } = await query(`SELECT * FROM ${TABLE} ${where} ORDER BY id DESC LIMIT $${params.length}`, params);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /:id — detalle completo
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT * FROM ${TABLE} WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// CREAR con auto-generación de codigo_pedido y cálculo de total_item
router.post('/', async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (!body.codigo_pedido) body.codigo_pedido = await nextCodigoPedido();
    body.total_item = (parseFloat(body.cant_solicitada) || 0) * (parseFloat(body.precio_unitario) || 0);

    const keys = COLUMNS.filter((c) => body[c] !== undefined);
    if (!keys.length) return res.status(400).json({ error: 'Sin datos válidos' });
    const values = keys.map((k) => body[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(`INSERT INTO ${TABLE} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`, values);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ACTUALIZAR con recálculo de total_item
router.put('/:id', async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.cant_solicitada !== undefined || body.precio_unitario !== undefined) {
      const cant = parseFloat(body.cant_solicitada) || 0;
      const precio = parseFloat(body.precio_unitario) || 0;
      body.total_item = cant * precio;
    }
    delete body.codigo_pedido;

    const keys = COLUMNS.filter((c) => c !== 'codigo_pedido' && body[c] !== undefined);
    if (!keys.length) return res.status(400).json({ error: 'Sin datos válidos' });
    const values = keys.map((k) => body[k]);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(`UPDATE ${TABLE} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id, ...values]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ELIMINAR
router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(`DELETE FROM ${TABLE} WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) { next(err); }
});

export default router;
