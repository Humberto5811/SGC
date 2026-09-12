// Rutas para el módulo Contrataciones (DEC y Programación)
import express from 'express';
import { query } from '../db.js';
import {
  TRAZA_EXTRA_SELECT,
  enrichRequerimientoRow,
  enrichRequerimientoRowsWithCcp,
  buildListFilters,
  ETAPAS,
} from '../lib/trazabilidad.js';
import { formatObservacionTraza, resolveResponsableFromDestino, submoduloLabelToEtapa } from '../lib/observacionDestino.js';
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
import { listarBandejaDEC, WHERE_BANDEJA_DEC } from '../lib/decBandeja.js';
import {
  REQUERIMIENTO_BANDEJA_FROM,
  REQUERIMIENTO_BANDEJA_EXTRA_SELECT,
} from '../lib/bandejaRequerimientoSql.js';
import { runWorkflowTransition } from '../lib/workflow/workflowIntegration.js';
import { transicionarExpediente } from '../lib/expedienteTransicion.js';
import { getObservacionesAbiertas } from '../../shared/observacionesMotor.js';

/**
 * Fase 1B — domainMutator para transiciones del tramo DEC/Programación.
 * Con motor activo, actualiza SOLO el payload histórico legacy (para que los
 * lectores de bandeja no se rompan) usando el MISMO tx del motor. NO llama a
 * registrarMovimiento (el motor escribirá workflow_eventos + historial_movimientos).
 */
function buildTramo1bPayloadMutator({ accionHistorial, submoduloLabel, camposExtras = {} }) {
  return async function payloadMutator(client, { expediente_id, row }) {
    let payload = {};
    try { payload = JSON.parse(row?.payload || '{}'); } catch (_) { payload = {}; }
    const now = new Date().toISOString();
    const arrayKey = accionHistorial; // historial_dec | historial_programacion | historial_actos
    if (!Array.isArray(payload[arrayKey])) payload[arrayKey] = [];
    payload[arrayKey].push({
      ...(camposExtras.entrada || {}),
      tipo: camposExtras.tipo,
      usuario: camposExtras.usuario || '',
      fecha: now,
    });
    // Arrays históricos adicionales (compat legacy, misma transacción).
    // Ej.: aprobar Coordinación CM agregaba también payload.historial_invitaciones
    // (ingreso_invitaciones) que la vista de Invitaciones usa para detectar ingreso.
    for (const [arrayExtra, entradaExtra] of Object.entries(camposExtras.arraysExtras || {})) {
      if (!Array.isArray(payload[arrayExtra])) payload[arrayExtra] = [];
      payload[arrayExtra].push({ ...entradaExtra, fecha: now });
    }
    // Cerrar observaciones del submódulo al continuar (mismo comportamiento legacy).
    await import('../lib/observacionesWorkflow.js').then(({ autoCerrarObservacionesEmisorAlContinuar }) => {
      autoCerrarObservacionesEmisorAlContinuar(payload, submoduloLabel, camposExtras.usuario || 'Sistema');
    });
    await client.query(
      'UPDATE requerimientos SET payload = $2, updated_at = NOW() WHERE id = $1',
      [Number(expediente_id), JSON.stringify(payload)],
    );
    return { compat_payload_actualizado: true };
  };
}

/** Fase 1B — respuestas compatibles: motor añade workflow+evento sin romper consumidores. */
function responderTransicionMotor(res, result, requerimientoId) {
  if (result.ok !== true) {
    return res.status(result.error ? 409 : 200).json({ success: false, error: result.error || 'Transición no permitida' });
  }
  if (result.evento) {
    return res.json({
      success: true,
      requerimiento: {
        id: result.data?.id ?? Number(requerimientoId),
        codigo: result.data?.codigo ?? null,
        estado: result.data?.estado ?? result.data?.estado_actual ?? null,
        estado_actual: result.data?.estado_actual ?? null,
      },
      workflow: result.workflow || undefined,
      evento: result.evento,
    });
  }
  return res.json({ success: true, requerimiento: result.requerimiento });
}

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
    data: await enrichRequerimientoRowsWithCcp(result.rows || []),
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

/** RC8.17.3B — candidatos PERSONA para observación DEC (sin guard org-scope de requerimientos). */
router.get('/dec/candidatos-observacion-destino/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const rid = parseInt(requerimientoId, 10);
    if (!Number.isFinite(rid) || rid <= 0) {
      return res.status(400).json({ ok: false, error: 'requerimientoId inválido' });
    }
    const { rows } = await query(
      `SELECT r.id ${REQUERIMIENTO_BANDEJA_FROM} WHERE r.id = $1 AND ${WHERE_BANDEJA_DEC}`,
      [rid],
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Expediente no encontrado en bandeja DEC' });
    }
    const destinoSubmodulo = req.query.destino_submodulo || req.query.destinoSubmodulo || '';
    const { listarCandidatosObservacionDestino, esDestinoObservacionDecSoportado } =
      await import('../lib/candidatosObservacionDestino.js');
    if (destinoSubmodulo && !esDestinoObservacionDecSoportado(destinoSubmodulo)) {
      return res.status(400).json({
        ok: false,
        error: 'Destino no permitido desde DEC (solo Registro, Evaluación o Programación)',
      });
    }
    const data = await listarCandidatosObservacionDestino({
      requerimientoId: rid,
      destinoSubmodulo,
      search: req.query.q || req.query.search || '',
    });
    res.json({ ok: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
    next(err);
  }
});

router.put('/dec/aprobar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const {
      usuario,
      usuario_destino_id: usuarioDestinoIdBody,
      responsable_recomendado_id: responsableRecomendadoIdBody,
      reasignacion_manual: reasignacionManualBody,
    } = req.body || {};
    const reqCheck = await query('SELECT id, payload, estado_actual FROM requerimientos WHERE id = $1', [requerimientoId]);
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    const usuarioDestinoId = usuarioDestinoIdBody != null && Number.isFinite(Number(usuarioDestinoIdBody))
      ? Number(usuarioDestinoIdBody)
      : null;
    if (!usuarioDestinoId) {
      return res.status(400).json({
        success: false,
        error: 'Debe seleccionar la persona responsable en Programación',
      });
    }

    const { assertUsuarioDestinoTransicionElegible } = await import('../lib/workflowTransicionResponsable.js');
    let elegible;
    try {
      elegible = await assertUsuarioDestinoTransicionElegible(
        requerimientoId,
        'DEC_APROBADO',
        usuarioDestinoId,
        reqCheck.rows[0],
      );
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ success: false, error: err.message, code: err.code });
      }
      throw err;
    }

    const responsableRecomendadoId = responsableRecomendadoIdBody != null
      && Number.isFinite(Number(responsableRecomendadoIdBody))
      ? Number(responsableRecomendadoIdBody)
      : (elegible.recomendado?.id ?? null);
    const reasignacionManual = reasignacionManualBody === true
      || (responsableRecomendadoId && usuarioDestinoId !== responsableRecomendadoId);

    const metaDerivacion = {
      usuario_destino_id: usuarioDestinoId,
      responsable_recomendado_id: responsableRecomendadoId,
      responsable_seleccionado_id: usuarioDestinoId,
      reasignacion_manual: reasignacionManual,
      etapa_origen: 'DEC',
      etapa_destino: 'PROGRAMACION',
      evento: 'DEC_APROBADO',
    };

    // Fase 1B — DEC_APROBADO: DEC → PROGRAMACION.
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_DEC',
      eventoCodigo: 'DEC_APROBADO',
      expedienteId: requerimientoId,
      req,
      metadata: {
        tipo_contratacion: req.body?.tipo_contratacion || 'BIEN',
        client_request_id: req.body?.client_request_id || null,
        observacion: 'DEC aprobado — derivado a Programación',
        ...metaDerivacion,
        unidad_destino: ETAPAS.PROGRAMACION.responsable,
      },
      domainMutator: buildTramo1bPayloadMutator({
        accionHistorial: 'historial_dec',
        submoduloLabel: 'DEC',
        camposExtras: { tipo: 'aprobacion_dec', usuario: usuario || 'DEC' },
      }),
      legacyHandler: async () => {
        let payload = {};
        try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
        if (!Array.isArray(payload.historial_dec)) payload.historial_dec = [];
        payload.historial_dec.push({ tipo: 'aprobacion_dec', usuario: usuario || '', fecha: new Date().toISOString() });
        autoCerrarObservacionesEmisorAlContinuar(payload, 'DEC', usuario || 'DEC');

        const tr = await transicionarExpediente({
          requerimientoId,
          evento: 'DEC_APROBADO',
          usuarioDestinoId,
          unidadDestino: ETAPAS.PROGRAMACION.responsable,
          motivo: 'Aprobado por DEC — derivado a Programación',
          metadata: {
            client_request_id: req.body?.client_request_id || `dec-aprobar:${requerimientoId}`,
            via: 'dec/aprobar:legacyHandler',
            ...metaDerivacion,
          },
          actorRol: usuario || 'DEC',
          domainMutator: async (tx) => {
            await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
              requerimientoId,
              JSON.stringify(payload),
            ]);
            return { historial_dec: true };
          },
        });
        const updated = tr.expediente;
        return { ok: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } };
      },
    });

    return responderTransicionMotor(res, result, requerimientoId);
  } catch (err) { next(err); }
});

router.put('/dec/observar/:requerimientoId', async (req, res, next) => {
  try {
    const { requerimientoId } = req.params;
    const {
      motivo, usuario, destino_submodulo, destino_etapa, destino_persona, origen_submodulo,
      usuario_destino_id: usuarioDestinoIdBody,
      responsable_recomendado_id: responsableRecomendadoIdBody,
      reasignacion_manual: reasignacionManualBody,
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

    const {
      mapDestinoSubmoduloAEtapaObservacion,
      esDestinoObservacionDecSoportado,
      assertUsuarioDestinoObservacionElegible,
    } = await import('../lib/candidatosObservacionDestino.js');

    const destinoSub = destino_submodulo || 'Registro de Requerimiento';
    const etapaDestObs = String(
      destino_etapa
      || mapDestinoSubmoduloAEtapaObservacion(destinoSub)
      || submoduloLabelToEtapa(destinoSub)
      || 'REGISTRO',
    ).toUpperCase().replace('REGISTRADO', 'REGISTRO');

    const usuarioDestinoId = usuarioDestinoIdBody != null && Number.isFinite(Number(usuarioDestinoIdBody))
      ? Number(usuarioDestinoIdBody)
      : (/^\d+$/.test(String(destino_persona || '').trim()) ? Number(destino_persona) : null);

    if (esDestinoObservacionDecSoportado(destinoSub)) {
      if (!usuarioDestinoId) {
        return res.status(400).json({
          success: false,
          error: 'Debe seleccionar la persona responsable de la subsanación',
        });
      }
      try {
        await assertUsuarioDestinoObservacionElegible(
          requerimientoId,
          destinoSub,
          usuarioDestinoId,
          reqCheck.rows[0],
        );
      } catch (err) {
        if (err.status) {
          return res.status(err.status).json({ success: false, error: err.message, code: err.code });
        }
        throw err;
      }
    }

    const responsableRecomendadoId = responsableRecomendadoIdBody != null
      && Number.isFinite(Number(responsableRecomendadoIdBody))
      ? Number(responsableRecomendadoIdBody)
      : null;
    const reasignacionManual = reasignacionManualBody === true
      || (usuarioDestinoId && responsableRecomendadoId && usuarioDestinoId !== responsableRecomendadoId);

    emitirObservacion(payload, {
      motivo,
      gerente: usuario || 'dec',
      origen: 'DEC',
      origen_submodulo: origen_submodulo || 'DEC',
      destino_submodulo: destinoSub,
      destino_etapa: etapaDestObs,
      destino_persona: destino_persona || '',
      usuario_destino_id: usuarioDestinoId,
      responsable_recomendado_id: responsableRecomendadoId,
      reasignacion_manual: reasignacionManual,
      observacion_padre_id: observacion_padre_id || observacionPadreId || null,
    });

    const responsable = resolveResponsableFromDestino(destinoSub, destino_persona, etapaDestObs);
    const metaObs = {
      client_request_id: req.body?.client_request_id || `dec-obs:${requerimientoId}`,
      via: 'dec/observar',
      etapa_origen: 'DEC',
      etapa_destino: etapaDestObs,
      evento: 'DEC_OBSERVADA',
      quien_subsana: destino_persona || responsable,
      usuario_destino_id: usuarioDestinoId,
      responsable_recomendado_id: responsableRecomendadoId,
      responsable_seleccionado_id: usuarioDestinoId,
      reasignacion_manual: reasignacionManual,
    };

    const tr = await transicionarExpediente({
      requerimientoId,
      evento: 'DEC_OBSERVADA',
      usuarioDestinoId,
      unidadDestino: usuarioDestinoId ? null : (responsable || null),
      motivo: formatObservacionTraza(motivo, { destino_persona, destino_submodulo: destinoSub }),
      metadata: metaObs,
      actorRol: usuario || 'DEC',
      domainMutator: async (tx) => {
        await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
          requerimientoId,
          JSON.stringify(payload),
        ]);
        return { observacion: true };
      },
    });
    const updated = tr.expediente;

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
    const {
      usuario,
      usuario_destino_id: usuarioDestinoIdBody,
      responsable_recomendado_id: responsableRecomendadoIdBody,
      reasignacion_manual: reasignacionManualBody,
    } = req.body || {};
    const reqCheck = await query(
      `SELECT id, payload, estado, estado_actual FROM requerimientos WHERE id = $1 AND estado IN ('Aprobado DEC', 'En Programación')`,
      [requerimientoId],
    );
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado o estado inválido' });

    const usuarioDestinoId = usuarioDestinoIdBody != null && Number.isFinite(Number(usuarioDestinoIdBody))
      ? Number(usuarioDestinoIdBody)
      : null;
    if (!usuarioDestinoId) {
      return res.status(400).json({
        success: false,
        error: 'Debe seleccionar la persona responsable en Coordinación CM',
      });
    }

    const { assertUsuarioDestinoTransicionElegible } = await import('../lib/workflowTransicionResponsable.js');
    let elegible;
    try {
      elegible = await assertUsuarioDestinoTransicionElegible(
        requerimientoId,
        'PROGRAMACION_APROBADA',
        usuarioDestinoId,
        reqCheck.rows[0],
      );
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ success: false, error: err.message, code: err.code });
      }
      throw err;
    }

    const responsableRecomendadoId = responsableRecomendadoIdBody != null
      && Number.isFinite(Number(responsableRecomendadoIdBody))
      ? Number(responsableRecomendadoIdBody)
      : (elegible.recomendado?.id ?? null);
    const reasignacionManual = reasignacionManualBody === true
      || (responsableRecomendadoId && usuarioDestinoId !== responsableRecomendadoId);

    const metaDerivacion = {
      usuario_destino_id: usuarioDestinoId,
      responsable_recomendado_id: responsableRecomendadoId,
      responsable_seleccionado_id: usuarioDestinoId,
      reasignacion_manual: reasignacionManual,
      etapa_origen: 'PROGRAMACION',
      etapa_destino: 'COORDINACION_CM',
      evento: 'PROGRAMACION_APROBADA',
    };

    // Fase 1B — Guards mínimos de Programación (igual para legacy y motor).
    const { rows: pedidos } = await query(
      'SELECT 1 FROM requerimiento_pedidos WHERE requerimiento_id = $1 LIMIT 1',
      [requerimientoId],
    );
    if (!pedidos.length) return res.status(409).json({ success: false, error: 'Debe asociar al menos un pedido SIGAMEF' });

    let payload = {};
    try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
    if (getObservacionesAbiertas(payload).length > 0) {
      return res.status(409).json({ success: false, error: 'Existen observaciones abiertas que impiden aprobar' });
    }

    // Fase 1B — PROGRAMACION_APROBADA: PROGRAMACION → COORDINACION_CM.
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_PROGRAMACION',
      eventoCodigo: 'PROGRAMACION_APROBADA',
      expedienteId: requerimientoId,
      req,
      metadata: {
        tipo_contratacion: req.body?.tipo_contratacion || 'BIEN',
        client_request_id: req.body?.client_request_id || null,
        observacion: 'Programación aprobada — derivado a Coordinación CM',
        ...metaDerivacion,
        unidad_destino: ETAPAS.COORDINACION_CM?.responsable || 'Coordinador de Contratos Menores',
      },
      domainMutator: buildTramo1bPayloadMutator({
        accionHistorial: 'historial_programacion',
        submoduloLabel: 'Programación',
        camposExtras: { tipo: 'aprobacion_programacion', usuario: usuario || 'Programación' },
      }),
      legacyHandler: async () => {
        let payload = {};
        try { payload = JSON.parse(reqCheck.rows[0].payload || '{}'); } catch (_) {}
        if (!Array.isArray(payload.historial_programacion)) payload.historial_programacion = [];
        payload.historial_programacion.push({ tipo: 'aprobacion_programacion', usuario: usuario || '', fecha: new Date().toISOString() });
        autoCerrarObservacionesEmisorAlContinuar(payload, 'Programación', usuario || 'Programación');

        const tr = await transicionarExpediente({
          requerimientoId,
          evento: 'PROGRAMACION_APROBADA',
          usuarioDestinoId,
          unidadDestino: ETAPAS.COORDINACION_CM?.responsable || 'Coordinador de Contratos Menores',
          motivo: 'Aprobado en Programación — derivado a Coordinación CM',
          metadata: {
            client_request_id: req.body?.client_request_id || `prog-aprobar:${requerimientoId}`,
            via: 'programacion/aprobar:legacyHandler',
            ...metaDerivacion,
          },
          actorRol: usuario || 'Programación',
          domainMutator: async (tx) => {
            await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
              requerimientoId,
              JSON.stringify(payload),
            ]);
            return { historial_programacion: true };
          },
        });
        const updated = tr.expediente;
        return { ok: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado } };
      },
    });

    return responderTransicionMotor(res, result, requerimientoId);
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

    const etapaDestObs = String(destino_etapa || submoduloLabelToEtapa(destino_submodulo) || 'REGISTRO').toUpperCase();
    const responsable = resolveResponsableFromDestino(destino_submodulo, destino_persona, etapaDestObs);
    const uid = /^\d+$/.test(String(destino_persona || '').trim()) ? Number(destino_persona) : null;

    const tr = await transicionarExpediente({
      requerimientoId,
      evento: 'PROGRAMACION_OBSERVADA',
      usuarioDestinoId: uid,
      unidadDestino: uid ? null : (responsable || null),
      motivo: formatObservacionTraza(motivo, { destino_persona, destino_submodulo }),
      metadata: {
        client_request_id: req.body?.client_request_id || `prog-obs:${requerimientoId}`,
        via: 'programacion/observar',
        etapa_destino: etapaDestObs,
        quien_subsana: destino_persona || responsable,
      },
      actorRol: usuario || 'Programación',
      domainMutator: async (tx) => {
        await tx.query('UPDATE requerimientos SET payload = $2::jsonb WHERE id = $1', [
          requerimientoId,
          JSON.stringify(payload),
        ]);
        return { observacion: true };
      },
    });
    const updated = tr.expediente;

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
    const {
      responsable_destino,
      usuario,
      usuario_destino_id: usuarioDestinoIdBody,
      responsable_recomendado_id: responsableRecomendadoIdBody,
      reasignacion_manual: reasignacionManualBody,
    } = req.body || {};

    const reqCheck = await query(
      'SELECT id, payload, estado, estado_actual FROM requerimientos WHERE id = $1',
      [requerimientoId],
    );
    if (!reqCheck.rowCount) return res.status(404).json({ success: false, error: 'No encontrado' });

    let usuarioDestinoId = usuarioDestinoIdBody != null && Number.isFinite(Number(usuarioDestinoIdBody))
      ? Number(usuarioDestinoIdBody)
      : null;
    if (!usuarioDestinoId && responsable_destino && /^\d+$/.test(String(responsable_destino).trim())) {
      usuarioDestinoId = Number(responsable_destino);
    }
    if (!usuarioDestinoId) {
      return res.status(400).json({
        success: false,
        error: 'Debe seleccionar la persona responsable en Invitaciones',
      });
    }

    const { assertUsuarioDestinoTransicionElegible } = await import('../lib/workflowTransicionResponsable.js');
    let elegible;
    try {
      elegible = await assertUsuarioDestinoTransicionElegible(
        requerimientoId,
        'COORDINACION_CM_APROBADA',
        usuarioDestinoId,
        reqCheck.rows[0],
      );
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ success: false, error: err.message, code: err.code });
      }
      throw err;
    }

    const responsableRecomendadoId = responsableRecomendadoIdBody != null
      && Number.isFinite(Number(responsableRecomendadoIdBody))
      ? Number(responsableRecomendadoIdBody)
      : (elegible.recomendado?.id ?? null);
    const reasignacionManual = reasignacionManualBody === true
      || (responsableRecomendadoId && usuarioDestinoId !== responsableRecomendadoId);

    const metaDerivacion = {
      usuario_destino_id: usuarioDestinoId,
      responsable_recomendado_id: responsableRecomendadoId,
      responsable_seleccionado_id: usuarioDestinoId,
      reasignacion_manual: reasignacionManual,
      etapa_origen: 'COORDINACION_CM',
      etapa_destino: 'INVITACIONES',
      evento: 'COORDINACION_CM_APROBADA',
    };

    // Fase 1B — COORDINACION_CM_APROBADA: COORDINACION_CM → INVITACIONES.
    const result = await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_COORDINACION_CM',
      eventoCodigo: 'COORDINACION_CM_APROBADA',
      expedienteId: requerimientoId,
      req,
      metadata: {
        tipo_contratacion: req.body?.tipo_contratacion || 'BIEN',
        client_request_id: req.body?.client_request_id || null,
        ...metaDerivacion,
        observacion: 'Coordinación CM aprobada — derivado a Invitaciones',
      },
      domainMutator: buildTramo1bPayloadMutator({
        accionHistorial: 'historial_actos',
        submoduloLabel: 'Coordinación CM',
        camposExtras: {
          tipo: 'aprobacion_invitaciones',
          usuario: usuario || 'Coordinador de Contratos Menores',
          entrada: { responsable_destino: usuarioDestinoId },
          // La vista de Invitaciones detecta el ingreso vía historial_invitaciones.
          arraysExtras: {
            historial_invitaciones: {
              tipo: 'ingreso_invitaciones',
              usuario: usuario || 'Coordinador de Contratos Menores',
            },
          },
        },
      }),
      legacyHandler: async () => {
        const updated = await aprobarActosInvitaciones(requerimientoId, {
          responsableDestino: usuarioDestinoId,
          usuario,
          usuarioDestinoId,
          ...metaDerivacion,
        });
        return { ok: true, requerimiento: { id: updated.id, codigo: updated.codigo, estado: updated.estado, estado_actual: updated.estado_actual } };
      },
    });

    return responderTransicionMotor(res, result, requerimientoId);
  } catch (err) { next(err); }
});

export default router;
