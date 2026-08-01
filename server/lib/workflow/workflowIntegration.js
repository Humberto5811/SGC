/**
 * Workflow Integration — adaptador de uso productivo (Fase 1A, Opción B).
 *
 * Decisición legacy vs motor según flags:
 * - flag del módulo apagado → ejecuta legacyHandler (comportamiento actual).
 * - flag del módulo encendido + WORKFLOW_ENGINE_WRITE_ENABLED=false → error 503 controlado.
 * - ambos encendidos → ejecuta executeTransition con context construido desde req.user.
 *
 * Reglas:
 * - Nunca ejecuta motor y legacy en la misma petición.
 * - Actor SIEMPRE desde req.user (nunca del body).
 * - El destino sale exclusivamente de shared/workflow/transiciones.js.
 * - Idempotency keys estables (sin timestamps aleatorios).
 * - Mantiene compatibilidad con la respuesta actual (ok/requerimiento/error).
 */
import { executeTransition } from './workflowEngine.js';
import { leerFlags } from './workflowGuards.js';
import { getTransition } from '../../../shared/workflow/transiciones.js';
import { emitirObservacion } from '../observacionesWorkflow.js';

/**
 * Idempotency key estable.
 *
 * Regla Fase 1A.2:
 * - si se provee `client_request_id`, se usa como identidad de la petición
 *   (un mismo request reintentado es idempotente; una observación nueva con
 *   el mismo texto pero distinto client_request_id crea un NUEVO ciclo);
 * - si no se provee, fallback de compatibilidad:
 *   expediente + evento + actor_id + motivo_hash + ciclo_observacion.
 *
 * Nunca se usa timestamp aleatorio como única clave.
 */
export function buildIdempotencyKey(eventoCodigo, requerimientoId, {
  clientRequestId,
  actorId,
  motivo,
  cicloObservacion,
} = {}) {
  if (clientRequestId) {
    return `req:${requerimientoId}:${eventoCodigo}:crq:${String(clientRequestId).slice(0, 80)}`;
  }
  const base = `req:${requerimientoId}:${eventoCodigo}`;
  const actorPart = actorId != null ? `:u${actorId}` : '';
  const motivoHash = motivo ? hashMotivo(motivo) : '';
  const ciclo = cicloObservacion != null ? `:c${cicloObservacion}` : '';
  return `${base}${actorPart}${motivoHash ? `:${motivoHash}` : ''}${ciclo}`;
}

/** Hash FNV-1a simple para estabilidad del motivo (sin randomness). */
function hashMotivo(motivo) {
  let h = 0x811c9dc5;
  const s = String(motivo || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Resuelve el permiso declarado en la matriz para conocer el rol esperado (log dev). */
export function getPermisoEsperado({ tipoContratacion, etapaOrigen, eventoCodigo }) {
  const tr = getTransition({ tipoContratacion, etapaOrigen, eventoCodigo });
  return tr ? tr.permiso : null;
}

export function getTipoContratacionDeRequerimiento(req, bodyTipo) {
  return (req && req.body && req.body.tipo_contratacion) || bodyTipo || 'BIEN';
}

/**
 * Normaliza payload a objeto seguro (object | JSON string | null | inválido).
 */
export function normalizarPayloadCompat(payload) {
  if (payload && typeof payload === 'object') return payload;
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Crea un domainMutator que:
 *  1. inserta la observación canónica en workflow_observaciones;
 *  2. actualiza payload.observaciones y payload.historial_evaluacion
 *     (compatibilidad legacy, reutilizando emitirObservacion como función pura
 *     sobre el objeto en memoria — sin SQL legacy);
 *  3. persiste el payload con el MISMO client (tx) de la transacción del motor.
 *
 * Todas las escrituras (workflow_observaciones, payload, workflow_eventos,
 * historial_movimientos, expediente) comparten la misma transacción: si alguna
 * falla, withTransaction hace ROLLBACK completo.
 *
 * @param {object} opts
 * @param {string} opts.motivo
 * @param {string} [opts.usuarioEmisor]
 * @param {string} [opts.responsableSubsanacion]
 * @param {string} [opts.destinoSubmodulo]
 * @param {string} [opts.destinoEtapa]
 * @param {string} [opts.destinoPersona]
 * @param {string} [opts.origenSubmodulo]
 * @param {string[]} [opts.documentos]
 * @param {string} [opts.origen] — dominio origen, default 'EVALUACION'
 * @returns {Function} async (client, { expediente_id, row }) =>
 *   { observacion_insertada, compat_payload_actualizado, observacion_id }
 */
export function buildObservacionDomainMutator({
  motivo,
  usuarioEmisor = 'SISTEMA',
  responsableSubsanacion = '',
  destinoSubmodulo = 'Registro de Requerimiento',
  destinoEtapa = 'REGISTRADO',
  destinoPersona = '',
  origenSubmodulo = 'Evaluación de Requerimiento',
  documentos = [],
  origen = 'EVALUACION',
} = {}) {
  return async function observacionMutator(client, { expediente_id, row }) {
    const now = new Date().toISOString();
    const expedienteId = Number(expediente_id);

    // 1. Insertar observación canónica en workflow_observaciones (mismo tx).
    const { rows } = await client.query(
      `INSERT INTO workflow_observaciones
         (expediente_id, origen, estado, emitida_por, responsable_subsanacion,
          motivo, documentos, dias_plazo, emitida_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        expedienteId,
        String(origen || 'EVALUACION'),
        'OBS_EMITIDA',
        String(usuarioEmisor || 'SISTEMA'),
        String(responsableSubsanacion || ''),
        String(motivo || ''),
        JSON.stringify(Array.isArray(documentos) ? documentos : []),
        5,
        now,
      ],
    );
    const observacionId = rows[0]?.id || null;

    // 2. Compatibilidad legacy: construir payload nuevo equivalente al flujo
    //    emitirObservacion + historial_evaluacion, sobre el objeto en memoria.
    const payload = normalizarPayloadCompat(row?.payload);
    if (!Array.isArray(payload.historial_evaluacion)) payload.historial_evaluacion = [];
    payload.historial_evaluacion.push({
      tipo: 'observacion',
      motivo: String(motivo || ''),
      usuario: String(usuarioEmisor || ''),
      fecha: now,
      destino_persona: String(destinoPersona || responsableSubsanacion || ''),
    });
    // Reutilizar emitirObservacion (función pura, muta el objeto, sin SQL).
    emitirObservacion(payload, {
      motivo: String(motivo || ''),
      gerente: String(usuarioEmisor || 'Gerente'),
      origen: 'GERENTE',
      origen_submodulo: String(origenSubmodulo || 'Evaluación de Requerimiento'),
      destino_submodulo: String(destinoSubmodulo || 'Registro de Requerimiento'),
      destino_etapa: String(destinoEtapa || 'REGISTRADO'),
      destino_persona: String(destinoPersona || responsableSubsanacion || ''),
    });

    // 3. Persistir payload actualizado con el MISMO tx.
    await client.query(
      `UPDATE requerimientos SET payload = $2, updated_at = NOW() WHERE id = $1`,
      [expedienteId, JSON.stringify(payload)],
    );

    return {
      observacion_insertada: true,
      compat_payload_actualizado: true,
      observacion_id: observacionId,
    };
  };
}

/**
 * Ejecuta una transición productiva del tramo.
 *
 * @param {object} opts
 * @param {string} opts.moduleFlag — 'WORKFLOW_ENGINE_REGISTRO' | 'WORKFLOW_ENGINE_EVALUACION' …
 * @param {string} opts.eventoCodigo — evento canónico.
 * @param {number|string} opts.expedienteId
 * @param {object} opts.req — request Express (req.user, req.body, req.headers).
 * @param {object} [opts.metadata] — metadatos complementarios.
 * @param {Function} [opts.domainMutator] — mutador de dominio (opcional, fase futura).
 * @param {Function} opts.legacyHandler — async () => respuesta legacy actual.
 * @returns {Promise<{ ok:boolean, data?:*, workflow?:object, evento?:object, error?:string, codigoCamino?:string }>}
 */
export async function runWorkflowTransition({
  moduleFlag,
  eventoCodigo,
  expedienteId,
  req,
  metadata = {},
  domainMutator = null,
  legacyHandler,
  flagsOverride = null,
}) {
  // flagsOverride permite a las pruebas forzar el estado de flags sin depender del .env.
  const flags = { ...leerFlags(), ...(flagsOverride || {}) };

  // 1. Flag del módulo apagado → legacy (comportamiento actual idéntico).
  if (flags[moduleFlag] !== true) {
    const result = await legacyHandler();
    return {
      ...result,
      codigoCamino: process.env.NODE_ENV === 'development' ? 'LEGACY' : undefined,
    };
  }

  // 2. Flag encendido pero WRITE_ENABLED=false → error controlado (el motor no escribe).
  if (flags.WORKFLOW_ENGINE_WRITE_ENABLED !== true) {
    const err = new Error('Workflow Engine: escritura deshabilitada (WORKFLOW_ENGINE_WRITE_ENABLED=false)');
    err.code = 'WORKFLOW_WRITE_DISABLED';
    err.status = 503;
    throw err;
  }

  // 3. Ambos encendidos → motor.
  const actor = {
    id: req?.user?.id ?? null,
    rol: req?.user?.rol || 'SISTEMA',
  };

  const tipoContratacion = getTipoContratacionDeRequerimiento(req, metadata?.tipo_contratacion);
  const idempotency_key = buildIdempotencyKey(eventoCodigo, expedienteId, {
    clientRequestId: metadata?.client_request_id,
    actorId: actor.id,
    motivo: metadata?.motivo,
    cicloObservacion: metadata?.ciclo_observacion,
  });

  const motor = await executeTransition(
    {
      expediente_id: Number(expedienteId),
      tipo_contratacion: tipoContratacion,
      evento: eventoCodigo,
      idempotency_key,
      user: req?.user || null, // normalizarActor da prioridad absoluta a req.user
      actor,
      permiso: metadata?.permiso,
      responsable_destino: metadata?.responsable_destino || null,
      metadata: { ...metadata, origen: 'workflow-integration' },
      domainMutator,
    },
    flags, // incluye WORKFLOW_ENGINE_WRITE_ENABLED
  );

  // 4. Respuesta compatible (motor): ok + workflow + evento.
  return {
    ok: true,
    workflow: motor.contrato
      ? {
          etapa_codigo: motor.contrato.etapa_codigo,
          etapa_label: motor.contrato.etapa_label,
          submodulo_codigo: motor.contrato.submodulo_codigo,
          submodulo_label: motor.contrato.submodulo_label,
          responsable_codigo: motor.contrato.responsable_codigo,
          responsable_label: motor.contrato.responsable_label,
        }
      : null,
    evento: {
      codigo: evento,
      idempotente: motor.idempotente === true,
    },
    data: motor.expediente_actualizado || null,
    codigoCamino: process.env.NODE_ENV === 'development' ? 'ENGINE' : undefined,
  };
}

/** Endpoints del tramo habilitados por el adaptador (documentación, no lógica). */
export const EVENTOS_TRAMO_REGISTRO_EVALUACION = Object.freeze([
  'REQUERIMIENTO_REGISTRADO',
  'REQUERIMIENTO_ENVIADO_EVALUACION',
  'EVALUACION_APROBADA',
  'EVALUACION_OBSERVADA',
]);

export default {
  runWorkflowTransition,
  buildIdempotencyKey,
  normalizarPayloadCompat,
  getPermisoEsperado,
  getTipoContratacionDeRequerimiento,
  buildObservacionDomainMutator,
  EVENTOS_TRAMO_REGISTRO_EVALUACION,
};