/**
 * EventEngine — capa de distribución de eventos del SGC (Fase 2).
 * NO escribe directamente en Timeline, Historial, Observaciones, Auditoría, Dashboard ni KPIs.
 */
import { crearEventContext } from './EventContext.js';
import { crearEventSubscribers } from './EventSubscribers.js';
import { crearEventDispatcher } from './EventDispatcher.js';
import {
  EVENTOS,
  esEventoValido,
  normalizarCodigoEvento,
  obtenerEventoCatalogo,
  mapPlanWorkflowToEvento,
} from './EventCatalog.js';

export class EventEngine {
  constructor(deps = {}) {
    this.subscribers = deps.subscribers || crearEventSubscribers();
    this.dispatcher = deps.dispatcher || crearEventDispatcher(this.subscribers);
    this._ultimoEvento = null;
    this._historialMemoria = deps.historialMemoria !== false ? [] : null;
    this._maxHistorial = deps.maxHistorial || 200;
  }

  /** Alias canónico de emisión validada. */
  registrarEvento(codigoEvento, fields = {}) {
    return this.emitSync(codigoEvento, fields);
  }

  emit(codigoEvento, fields = {}) {
    return this.emitAsync(codigoEvento, fields);
  }

  emitSync(codigoEvento, fields = {}) {
    const context = this._buildContext(codigoEvento, fields);
    const dispatchResult = this.dispatcher.dispatch(context, fields.dispatch || {});
    const snapshot = context.obtenerEventSnapshot();
    const result = {
      ok: dispatchResult.errores.length === 0,
      evento: context.evento,
      snapshot,
      dispatch: dispatchResult,
      fase: 2,
      persistido: false,
    };
    this._ultimoEvento = result;
    this._pushHistorial(result);
    return result;
  }

  async emitAsync(codigoEvento, fields = {}) {
    return Promise.resolve(this.emitSync(codigoEvento, fields));
  }

  /** Emisión desde plan del Workflow Engine (integración preparada — solo dispatch). */
  emitDesdePlanWorkflow(plan = {}, fields = {}) {
    const codigo = mapPlanWorkflowToEvento(plan);
    if (!codigo) {
      return {
        ok: false,
        motivo: 'No hay evento mapeado para el plan de workflow',
        plan,
        fase: 2,
      };
    }
    return this.emitSync(codigo, {
      requerimientoId: plan.requerimientoId,
      moduloOrigen: plan.moduloOrigen || fields.moduloOrigen,
      moduloDestino: plan.destino || plan.moduloDestino || fields.moduloDestino,
      usuario: fields.usuario || plan.payload?.usuario,
      payload: { ...(plan.payload || {}), plan },
      workflowSnapshot: fields.workflowSnapshot,
      observacionesSnapshot: fields.observacionesSnapshot,
      metadata: { origen: 'WorkflowEngine', tipoPlan: plan.tipo },
    });
  }

  subscribe(evento, callback, opts) {
    return this.subscribers.subscribe(evento, callback, opts);
  }

  unsubscribe(idOrEvento, callback) {
    return this.subscribers.unsubscribe(idOrEvento, callback);
  }

  obtenerEventSnapshot() {
    return this._ultimoEvento?.snapshot || null;
  }

  obtenerUltimoEvento() {
    return this._ultimoEvento;
  }

  listarHistorialMemoria(limit = 20) {
    if (!this._historialMemoria) return [];
    return this._historialMemoria.slice(-limit);
  }

  _buildContext(codigoEvento, fields) {
    const codigo = normalizarCodigoEvento(codigoEvento);
    if (!codigo || !esEventoValido(codigo)) {
      throw new Error(`Evento inválido o no catalogado: ${codigoEvento}`);
    }
    return crearEventContext({
      evento: codigo,
      eventoDef: obtenerEventoCatalogo(codigo),
      requerimientoId: fields.requerimientoId,
      codigoRequerimiento: fields.codigoRequerimiento || fields.codigo,
      moduloOrigen: fields.moduloOrigen,
      moduloDestino: fields.moduloDestino,
      usuario: fields.usuario,
      fecha: fields.fecha,
      hora: fields.hora,
      timestamp: fields.timestamp,
      payload: fields.payload,
      workflowSnapshot: fields.workflowSnapshot,
      observacionesSnapshot: fields.observacionesSnapshot,
      metadata: fields.metadata,
    });
  }

  _pushHistorial(result) {
    if (!this._historialMemoria) return;
    this._historialMemoria.push(result);
    if (this._historialMemoria.length > this._maxHistorial) {
      this._historialMemoria.shift();
    }
  }
}

export function crearEventEngine(deps) {
  return new EventEngine(deps);
}

export { EVENTOS };

export default EventEngine;
