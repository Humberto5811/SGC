/**
 * RegistroWorkflowAdapter — Fase 3A.1.
 * Recibe acciones del módulo Registro y delega únicamente al Workflow Engine.
 * NO persiste, NO llama rutas legacy, NO modifica BD.
 */
import { crearWorkflowEngine } from '../index.js';
import { WORKFLOW_ACTION, createWorkflowPlan } from '../../interfaces/WorkflowContracts.js';

export const MODULO_REGISTRO = 'Registro de Requerimiento';

export class RegistroWorkflowAdapter {
  /**
   * @param {Object} deps
   * @param {Function} [deps.createWorkflowEngine]
   * @param {import('../../eventEngine/EventEngine.js').EventEngine} [deps.eventEngine]
   */
  constructor(deps = {}) {
    this.moduloLabel = MODULO_REGISTRO;
    this.createWorkflowEngine = deps.createWorkflowEngine || crearWorkflowEngine;
    this.engineDeps = {
      eventEngine: deps.eventEngine || null,
      emitPlanEvents: deps.emitPlanEvents !== false && !!deps.eventEngine,
      estadoManager: deps.estadoManager || null,
    };
  }

  _engine(row, opts = {}) {
    return this.createWorkflowEngine(
      row,
      { moduloLabel: this.moduloLabel, moduloConsulta: 'REGISTRADO', ...opts },
      this.engineDeps,
    );
  }

  crear(row, payload = {}) {
    const engine = this._engine(row, { moduloConsulta: 'REGISTRADO' });
    return createWorkflowPlan({
      tipo: WORKFLOW_ACTION.CREAR,
      fase: 3,
      requerimientoId: row?.id ?? null,
      moduloOrigen: this.moduloLabel,
      payload,
      ...this._snapshotMeta(engine),
    });
  }

  editar(row, payload = {}) {
    const engine = this._engine(row);
    return createWorkflowPlan({
      tipo: WORKFLOW_ACTION.EDITAR,
      fase: 3,
      requerimientoId: row?.id ?? engine.obtenerContexto()?.requerimientoId,
      moduloOrigen: this.moduloLabel,
      payload,
      ...this._snapshotMeta(engine),
    });
  }

  aprobar(row, payload = {}) {
    const engine = this._engine(row);
    const plan = engine.aprobar(payload);
    return createWorkflowPlan({ ...plan, tipo: WORKFLOW_ACTION.APROBAR, fase: plan.fase || 3 });
  }

  derivar(row, destino, payload = {}) {
    const engine = this._engine(row);
    const plan = engine.derivar(destino, payload);
    return createWorkflowPlan({ ...plan, tipo: WORKFLOW_ACTION.DERIVAR, fase: plan.fase || 3 });
  }

  observar(row, payload = {}) {
    const engine = this._engine(row);
    const plan = engine.observar(payload);
    return createWorkflowPlan({ ...plan, tipo: WORKFLOW_ACTION.OBSERVAR, fase: plan.fase || 3 });
  }

  subsanar(row, payload = {}) {
    const engine = this._engine(row);
    const plan = engine.subsanar(payload);
    return createWorkflowPlan({ ...plan, tipo: WORKFLOW_ACTION.SUBSANAR, fase: plan.fase || 3 });
  }

  cerrar(row, payload = {}) {
    const engine = this._engine(row);
    const plan = engine.cerrar(payload);
    return createWorkflowPlan({ ...plan, tipo: WORKFLOW_ACTION.CERRAR, fase: plan.fase || 3 });
  }

  obtenerSnapshot(row) {
    return this._engine(row).obtenerWorkflowSnapshot();
  }

  _snapshotMeta(engine) {
    return { workflowSnapshot: engine.obtenerWorkflowSnapshot() };
  }
}

export function crearRegistroWorkflowAdapter(deps) {
  return new RegistroWorkflowAdapter(deps);
}

export default RegistroWorkflowAdapter;
