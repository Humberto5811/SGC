/**
 * WorkflowEngine — única autoridad del flujo del SGC (Fase 1).
 * No conoce UI, componentes ni CSS. No persiste cambios en Fase 1.
 */
import { crearEstadoManager } from '../workflow/EstadoManager.js';
import { WorkflowContext, crearWorkflowContext } from './WorkflowContext.js';
import {
  ETAPAS,
  FLUJO_ETAPAS,
  FLUJO_REQUERIMIENTO,
  resolveEtapaFromRow,
  resolveModuloActualFromRow,
  resolveResponsableFromRow,
  resolveEstadoNegocioFromRow,
  etapaToModuloLabel,
  normalizarEtapa,
  normalizarEstado,
} from './WorkflowState.js';
import {
  obtenerSiguienteEtapa,
  obtenerEtapaAnterior,
  obtenerDestinoPorAccion,
  validarTransicionEtapa,
  validarTransicionEstadoCore,
} from './WorkflowTransitions.js';
import {
  ACCIONES,
  puedeAccion,
  obtenerAccionesPermitidas,
} from './WorkflowPermissions.js';

function planAccion(tipo, context, extra = {}) {
  return {
    fase: 1,
    persistir: false,
    tipo,
    requerimientoId: context.requerimientoId,
    etapaOrigen: context.etapaActual,
    moduloOrigen: context.moduloActual,
    ...extra,
  };
}

function attachEventEmission(engine, plan, eventEngine, emitPlanEvents) {
  if (!eventEngine || emitPlanEvents === false) return plan;
  const emission = eventEngine.emitDesdePlanWorkflow(plan, {
    workflowSnapshot: engine.obtenerWorkflowSnapshot(),
    observacionesSnapshot: null,
    moduloOrigen: plan.moduloOrigen,
    moduloDestino: plan.destino,
    usuario: plan.payload?.usuario,
  });
  return {
    ...plan,
    fase: 2,
    eventoEmitido: emission.evento || null,
    eventEmission: emission,
    persistir: false,
  };
}

export class WorkflowEngine {
  /**
   * @param {Object|WorkflowContext} input - fila requerimiento o contexto
   * @param {Object} opts - opciones de consulta (moduloConsulta, moduloLabel, usuario)
   * @param {Object} deps - dependencias opcionales (estadoManager, workflowManager legacy)
   */
  constructor(input = {}, opts = {}, deps = {}) {
    this.ctx = input instanceof WorkflowContext
      ? input
      : crearWorkflowContext(input, opts);
    this.estadoManager = deps.estadoManager || crearEstadoManager();
    this.workflowManager = deps.workflowManager || null;
    /** @type {import('../eventEngine/EventEngine.js').EventEngine|null} */
    this.eventEngine = deps.eventEngine || null;
    /** Si true y hay eventEngine, emite eventos al generar planes (sin persistir motores). */
    this.emitPlanEvents = deps.emitPlanEvents !== false && !!this.eventEngine;
  }

  _finalizarPlan(tipo, extra = {}) {
    const plan = planAccion(tipo, this.ctx, extra);
    return attachEventEmission(this, plan, this.eventEngine, this.emitPlanEvents);
  }

  /** @returns {WorkflowContext} */
  obtenerContexto() {
    return this.ctx;
  }

  obtenerEstado() {
    return {
      negocio: this.ctx.estado,
      core: normalizarEstado(this.ctx.estado) || resolveEstadoNegocioFromRow(this.ctx.raw),
      etapa: this.ctx.etapaActual,
    };
  }

  obtenerModuloActual() {
    return this.ctx.moduloActual;
  }

  obtenerModuloAnterior() {
    const prev = obtenerEtapaAnterior(this.ctx.etapaActual);
    return prev ? etapaToModuloLabel(prev) : null;
  }

  obtenerModuloDestino(accion = 'APROBAR') {
    const dest = obtenerDestinoPorAccion(this.ctx.etapaActual, accion);
    return dest ? etapaToModuloLabel(dest) : null;
  }

  obtenerResponsable() {
    return this.ctx.responsableActual || this.ctx.responsable;
  }

  obtenerModuloEmisor(accion = 'DERIVAR') {
    return this.ctx.moduloActual;
  }

  obtenerModuloReceptor(accion = 'APROBAR') {
    return this.obtenerModuloDestino(accion);
  }

  puedeAprobar() {
    return puedeAccion(ACCIONES.APROBAR, this.ctx);
  }

  puedeObservar() {
    return puedeAccion(ACCIONES.OBSERVAR, this.ctx);
  }

  puedeSubsanar() {
    return puedeAccion(ACCIONES.SUBSANAR, this.ctx);
  }

  puedeCerrar() {
    return puedeAccion(ACCIONES.CERRAR, this.ctx);
  }

  puedeDerivar() {
    return puedeAccion(ACCIONES.DERIVAR, this.ctx)
      && !!obtenerDestinoPorAccion(this.ctx.etapaActual, 'DERIVAR');
  }

  obtenerAccionesPermitidas() {
    return obtenerAccionesPermitidas(this.ctx);
  }

  validarTransicion(destino, opts = {}) {
    if (opts.usarEstadoCore) {
      return validarTransicionEstadoCore(
        this.ctx.estado,
        destino,
        this.estadoManager,
      );
    }
    const etapaDestino = normalizarEtapa(destino) || normalizarEtapa(etapaToModuloLabel(destino));
    return validarTransicionEtapa(this.ctx.etapaActual, etapaDestino || destino);
  }

  obtenerWorkflowSnapshot() {
    const siguiente = obtenerSiguienteEtapa(this.ctx.etapaActual);
    const anterior = obtenerEtapaAnterior(this.ctx.etapaActual);
    const acciones = this.obtenerAccionesPermitidas();
    const transicionDefault = this.validarTransicion(
      obtenerDestinoPorAccion(this.ctx.etapaActual, 'APROBAR') || siguiente,
    );

    return {
      requerimientoId: this.ctx.requerimientoId,
      codigo: this.ctx.codigo,
      estado: this.ctx.estado,
      etapaActual: this.ctx.etapaActual,
      moduloActual: this.ctx.moduloActual,
      subModuloActual: this.ctx.subModuloActual,
      moduloAnterior: anterior ? etapaToModuloLabel(anterior) : null,
      moduloDestino: this.obtenerModuloDestino('APROBAR'),
      responsable: this.obtenerResponsable(),
      accionesPermitidas: acciones,
      workflowValido: !!this.ctx.etapaActual && FLUJO_ETAPAS.includes(this.ctx.etapaActual),
      siguientePaso: siguiente ? etapaToModuloLabel(siguiente) : null,
      pasoAnterior: anterior ? etapaToModuloLabel(anterior) : null,
      transicionDefaultValida: transicionDefault.valido,
      historialEstadosCount: this.ctx.historialEstados.length,
      fase: 1,
    };
  }

  /** Fase 1: planifica sin persistir. Fase 2+: delegará en Event Engine. */
  derivar(destino, payload = {}) {
    const validacion = this.validarTransicion(destino);
    if (!validacion.valido) throw new Error(validacion.motivo || 'Derivación no permitida');
    const etapaDestino = normalizarEtapa(destino) || validacion.destino;
    return this._finalizarPlan('derivar', {
      destino: etapaToModuloLabel(etapaDestino),
      etapaDestino,
      payload,
    });
  }

  aprobar(payload = {}) {
    const etapaDestino = obtenerDestinoPorAccion(this.ctx.etapaActual, 'APROBAR');
    if (!etapaDestino) throw new Error('No hay destino de aprobación definido para la etapa actual');
    const validacion = this.validarTransicion(etapaDestino);
    if (!validacion.valido) throw new Error(validacion.motivo || 'Aprobación no permitida');
    return this._finalizarPlan('aprobar', {
      destino: etapaToModuloLabel(etapaDestino),
      etapaDestino,
      payload,
    });
  }

  observar(payload = {}) {
    if (!this.puedeObservar()) throw new Error('Observar no permitido en el contexto actual');
    return this._finalizarPlan('observar', {
      delegadoMotorObservaciones: true,
      payload,
    });
  }

  subsanar(payload = {}) {
    if (!this.puedeSubsanar()) throw new Error('Subsanar no permitido en el contexto actual');
    return this._finalizarPlan('subsanar', {
      delegadoMotorObservaciones: true,
      payload,
    });
  }

  cerrar(payload = {}) {
    if (!this.puedeCerrar()) throw new Error('Cerrar no permitido en el contexto actual');
    return this._finalizarPlan('cerrar', {
      delegadoMotorObservaciones: true,
      payload,
    });
  }

  /** Catálogos de referencia (solo lectura). */
  obtenerFlujoEtapas() {
    return FLUJO_ETAPAS.slice();
  }

  obtenerFlujoEstadosCore() {
    return FLUJO_REQUERIMIENTO.slice();
  }

  /** Resolución estática sin fila (utilidad para bandejas futuras). */
  static resolveEtapaFromRow(row) {
    return resolveEtapaFromRow(row);
  }

  static resolveModuloActualFromRow(row) {
    return resolveModuloActualFromRow(row);
  }

  static create(input, opts, deps) {
    return new WorkflowEngine(input, opts, deps);
  }
}

export function crearWorkflowEngine(input, opts, deps) {
  return WorkflowEngine.create(input, opts, deps);
}

export default WorkflowEngine;
