// Rutas para el módulo Contrataciones (DEC y Programación)
import express from 'express';
import { query } from '../db.js';
import {
  TRAZA_EXTRA_SELECT,
  enrichRequerimientoRow,
  registrarMovimiento,
  buildListFilters,
  ETAPAS,
} from '../lib/trazabilidad.js';
import { formatObservacionTraza } from '../lib/observacionDestino.js';

const router = express.Router();

const BASE_FROM = `
  FROM requerimientos r
  LEFT JOIN areas a ON r.area = a.nombre
  LEFT JOIN centros c ON a.centro_id = c.id
`;

async function listarRequerimientosPorEstados(estados, page, pageSize, queryParams = {}, options = {}) {
  const offset = (page - 1) * pageSize;
  const placeholders = estados.map((_, i) => `$${i + 1}`).join(', ');
  const { whereExtra, params: filterParams } = buildListFilters(queryParams);
  const params = [...estados, ...filterParams];

  let where = `WHERE r.estado IN (${placeholders})`;
  if (options.includeProgramacionTrazabilidad) {
    where = `WHERE (
      r.estado IN (${placeholders})
      OR (r.estado_actual = 'PROGRAMACION' AND r.estado IN ('En tramite de aprobación', 'Observado', 'Observado Programación'))
    )`;
  }
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
  return {
    data: (result.rows || []).map(enrichRequerimientoRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

router.get('/dec', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const estados = ['Aprobado', 'Aprobado DEC', 'Observado DEC', 'Observado Programación'];
    const result = await listarRequerimientosPorEstados(estados, page, pageSize, req.query);
    res.json(result);
  } catch (err) { next(err); }
});

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
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'Aprobado DEC',
      usuario: usuario || 'DEC',
      accion: 'aprobado',
      observacion: 'Aprobado por DEC — derivado a Programación',
      responsable: ETAPAS.PROGRAMACION.responsable,
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

router.put('/dec/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo } = req.body || {};
    if (!motivo) return res.status(400).json({ success: false, error: 'Motivo requerido' });

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.observaciones)) payload.observaciones = [];
    payload.observaciones.push({
      ronda: payload.observaciones.length + 1,
      motivo,
      gerente: usuario || 'dec',
      origen: 'DEC',
      origen_submodulo: origen_submodulo || 'DEC',
      destino_submodulo: destino_submodulo || '',
      destino_etapa: destino_etapa || '',
      destino_persona: destino_persona || '',
      fecha: new Date().toISOString(),
      subsanacion: null,
    });
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'Observado DEC',
      usuario: usuario || 'DEC',
      accion: 'observado',
      observacion: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
      responsable: destino_persona || ETAPAS.EVALUACION.responsable,
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

router.get('/programacion', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const estados = ['Aprobado DEC', 'Observado Programación', 'En Programación'];
    const result = await listarRequerimientosPorEstados(estados, page, pageSize, req.query, {
      includeProgramacionTrazabilidad: true,
    });
    res.json(result);
  } catch (err) { next(err); }
});

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
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'Aprobado Programación',
      usuario: usuario || 'Programación',
      accion: 'aprobado',
      observacion: 'Aprobado en Programación',
      responsable: ETAPAS.PROGRAMACION.responsable,
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

router.put('/programacion/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo } = req.body || {};
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
      origen_submodulo: origen_submodulo || 'Programación',
      destino_submodulo: destino_submodulo || '',
      destino_etapa: destino_etapa || '',
      destino_persona: destino_persona || '',
      fecha: new Date().toISOString(),
      subsanacion: null,
    });
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'Observado Programación',
      usuario: usuario || 'Programación',
      accion: 'observado',
      observacion: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
      responsable: destino_persona || ETAPAS.PROGRAMACION.responsable,
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

export default router;
