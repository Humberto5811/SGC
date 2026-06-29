// Rutas personalizadas para requerimientos (más allá de CRUD básico)
import express from 'express';
import { query } from '../db.js';
import {
  TRAZA_EXTRA_SELECT,
  enrichRequerimientoRow,
  registrarMovimiento,
  registrarSubsanacionDerivacion,
  obtenerTrazabilidad,
  buildListFilters,
  ETAPAS,
} from '../lib/trazabilidad.js';
import {
  emitirObservacion,
  registrarSubsanacionObservacion,
  procesarAccionObservacion,
  autoCerrarObservacionesEmisorAlContinuar,
} from '../lib/observacionesWorkflow.js';

const router = express.Router();

const BASE_FROM = `
  FROM requerimientos r
  LEFT JOIN areas a ON r.area = a.nombre
  LEFT JOIN centros c ON a.centro_id = c.id
`;

// GET /api/requerimientos/listar-con-detalles
router.get('/listar-con-detalles', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '100', 10)));
    const offset = (page - 1) * pageSize;
    const { whereExtra, params: filterParams } = buildListFilters(req.query);

    let where = 'WHERE 1=1';
    const params = [...filterParams];
    if (whereExtra) where += ` AND ${whereExtra}`;

    const countSql = `SELECT COUNT(*)::int AS total ${BASE_FROM} ${where}`;
    const countResult = await query(countSql, params);
    const total = countResult.rows[0].total;

    params.push(pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const dataSql = `
      SELECT
        r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado,
        r.payload, r.usuario_modificacion, r.created_at, r.updated_at,
        COALESCE(c.nombre, c.codigo, a.responsable, '') AS centro_nombre,
        ${TRAZA_EXTRA_SELECT}
      ${BASE_FROM}
      ${where}
      ORDER BY r.codigo ASC NULLS LAST, r.id ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await query(dataSql, params);
    const rows = (result.rows || []).map(enrichRequerimientoRow);

    res.json({
      data: rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      etapas: Object.entries(ETAPAS).map(([k, v]) => ({ codigo: k, label: v.label })),
    });
  } catch (err) {
    console.error('[requerimientos/listar-con-detalles] Error:', err);
    next(err);
  }
});

// GET /api/requerimientos/:id/trazabilidad
router.get('/:requerimientoId/trazabilidad', async (req, res, next) => {
  try {
    const data = await obtenerTrazabilidad(req.params.requerimientoId);
    if (!data) return res.status(404).json({ error: 'Requerimiento no encontrado' });
    res.json(data);
  } catch (err) { next(err); }
});

// PUT /api/requerimientos/:requerimientoId/solicitar-aprobacion
router.put('/:requerimientoId/solicitar-aprobacion', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { usuario } = req.body || {};
    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck?.rowCount) {
      return res.status(404).json({ success: false, error: 'Requerimiento no encontrado' });
    }

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.historial_evaluacion)) payload.historial_evaluacion = [];
    payload.historial_evaluacion.push({
      tipo: 'derivacion',
      usuario: usuario || 'Usuario AU',
      fecha: new Date().toISOString(),
      observacion: 'Solicitud de aprobación enviada a evaluación',
    });
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'En tramite de aprobación',
      usuario: usuario || 'Usuario AU',
      accion: 'derivado',
      observacion: 'Solicitud de aprobación enviada a evaluación',
      responsable: ETAPAS.EVALUACION.responsable,
      etapaEjecutor: 'REGISTRADO',
      etapaDestino: 'EVALUACION',
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

// PUT /api/requerimientos/:requerimientoId/observar
router.put('/:requerimientoId/observar', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const {
      motivo, usuario, destino_submodulo, destino_etapa, destino_persona,
      origen_submodulo, accion, observacion_id, observacion_padre_id, observacionPadreId,
    } = req.body || {};

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}

    const accionObs = procesarAccionObservacion(payload, {
      accion, observacion_id, origen_submodulo: origen_submodulo || 'Evaluación de Requerimiento',
      moduloOrigen: origen_submodulo, usuario,
    });
    if (accionObs) {
      await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);
      const updated = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
      return res.json({ success: true, requerimiento: enrichRequerimientoRow(updated.rows[0]) });
    }

    if (!motivo) return res.status(400).json({ success: false, error: 'Motivo de observación requerido' });

    if (!Array.isArray(payload.historial_evaluacion)) payload.historial_evaluacion = [];
    payload.historial_evaluacion.push({
      tipo: 'observacion',
      motivo,
      usuario: usuario || '',
      fecha: new Date().toISOString(),
    });

    emitirObservacion(payload, {
      motivo,
      gerente: usuario || 'Gerente',
      origen: 'GERENTE',
      origen_submodulo: origen_submodulo || 'Evaluación de Requerimiento',
      destino_submodulo: destino_submodulo || 'Registro de Requerimiento',
      destino_etapa: destino_etapa || 'REGISTRADO',
      destino_persona: destino_persona || '',
      observacion_padre_id: observacion_padre_id || observacionPadreId || null,
    });

    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'Observado',
      usuario: usuario || 'Gerente',
      accion: 'observado',
      observacion: motivo,
      responsable: ETAPAS.REGISTRADO.responsable,
      etapaEjecutor: 'EVALUACION',
      etapaDestinoEvento: 'REGISTRADO',
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

// PUT /api/requerimientos/:requerimientoId/subsanar
router.put('/:requerimientoId/subsanar', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const {
      respuesta, usuario, origen_submodulo, destino_submodulo, destino_etapa, destino_persona,
      observacion_id,
    } = req.body || {};
    if (!respuesta) return res.status(400).json({ success: false, error: 'Subsanación requerida' });

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}

    const { destinoSubmodulo, destinoEtapa, destinoPersona } = registrarSubsanacionObservacion(payload, {
      observacion_id,
      respuesta,
      origen_submodulo: origen_submodulo || 'Registro de Requerimiento',
      usuario: usuario || 'Usuario AU',
    });

    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarSubsanacionDerivacion({
      requerimientoId,
      usuario: usuario || 'Usuario AU',
      textoSubsanacion: respuesta,
      origenSubmodulo: origen_submodulo || 'Registro de Requerimiento',
      destinoSubmodulo: destinoSubmodulo || destino_submodulo || '',
      destinoEtapa: destinoEtapa || destino_etapa || '',
      destinoPersona: destinoPersona || destino_persona || '',
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

// PUT /api/requerimientos/:requerimientoId/aprobar-evaluacion
router.put('/:requerimientoId/aprobar-evaluacion', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { usuario } = req.body || {};

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.historial_evaluacion)) payload.historial_evaluacion = [];
    payload.historial_evaluacion.push({
      tipo: 'aprobacion',
      usuario: usuario || '',
      fecha: new Date().toISOString(),
    });
    autoCerrarObservacionesEmisorAlContinuar(payload, 'Evaluación de Requerimiento', usuario || 'Gerente');
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'Aprobado',
      usuario: usuario || 'Gerente',
      accion: 'aprobado',
      observacion: 'Aprobado en evaluación — derivado a DEC',
      responsable: ETAPAS.DEC.responsable,
      etapaEjecutor: 'EVALUACION',
      etapaDestino: 'DEC',
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

export default router;
