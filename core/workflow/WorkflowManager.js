/**
 * WorkflowManager — flujo de estados del REQUERIMIENTO únicamente.
 */
import { ESTADOS, FLUJO_REQUERIMIENTO } from '../common/ConstantesEstados.js';
import { resolverRequerimientoId, resolverCodigoRequerimiento, requerido } from '../common/Utils.js';
import { crearEstadoManager } from './EstadoManager.js';

const TRANSICIONES = Object.freeze(
  FLUJO_REQUERIMIENTO.reduce((acc, estado, idx) => {
    const siguientes = [];
    if (idx < FLUJO_REQUERIMIENTO.length - 1) siguientes.push(FLUJO_REQUERIMIENTO[idx + 1]);
    if (idx > 0) siguientes.push(FLUJO_REQUERIMIENTO[idx - 1]);
    acc[estado] = [...new Set(siguientes)];
    return acc;
  }, {}),
);

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
    const idx = FLUJO_REQUERIMIENTO.indexOf(n);
    return idx > 0 ? FLUJO_REQUERIMIENTO[idx - 1] : TRANSICIONES_INVERSAS[n] || null;
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
    requerido(payload.requerimientoId ?? payload.expedienteId, 'requerimientoId');
    if (this.timeline) {
      return this.timeline.registrarEvento({
        ...payload,
        requerimientoId: resolverRequerimientoId(payload),
        codigoRequerimiento: resolverCodigoRequerimiento(payload),
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
    const requerimientoId = resolverRequerimientoId(payload);
    if (this.historial) {
      await this.historial.registrarCambio({
        requerimientoId,
        codigoRequerimiento: resolverCodigoRequerimiento(payload, requerimientoId),
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

  obtenerFlujoLineal() {
    return FLUJO_REQUERIMIENTO.slice();
  }
}

export function crearWorkflowManager(contexto, deps) {
  return new WorkflowManager(contexto, deps);
}

export default WorkflowManager;
