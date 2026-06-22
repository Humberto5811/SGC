// Programación — endpoints para asociación de pedidos y paquetes de consolidación
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// ==================== ASOCIACIÓN DE PEDIDOS SIGAMEF ====================

// GET /api/programacion/pedidos/:requerimientoId — listar pedidos asociados a un requerimiento
router.get('/pedidos/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { rows } = await query(`
      SELECT rp.id AS asociacion_id, rp.fecha_registro, rp.usuario_registro,
             p.id, p.codigo_pedido, p.ano_eje, p.tipo, p.nro_pedido, p.centro,
             p.centro_costo, p.fecha_pedido, p.descripcion, p.cant_solicitada,
             p.precio_unitario, p.total_item, p.codigo_sigamef, p.unidad_medida,
             p.fuente_fto, p.sec_func, p.grupo_bien, p.clase_bien, p.familia_bien,
             p.item_bien, p.especifica, p.estado
      FROM requerimiento_pedidos rp
      JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
      WHERE rp.requerimiento_id = $1
      ORDER BY rp.id ASC
    `, [requerimientoId]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// POST /api/programacion/pedidos — asociar pedidos a un requerimiento
router.post('/pedidos', async (req, res, next) => {
  try {
    const { requerimiento_id, pedido_ids, usuario } = req.body;
    if (!requerimiento_id || !Array.isArray(pedido_ids) || !pedido_ids.length) {
      return res.status(400).json({ error: 'requerimiento_id y pedido_ids son requeridos.' });
    }
    let inserted = 0;
    for (const pid of pedido_ids) {
      try {
        await query(`
          INSERT INTO requerimiento_pedidos (requerimiento_id, pedido_sigamef_id, usuario_registro)
          VALUES ($1, $2, $3)
          ON CONFLICT (requerimiento_id, pedido_sigamef_id) DO NOTHING
        `, [requerimiento_id, pid, usuario || '']);
        inserted++;
      } catch (_) { /* skip duplicates */ }
    }
    res.json({ ok: true, inserted });
  } catch (err) { next(err); }
});

// DELETE /api/programacion/pedidos/:asociacionId — eliminar una asociación
router.delete('/pedidos/:asociacionId', async (req, res, next) => {
  try {
    await query('DELETE FROM requerimiento_pedidos WHERE id = $1', [req.params.asociacionId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/programacion/pedidos-count — contar pedidos asociados por requerimiento (batch)
router.get('/pedidos-count', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT requerimiento_id, COUNT(*)::int AS count
      FROM requerimiento_pedidos
      GROUP BY requerimiento_id
    `);
    const map = {};
    rows.forEach((r) => { map[r.requerimiento_id] = r.count; });
    res.json(map);
  } catch (err) { next(err); }
});

// GET /api/programacion/buscar-pedido?q=... — buscar pedidos SIGAMEF por código o descripción
router.get('/buscar-pedido', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ data: [] });
    const { rows } = await query(`
      SELECT id, codigo_pedido, ano_eje, tipo, nro_pedido, centro, centro_costo,
             fecha_pedido, descripcion, cant_solicitada, precio_unitario, total_item,
             codigo_sigamef, unidad_medida
      FROM pedidos_sigamef
      WHERE codigo_pedido ILIKE $1 OR nro_pedido ILIKE $1 OR descripcion ILIKE $1
            OR codigo_sigamef ILIKE $1
      ORDER BY id ASC
      LIMIT 20
    `, [`%${q}%`]);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ==================== PAQUETES DE CONSOLIDACIÓN ====================

// GET /api/programacion/paquetes — listar paquetes
router.get('/paquetes', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT pp.*,
        (SELECT COUNT(*)::int FROM paquete_requerimientos pr WHERE pr.paquete_id = pp.id) AS cant_requerimientos
      FROM paquetes_programacion pp
      ORDER BY pp.id DESC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// GET /api/programacion/paquetes/:id — detalle de un paquete con requerimientos y pedidos
router.get('/paquetes/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const paqRes = await query('SELECT * FROM paquetes_programacion WHERE id = $1', [id]);
    if (!paqRes.rows.length) return res.status(404).json({ error: 'Paquete no encontrado' });
    const paquete = paqRes.rows[0];

    // Requerimientos del paquete
    const { rows: reqs } = await query(`
      SELECT r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado, r.payload
      FROM paquete_requerimientos pr
      JOIN requerimientos r ON pr.requerimiento_id = r.id
      WHERE pr.paquete_id = $1
      ORDER BY r.id ASC
    `, [id]);

    // Pedidos asociados a todos los requerimientos del paquete
    const reqIds = reqs.map((r) => r.id);
    let pedidos = [];
    if (reqIds.length) {
      const { rows: peds } = await query(`
        SELECT DISTINCT p.id, p.codigo_pedido, p.ano_eje, p.tipo, p.nro_pedido, p.centro,
               p.centro_costo, p.descripcion, p.cant_solicitada, p.precio_unitario, p.total_item,
               p.codigo_sigamef, p.unidad_medida, rp.requerimiento_id
        FROM requerimiento_pedidos rp
        JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
        WHERE rp.requerimiento_id = ANY($1)
        ORDER BY p.id ASC
      `, [reqIds]);
      pedidos = peds;
    }

    // Resumen consolidado
    let cantidadTotal = 0, montoTotal = 0;
    const centrosSet = new Set(), metasSet = new Set(), especificasSet = new Set();
    for (const r of reqs) {
      try {
        const p = JSON.parse(r.payload || '{}');
        const items = r.tipo === 'servicios' ? (p.servicioItems || []) : r.tipo === 'locacion' ? (p.locadorItems || []) : (p.items || []);
        if (Array.isArray(items)) {
          items.forEach((it) => {
            cantidadTotal += Number(it.cantidad || it.cant_solicitada || 0);
            montoTotal += r.tipo === 'bienes'
              ? (Number(it.precio_unitario || 0) * Number(it.cantidad || 0))
              : Number(it.monto || 0);
          });
        }
      } catch (_) {}
    }
    for (const ped of pedidos) {
      if (ped.centro) centrosSet.add(ped.centro);
      if (ped.especifica) especificasSet.add(ped.especifica);
    }

    res.json({
      paquete,
      requerimientos: reqs,
      pedidos,
      resumen: {
        cantidad_total: cantidadTotal,
        monto_total: Number(montoTotal.toFixed(2)),
        centros: [...centrosSet],
        metas: [...metasSet],
        especificas: [...especificasSet],
      }
    });
  } catch (err) { next(err); }
});

// POST /api/programacion/paquetes — crear paquete de consolidación
router.post('/paquetes', async (req, res, next) => {
  try {
    const { requerimiento_ids, usuario } = req.body;
    if (!Array.isArray(requerimiento_ids) || requerimiento_ids.length < 2) {
      return res.status(400).json({ error: 'Se requieren al menos 2 requerimientos.' });
    }

    // Validaciones
    for (const rid of requerimiento_ids) {
      const { rows } = await query('SELECT id, estado FROM requerimientos WHERE id = $1', [rid]);
      if (!rows.length) return res.status(400).json({ error: `Requerimiento ${rid} no encontrado.` });
      const est = rows[0].estado || '';
      if (/anulad/i.test(est)) return res.status(400).json({ error: `Requerimiento ${rid} está anulado.` });

      // Check si ya está en otro paquete
      const { rows: paqCheck } = await query(
        'SELECT pr.paquete_id FROM paquete_requerimientos pr WHERE pr.requerimiento_id = $1', [rid]
      );
      if (paqCheck.length) return res.status(400).json({ error: `Requerimiento ${rid} ya pertenece a otro paquete.` });

      // Check pedidos asociados
      const { rows: pedCheck } = await query(
        'SELECT COUNT(*)::int AS c FROM requerimiento_pedidos WHERE requerimiento_id = $1', [rid]
      );
      if (!pedCheck[0].c) return res.status(400).json({ error: `Requerimiento ${rid} no tiene pedidos SIGAMEF asociados.` });
    }

    // Generar código correlativo
    const { rows: maxCode } = await query(
      "SELECT codigo_paquete FROM paquetes_programacion ORDER BY id DESC LIMIT 1"
    );
    let nextNum = 1;
    if (maxCode.length) {
      const m = maxCode[0].codigo_paquete.match(/(\d+)/);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const codigoPaquete = `PAQ-${String(nextNum).padStart(4, '0')}`;

    // Crear paquete
    const { rows: paq } = await query(
      `INSERT INTO paquetes_programacion (codigo_paquete, usuario_creacion) VALUES ($1, $2) RETURNING *`,
      [codigoPaquete, usuario || '']
    );
    const paqueteId = paq[0].id;

    // Asociar requerimientos
    for (const rid of requerimiento_ids) {
      await query(
        'INSERT INTO paquete_requerimientos (paquete_id, requerimiento_id) VALUES ($1, $2)',
        [paqueteId, rid]
      );
    }

    res.json({ ok: true, paquete: paq[0] });
  } catch (err) { next(err); }
});

// PUT /api/programacion/paquetes/:id/aprobar — aprobar un paquete
router.put('/paquetes/:id/aprobar', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { usuario } = req.body || {};
    const { rows } = await query(
      `UPDATE paquetes_programacion
       SET estado = 'Aprobado', usuario_aprobacion = $2, fecha_aprobacion = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, usuario || '']
    );
    if (!rows.length) return res.status(404).json({ error: 'Paquete no encontrado' });

    // Marcar requerimientos del paquete como "Programado"
    await query(`
      UPDATE requerimientos SET estado = 'Programado', updated_at = NOW()
      WHERE id IN (SELECT requerimiento_id FROM paquete_requerimientos WHERE paquete_id = $1)
    `, [id]);

    res.json({ ok: true, paquete: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/programacion/paquetes/:id — eliminar un paquete (solo si pendiente)
router.delete('/paquetes/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await query('SELECT estado FROM paquetes_programacion WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Paquete no encontrado' });
    if (rows[0].estado !== 'Pendiente') return res.status(400).json({ error: 'Solo se pueden eliminar paquetes pendientes.' });
    await query('DELETE FROM paquete_requerimientos WHERE paquete_id = $1', [id]);
    await query('DELETE FROM paquetes_programacion WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
