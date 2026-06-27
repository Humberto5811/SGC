/**
 * EstadoManager — catálogo y utilidades de estados del Core.
 */
import { ESTADOS, ESTADOS_LIST, ESTADOS_TERMINALES, esEstadoValido, normalizarEstado } from '../common/ConstantesEstados.js';

export class EstadoManager {
  obtenerCatalogo() {
    return ESTADOS_LIST.slice();
  }

  obtenerConstantes() {
    return { ...ESTADOS };
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
