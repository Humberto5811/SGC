/**
 * Contratos comunes Workflow / Event — Fase 3A.1.
 * Solo tipos y factories; sin lógica de negocio ni persistencia.
 */

/** @typedef {'crear'|'editar'|'aprobar'|'derivar'|'observar'|'subsanar'|'cerrar'} WorkflowActionType */

export const WORKFLOW_ACTION = Object.freeze({
  CREAR: 'crear',
  EDITAR: 'editar',
  APROBAR: 'aprobar',
  DERIVAR: 'derivar',
  OBSERVAR: 'observar',
  SUBSANAR: 'subsanar',
  CERRAR: 'cerrar',
});

/**
 * @typedef {Object} WorkflowAction
 * @property {WorkflowActionType} tipo
 * @property {string|number|null} [requerimientoId]
 * @property {string} [moduloOrigen]
 * @property {string} [moduloDestino]
 * @property {string} [usuario]
 * @property {Object} [payload]
 */

/**
 * @typedef {Object} WorkflowPlan
 * @property {WorkflowActionType} tipo
 * @property {boolean} persistir
 * @property {number} fase
 * @property {string|number|null} [requerimientoId]
 * @property {string} [moduloOrigen]
 * @property {string} [destino]
 * @property {string} [etapaDestino]
 * @property {Object} [payload]
 * @property {Object} [eventEmission]
 */

/**
 * @typedef {Object} WorkflowTransition
 * @property {string} origen
 * @property {string} destino
 * @property {boolean} valido
 * @property {string} [motivo]
 */

/**
 * @typedef {Object} WorkflowEvent
 * @property {string} codigo
 * @property {string} [categoria]
 * @property {Object} snapshot
 */

/**
 * @typedef {Object} WorkflowResult
 * @property {boolean} ok
 * @property {WorkflowPlan} plan
 * @property {EventResult|null} [evento]
 * @property {Object|null} [legacy]
 * @property {number} fase
 */

/**
 * @typedef {Object} EventResult
 * @property {boolean} ok
 * @property {string} [evento]
 * @property {Object} [snapshot]
 * @property {Object} [dispatch]
 * @property {boolean} persistido
 * @property {number} fase
 */

/**
 * @typedef {Object} TransitionResult
 * @property {boolean} valido
 * @property {string} [origen]
 * @property {string} [destino]
 * @property {string} [motivo]
 */

export function createWorkflowAction(fields = {}) {
  return Object.freeze({
    tipo: fields.tipo || WORKFLOW_ACTION.EDITAR,
    requerimientoId: fields.requerimientoId ?? null,
    moduloOrigen: fields.moduloOrigen || '',
    moduloDestino: fields.moduloDestino || '',
    usuario: fields.usuario || '',
    payload: fields.payload || {},
    _contract: 'WorkflowAction',
  });
}

export function createWorkflowPlan(fields = {}) {
  return Object.freeze({
    persistir: false,
    fase: fields.fase ?? 3,
    tipo: fields.tipo || WORKFLOW_ACTION.EDITAR,
    requerimientoId: fields.requerimientoId ?? null,
    moduloOrigen: fields.moduloOrigen || '',
    destino: fields.destino || '',
    etapaDestino: fields.etapaDestino || '',
    payload: fields.payload || {},
    eventEmission: fields.eventEmission ?? null,
    _contract: 'WorkflowPlan',
  });
}

export function createWorkflowTransition(fields = {}) {
  return Object.freeze({
    origen: fields.origen || '',
    destino: fields.destino || '',
    valido: fields.valido === true,
    motivo: fields.motivo || '',
    _contract: 'WorkflowTransition',
  });
}

export function createWorkflowEvent(fields = {}) {
  return Object.freeze({
    codigo: fields.codigo || '',
    categoria: fields.categoria || '',
    snapshot: fields.snapshot || {},
    _contract: 'WorkflowEvent',
  });
}

export function createWorkflowResult(fields = {}) {
  return Object.freeze({
    ok: fields.ok !== false,
    plan: fields.plan || createWorkflowPlan(),
    evento: fields.evento ?? null,
    legacy: fields.legacy ?? null,
    fase: fields.fase ?? 3,
    _contract: 'WorkflowResult',
  });
}

export function createEventResult(fields = {}) {
  return Object.freeze({
    ok: fields.ok !== false,
    evento: fields.evento || '',
    snapshot: fields.snapshot ?? null,
    dispatch: fields.dispatch ?? null,
    persistido: fields.persistido === true,
    fase: fields.fase ?? 2,
    _contract: 'EventResult',
  });
}

export function createTransitionResult(fields = {}) {
  return Object.freeze({
    valido: fields.valido === true,
    origen: fields.origen || '',
    destino: fields.destino || '',
    motivo: fields.motivo || '',
    _contract: 'TransitionResult',
  });
}

export default {
  WORKFLOW_ACTION,
  createWorkflowAction,
  createWorkflowPlan,
  createWorkflowTransition,
  createWorkflowEvent,
  createWorkflowResult,
  createEventResult,
  createTransitionResult,
};
