/**
 * MigrationFacade — punto único de migración progresiva (Fase 3A.1).
 *
 * Flujo preparado:
 *   Módulo → Workflow Adapter → Workflow Engine → Event Adapter → Event Engine → Legacy (futuro)
 *
 * Fase 3A.1: NO ejecuta legacy. NO persiste. Solo encapsula y emite eventos.
 */
import { RegistroWorkflowAdapter, crearRegistroWorkflowAdapter } from './adapters/RegistroWorkflowAdapter.js';
import { RegistroEventAdapter, crearRegistroEventAdapter } from '../eventEngine/adapters/RegistroEventAdapter.js';
import { createWorkflowResult } from '../interfaces/WorkflowContracts.js';

export class MigrationFacade {
  /**
   * @param {Object} deps
   * @param {RegistroWorkflowAdapter} [deps.workflowAdapter]
   * @param {RegistroEventAdapter} [deps.eventAdapter]
   * @param {Object} [deps.legacy] - hook futuro (registrarMovimiento, etc.)
   */
  constructor(deps = {}) {
    this.workflowAdapter = deps.workflowAdapter
      || crearRegistroWorkflowAdapter(deps);
    this.eventAdapter = deps.eventAdapter
      || crearRegistroEventAdapter(deps);
    this.legacy = deps.legacy || null;
    this.ejecutarLegacy = deps.ejecutarLegacy === true;
  }

  _finalize(action, row, plan, eventResult) {
    const legacyResult = this.ejecutarLegacy && this.legacy
      ? this._invokeLegacy(action, row, plan)
      : null;

    return createWorkflowResult({
      ok: true,
      plan,
      evento: eventResult,
      legacy: legacyResult,
      fase: 3,
    });
  }

  _invokeLegacy(action, row, plan) {
    if (!this.legacy) return { omitido: true, motivo: 'Legacy no configurado' };
    const fn = this.legacy[action];
    if (typeof fn !== 'function') {
      return { omitido: true, motivo: `Legacy.${action} no disponible` };
    }
    return fn(row, plan);
  }

  crear(row, payload = {}) {
    const plan = this.workflowAdapter.crear(row, payload);
    const evento = this.eventAdapter.emitCreado(row, { payload, workflowSnapshot: plan.workflowSnapshot });
    return this._finalize('crear', row, plan, evento);
  }

  editar(row, payload = {}) {
    const plan = this.workflowAdapter.editar(row, payload);
    const evento = this.eventAdapter.emitEditado(row, { payload, workflowSnapshot: plan.workflowSnapshot });
    return this._finalize('editar', row, plan, evento);
  }

  aprobar(row, payload = {}) {
    const plan = this.workflowAdapter.aprobar(row, payload);
    const evento = this.eventAdapter.emitAprobado(row, plan);
    return this._finalize('aprobar', row, plan, evento);
  }

  derivar(row, destino, payload = {}) {
    const plan = this.workflowAdapter.derivar(row, destino, payload);
    const evento = this.eventAdapter.emitDerivado(row, plan);
    return this._finalize('derivar', row, plan, evento);
  }

  observar(row, payload = {}) {
    const plan = this.workflowAdapter.observar(row, payload);
    const evento = this.eventAdapter.emitObservado(row, plan);
    return this._finalize('observar', row, plan, evento);
  }

  subsanar(row, payload = {}) {
    const plan = this.workflowAdapter.subsanar(row, payload);
    const evento = this.eventAdapter.emitSubsanado(row, plan);
    return this._finalize('subsanar', row, plan, evento);
  }

  obtenerSnapshot(row) {
    return this.workflowAdapter.obtenerSnapshot(row);
  }
}

export function crearMigrationFacade(deps) {
  return new MigrationFacade(deps);
}

export default MigrationFacade;
