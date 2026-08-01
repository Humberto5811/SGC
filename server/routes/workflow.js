/**
 * Rutas del Workflow Engine — FASE BASE.
 *
 * Seguras:
 *   GET  /api/workflow/ubicacion/:expedienteId
 *   GET  /api/workflow/estados/:expedienteId
 *   GET  /api/workflow/transiciones-permitidas/:expedienteId
 *   POST /api/workflow/simular
 *
 * Escritura (NO productiva):
 *   POST /api/workflow/transiciones
 *   → responde 503 si WORKFLOW_ENGINE_WRITE_ENABLED !== 'true'.
 *
 * No conecta vistas ni rutas productivas.
 */
import express from 'express';
import {
  getWorkflowActual,
  getWorkflowEstados,
  simulateTransition,
  executeTransition,
  assertWriteEnabled,
} from '../lib/workflow/workflowEngine.js';
import { getAllowedTransitions } from '../../shared/workflow/transiciones.js';
import { leerFlags } from '../lib/workflow/workflowGuards.js';
import { resolverEtapaLegacy } from '../lib/workflow/workflowCompatibility.js';
import { tipoDeRequerimiento, getRequerimientoById } from '../lib/workflow/workflowRepository.js';

const router = express.Router();

/** GET /api/workflow/ubicacion/:expedienteId */
router.get('/ubicacion/:expedienteId', async (req, res, next) => {
  try {
    const id = parseInt(req.params.expedienteId, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'expedienteId inválido' });
    }
    const result = await getWorkflowActual(id);
    if (!result) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    res.json({ ...result.contrato, advertencias: result.advertencias });
  } catch (err) {
    next(err);
  }
});

/** GET /api/workflow/estados/:expedienteId */
router.get('/estados/:expedienteId', async (req, res, next) => {
  try {
    const id = parseInt(req.params.expedienteId, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'expedienteId inválido' });
    }
    const result = await getWorkflowEstados(id);
    if (!result) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    res.json({ ...result.contrato, advertencias: result.advertencias });
  } catch (err) {
    next(err);
  }
});

/** GET /api/workflow/transiciones-permitidas/:expedienteId */
router.get('/transiciones-permitidas/:expedienteId', async (req, res, next) => {
  try {
    const id = parseInt(req.params.expedienteId, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'expedienteId inválido' });
    }
    const flags = leerFlags();
    const row = await getRequerimientoById(id);
    if (!row) {
      return res.status(404).json({ error: 'Expediente no encontrado' });
    }
    const tipo = tipoDeRequerimiento(row) || '';
    const etapa = resolverEtapaLegacy(row).etapa || '';
    const all = getAllowedTransitions({ tipoContratacion: tipo, etapaOrigen: etapa });
    const permitidas = all
      .filter((t) => {
        if (!t.feature_flag) return true;
        return flags[t.feature_flag] === true;
      })
      .map((t) => ({
        evento_codigo: t.evento_codigo,
        etapa_destino: t.etapa_destino,
        cambia_ubicacion: t.cambia_ubicacion,
        permiso: t.permiso,
        responsable_destino: t.responsable_destino,
      }));
    res.json({ expediente_id: id, etapa_actual: etapa, tipo_contratacion: tipo, transiciones: permitidas });
  } catch (err) {
    next(err);
  }
});

/** POST /api/workflow/simular — simulación pura, sin escritura. */
router.post('/simular', async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!body.tipo_contratacion || !body.evento) {
      return res.status(400).json({ error: 'tipo_contratacion y evento son obligatorios' });
    }
    const flags = leerFlags();
    // Para /simular el actor recibido es SOLO contexto de simulación.
    // Si además hay sesión autenticada (req.user), sus id/rol tienen prioridad.
    const actorSimulacion = req.user
      ? { id: req.user.id, rol: req.user.rol }
      : (body.actor && typeof body.actor === 'object' ? body.actor : null);
    const result = await simulateTransition({
      tipo_contratacion: body.tipo_contratacion,
      etapa_actual: body.etapa_actual || null,
      estados_dominio: body.estados_dominio || {},
      evento: body.evento,
      actor: actorSimulacion,
      actor_id: body.actor_id,
      actor_rol: body.actor_rol,
      documentos: body.documentos || [],
      metadata: body.metadata || {},
      flags,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/workflow/transiciones — NO habilitado productivamente.
 * Solo responde si WORKFLOW_ENGINE_WRITE_ENABLED === 'true'.
 */
router.post('/transiciones', async (req, res, next) => {
  try {
    const flags = leerFlags();
    assertWriteEnabled(flags);
    const body = req.body || {};
    if (!body.expediente_id || !body.evento) {
      return res.status(400).json({ error: 'expediente_id y evento son obligatorios' });
    }
    // Escritura productiva: actor SIEMPRE desde req.user (nunca del cuerpo del cliente).
    // normalizarActor en el motor da prioridad absoluta a `user`.
    const result = await executeTransition(
      {
        expediente_id: body.expediente_id,
        tipo_contratacion: body.tipo_contratacion,
        evento: body.evento,
        idempotency_key: body.idempotency_key,
        user: req.user || null,
        actor: body.actor,
        actor_id: body.actor_id,
        actor_rol: body.actor_rol,
        permiso: body.permiso,
        metadata: body.metadata || {},
        domainMutator: null,
      },
      flags,
    );
    res.json(result);
  } catch (err) {
    if (err?.code === 'WORKFLOW_WRITE_DISABLED' || err?.message?.includes('WORKFLOW_FEATURE_DISABLED')) {
      return res.status(503).json({ error: 'feature disabled', code: err.code || 'WORKFLOW_FEATURE_DISABLED' });
    }
    if (err?.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
    if (err?.code === 'TRANSITION_NOT_FOUND') return res.status(409).json({ error: err.message });
    if (err?.code === 'PERMISSION_DENIED') return res.status(403).json({ error: err.message });
    next(err);
  }
});

export default router;