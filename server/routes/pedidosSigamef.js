// Rutas de Pedidos SIGAMEF.
// codigo_pedido = identificador interno (PED-000001)
// pedido_sigamef = código operativo (PB-/PS-/PL-)
import express from 'express';
import pool, { query } from '../db.js';
import { logImportAudit } from '../lib/importEngine.js';
import {
  cleanString, normalizeRowKeys, normalizeDateValue, normalizeNumber, normalizeUpper,
} from '../lib/importNormalize.js';
import { generatePedidoSigamef } from '../lib/pedidoSigamefCodes.js';

const TABLE = 'pedidos_sigamef';
const COLUMNS = [
  'codigo_pedido', 'pedido_sigamef', 'ano_eje', 'tipo', 'nro_pedido', 'centro', 'centro_costo',
  'fecha_pedido', 'fuente_fto', 'sec_func', 'grupo_bien', 'clase_bien', 'familia_bien',
  'item_bien', 'codigo_sigamef', 'descripcion', 'especifica', 'unidad_medida',
  'cant_solicitada', 'precio_unitario', 'total_item', 'estado',
];
const IMPORT_COLS = COLUMNS.filter((c) => c !== 'codigo_pedido');
const NUMERIC_COLS = new Set(['cant_solicitada', 'precio_unitario', 'total_item']);
const SEARCH_COLS = ['pedido_sigamef', 'nro_pedido', 'codigo_sigamef', 'descripcion', 'centro'];

const router = express.Router();

async function nextCodigoPedido(client) {
  const q = client || { query: (s, p) => query(s, p) };
  const { rows } = await q.query(
    `SELECT codigo_pedido FROM ${TABLE} WHERE codigo_pedido LIKE 'PED-%' ORDER BY codigo_pedido DESC LIMIT 1`,
  );
  if (!rows.length) return 'PED-000001';
  const num = parseInt(rows[0].codigo_pedido.replace('PED-', ''), 10) || 0;
  return `PED-${String(num + 1).padStart(6, '0')}`;
}

function transformPedidoRow(raw) {
  const r = normalizeRowKeys(raw);
  if (!r.tipo && r.tipo_bien) r.tipo = r.tipo_bien;
  if (!r.nro_pedido && r.numero_pedido) r.nro_pedido = r.numero_pedido;
  if (!r.fecha_pedido && r.fecha) r.fecha_pedido = r.fecha;
  r.tipo = normalizeUpper(r.tipo);
  r.nro_pedido = cleanString(r.nro_pedido);
  r.pedido_sigamef = generatePedidoSigamef(r.tipo, r.nro_pedido);
  r.fecha_pedido = normalizeDateValue(r.fecha_pedido);
  r.estado = cleanString(r.estado) || 'Activo';
  return r;
}

function validatePedidoRow(row) {
  if (!cleanString(row.tipo)) return 'Tipo requerido';
  if (!cleanString(row.nro_pedido)) return 'Nro Pedido requerido';
  if (!cleanString(row.pedido_sigamef)) return 'No se pudo generar pedido_sigamef';
  if (!cleanString(row.codigo_sigamef)) return 'Código SIGAMEF requerido';
  if (!cleanString(row.descripcion)) return 'Descripción requerida';
  return null;
}

function coercePedidoRow(row, codigoPedido) {
  const cant = normalizeNumber(row.cant_solicitada, 0);
  const precio = normalizeNumber(row.precio_unitario, 0);
  const data = { codigo_pedido: codigoPedido };
  for (const c of IMPORT_COLS) {
    if (NUMERIC_COLS.has(c)) data[c] = normalizeNumber(row[c], c === 'total_item' ? cant * precio : 0);
    else if (c === 'total_item') data[c] = cant * precio;
    else if (c === 'pedido_sigamef') data[c] = row.pedido_sigamef;
    else if (c === 'fecha_pedido') data[c] = row.fecha_pedido || '';
    else if (c === 'tipo') data[c] = row.tipo || '';
    else data[c] = cleanString(row[c]);
  }
  return data;
}

function applyPedidoSigamef(body) {
  const tipo = normalizeUpper(body.tipo);
  const nro = cleanString(body.nro_pedido);
  body.tipo = tipo;
  body.nro_pedido = nro;
  body.pedido_sigamef = generatePedidoSigamef(tipo, nro);
  if (body.fecha_pedido !== undefined) body.fecha_pedido = normalizeDateValue(body.fecha_pedido);
  body.total_item = normalizeNumber(body.cant_solicitada, 0) * normalizeNumber(body.precio_unitario, 0);
  return body;
}

router.post('/import', async (req, res, next) => {
  const body = req.body || {};
  const importRows = Array.isArray(body.rows) ? body.rows : [];
  if (!importRows.length) {
    return res.status(400).json({ error: 'No se recibieron filas para importar.' });
  }

  const client = await pool.connect();
  const start = Date.now();
  const stats = {
    leidos: importRows.length,
    insertados: 0,
    actualizados: 0,
    omitidos: 0,
    errores: [],
    duracion_ms: 0,
  };
  const seen = new Set();
  let lastNum = 0;

  try {
    await client.query('BEGIN');
    const { rows: maxRows } = await client.query(
      `SELECT codigo_pedido FROM ${TABLE} WHERE codigo_pedido LIKE 'PED-%' ORDER BY codigo_pedido DESC LIMIT 1`,
    );
    if (maxRows.length) lastNum = parseInt(maxRows[0].codigo_pedido.replace('PED-', ''), 10) || 0;

    for (let i = 0; i < importRows.length; i++) {
      try {
        const row = transformPedidoRow(importRows[i]);
        const err = validatePedidoRow(row);
        if (err) {
          stats.omitidos += 1;
          stats.errores.push({ fila: i + 1, error: err });
          continue;
        }
        if (seen.has(row.pedido_sigamef)) {
          stats.omitidos += 1;
          stats.errores.push({ fila: i + 1, error: `Duplicado en archivo: ${row.pedido_sigamef}` });
          continue;
        }
        seen.add(row.pedido_sigamef);

        const { rows: existing } = await client.query(
          `SELECT id, codigo_pedido FROM ${TABLE} WHERE pedido_sigamef = $1 LIMIT 1`,
          [row.pedido_sigamef],
        );

        const codigoPedido = existing.length
          ? existing[0].codigo_pedido
          : `PED-${String((lastNum += 1)).padStart(6, '0')}`;

        const data = coercePedidoRow(row, codigoPedido);
        if (existing.length) {
          const setCols = IMPORT_COLS.map((c, idx) => `${c} = $${idx + 2}`);
          await client.query(
            `UPDATE ${TABLE} SET ${setCols.join(', ')}, updated_at = NOW() WHERE id = $1`,
            [existing[0].id, ...IMPORT_COLS.map((c) => data[c])],
          );
          stats.actualizados += 1;
        } else {
          await client.query(
            `INSERT INTO ${TABLE} (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((_, idx) => `$${idx + 1}`).join(', ')})`,
            COLUMNS.map((c) => data[c]),
          );
          stats.insertados += 1;
        }
      } catch (e) {
        stats.errores.push({ fila: i + 1, error: e.message || 'Error al procesar' });
      }
    }

    stats.duracion_ms = Date.now() - start;
    await logImportAudit(client, {
      catalogo: 'pedidos_sigamef',
      usuario: body.usuario || 'Sistema',
      archivo: body.archivo || body.fileName || '',
      ...stats,
    });
    await client.query('COMMIT');

    res.json({
      ok: true,
      ...stats,
      inserted: stats.insertados,
      updated: stats.actualizados,
      skipped: stats.omitidos,
      mode: 'upsert',
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    next(err);
  } finally {
    client.release();
  }
});

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

    params.push(pageSize, offset);
    const { rows } = await query(
      `SELECT * FROM ${TABLE} ${where} ORDER BY id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    res.json({ data: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
  } catch (err) { next(err); }
});

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
      conds.push(`(descripcion ILIKE $${n} OR codigo_sigamef ILIKE $${n} OR nro_pedido ILIKE $${n} OR pedido_sigamef ILIKE $${n})`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit);
    const { rows } = await query(`SELECT * FROM ${TABLE} ${where} ORDER BY id ASC LIMIT $${params.length}`, params);
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
    const body = applyPedidoSigamef({ ...req.body });
    if (!body.codigo_pedido) body.codigo_pedido = await nextCodigoPedido();

    const keys = COLUMNS.filter((c) => body[c] !== undefined);
    if (!keys.length) return res.status(400).json({ error: 'Sin datos válidos' });
    const values = keys.map((k) => body[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(`INSERT INTO ${TABLE} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`, values);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = applyPedidoSigamef({ ...req.body });
    delete body.codigo_pedido;

    const keys = COLUMNS.filter((c) => c !== 'codigo_pedido' && body[c] !== undefined);
    if (!keys.length) return res.status(400).json({ error: 'Sin datos válidos' });
    const values = keys.map((k) => body[k]);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE ${TABLE} SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values],
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows: refs } = await query(
      'SELECT 1 FROM requerimiento_pedidos WHERE pedido_sigamef_id = $1 LIMIT 1',
      [req.params.id],
    );
    if (refs.length) {
      return res.status(409).json({ error: 'No se puede eliminar: el pedido está asociado a requerimientos.' });
    }
    const { rows } = await query(`DELETE FROM ${TABLE} WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) { next(err); }
});

export default router;
