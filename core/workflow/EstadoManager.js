/**
 * EstadoManager — catálogo de estados del REQUERIMIENTO (workflow).
 */
import {
  ESTADOS,
  ESTADOS_REQUERIMIENTO,
  ESTADOS_LIST,
  ESTADOS_TERMINALES,
  ESTADOS_OBSERVACION,
  FLUJO_REQUERIMIENTO,
  esEstadoValido,
  normalizarEstado,
} from '../common/ConstantesEstados.js';

export class EstadoManager {
  obtenerCatalogo() {
    return ESTADOS_LIST.slice();
  }

  obtenerConstantes() {
    return { ...ESTADOS_REQUERIMIENTO };
  }

  obtenerEstadosObservacion() {
    return { ...ESTADOS_OBSERVACION };
  }

  obtenerFlujoLineal() {
    return FLUJO_REQUERIMIENTO.slice();
  }

  esValido(estado) {
    return esEstadoValido(estado);
  }

  normalizar(estado) {
    return normalizarEstado(estado);
  }

  esTerminal(estado) {
    const n = normalizarEstado(estado);
    return n ? ESTADOS_TERMINALES.includes(n) : false;
  }

  comparar(a, b) {
    return normalizarEstado(a) === normalizarEstado(b);
  }
}

export function crearEstadoManager() {
  return new EstadoManager();
}

export default EstadoManager;
