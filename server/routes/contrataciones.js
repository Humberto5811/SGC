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
import { formatObservacionTraza, resolveEstadoFromDestino, resolveResponsableFromDestino, submoduloLabelToEtapa } from '../lib/observacionDestino.js';
import { appendObservacion } from '../lib/observacionesExpediente.js';
import {
  emitirObservacion,
  procesarAccionObservacion,
  autoCerrarObservacionesEmisorAlContinuar,
} from '../lib/observacionesWorkflow.js';
import {
  listarBandejaActos,
  listUsuariosPerfilActos,
  listUsuariosPorSubmodulo,
  asignarAnalistaActos,
  reasignarActos,
  observarActos,
  derivarActos,
  aprobarActosInvitaciones,
  COORDINADOR_ACTOS,
} from '../lib/actosPreparatorios.js';
import { listarBandejaProgramacion } from '../lib/programacionBandeja.js';
import { listarBandejaDEC } from '../lib/decBandeja.js';
import {
  REQUERIMIENTO_BANDEJA_FROM,
  REQUERIMIENTO_BANDEJA_EXTRA_SELECT,
} from '../lib/bandejaRequerimientoSql.js';

const router = express.Router();

const BASE_FROM = REQUERIMIENTO_BANDEJA_FROM;

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
      ${REQUERIMIENTO_BANDEJA_EXTRA_SELECT},
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
    const result = await listarBandejaDEC(page, pageSize, req.query);
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
    autoCerrarObservacionesEmisorAlContinuar(payload, 'DEC', usuario || 'DEC');
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'Aprobado DEC',
      usuario: usuario || 'DEC',
      accion: 'aprobado',
      observacion: 'Aprobado por DEC — derivado a Programación',
      responsable: ETAPAS.PROGRAMACION.responsable,
      etapaEjecutor: 'DEC',
      etapaDestino: 'PROGRAMACION',
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

router.put('/dec/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const {
      motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo,
      accion, observacion_id, observacion_padre_id, observacionPadreId,
    } = req.body || {};

    const reqCheck = await query('SELECT id, payload FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}

    const accionObs = procesarAccionObservacion(payload, {
      accion, observacion_id, origen_submodulo: origen_submodulo || 'DEC', usuario,
    });
    if (accionObs) {
      await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);
      const row = (await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId])).rows[0];
      return res.json({ success: true, requerimiento: enrichRequerimientoRow(row) });
    }

    if (!motivo) return res.status(400).json({ success: false, error: 'Motivo requerido' });

    emitirObservacion(payload, {
      motivo,
      gerente: usuario || 'dec',
      origen: 'DEC',
      origen_submodulo: origen_submodulo || 'DEC',
      destino_submodulo: destino_submodulo || 'Registro de Requerimiento',
      destino_etapa: destino_etapa || 'REGISTRADO',
      destino_persona: destino_persona || '',
      observacion_padre_id: observacion_padre_id || observacionPadreId || null,
    });
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const etapaDestObs = String(destino_etapa || submoduloLabelToEtapa(destino_submodulo) || 'REGISTRADO').toUpperCase();
    const estadoNuevo = destino_submodulo || destino_etapa
      ? resolveEstadoFromDestino(destino_submodulo, destino_etapa)
      : 'Observado DEC';
    const responsable = resolveResponsableFromDestino(destino_submodulo, destino_persona, etapaDestObs);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo,
      usuario: usuario || 'DEC',
      accion: 'observado',
      observacion: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
      responsable,
      etapaEjecutor: 'DEC',
      etapaDestinoEvento: etapaDestObs,
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

router.get('/programacion', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const result = await listarBandejaProgramacion(page, pageSize, req.query);
    res.json(result);
  } catch (err) { next(err); }
});

router.put('/programacion/aprobar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { usuario } = req.body || {};
    const reqCheck = await query(
      `SELECT id, payload FROM requerimientos WHERE id = $1 AND estado IN ('Aprobado DEC', 'En Programación')`,
      [requerimientoId],
    );
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado o estado inválido' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (!Array.isArray(payload.historial_programacion)) payload.historial_programacion = [];
    payload.historial_programacion.push({ tipo: 'aprobacion_programacion', usuario: usuario || '', fecha: new Date().toISOString() });
    autoCerrarObservacionesEmisorAlContinuar(payload, 'Programación', usuario || 'Programación');
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo: 'Programado',
      usuario: usuario || 'Programación',
      accion: 'aprobado',
      observacion: 'Aprobado en Programación — derivado a Coordinación CM',
      responsable: ETAPAS.ACTOS_PREPARATORIOS.responsable,
      etapaEjecutor: 'PROGRAMACION',
      etapaDestino: 'ACTOS_PREPARATORIOS',
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

router.put('/programacion/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const {
      motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo,
      accion, observacion_id, observacion_padre_id, observacionPadreId,
    } = req.body || {};

    const reqCheck = await query('SELECT id, payload, estado FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}

    const accionObs = procesarAccionObservacion(payload, {
      accion, observacion_id, origen_submodulo: origen_submodulo || 'Programación', usuario,
    });
    if (accionObs) {
      await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);
      const row = (await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId])).rows[0];
      return res.json({ success: true, requerimiento: enrichRequerimientoRow(row) });
    }

    if (!motivo) return res.status(400).json({ success: false, error: 'Motivo requerido' });

    appendObservacion(payload, {
      motivo,
      gerente: usuario || 'Programación',
      origen: 'PROGRAMACIÓN',
      origen_submodulo: origen_submodulo || 'Programación',
      destino_submodulo: destino_submodulo || '',
      destino_etapa: destino_etapa || '',
      destino_persona: destino_persona || '',
      observacion_padre_id: observacion_padre_id || observacionPadreId || null,
    });
    await query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [requerimientoId, JSON.stringify(payload)]);

    const etapaDestObs = String(destino_etapa || submoduloLabelToEtapa(destino_submodulo) || 'REGISTRADO').toUpperCase();
    const estadoNuevo = destino_submodulo || destino_etapa
      ? resolveEstadoFromDestino(destino_submodulo, destino_etapa)
      : 'Observado Programación';
    const responsable = resolveResponsableFromDestino(destino_submodulo, destino_persona, etapaDestObs);

    const updated = await registrarMovimiento({
      requerimientoId,
      estadoNuevo,
      usuario: usuario || 'Programación',
      accion: 'observado',
      observacion: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
      responsable,
      etapaEjecutor: 'PROGRAMACION',
      etapaDestinoEvento: etapaDestObs,
    });

    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

// ==================== ACTOS PREPARATORIOS ====================

router.get('/actos/usuarios', async (req, res, next) => {
  try {
    const perfil = (req.query.perfil || '').trim();
    const submodulo = (req.query.submodulo || '').trim();
    const search = (req.query.search || '').trim();
    if (submodulo) {
      const data = await listUsuariosPorSubmodulo(submodulo, search);
      return res.json({ data });
    }
    const data = await listUsuariosPerfilActos(perfil, submodulo);
    res.json({ data });
  } catch (err) { next(err); }
});

router.get('/actos', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || '200', 10)));
    const soloMios = req.query.solo_mios === '1' || req.query.solo_mios === 'true';
    const miEquipo = req.query.mi_equipo === '1' || req.query.mi_equipo === 'true';
    const usuarioNombre = req.headers['x-user-name'] || req.query.usuario || '';
    const result = await listarBandejaActos(page, pageSize, req.query, {
      soloAsignadosA: soloMios ? usuarioNombre : null,
      soloMiEquipo: miEquipo,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.put('/actos/asignar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { analista, usuario, submodulo_code, submodulo_label } = req.body || {};
    if (!analista) return res.status(400).json({ success: false, error: 'Analista destino requerido' });
    const updated = await asignarAnalistaActos(requerimientoId, {
      analista,
      usuario: usuario || COORDINADOR_ACTOS,
      submodulo_code,
      submodulo_label,
    });
    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado, responsable_actual: updated.responsable_actual } });
  } catch (err) { next(err); }
});

router.put('/actos/reasignar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { analista, usuario, submodulo_code, submodulo_label } = req.body || {};
    if (!analista) return res.status(400).json({ success: false, error: 'Analista destino requerido' });
    const updated = await reasignarActos(requerimientoId, {
      analista,
      usuario,
      submodulo_code,
      submodulo_label,
    });
    res.json({ success: true, requerimiento: updated });
  } catch (err) { next(err); }
});

router.put('/actos/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const updated = await observarActos(requerimientoId, req.body || {});
    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

router.put('/actos/derivar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const updated = await derivarActos(requerimientoId, req.body || {});
    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } });
  } catch (err) { next(err); }
});

router.put('/actos/aprobar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const { responsable_destino, usuario } = req.body || {};
    if (!responsable_destino) return res.status(400).json({ success: false, error: 'Responsable destino en Invitaciones requerido' });
    const updated = await aprobarActosInvitaciones(requerimientoId, { responsableDestino: responsable_destino, usuario });
    res.json({ success: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado, estado_actual: updated.estado_actual } });
  } catch (err) { next(err); }
});

export default router;
