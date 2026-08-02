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
import { insertWorkflowEvento, appendMovimiento, buildMovimientoEntry } from './workflowHistory.js';
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

    // 9. domainMutator solo si fue proporcionado
    let domainResults = null;
    if (context.domainMutator && typeof context.domainMutator === 'function') {
      domainResults = await context.domainMutator(tx, {
        expediente_id: context.expediente_id,
        transicion,
        contexto: context,
        row,
      });
    }

    // 10-13. Actualizar ubicación SOLO si cambia_ubicacion.
    // Se usa `mapEtapaDestinoBD` para que el estado_actual escrito sea el código que
    // los lectores legacy esperan (ej.: COORDINACION_CM → ACTOS_PREPARATORIOS).
    // El contrato y el evento conservan el código canónico de la matriz.
    const destino = transicion.etapa_destino;
    const destinoBD = mapEtapaDestinoBD(destino);
    const meta = getEtapaMeta(destino) || getEtapaMeta('REGISTRO');
    const cambia = transicion.cambia_ubicacion;
    const responsable = context.responsable_destino || transicion.responsable_destino
      || meta.responsableCodigo || 'SISTEMA';

    if (cambia) {
      await tx.query(`
        UPDATE requerimientos SET
          estado_actual = $2,
          sub_modulo_actual = $3,
          responsable_actual = $4,
          fecha_estado_actual = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [context.expediente_id, destinoBD, meta.submoduloLabel, responsable]);
    } else if (context.responsable_destino) {
      // Evento sin cambio de ubicación con responsable explícito (ej. EVALUACION_OBSERVADA):
      // se actualiza responsable_actual (responsable de subsanación) sin mover etapa.
      await tx.query(`
        UPDATE requerimientos SET
          responsable_actual = $2,
          fecha_estado_actual = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [context.expediente_id, context.responsable_destino]);
    } else {
      await tx.query(`
        UPDATE requerimientos SET updated_at = NOW() WHERE id = $1
      `, [context.expediente_id]);
    }

    // 14. Insertar workflow_eventos
    const eventoRow = await insertWorkflowEvento(tx, {
      expediente_id: context.expediente_id,
      tipo_contratacion: tipo,
      evento_codigo: evento,
      etapa_origen: etapaVigente,
      etapa_destino: destino,
      actor_id: actorNormalizado.id ?? null,
      actor_rol: actorNormalizado.rol || 'SISTEMA',
      responsable_destino: responsable,
      metadata: {
        ...(context.metadata || {}),
        cambia_ubicacion: cambia,
        permiso: transicion.permiso,
        guard_codigo: transicion.guard_codigo,
        domain_results: domainResults || null,
      },
      idempotency_key: idemKey,
    });

    // 15. historial_movimientos (append)
    const entry = buildMovimientoEntry({
      accion: evento,
      etapa: cambia ? destino : etapaVigente,
      usuario: context.actor_rol || 'Sistema',
      responsable,
      observacion: context.metadata?.observacion || `Evento ${evento}`,
      subModuloDestino: cambia ? meta.submoduloCodigo : '',
    });
    await appendMovimiento(tx, context.expediente_id, entry);

    // Releer fila actualizada
    const { rows: freshRows } = await tx.query(
      'SELECT * FROM requerimientos WHERE id = $1',
      [context.expediente_id],
    );
    const freshRow = freshRows[0];

    return {
      idempotente: false,
      evento: eventoRow,
      expediente_actualizado: freshRow,
      contrato: await buildContratoDesdeRow(freshRow),
    };
  }, client);
}

/**
 * Mapea el código de etapa canónico de la matriz al código de estado_actual
 * esperado por los lectores legacy en BD.
 * - COORDINACION_CM → ACTOS_PREPARATORIOS (bandeja de Actos usa este código).
 * - El resto se conserva igual.
 */
function mapEtapaDestinoBD(destino) {
  if (destino === 'COORDINACION_CM') return 'ACTOS_PREPARATORIOS';
  return destino;
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