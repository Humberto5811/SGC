/**
 * bandejaConfiable.js
 * 
 * Rutas para obtener bandeja de requerimientos desde vista_requerimiento_actual.
 * Garantiza que la información es consistente y actualizada.
 * NO hace queries complejas - solo consulta la vista materializada.
 */

import express from 'express';
import { query } from '../db.js';

const router = express.Router();

/**
 * GET /api/bandeja/usuario/:usuario
 * Obtiene todos los requerimientos para un usuario específico
 * Desde la vista materializada (confiable y rápida)
 */
router.get('/usuario/:usuario', async (req, res, next) => {
  try {
    const { usuario } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const offset = (page - 1) * pageSize;

    // Consultar SOLO desde vista_requerimiento_actual
    const result = await query(
      `SELECT
        v.requerimiento_id,
        v.codigo_requerimiento,
        v.etapa_actual,
        v.estado_label,
        v.responsable_actual,
        v.observacion_activa,
        v.dias_en_etapa,
        v.timestamp_ultima_actualizacion,
        r.cmn,
        r.denominacion,
        r.area,
        r.tipo
      FROM vista_requerimiento_actual v
      JOIN requerimientos r ON v.requerimiento_id = r.id
      WHERE v.responsable_actual ILIKE $1
         OR v.responsable_actual ILIKE $2
      ORDER BY v.timestamp_ultima_actualizacion DESC, v.requerimiento_id DESC
      LIMIT $3 OFFSET $4`,
      [usuario, `%${usuario}%`, pageSize, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM vista_requerimiento_actual
       WHERE responsable_actual ILIKE $1 OR responsable_actual ILIKE $2`,
      [usuario, `%${usuario}%`]
    );

    res.json({
      success: true,
      usuario,
      total: countResult.rows[0].total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      requerimientos: result.rows,
    });
  } catch (error) {
    console.error('[bandejaConfiable] Error:', error);
    next(error);
  }
});

/**
 * GET /api/bandeja/etapa/:etapa
 * Obtiene todos los requerimientos en una etapa específica
 */
router.get('/etapa/:etapa', async (req, res, next) => {
  try {
    const { etapa } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const offset = (page - 1) * pageSize;

    const result = await query(
      `SELECT
        v.requerimiento_id,
        v.codigo_requerimiento,
        v.etapa_actual,
        v.estado_label,
        v.responsable_actual,
        v.observacion_activa,
        v.dias_en_etapa,
        v.timestamp_ultima_actualizacion,
        r.cmn,
        r.denominacion,
        r.area,
        r.tipo
      FROM vista_requerimiento_actual v
      JOIN requerimientos r ON v.requerimiento_id = r.id
      WHERE UPPER(v.etapa_actual) = UPPER($1)
      ORDER BY v.dias_en_etapa DESC, v.timestamp_ultima_actualizacion DESC
      LIMIT $2 OFFSET $3`,
      [etapa, pageSize, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM vista_requerimiento_actual
       WHERE UPPER(etapa_actual) = UPPER($1)`,
      [etapa]
    );

    res.json({
      success: true,
      etapa,
      total: countResult.rows[0].total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      requerimientos: result.rows,
    });
  } catch (error) {
    console.error('[bandejaConfiable] Error:', error);
    next(error);
  }
});

/**
 * GET /api/bandeja/requerimiento/:requerimientoId
 * Obtiene estado actual y transiciones permitidas para un requerimiento
 */
router.get('/requerimiento/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;

    const result = await query(
      `SELECT
        v.requerimiento_id,
        v.codigo_requerimiento,
        v.etapa_actual,
        v.estado_label,
        v.responsable_actual,
        v.observacion_activa,
        v.observacion_id,
        v.dias_en_etapa,
        v.timestamp_ultima_actualizacion,
        r.denominacion,
        r.area,
        r.tipo,
        r.cmn
      FROM vista_requerimiento_actual v
      JOIN requerimientos r ON v.requerimiento_id = r.id
      WHERE v.requerimiento_id = $1`,
      [requerimientoId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: 'Requerimiento no encontrado',
      });
    }

    const vista = result.rows[0];

    // Obtener timeline del requerimiento
    const timelineResult = await query(
      `SELECT
        id,
        etapa_origen,
        etapa_destino,
        accion,
        usuario,
        responsable,
        motivo,
        fecha
      FROM timeline
      WHERE requerimiento_id = $1
      ORDER BY fecha DESC
      LIMIT 20`,
      [requerimientoId]
    );

    res.json({
      success: true,
      requerimiento: {
        id: vista.requerimiento_id,
        codigo: vista.codigo_requerimiento,
        denominacion: vista.denominacion,
        area: vista.area,
        tipo: vista.tipo,
        cmn: vista.cmn,
      },
      workflow: {
        etapaActual: vista.etapa_actual,
        estado: vista.estado_label,
        responsable: vista.responsable_actual,
        diasEnEtapa: vista.dias_en_etapa,
        observacionActiva: vista.observacion_activa,
        observacionId: vista.observacion_id,
        ultimaActualizacion: vista.timestamp_ultima_actualizacion,
      },
      timeline: timelineResult.rows,
    });
  } catch (error) {
    console.error('[bandejaConfiable] Error:', error);
    next(error);
  }
});

/**
 * GET /api/bandeja/estadisticas
 * Obtiene estadísticas por etapa
 */
router.get('/estadisticas', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        v.etapa_actual,
        COUNT(*) as total,
        COUNT(CASE WHEN v.observacion_activa THEN 1 END) as con_observacion,
        AVG(v.dias_en_etapa) as dias_promedio,
        MAX(v.dias_en_etapa) as dias_maximo,
        COUNT(CASE WHEN v.dias_en_etapa > 10 THEN 1 END) as atrasados
      FROM vista_requerimiento_actual v
      GROUP BY v.etapa_actual
      ORDER BY v.etapa_actual
    `);

    res.json({
      success: true,
      estadisticas: result.rows,
    });
  } catch (error) {
    console.error('[bandejaConfiable] Error:', error);
    next(error);
  }
});

/**
 * GET /api/bandeja/atrasados
 * Obtiene requerimientos que llevan más de 10 días en la misma etapa
 */
router.get('/atrasados', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        v.requerimiento_id,
        v.codigo_requerimiento,
        v.etapa_actual,
        v.estado_label,
        v.responsable_actual,
        v.dias_en_etapa,
        v.fecha_ingreso_etapa,
        r.denominacion,
        r.area
      FROM vista_requerimiento_actual v
      JOIN requerimientos r ON v.requerimiento_id = r.id
      WHERE v.dias_en_etapa > 10
      AND v.etapa_actual NOT IN ('FINALIZADO', 'CERRADO')
      ORDER BY v.dias_en_etapa DESC
    `);

    res.json({
      success: true,
      total: result.rows.length,
      requerimientos: result.rows,
    });
  } catch (error) {
    console.error('[bandejaConfiable] Error:', error);
    next(error);
  }
});

export default router;
