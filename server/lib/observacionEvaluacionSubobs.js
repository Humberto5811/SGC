/**
 * RC8.17.8G / G1 — Observaciones Eval→destino con transición canónica e idempotencia por nodo.
 * Payload.observaciones sigue siendo la fuente del árbol; ERV vía transicionarExpediente únicamente.
 *
 * Contrato PUT /api/requerimientos/:id/observar (raíz Eval→Registro, G1):
 * - Clientes productivos DEBEN enviar `observacion_raiz_id` (o `observacionRaizId`) estable por
 *   intento lógico: mismo id en reintento/doble clic → misma `client_request_id`
 *   (`eval-obs:<reqId>:<observacionRaizId>`) → idempotencia de transición.
 * - Nueva observación raíz → nuevo `observacion_raiz_id` (p. ej. `obs_act_*` desde UI).
 * - Sin id de cliente: fallback servidor `obs_root_<n>` (n = raíces existentes + 1). Eso permite
 *   compatibilidad con integraciones antiguas pero NO garantiza idempotencia ante reintentos
 *   idénticos (cada POST sin id puede generar otra raíz y otra key). No se deduplica por motivo.
 * - Eventos históricos con solo `eval-obs:<reqId>` siguen siendo válidos; no se reescriben.
 */
import { getObservacionPadreId, getRaicesObservaciones } from '../../shared/observacionesMotor.js';

/** Identificadores de nodo de observación (raíz/hija/actuación). */
const OBSERVACION_NODO_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;

/**
 * Valida id de nodo enviado por cliente (autoridad de persistencia sigue en servidor).
 * @param {string} id
 * @param {string} [label]
 */
export function assertValidObservacionNodoId(id, label = 'observacion_id') {
  const s = String(id || '').trim();
  if (!s || !OBSERVACION_NODO_ID_RE.test(s)) {
    const err = new Error(`${label} inválido`);
    err.code = 'OBSERVACION_NODO_ID_INVALID';
    throw err;
  }
  return s;
}

/**
 * Id estable de nodo raíz Eval (reintentos reutilizan el mismo id si el cliente lo envía).
 * @param {object} payload
 * @param {string|null} explicitId — observacion_raiz_id desde cliente
 */
export function allocateObservacionRaizId(payload, explicitId = null) {
  if (explicitId != null && String(explicitId).trim()) {
    return assertValidObservacionNodoId(explicitId, 'observacion_raiz_id');
  }
  const hilos = Array.isArray(payload?.observaciones) ? payload.observaciones : [];
  const raices = getRaicesObservaciones(hilos);
  const existing = new Set(hilos.map((o) => String(o.id)));
  let n = raices.length + 1;
  let candidate = `obs_root_${n}`;
  while (existing.has(candidate)) {
    n += 1;
    candidate = `obs_root_${n}`;
  }
  return candidate;
}
import { emitirObservacion } from './observacionesWorkflow.js';
import { normalizarPayloadCompat } from './workflow/workflowIntegration.js';

/**
 * Id estable de nodo hijo (reintentos / doble clic reutilizan el mismo id si el payload no cambió).
 * @param {object} payload
 * @param {string} padreId
 * @param {string|null} explicitId — opcional desde cliente
 */
export function allocateObservacionHijaId(payload, padreId, explicitId = null) {
  if (explicitId != null && String(explicitId).trim()) {
    return String(explicitId).trim().slice(0, 120);
  }
  const padre = String(padreId || '').trim();
  if (!padre) throw new Error('observacion_padre_id requerida para subobservación');
  const hilos = Array.isArray(payload?.observaciones) ? payload.observaciones : [];
  const hijos = hilos.filter((o) => String(getObservacionPadreId(o) || '') === padre);
  const slug = padre.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return `obs_sub_${slug}_${hijos.length + 1}`;
}

/**
 * client_request_id / idempotency para observación Eval.
 * Raíz G1: eval-obs:<reqId>:<observacionRaizId> (legacy sin nodo: eval-obs:<reqId>).
 * Subobs: eval-subobs:<id>:<observacionHijaId>.
 */
export function buildClientRequestIdEvalObservacion({
  requerimientoId,
  observacionPadreId = null,
  observacionHijaId = null,
  observacionRaizId = null,
  clientRequestIdFromBody = null,
} = {}) {
  if (clientRequestIdFromBody != null && String(clientRequestIdFromBody).trim()) {
    return String(clientRequestIdFromBody).trim().slice(0, 80);
  }
  const rid = Number(requerimientoId);
  if (observacionPadreId && observacionHijaId) {
    return `eval-subobs:${rid}:${observacionHijaId}`.slice(0, 80);
  }
  if (observacionRaizId) {
    return `eval-obs:${rid}:${observacionRaizId}`.slice(0, 80);
  }
  return `eval-obs:${rid}`;
}

/**
 * Mutador de dominio: persiste payload.observaciones en la misma tx que ERV.
 * No inserta workflow_observaciones (incluso en motor ON para subobs).
 */
export function buildEvalObservacionPayloadDomainMutator({
  motivo,
  usuarioEmisor = 'SISTEMA',
  responsableSubsanacion = '',
  destinoSubmodulo = 'Registro de Requerimiento',
  destinoEtapa = 'REGISTRO',
  destinoPersona = '',
  origenSubmodulo = 'Evaluación de Requerimiento',
  usuarioDestinoId = null,
  usuarioOrigenId = null,
  responsableRecomendadoId = null,
  reasignacionManual = false,
  observacionPadreId = null,
  observacionHijaId = null,
  observacionRaizId = null,
  incluirHistorialEvaluacion = true,
} = {}) {
  const padreId = observacionPadreId ? String(observacionPadreId).trim() : null;
  const esSubobs = !!padreId;

  return async function evalObservacionPayloadMutator(client, { expediente_id, row }) {
    const expedienteId = Number(expediente_id);
    const now = new Date().toISOString();
    const uidDest = usuarioDestinoId != null && Number.isFinite(Number(usuarioDestinoId))
      ? Number(usuarioDestinoId)
      : null;
    const uidOrig = usuarioOrigenId != null && Number.isFinite(Number(usuarioOrigenId))
      ? Number(usuarioOrigenId)
      : null;

    const payload = normalizarPayloadCompat(row?.payload);
    if (!esSubobs && incluirHistorialEvaluacion) {
      if (!Array.isArray(payload.historial_evaluacion)) payload.historial_evaluacion = [];
      payload.historial_evaluacion.push({
        tipo: 'observacion',
        motivo: String(motivo || ''),
        usuario: String(usuarioEmisor || ''),
        fecha: now,
        destino_persona: String(destinoPersona || responsableSubsanacion || ''),
      });
    }

    const hijaId = esSubobs
      ? (observacionHijaId || allocateObservacionHijaId(payload, padreId))
      : null;
    const raizId = esSubobs
      ? null
      : (observacionRaizId || allocateObservacionRaizId(payload));

    const emitResult = emitirObservacion(payload, {
      motivo: String(motivo || ''),
      gerente: String(usuarioEmisor || 'Gerente'),
      origen: 'GERENTE',
      origen_submodulo: String(origenSubmodulo || 'Evaluación de Requerimiento'),
      destino_submodulo: String(destinoSubmodulo || 'Registro de Requerimiento'),
      destino_etapa: String(destinoEtapa || 'REGISTRO'),
      destino_persona: String(destinoPersona || responsableSubsanacion || ''),
      usuario_origen_id: uidOrig,
      usuario_destino_id: uidDest,
      responsable_recomendado_id: responsableRecomendadoId,
      reasignacion_manual: reasignacionManual === true,
      observacion_padre_id: padreId,
      id: hijaId || raizId || undefined,
      forceNew: (esSubobs || raizId) ? true : undefined,
    });

    await client.query(
      `UPDATE requerimientos SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [expedienteId, JSON.stringify(payload)],
    );

    const obsId = emitResult?.observacion?.id || hijaId || raizId || null;
    return {
      compat_payload_actualizado: true,
      observacion_payload_id: obsId,
      observacion_padre_id: padreId,
      es_subobservacion: esSubobs,
    };
  };
}

export default {
  allocateObservacionHijaId,
  allocateObservacionRaizId,
  assertValidObservacionNodoId,
  buildClientRequestIdEvalObservacion,
  buildEvalObservacionPayloadDomainMutator,
};
