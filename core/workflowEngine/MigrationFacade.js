/**
 * MigrationFacade — punto único de migración progresiva (Fase 3A.1+).
 *
 * Flujo (modo paralelo 3A.2):
 *   Módulo → Workflow Adapter → Workflow Engine → Event Adapter → Event Engine → Legacy
 */
import { RegistroWorkflowAdapter, crearRegistroWorkflowAdapter } from './adapters/RegistroWorkflowAdapter.js';
import { RegistroEventAdapter, crearRegistroEventAdapter } from '../eventEngine/adapters/RegistroEventAdapter.js';
import { createWorkflowPlan, createWorkflowResult } from '../interfaces/WorkflowContracts.js';
import { migrationLog, migrationWarn } from './MigrationLogger.js';

const PERMISO_POR_ACCION = Object.freeze({
  derivar: 'aprobar',
  aprobar: 'aprobar',
  observar: 'observar',
  subsanar: 'subsanar',
  editar: 'editar',
});

export class MigrationFacade {
  /**
   * @param {Object} deps
   * @param {RegistroWorkflowAdapter} [deps.workflowAdapter]
   * @param {RegistroEventAdapter} [deps.eventAdapter]
   * @param {Object} [deps.legacy] - hooks legacy (registrarMovimiento, etc.)
   * @param {boolean} [deps.ejecutarLegacy]
   * @param {boolean} [deps.migrationLogEnabled]
   */
  constructor(deps = {}) {
    this.workflowAdapter = deps.workflowAdapter
      || crearRegistroWorkflowAdapter(deps);
    this.eventAdapter = deps.eventAdapter
      || crearRegistroEventAdapter(deps);
    this.legacy = deps.legacy || null;
    this.ejecutarLegacy = deps.ejecutarLegacy === true;
    this.migrationLogEnabled = deps.migrationLogEnabled !== false;
  }

  _log(cadena, detalle) {
    migrationLog(cadena, detalle, { enabled: this.migrationLogEnabled });
  }

  _warn(mensaje, extra) {
    migrationWarn(mensaje, extra, { enabled: this.migrationLogEnabled });
  }

  _validarPreLegacy(action, row) {
    if (action === 'crear') {
      return { valido: true, snapshot: row ? this.workflowAdapter.obtenerSnapshot(row) : null };
    }

    const snapshot = this.workflowAdapter.obtenerSnapshot(row);

    if (!snapshot?.workflowValido) {
      return { valido: false, motivo: 'Workflow snapshot inválido', snapshot };
    }

    const etapa = snapshot.etapaActual || row?.estado_actual;
    if (!etapa) {
      return { valido: false, motivo: 'estado_actual ausente en snapshot', snapshot };
    }

    const subModulo = snapshot.subModuloActual || row?.sub_modulo_actual;
    if (!subModulo) {
      return { valido: false, motivo: 'sub_modulo_actual ausente en snapshot', snapshot };
    }

    const responsable = snapshot.responsable || row?.responsable_actual;
    if (!responsable && action !== 'editar') {
      return { valido: false, motivo: 'responsable_actual ausente en snapshot', snapshot };
    }

    const permiso = PERMISO_POR_ACCION[action];
    if (permiso && !snapshot.accionesPermitidas?.includes(permiso)) {
      return {
        valido: false,
        motivo: `Permiso '${permiso}' no concedido para '${action}'`,
        snapshot,
      };
    }

    return { valido: true, snapshot };
  }

  _planInvalido(action, plan, motivoExtra) {
    const motivo = plan?.motivo || motivoExtra || 'Transición no permitida por Workflow Engine';
    this._warn(`${action} bloqueado — legacy omitido`, motivo);
    return createWorkflowResult({
      ok: false,
      plan: plan || createWorkflowPlan({ tipo: action, valido: false, motivo }),
      evento: null,
      legacy: null,
      advertencia: motivo,
      fase: 3,
    });
  }

  async _finalize(action, row, plan, eventResult, payload = {}) {
    if (plan?.valido === false) {
      return this._planInvalido(action, plan);
    }

    this._log('EventEngine', eventResult?.evento || '(sin evento)');

    const legacyResult = this.ejecutarLegacy && this.legacy
      ? await this._invokeLegacy(action, row, plan, payload)
      : null;

    if (legacyResult != null) {
      this._log('Legacy', `${action} ejecutado`);
    }

    return createWorkflowResult({
      ok: true,
      plan,
      evento: eventResult,
      legacy: legacyResult,
      fase: 3,
    });
  }

  async _invokeLegacy(action, row, plan, payload) {
    if (!this.legacy) return { omitido: true, motivo: 'Legacy no configurado' };
    if (typeof payload.legacyExecutor === 'function') {
      return payload.legacyExecutor(row, plan);
    }
    const fn = this.legacy[action];
    if (typeof fn !== 'function') {
      return { omitido: true, motivo: `Legacy.${action} no disponible` };
    }
    return fn(row, plan, payload);
  }

  async _ejecutarAccion(action, row, buildPlan, emitEvent, payload = {}) {
    this._log('Registro', `MigrationFacade.${action}`);
    this._log('MigrationFacade', action);

    const pre = this._validarPreLegacy(action, row);
    if (!pre.valido) {
      return this._planInvalido(action, createWorkflowPlan({
        tipo: action,
        valido: false,
        motivo: pre.motivo,
        workflowSnapshot: pre.snapshot,
      }), pre.motivo);
    }

    this._log('WorkflowEngine', `obtenerWorkflowSnapshot etapa=${pre.snapshot?.etapaActual || '—'}`);

    const plan = buildPlan();
    if (plan?.valido === false) {
      return this._planInvalido(action, plan);
    }

    const evento = emitEvent(plan);
    return this._finalize(action, row, plan, evento, payload);
  }

  async crear(row, payload = {}) {
    return this._ejecutarAccion(
      'crear',
      row,
      () => this.workflowAdapter.crear(row, payload),
      (plan) => this.eventAdapter.emitCreado(row, { payload, workflowSnapshot: plan.workflowSnapshot }),
      payload,
    );
  }

  async editar(row, payload = {}) {
    return this._ejecutarAccion(
      'editar',
      row,
      () => this.workflowAdapter.editar(row, payload),
      (plan) => this.eventAdapter.emitEditado(row, { payload, workflowSnapshot: plan.workflowSnapshot }),
      payload,
    );
  }

  async aprobar(row, payload = {}) {
    return this._ejecutarAccion(
      'aprobar',
      row,
      () => this.workflowAdapter.aprobar(row, payload),
      (plan) => this.eventAdapter.emitAprobado(row, plan),
      payload,
    );
  }

  async derivar(row, destino, payload = {}) {
    return this._ejecutarAccion(
      'derivar',
      row,
      () => this.workflowAdapter.derivar(row, destino, payload),
      (plan) => this.eventAdapter.emitDerivado(row, plan),
      payload,
    );
  }

  async observar(row, payload = {}) {
    return this._ejecutarAccion(
      'observar',
      row,
      () => this.workflowAdapter.observar(row, payload),
      (plan) => this.eventAdapter.emitObservado(row, plan),
      payload,
    );
  }

  async subsanar(row, payload = {}) {
    if (payload.obsMotorValidado === true) {
      this._log('Registro', 'MigrationFacade.subsanar');
      this._log('MigrationFacade', 'subsanar (motor observaciones)');
      const plan = createWorkflowPlan({
        tipo: 'subsanar',
        fase: 3,
        requerimientoId: row?.id ?? null,
        workflowSnapshot: this.workflowAdapter.obtenerSnapshot(row),
        valido: true,
      });
      this._log('WorkflowEngine', `snapshot etapa=${plan.workflowSnapshot?.etapaActual || '—'}`);
      const evento = this.eventAdapter.emitSubsanado(row, plan);
      return this._finalize('subsanar', row, plan, evento, payload);
    }
    return this._ejecutarAccion(
      'subsanar',
      row,
      () => this.workflowAdapter.subsanar(row, payload),
      (plan) => this.eventAdapter.emitSubsanado(row, plan),
      payload,
    );
  }

  obtenerSnapshot(row) {
    return this.workflowAdapter.obtenerSnapshot(row);
  }

  obtenerWorkflowSnapshot(row) {
    return this.obtenerSnapshot(row);
  }
}

export function crearMigrationFacade(deps) {
  return new MigrationFacade(deps);
}

export default MigrationFacade;
