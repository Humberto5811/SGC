/**
 * WorkflowManager — estructura del flujo de estados (fase 1: sin integración).
 */
import { ESTADOS } from '../common/ConstantesEstados.js';
import { requerido } from '../common/Utils.js';
import { crearEstadoManager } from './EstadoManager.js';

/** Mapa provisional de transiciones — se ampliará en fase de migración. */
const TRANSICIONES = Object.freeze({
  [ESTADOS.BORRADOR]: [ESTADOS.PENDIENTE, ESTADOS.EN_PROCESO, ESTADOS.ANULADO],
  [ESTADOS.PENDIENTE]: [ESTADOS.EN_PROCESO, ESTADOS.DERIVADO, ESTADOS.OBSERVADO, ESTADOS.ANULADO],
  [ESTADOS.EN_PROCESO]: [ESTADOS.DERIVADO, ESTADOS.OBSERVADO, ESTADOS.APROBADO, ESTADOS.RECHAZADO],
  [ESTADOS.DERIVADO]: [ESTADOS.EN_PROCESO, ESTADOS.OBSERVADO, ESTADOS.APROBADO],
  [ESTADOS.OBSERVADO]: [ESTADOS.RESPONDIDO, ESTADOS.EN_PROCESO, ESTADOS.RECHAZADO],
  [ESTADOS.RESPONDIDO]: [ESTADOS.EN_PROCESO, ESTADOS.DERIVADO, ESTADOS.APROBADO],
  [ESTADOS.APROBADO]: [ESTADOS.FINALIZADO, ESTADOS.CERRADO, ESTADOS.DERIVADO],
  [ESTADOS.RECHAZADO]: [ESTADOS.CERRADO, ESTADOS.ANULADO],
  [ESTADOS.FINALIZADO]: [ESTADOS.CERRADO],
  [ESTADOS.CERRADO]: [],
  [ESTADOS.ANULADO]: [],
});

const TRANSICIONES_INVERSAS = Object.freeze(
  Object.entries(TRANSICIONES).reduce((acc, [origen, destinos]) => {
    destinos.forEach((d) => {
      if (!acc[d]) acc[d] = origen;
    });
    return acc;
  }, {}),
);

export class WorkflowManager {
  constructor(contexto, deps = {}) {
    this.ctx = contexto;
    this.estadoManager = deps.estadoManager || crearEstadoManager();
    this.timeline = deps.timeline || null;
    this.historial = deps.historial || null;
  }

  obtenerSiguienteEstado(estadoActual) {
    const n = this.estadoManager.normalizar(estadoActual);
    if (!n) return [];
    return TRANSICIONES[n] || [];
  }

  obtenerEstadoAnterior(estadoActual) {
    const n = this.estadoManager.normalizar(estadoActual);
    if (!n) return null;
    return TRANSICIONES_INVERSAS[n] || null;
  }

  validarTransicion(estadoActual, estadoNuevo) {
    const actual = this.estadoManager.normalizar(estadoActual);
    const nuevo = this.estadoManager.normalizar(estadoNuevo);
    if (!actual || !nuevo) return { valido: false, motivo: 'Estado inválido' };
    const permitidos = TRANSICIONES[actual] || [];
    return {
      valido: permitidos.includes(nuevo),
      motivo: permitidos.includes(nuevo) ? '' : `Transición ${actual} → ${nuevo} no permitida`,
    };
  }

  async registrarMovimiento(payload = {}) {
    requerido(payload.expedienteId, 'expedienteId');
    if (this.timeline) {
      return this.timeline.registrarEvento({
        ...payload,
        estadoAnterior: payload.estadoAnterior,
        estadoNuevo: payload.estadoNuevo,
      });
    }
    return { registrado: false, motivo: 'TimelineManager no configurado' };
  }

  async registrarCambioEstado(payload = {}) {
    const validacion = this.validarTransicion(payload.estadoAnterior, payload.estadoNuevo);
    if (!validacion.valido && !payload.omitirValidacion) {
      throw new Error(validacion.motivo);
    }
    if (this.historial) {
      await this.historial.registrarCambio({
        expedienteId: payload.expedienteId,
        cambio: `Estado: ${payload.estadoAnterior} → ${payload.estadoNuevo}`,
        modulo: payload.modulo,
        submodulo: payload.submodulo,
        valorAnterior: payload.estadoAnterior,
        valorNuevo: payload.estadoNuevo,
        campo: 'estado',
      });
    }
    return this.registrarMovimiento(payload);
  }
}

export function crearWorkflowManager(contexto, deps) {
  return new WorkflowManager(contexto, deps);
}

export default WorkflowManager;
