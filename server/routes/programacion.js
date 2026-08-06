// Programación — endpoints para asociación de pedidos y paquetes de consolidación
import express from 'express';
import { query } from '../db.js';
import {
  TRAZA_EXTRA_SELECT,
  enrichRequerimientoRow,
  buildListFilters,
  ETAPAS,
} from '../lib/trazabilidad.js';
import { buildMatrizSeguimientoPedidos } from '../lib/pedidosMatriz.js';
import { buildMatrizConsolidacionPaquetes } from '../lib/paquetesMatriz.js';
import { listarBandejaProgramacion } from '../lib/programacionBandeja.js';
import { transicionarExpediente } from '../lib/expedienteTransicion.js';

const router = express.Router();

// ==================== REQUERIMIENTOS (BANDEJA) ====================

// GET /api/programacion/requerimientos — bandeja maestra Programación (trazabilidad completa)
router.get('/requerimientos', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const result = await listarBandejaProgramacion(page, pageSize, req.query);
    res.json(result);
  } catch (err) { next(err); }
});

// ==================== ASOCIACIÓN DE PEDIDOS SIGAMEF ====================

// GET /api/programacion/pedidos/matriz-seguimiento
router.get('/pedidos/matriz-seguimiento', async (req, res, next) => {
  try {
    const data = await buildMatrizSeguimientoPedidos();
    res.json(data);
  } catch (err) { next(err); }
});

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
      const existente = await query(
        'SELECT requerimiento_id FROM requerimiento_pedidos WHERE pedido_sigamef_id = $1',
        [pid]
      );
      if (existente.rows.length && existente.rows[0].requerimiento_id !== Number(requerimiento_id)) {
        return res.status(400).json({ error: 'Uno o más pedidos ya están asignados a otro requerimiento.' });
      }
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

// GET /api/programacion/buscar-pedido?q=...&requerimiento_id=... — buscar pedidos SIGAMEF
router.get('/buscar-pedido', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const requerimientoId = parseInt(req.query.requerimiento_id || '0', 10) || null;
    if (!q) return res.json({ data: [] });
    const { rows } = await query(`
      SELECT p.id, p.codigo_pedido, p.ano_eje, p.tipo, p.nro_pedido, p.centro, p.centro_costo,
             p.fecha_pedido, p.descripcion, p.cant_solicitada, p.precio_unitario, p.total_item,
             p.codigo_sigamef, p.unidad_medida,
             rp.requerimiento_id AS req_asignado_id,
             r.codigo AS requerimiento_codigo
      FROM pedidos_sigamef p
      LEFT JOIN requerimiento_pedidos rp ON rp.pedido_sigamef_id = p.id
      LEFT JOIN requerimientos r ON r.id = rp.requerimiento_id
      WHERE p.codigo_pedido ILIKE $1 OR p.nro_pedido ILIKE $1 OR p.descripcion ILIKE $1
            OR p.codigo_sigamef ILIKE $1
      ORDER BY p.id ASC
      LIMIT 20
    `, [`%${q}%`]);
    const data = rows.map((row) => ({
      ...row,
      asignado: !!row.req_asignado_id,
      asignado_este: requerimientoId && row.req_asignado_id === requerimientoId,
      asignado_otro: !!row.req_asignado_id && row.req_asignado_id !== requerimientoId,
    }));
    res.json({ data });
  } catch (err) { next(err); }
});

// ==================== PAQUETES DE CONSOLIDACIÓN ====================

// GET /api/programacion/paquetes/matriz-consolidacion
router.get('/paquetes/matriz-consolidacion', async (req, res, next) => {
  try {
    const data = await buildMatrizConsolidacionPaquetes();
    res.json(data);
  } catch (err) { next(err); }
});

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
      SELECT r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado, r.payload,
             COALESCE(c.nombre, r.responsable, '') AS centro_nombre
      FROM paquete_requerimientos pr
      JOIN requerimientos r ON pr.requerimiento_id = r.id
      LEFT JOIN areas a ON r.area = a.nombre
      LEFT JOIN centros c ON a.centro_id = c.id
      WHERE pr.paquete_id = $1
      ORDER BY r.id ASC
    `, [id]);

    // Pedidos asociados a todos los requerimientos del paquete
    const reqIds = reqs.map((r) => r.id);
    let pedidos = [];
    if (reqIds.length) {
      const { rows: peds } = await query(`
        SELECT p.id, p.ano_eje, p.tipo, p.nro_pedido, p.centro, p.descripcion,
               p.cant_solicitada, p.precio_unitario, p.total_item,
               p.codigo_sigamef, p.sec_func, p.especifica, p.unidad_medida,
               rp.requerimiento_id, r.codigo AS requerimiento_codigo,
               COALESCE(NULLIF(TRIM(r.area), ''), a.nombre, '') AS area_usuaria
        FROM requerimiento_pedidos rp
        JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
        JOIN requerimientos r ON rp.requerimiento_id = r.id
        LEFT JOIN areas a ON a.nombre = r.area OR a.codigo = r.area
        WHERE rp.requerimiento_id = ANY($1)
        ORDER BY r.codigo ASC, p.nro_pedido ASC
      `, [reqIds]);
      pedidos = peds;
    }

    // Completar área usuaria y unidad de medida si faltan
    for (const ped of pedidos) {
      const req = reqs.find((r) => r.id === ped.requerimiento_id);
      if (!req) continue;
      if (!ped.area_usuaria || !String(ped.area_usuaria).trim()) {
        ped.area_usuaria = req.area || '';
        if (!ped.area_usuaria) {
          try {
            const pl = JSON.parse(req.payload || '{}');
            ped.area_usuaria = (pl.area && pl.area.nombre) || pl.area_usuaria || '';
          } catch (_) {}
        }
      }
      if (!ped.unidad_medida || !String(ped.unidad_medida).trim()) {
        try {
          const pl = JSON.parse(req.payload || '{}');
          const items = req.tipo === 'servicios' ? (pl.servicioItems || [])
            : req.tipo === 'locacion' ? (pl.locadorItems || []) : (pl.items || []);
          const match = items.find((it) =>
            String(it.item_bien || it.codigo_sigamef || '') === String(ped.codigo_sigamef || '')
            || String(it.nombre_item || '').toLowerCase() === String(ped.descripcion || '').toLowerCase()
          );
          if (match) ped.unidad_medida = match.unidad_medida || match.unidad || '';
        } catch (_) {}
      }
    }

    // Resumen consolidado (suma de pedidos SIGAMEF asociados)
    let cantidadTotal = 0;
    let montoTotal = 0;
    const centrosSet = new Set();
    const metasSet = new Set();
    for (const ped of pedidos) {
      cantidadTotal += Number(ped.cant_solicitada || 0);
      montoTotal += Number(ped.total_item || 0);
      if (ped.centro) centrosSet.add(ped.centro);
      if (ped.sec_func) metasSet.add(ped.sec_func);
    }

    res.json({
      paquete,
      requerimientos: reqs,
      pedidos,
      resumen: {
        cantidad_total: Number(cantidadTotal.toFixed(2)),
        monto_total: Number(montoTotal.toFixed(2)),
        centros: [...centrosSet],
        metas: [...metasSet],
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
    const reqIds = await query(
      'SELECT requerimiento_id FROM paquete_requerimientos WHERE paquete_id = $1',
      [id]
    );
    for (const row of reqIds.rows) {
      await transicionarExpediente({
        requerimientoId: row.requerimiento_id,
        evento: 'PROGRAMACION_APROBADA',
        unidadDestino: ETAPAS.ACTOS_PREPARATORIOS?.responsable || 'Coordinador de Contratos Menores',
        motivo: `Paquete ${id} aprobado — consolidación programada`,
        metadata: {
          client_request_id: `paquete-aprobar:${id}:${row.requerimiento_id}`,
          via: 'programacion/paquetes/aprobar',
          paquete_id: id,
        },
        actorRol: usuario || 'Programación',
      });
    }

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
