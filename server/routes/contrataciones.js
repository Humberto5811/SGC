// Rutas para el módulo Contrataciones (DEC y Programación)
// Reutiliza la tabla requerimientos y agrega endpoints específicos
// para el flujo: Gerente → DEC → Programación
import express from 'express';
import { query } from '../db.js';

const router = express.Router();

// GET /api/contrataciones/dec - Listar requerimientos aptos para DEC
// Muestra solo requerimientos con estado "Aprobado" (aprobado por Gerente)
router.get('/dec', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '100', 10)));
    const offset = (page - 1) * pageSize;

    const dataSql = `
      SELECT 
        r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado, 
        r.payload, r.usuario_modificacion, r.created_at, r.updated_at,
        COALESCE(c.nombre, '') as centro_nombre
      FROM requerimientos r
      LEFT JOIN areas a ON r.area = a.nombre
      LEFT JOIN centros c ON a.centro_id = c.id
      WHERE r.estado = 'Aprobado'
      ORDER BY r.id DESC
      LIMIT $1 OFFSET $2
    `;
    const countSql = `SELECT COUNT(*)::int AS total FROM requerimientos WHERE estado = 'Aprobado'`;
    
    const countResult = await query(countSql);
    const total = countResult.rows[0].total;
    const result = await query(dataSql, [pageSize, offset]);
    
    res.json({
      data: result.rows || [],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    });
  } catch (err) { next(err); }
});

// PUT /api/contrataciones/dec/aprobar/:requerimientoId
router.put('/dec/aprobar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { usuario } = req.body || {};

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1 AND estado = $2', 
      [requerimientoId, 'Aprobado']);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado o estado inválido' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.historial_dec)) payload.historial_dec = [];
    payload.historial_dec.push({
      tipo: 'aprobacion_dec',
      usuario: usuario || '',
      fecha: new Date().toISOString(),
    });

    const result = await query(
      `UPDATE requerimientos SET estado = 'Aprobado DEC', payload = $2, updated_at = NOW()
       WHERE id = $1 RETURNING id, codigo, estado`,
      [requerimientoId, JSON.stringify(payload)]
    );
    res.json({ success: true, requerimiento: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/contrataciones/dec/observar/:requerimientoId
router.put('/dec/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { motivo, usuario } = req.body || {};
    if (!motivo) return res.status(400).json({ success: false, error: 'Motivo requerido' });

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1 AND estado = $2',
      [requerimientoId, 'Aprobado']);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado o estado inválido' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.historial_dec)) payload.historial_dec = [];
    payload.historial_dec.push({
      tipo: 'observacion_dec',
      motivo,
      usuario: usuario || '',
      fecha: new Date().toISOString(),
    });
    // También agregar al historial de evaluación para que aparezca en el ciclo de observaciones
    if (!Array.isArray(payload.observaciones)) payload.observaciones = [];
    payload.observaciones.push({
      ronda: payload.observaciones.length + 1,
      motivo,
      gerente: usuario || 'dec',
      fecha: new Date().toISOString(),
      origen: 'DEC',
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

// GET /api/contrataciones/programacion - Listar requerimientos aptos para Programación
// Muestra solo requerimientos con estado "Aprobado DEC"
router.get('/programacion', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '100', 10)));
    const offset = (page - 1) * pageSize;

    const dataSql = `
      SELECT 
        r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado, 
        r.payload, r.usuario_modificacion, r.created_at, r.updated_at,
        COALESCE(c.nombre, '') as centro_nombre
      FROM requerimientos r
      LEFT JOIN areas a ON r.area = a.nombre
      LEFT JOIN centros c ON a.centro_id = c.id
      WHERE r.estado = 'Aprobado DEC'
      ORDER BY r.id DESC
      LIMIT $1 OFFSET $2
    `;
    const countSql = `SELECT COUNT(*)::int AS total FROM requerimientos WHERE estado = 'Aprobado DEC'`;
    
    const countResult = await query(countSql);
    const total = countResult.rows[0].total;
    const result = await query(dataSql, [pageSize, offset]);
    
    res.json({
      data: result.rows || [],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    });
  } catch (err) { next(err); }
});

// PUT /api/contrataciones/programacion/aprobar/:requerimientoId
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
    payload.historial_programacion.push({
      tipo: 'aprobacion_programacion',
      usuario: usuario || '',
      fecha: new Date().toISOString(),
    });

    const result = await query(
      `UPDATE requerimientos SET estado = 'Aprobado Programación', payload = $2, updated_at = NOW()
       WHERE id = $1 RETURNING id, codigo, estado`,
      [requerimientoId, JSON.stringify(payload)]
    );
    res.json({ success: true, requerimiento: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/contrataciones/programacion/observar/:requerimientoId
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
    if (!Array.isArray(payload.historial_programacion)) payload.historial_programacion = [];
    payload.historial_programacion.push({
      tipo: 'observacion_programacion',
      motivo,
      usuario: usuario || '',
      fecha: new Date().toISOString(),
    });

    // Al observar programación, devuelve a DEC (estado "Observado Programación")
    const result = await query(
      `UPDATE requerimientos SET estado = 'Observado Programación', payload = $2, updated_at = NOW()
       WHERE id = $1 RETURNING id, codigo, estado`,
      [requerimientoId, JSON.stringify(payload)]
    );
    res.json({ success: true, requerimiento: result.rows[0] });
  } catch (err) { next(err); }
});

export default router;