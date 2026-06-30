/**
 * RegistroEventAdapter — Fase 3A.1.
 * Recibe planes del Workflow Engine y emite eventos vía Event Engine.
 * NO modifica Timeline, Historial ni Observaciones operativos.
 */
import { crearEventEngine, EVENTOS } from '../index.js';
import { computeMotorSnapshot } from '../../../shared/observacionesMotor.js';
import { createEventResult } from '../../interfaces/WorkflowContracts.js';
import { MODULO_REGISTRO } from '../../workflowEngine/adapters/RegistroWorkflowAdapter.js';

export class RegistroEventAdapter {
  constructor(deps = {}) {
    this.eventEngine = deps.eventEngine || crearEventEngine();
    this.moduloLabel = deps.moduloLabel || MODULO_REGISTRO;
  }

  _baseFields(row, fields = {}) {
    return {
      requerimientoId: row?.id ?? fields.requerimientoId,
      codigoRequerimiento: row?.codigo ?? fields.codigo,
      moduloOrigen: fields.moduloOrigen || this.moduloLabel,
      moduloDestino: fields.moduloDestino || fields.destino || '',
      usuario: fields.usuario || fields.payload?.usuario || 'Sistema',
      payload: fields.payload || {},
      workflowSnapshot: fields.workflowSnapshot || null,
      observacionesSnapshot: fields.observacionesSnapshot
        ?? (row ? computeMotorSnapshot(row, this.moduloLabel) : null),
    };
  }

  _wrap(raw) {
    return createEventResult({
      ok: raw?.ok !== false,
      evento: raw?.evento || raw?.snapshot?.evento,
      snapshot: raw?.snapshot || null,
      dispatch: raw?.dispatch || null,
      persistido: false,
      fase: raw?.fase ?? 2,
    });
  }

  emitDesdePlan(plan, row = {}, fields = {}) {
    const raw = this.eventEngine.emitDesdePlanWorkflow(plan, {
      ...this._baseFields(row, fields),
      workflowSnapshot: fields.workflowSnapshot || plan.workflowSnapshot,
    });
    return this._wrap(raw);
  }

  emitCreado(row, fields = {}) {
    return this._wrap(this.eventEngine.emitSync(EVENTOS.REQUERIMIENTO_CREADO, this._baseFields(row, fields)));
  }

  emitEditado(row, fields = {}) {
    return this._wrap(this.eventEngine.emitSync(EVENTOS.REQUERIMIENTO_EDITADO, this._baseFields(row, fields)));
  }

  emitDerivado(row, planOrFields = {}) {
    const fields = planOrFields.plan ? { ...planOrFields, payload: { plan: planOrFields } } : planOrFields;
    if (planOrFields.tipo === 'derivar') {
      return this.emitDesdePlan(planOrFields, row, fields);
    }
    return this._wrap(this.eventEngine.emitSync(EVENTOS.REQUERIMIENTO_DERIVADO, this._baseFields(row, fields)));
  }

  emitObservado(row, planOrFields = {}) {
    if (planOrFields.tipo === 'observar') {
      return this.emitDesdePlan(planOrFields, row, planOrFields);
    }
    return this._wrap(this.eventEngine.emitSync(EVENTOS.OBSERVACION_EMITIDA, this._baseFields(row, planOrFields)));
  }

  emitSubsanado(row, planOrFields = {}) {
    if (planOrFields.tipo === 'subsanar') {
      return this.emitDesdePlan(planOrFields, row, planOrFields);
    }
    return this._wrap(this.eventEngine.emitSync(EVENTOS.OBSERVACION_SUBSANADA, this._baseFields(row, planOrFields)));
  }

  emitAprobado(row, planOrFields = {}) {
    if (planOrFields.tipo === 'aprobar') {
      return this.emitDesdePlan(planOrFields, row, planOrFields);
    }
    return this._wrap(this.eventEngine.emitSync(EVENTOS.REQUERIMIENTO_APROBADO, this._baseFields(row, planOrFields)));
  }
}

export function crearRegistroEventAdapter(deps) {
  return new RegistroEventAdapter(deps);
}

export default RegistroEventAdapter;
