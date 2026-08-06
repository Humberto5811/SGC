/**
 * Workflow Engine — motor transaccional del Workflow SGC.
 *
 * Esta fase NO conecta rutas productivas al motor. executeTransition existe y
 * se prueba con fixtures/BD de prueba (WORKFLOW_ENGINE_WRITE_ENABLED=false).
 *
 * Flujo executeTransition:
 * 1. abrir transacción si no recibe client;
 * 2. SELECT requerimiento FOR UPDATE;
 * 3. leer estado_actual desde BD;
 * 4. obtener tipo de contratación;
 * 5. obtener transición desde catálogo;
 * 6. validar evento;
 * 7. validar actor/permiso;
 * 8. validar idempotencia;
 * 9. ejecutar domainMutator solo si fue proporcionado;
 * 10. actualizar estado_actual únicamente si cambia_ubicacion=true;
 * 11. actualizar sub_modulo_actual;
 * 12. actualizar responsable_actual;
 * 13. actualizar fecha_estado_actual;
 * 14. insertar workflow_eventos;
 * 15. agregar historial_movimientos;
 * 16. commit;
 * 17. rollback ante cualquier error.
 */
import { getTransition } from '../../../shared/workflow/transiciones.js';
import { getEtapaMeta } from '../../../shared/workflow/etapas.js';
import { validarTransicion, FEATURE_FLAGS_DEFAULT } from './workflowValidator.js';
import { simularTransicion } from './workflowSimulator.js';
import { withTransaction } from './workflowTransaction.js';
import {
  getRequerimientoById,
  getExistingEventByIdempotencyKey,
  getDomainStates,
  tipoDeRequerimiento,
  etapaDeRequerimiento,
} from './workflowRepository.js';
import { validarPermiso } from './workflowGuards.js';
import { resolverEtapaLegacy } from './workflowCompatibility.js';
import { buildContratoUbicacion, buildContratoEstados, normalizarActor } from '../../../shared/workflow/workflowContract.js';

/** Verifica flag de escritura global. */
export function assertWriteEnabled(flags = {}) {
  const enabled = flags.WORKFLOW_ENGINE_WRITE_ENABLED === true;
  if (!enabled) {
    const err = new Error('WORKFLOW_ENGINE_WRITE_ENABLED=false');
    err.code = 'WORKFLOW_WRITE_DISABLED';
    throw err;
  }
}

/**
 * Lee la ubicación vigente de un expediente.
 * @returns Contrato A (ubicación) + advertencias de compatibilidad.
 */
export async function getWorkflowActual(expedienteId, client = null) {
  const row = await getRequerimientoById(expedienteId, client);
  if (!row) return null;

  const tipo = tipoDeRequerimiento(row);
  const etapaLegacy = resolverEtapaLegacy(row);
  const etapa = etapaLegacy.etapa || etapaDeRequerimiento(row) || 'REGISTRO';
  const meta = getEtapaMeta(etapa) || getEtapaMeta('REGISTRO');

  return {
    contrato: buildContratoUbicacion({
      expediente_id: Number(row.expediente_id),
      tipo_contratacion: tipo || null,
      etapa_codigo: meta.codigo,
      etapa_label: meta.label,
      submodulo_codigo: meta.submoduloCodigo,
      submodulo_label: meta.submoduloLabel,
      responsable_codigo: meta.responsableCodigo,
      responsable_label: meta.responsableLabel,
      actualizado_en: row.fecha_estado_actual || row.updated_at || row.created_at || null,
    }),
    advertencias: etapaLegacy.advertencias || [],
  };
}

/**
 * Lee los estados por dominio de un expediente.
 * @returns Contrato B (estados).
 */
export async function getWorkflowEstados(expedienteId, opts = {}, client = null) {
  const row = await getRequerimientoById(expedienteId, client);
  if (!row) return null;

  const tipo = tipoDeRequerimiento(row);
  const etapaLegacy = resolverEtapaLegacy(row);
  const etapa = etapaLegacy.etapa || etapaDeRequerimiento(row) || 'REGISTRO';
  const meta = getEtapaMeta(etapa) || getEtapaMeta('REGISTRO');

  const domainStates = await getDomainStates(expedienteId, { ...opts, row }, client);

  return {
    contrato: buildContratoEstados({
      tipo_contratacion: tipo || null,
      etapa_codigo: meta.codigo,
      etapa_label: meta.label,
      submodulo_codigo: meta.submoduloCodigo,
      submodulo_label: meta.submoduloLabel,
      responsable_codigo: meta.responsableCodigo,
      responsable_label: meta.responsableLabel,
      domainStates,
    }),
    advertencias: etapaLegacy.advertencias || [],
    domainStates,
  };
}

/** Valida una transición (lectura, sin escribir). */
export async function validateTransition(context = {}, flags = {}) {
  return validarTransicion({ ...context, flags });
}

/** Simula una transición (sin escrituras, sin BD obligatoria). */
export async function simulateTransition(context = {}) {
  return simularTransicion(context);
}

/**
 * Ejecuta una transición de forma transaccional.
 *
 * @param {object} context
 * @param {string} context.tipo_contratacion
 * @param {string} context.evento
 * @param {number} context.expediente_id
 * @param {string} [context.idempotency_key]
 * @param {string|number} [context.actor_id]
 * @param {string} [context.actor_rol]
 * @param {string} [context.permiso]
 * @param {object} [context.metadata]
 * @param {Function} [context.domainMutator] — async (client, { expediente_id, transicion, contexto }) => results
 * @param {object} [flags]
 * @returns {Promise<{ evento, expediente_actualizado, contrato }>}
 */
export async function executeTransition(context = {}, flags = {}, client = null) {
  const fl = { ...FEATURE_FLAGS_DEFAULT, ...(flags || {}) };
  assertWriteEnabled(fl);
  // Normalización de actor: `req.user` (si viene en `context.user`) tiene prioridad
  // absoluta; nunca se confía en actor.id/rol del cliente para autorización productiva.
  const actorNormalizado = normalizarActor(context);

  return withTransaction(async (tx) => {
    // 2. SELECT FOR UPDATE
    const { rows: lockRows } = await tx.query(
      'SELECT * FROM requerimientos WHERE id = $1 FOR UPDATE',
      [context.expediente_id],
    );
    if (!lockRows.length) {
      const err = new Error('Requerimiento no encontrado');
      err.code = 'NOT_FOUND';
      throw err;
    }
    const row = lockRows[0];

    // 8. Idempotencia PRIMERO (replay con la misma key debe devolver el evento
    // original aunque la etapa ya haya avanzado).
    if (!context.idempotency_key) {
      const err = new Error('idempotency_key es obligatoria en escritura');
      err.code = 'IDEMPOTENCY_REQUIRED';
      throw err;
    }
    const idemKey = context.idempotency_key;
    const previo = await getExistingEventByIdempotencyKey(idemKey, tx);
    if (previo) {
      return {
        idempotente: true,
        evento: previo,
        expediente_actualizado: row,
        contrato: await buildContratoDesdeRow(row),
      };
    }

    // 3-4. estado_actual + tipo desde BD
    const tipo = tipoDeRequerimiento(row) || String(context.tipo_contratacion || '').toUpperCase();
    const etapaVigente = etapaDeRequerimiento(row) || 'REGISTRO';

    // 5-7. Transición desde catálogo + validación de evento/permiso (nunca destino del cliente).
    // Si no existe desde la etapa vigente, se intenta el origen de creación (null → '')
    // para eventos como REQUERIMIENTO_REGISTRADO que se emiten justo tras el INSERT
    // (la etapa vigente en BD ya es REGISTRO). Mismo comportamiento con PostgreSQL real.
    const evento = String(context.evento || '').trim().toUpperCase();
    let transicion = getTransition({ tipoContratacion: tipo, etapaOrigen: etapaVigente, eventoCodigo: evento });
    if (!transicion && etapaVigente === 'REGISTRO') {
      transicion = getTransition({ tipoContratacion: tipo, etapaOrigen: '', eventoCodigo: evento });
    }
    if (!transicion) {
      const err = new Error(`Transición no existe: ${tipo} ${etapaVigente} ${evento}`);
      err.code = 'TRANSITION_NOT_FOUND';
      throw err;
    }

    const permisoCheck = validarPermiso(transicion, { ...context, actor_id: actorNormalizado.id, actor_rol: actorNormalizado.rol });
    if (!permisoCheck.valido) {
      const err = new Error(permisoCheck.error);
      err.code = 'PERMISSION_DENIED';
      throw err;
    }

    // RC8.6A.1 — dueño único de persistencia: transicionarExpediente (misma tx).
    // El motor solo validó permiso/catálogo; no escribe estado/asignación por su cuenta.
    const { transicionarExpediente } = await import('../expedienteTransicion.js');
    const uidDest = context.usuario_destino_id
      ?? context.metadata?.usuario_destino_id
      ?? null;
    const unidadDest = context.unidad_destino
      || context.metadata?.unidad_destino
      || null;
    const wrappedMutator = context.domainMutator
      ? async (clientTx, ctx) => context.domainMutator(clientTx, {
        expediente_id: context.expediente_id,
        transicion: ctx.transicion || transicion,
        contexto: context,
        row: ctx.row || row,
        ...ctx,
      })
      : null;

    const result = await transicionarExpediente({
      requerimientoId: context.expediente_id,
      evento,
      usuarioOrigenId: actorNormalizado.id ?? null,
      usuarioDestinoId: uidDest,
      unidadDestino: unidadDest
        || (!uidDest ? (context.responsable_destino || transicion.responsable_destino || null) : null),
      motivo: context.metadata?.observacion || context.metadata?.motivo || '',
      metadata: {
        ...(context.metadata || {}),
        idempotency_key: idemKey,
        tipo_contratacion: tipo,
        via: 'executeTransition→transicionarExpediente',
        permiso: transicion.permiso,
        guard_codigo: transicion.guard_codigo,
      },
      actorRol: actorNormalizado.rol || context.actor_rol || 'SISTEMA',
      domainMutator: wrappedMutator,
      client: tx,
    });

    return {
      idempotente: !!result.idempotente,
      evento: result.evento,
      expediente_actualizado: result.expediente,
      contrato: await buildContratoDesdeRow(result.expediente || row),
      domain_results: result.domain_results,
      dueno_persistencia: result.dueno_persistencia || 'transicionarExpediente',
    };
  }, client);
}

async function buildContratoDesdeRow(row) {
  const tipo = tipoDeRequerimiento(row);
  const etapa = etapaDeRequerimiento(row) || 'REGISTRO';
  const meta = getEtapaMeta(etapa) || getEtapaMeta('REGISTRO');
  return buildContratoUbicacion({
    expediente_id: Number(row.id),
    tipo_contratacion: tipo || null,
    etapa_codigo: meta.codigo,
    etapa_label: meta.label,
    submodulo_codigo: meta.submoduloCodigo,
    submodulo_label: meta.submoduloLabel,
    responsable_codigo: meta.responsableCodigo,
    responsable_label: meta.responsableLabel,
    actualizado_en: row.fecha_estado_actual || row.updated_at || row.created_at || null,
  });
}

/** Verifica flag de módulo (handler general). */
export function assertWorkflowEnabled(moduleName, flags = {}) {
  const fl = { ...FEATURE_FLAGS_DEFAULT, ...(flags || {}) };
  const flagMap = {
    BASE: 'WORKFLOW_ENGINE_BASE',
    INVITACIONES: 'WORKFLOW_ENGINE_INVITACIONES',
    VALIDACIONES: 'WORKFLOW_ENGINE_VALIDACIONES',
    CUADRO: 'WORKFLOW_ENGINE_CUADRO',
    REGISTRO: 'WORKFLOW_ENGINE_REGISTRO',
    ORDENES: 'WORKFLOW_ENGINE_ORDENES',
    VIATICOS: 'WORKFLOW_ENGINE_VIATICOS',
  };
  const flag = flagMap[String(moduleName || '').toUpperCase()] || 'WORKFLOW_ENGINE_BASE';
  if (fl[flag] === true) return true;
  const err = new Error(`WORKFLOW_FEATURE_DISABLED:${flag}`);
  err.code = 'WORKFLOW_FEATURE_DISABLED';
  throw err;
}

export default {
  getWorkflowActual,
  getWorkflowEstados,
  validateTransition,
  simulateTransition,
  executeTransition,
  assertWorkflowEnabled,
  assertWriteEnabled,
};