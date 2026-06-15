// Rutas para el módulo Contrataciones (DEC y Programación)
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// Helper: obtener requerimientos por lista de estados
async function listarRequerimientosPorEstados(estados, page, pageSize) {
  const offset = (page - 1) * pageSize;
  const placeholders = estados.map((_, i) => `$${i + 1}`).join(', ');
  const params = [...estados];
  
  const dataSql = `
    SELECT 
      r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado, 
      r.payload, r.usuario_modificacion, r.created_at, r.updated_at,
      COALESCE(c.nombre, '') as centro_nombre
    FROM requerimientos r
    LEFT JOIN areas a ON r.area = a.nombre
    LEFT JOIN centros c ON a.centro_id = c.id
    WHERE r.estado IN (${placeholders})
    ORDER BY r.id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  const countSql = `SELECT COUNT(*)::int AS total FROM requerimientos WHERE estado IN (${placeholders})`;
  
  const countResult = await query(countSql, params);
  const total = countResult.rows[0].total;
  params.push(pageSize, offset);
  const result = await query(dataSql, params);
  return { data: result.rows || [], total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// GET /dec - DEC ve: Aprobado, Aprobado DEC, Observado DEC, Observado Programación
router.get('/dec', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const estados = ['Aprobado', 'Aprobado DEC', 'Observado DEC', 'Observado Programación'];
    const result = await listarRequerimientosPorEstados(estados, page, pageSize);
    res.json(result);
  } catch (err) { next(err); }
});

// PUT /dec/aprobar/:id
router.put('/dec/aprobar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { usuario } = req.body || {};
    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.historial_dec)) payload.historial_dec = [];
    payload.historial_dec.push({ tipo: 'aprobacion_dec', usuario: usuario || '', fecha: new Date().toISOString() });

    const result = await query(
      `UPDATE requerimientos SET estado = 'Aprobado DEC', payload = $2, updated_at = NOW()
       WHERE id = $1 RETURNING id, codigo, estado`,
      [requerimientoId, JSON.stringify(payload)]
    );
    res.json({ success: true, requerimiento: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /dec/observar/:id - Observado DEC pero permanece visible en DEC
router.put('/dec/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { motivo, usuario } = req.body || {};
    if (!motivo) return res.status(400).json({ success: false, error: 'Motivo requerido' });

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    
    // Registrar observación DEC con origen
    if (!Array.isArray(payload.observaciones)) payload.observaciones = [];
    payload.observaciones.push({
      ronda: payload.observaciones.length + 1,
      motivo,
      gerente: usuario || 'dec',
      origen: 'DEC',
      fecha: new Date().toISOString(),
      subsanacion: null,
    });

    const result = await query(
      `UPDATE requerimientos SET estado = 'Observado DEC', payload = $2, updated_at = NOW()
       WHERE id = $1 RETURNING id, codigo, estado`,
      [requerimientoId, JSON.stringify(payload)]
    );
    res.json({ success: true, requerimiento: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /programacion - Programación ve: Aprobado DEC, Observado Programación
router.get('/programacion', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const estados = ['Aprobado DEC', 'Observado Programación'];
    const result = await listarRequerimientosPorEstados(estados, page, pageSize);
    res.json(result);
  } catch (err) { next(err); }
});

// PUT /programacion/aprobar/:id
router.put('/programacion/aprobar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { usuario } = req.body || {};
    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1 AND estado = $2',
      [requerimientoId, 'Aprobado DEC']);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado o estado inválido' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.historial_programacion)) payload.historial_programacion = [];
    payload.historial_programacion.push({ tipo: 'aprobacion_programacion', usuario: usuario || '', fecha: new Date().toISOString() });

    const result = await query(
      `UPDATE requerimientos SET estado = 'Aprobado Programación', payload = $2, updated_at = NOW()
       WHERE id = $1 RETURNING id, codigo, estado`,
      [requerimientoId, JSON.stringify(payload)]
    );
    res.json({ success: true, requerimiento: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /programacion/observar/:id
router.put('/programacion/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { motivo, usuario } = req.body || {};
    if (!motivo) return res.status(400).json({ success: false, error: 'Motivo requerido' });

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1 AND estado = $2',
      [requerimientoId, 'Aprobado DEC']);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado o estado inválido' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.observaciones)) payload.observaciones = [];
    payload.observaciones.push({
      ronda: payload.observaciones.length + 1,
      motivo,
      gerente: usuario || 'programacion',
      origen: 'PROGRAMACIÓN',
      fecha: new Date().toISOString(),
      subsanacion: null,
    });

    const result = await query(
      `UPDATE requerimientos SET estado = 'Observado Programación', payload = $2, updated_at = NOW()
       WHERE id = $1 RETURNING id, codigo, estado`,
      [requerimientoId, JSON.stringify(payload)]
    );
    res.json({ success: true, requerimiento: result.rows[0] });
  } catch (err) { next(err); }
});

export default router;