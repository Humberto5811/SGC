import express from 'express';
import { query, getClient } from '../db.js';

const router = express.Router();

async function loadGlosaWithEntregas(id) {
  const { rows } = await query(
    `SELECT gb.*, COALESCE(json_agg(json_build_object(
        'id', ge.id,
        'numero_entrega', ge.numero_entrega,
        'entregable', ge.entregable,
        'cantidad', ge.cantidad,
        'plazo', ge.plazo,
        'condicion', ge.condicion
      ) ORDER BY ge.numero_entrega) FILTER (WHERE ge.id IS NOT NULL), '[]') AS entregas
     FROM glosas_bienes gb
     LEFT JOIN glosas_entregas ge ON ge.glosa_id = gb.id
     WHERE gb.id = $1
     GROUP BY gb.id`,
    [id]
  );
  return rows[0];
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT gb.*, COALESCE(json_agg(json_build_object(
          'id', ge.id,
          'numero_entrega', ge.numero_entrega,
          'entregable', ge.entregable,
          'cantidad', ge.cantidad,
          'plazo', ge.plazo,
          'condicion', ge.condicion
        ) ORDER BY ge.numero_entrega) FILTER (WHERE ge.id IS NOT NULL), '[]') AS entregas
       FROM glosas_bienes gb
       LEFT JOIN glosas_entregas ge ON ge.glosa_id = gb.id
       GROUP BY gb.id
       ORDER BY
         CASE WHEN gb.literal IS NOT NULL THEN 0 ELSE 1 END,
         gb.literal,
         NULLIF(split_part(gb.numero, '.', 1), '')::int NULLS FIRST,
         NULLIF(split_part(gb.numero, '.', 2), '')::int NULLS FIRST,
         gb.id`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const glosa = await loadGlosaWithEntregas(req.params.id);
    if (!glosa) return res.status(404).json({ error: 'No encontrado' });
    res.json(glosa);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { literal = null, numero = null, titulo, contenido = '', usuario_modificacion, entregas = [] } = req.body;
  if (!titulo) return res.status(400).json({ error: 'Titulo es requerido' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const insertRes = await client.query(
      `INSERT INTO glosas_bienes (literal, numero, titulo, contenido, usuario_modificacion, fecha_modificacion)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [literal, numero, titulo, contenido, usuario_modificacion || null]
    );
    const glosa = insertRes.rows[0];

    let totalCantidad = 0;
    if (Array.isArray(entregas) && entregas.length) {
      const insertEntregaText = `INSERT INTO glosas_entregas
        (glosa_id, numero_entrega, entregable, cantidad, plazo, condicion)
        VALUES ($1, $2, $3, $4, $5, $6)`;
      for (const entry of entregas) {
        const cantidad = Number(entry.cantidad) || 0;
        await client.query(insertEntregaText, [glosa.id, Number(entry.numero_entrega) || 1, entry.entregable || '', cantidad, entry.plazo || '', entry.condicion || '']);
        totalCantidad += cantidad;
      }
      await client.query(`UPDATE glosas_bienes SET total_cantidad = $1 WHERE id = $2`, [totalCantidad, glosa.id]);
      glosa.total_cantidad = totalCantidad;
    }

    await client.query('COMMIT');
    const createdGlosa = await loadGlosaWithEntregas(glosa.id);
    res.status(201).json(createdGlosa);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res, next) => {
  const { literal, numero, titulo, contenido, usuario_modificacion, entregas } = req.body;
  const keys = [];
  const values = [];
  if (literal !== undefined) { keys.push('literal'); values.push(literal); }
  if (numero !== undefined) { keys.push('numero'); values.push(numero); }
  if (titulo !== undefined) { keys.push('titulo'); values.push(titulo); }
  if (contenido !== undefined) { keys.push('contenido'); values.push(contenido); }
  if (usuario_modificacion !== undefined) { keys.push('usuario_modificacion'); values.push(usuario_modificacion); }

  if (!keys.length && entregas === undefined) {
    return res.status(400).json({ error: 'Sin datos válidos' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    if (keys.length) {
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const params = [...values, req.params.id];
      await client.query(`UPDATE glosas_bienes SET ${setClause}, fecha_modificacion = NOW(), updated_at = NOW() WHERE id = $${params.length}`, params);
    } else {
      await client.query(`UPDATE glosas_bienes SET fecha_modificacion = NOW(), updated_at = NOW() WHERE id = $1`, [req.params.id]);
    }

    if (Array.isArray(entregas)) {
      await client.query('DELETE FROM glosas_entregas WHERE glosa_id = $1', [req.params.id]);
      let totalCantidad = 0;
      const insertEntregaText = `INSERT INTO glosas_entregas
        (glosa_id, numero_entrega, entregable, cantidad, plazo, condicion)
        VALUES ($1, $2, $3, $4, $5, $6)`;
      for (const entry of entregas) {
        const cantidad = Number(entry.cantidad) || 0;
        await client.query(insertEntregaText, [req.params.id, Number(entry.numero_entrega) || 1, entry.entregable || '', cantidad, entry.plazo || '', entry.condicion || '']);
        totalCantidad += cantidad;
      }
      await client.query('UPDATE glosas_bienes SET total_cantidad = $1 WHERE id = $2', [totalCantidad, req.params.id]);
    }

    await client.query('COMMIT');
    const updated = await loadGlosaWithEntregas(req.params.id);
    if (!updated) return res.status(404).json({ error: 'No encontrado' });
    res.json(updated);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query('DELETE FROM glosas_bienes WHERE id = $1 RETURNING *', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true, deleted: rows[0] });
  } catch (err) { next(err); }
});

export default router;
