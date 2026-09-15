/**
 * RC8.17.8G — Subobservaciones Eval→destino con transición canónica e idempotencia por nodo.
 * Payload.observaciones sigue siendo la fuente del árbol; ERV vía transicionarExpediente únicamente.
 */
import { getObservacionPadreId } from '../../shared/observacionesMotor.js';
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
 * Raíz: eval-obs:<id> (sin cambio). Subobs: eval-subobs:<id>:<observacionHijaId>.
 */
export function buildClientRequestIdEvalObservacion({
  requerimientoId,
  observacionPadreId = null,
  observacionHijaId = null,
  clientRequestIdFromBody = null,
} = {}) {
  if (clientRequestIdFromBody != null && String(clientRequestIdFromBody).trim()) {
    return String(clientRequestIdFromBody).trim().slice(0, 80);
  }
  const rid = Number(requerimientoId);
  if (observacionPadreId && observacionHijaId) {
    return `eval-subobs:${rid}:${observacionHijaId}`.slice(0, 80);
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
      id: hijaId || undefined,
      forceNew: esSubobs ? true : undefined,
    });

    await client.query(
      `UPDATE requerimientos SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [expedienteId, JSON.stringify(payload)],
    );

    const obsId = emitResult?.observacion?.id || hijaId || null;
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
  buildClientRequestIdEvalObservacion,
  buildEvalObservacionPayloadDomainMutator,
};
