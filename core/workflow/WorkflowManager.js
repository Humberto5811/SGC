/**
 * WorkflowManager — flujo de estados del REQUERIMIENTO + registro automático de eventos por módulo.
 */
import { ESTADOS, ESTADOS_MODULO, FLUJO_REQUERIMIENTO } from '../common/ConstantesEstados.js';
import { obtenerEventoDerivacion } from '../common/CatalogoEventos.js';
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

function basePayload(payload) {
  const requerimientoId = resolverRequerimientoId(payload);
  return {
    ...payload,
    requerimientoId,
    codigoRequerimiento: resolverCodigoRequerimiento(payload, requerimientoId),
  };
}

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

  async _registrarEventoModulo(codigoEvento, payload = {}) {
    const p = basePayload(payload);
    if (this.timeline?.registrarEventoFuncional) {
      await this.timeline.registrarEventoFuncional(codigoEvento, {
        ...p,
        modulo: p.modulo || p.submodulo,
        estadoModulo: p.estadoModulo,
      });
    } else if (this.timeline) {
      await this.timeline.registrarEvento({ ...p, eventoCodigo: codigoEvento });
    }
    if (this.historial?.registrarAccion) {
      await this.historial.registrarAccion({
        ...p,
        eventoCodigo: codigoEvento,
        estadoAnterior: p.estadoAnterior,
        estadoNuevo: p.estadoNuevo || p.estadoModulo,
      });
    }
    return p;
  }

  /** Módulo recibe el requerimiento. */
  async registrarRecibido(payload = {}) {
    requerido(payload.requerimientoId ?? payload.expedienteId, 'requerimientoId');
    return this._registrarEventoModulo('REQUERIMIENTO_RECIBIDO', {
      ...payload,
      estadoModulo: ESTADOS_MODULO.RECIBIDO,
    });
  }

  /** Módulo inicia procesamiento. */
  async registrarEnProceso(payload = {}) {
    requerido(payload.requerimientoId ?? payload.expedienteId, 'requerimientoId');
    return this._registrarEventoModulo('EN_PROCESO', {
      ...payload,
      estadoModulo: ESTADOS_MODULO.EN_PROCESO,
    });
  }

  /** Módulo emite observación (si corresponde). */
  async registrarObservado(payload = {}) {
    requerido(payload.requerimientoId ?? payload.expedienteId, 'requerimientoId');
    return this._registrarEventoModulo('OBSERVACION_REGISTRADA', {
      ...payload,
      estadoModulo: ESTADOS_MODULO.OBSERVADO,
    });
  }

  /** Módulo registra subsanación (si corresponde). */
  async registrarSubsanado(payload = {}) {
    requerido(payload.requerimientoId ?? payload.expedienteId, 'requerimientoId');
    return this._registrarEventoModulo('SUBSANACION_REGISTRADA', {
      ...payload,
      estadoModulo: ESTADOS_MODULO.SUBSANADO,
    });
  }

  /** Módulo aprueba. */
  async registrarAprobado(payload = {}) {
    requerido(payload.requerimientoId ?? payload.expedienteId, 'requerimientoId');
    return this._registrarEventoModulo('APROBADO', {
      ...payload,
      estadoModulo: ESTADOS_MODULO.APROBADO,
    });
  }

  /** Módulo deriva al siguiente — registra evento de derivación + recepción en destino (opcional). */
  async registrarDerivado(payload = {}) {
    requerido(payload.requerimientoId ?? payload.expedienteId, 'requerimientoId');
    const p = basePayload(payload);
    const destino = p.moduloDestino || p.destino || p.submodulo;
    const def = obtenerEventoDerivacion(destino);
    const codigo = def?.codigo || 'DERIVADO';

    await this._registrarEventoModulo(codigo, {
      ...p,
      moduloDestino: destino,
      estadoModulo: ESTADOS_MODULO.DERIVADO,
      descripcion: p.descripcion || def?.label || `Derivado a ${destino || 'siguiente módulo'}`,
    });

    if (p.registrarRecepcionDestino !== false && destino) {
      await this._registrarEventoModulo('REQUERIMIENTO_RECIBIDO', {
        ...p,
        modulo: destino,
        moduloOrigen: p.modulo || p.moduloOrigen,
        moduloDestino: destino,
        estadoModulo: ESTADOS_MODULO.RECIBIDO,
      });
    }
    return p;
  }

  async registrarMovimiento(payload = {}) {
    requerido(payload.requerimientoId ?? payload.expedienteId, 'requerimientoId');
    if (this.timeline) {
      return this.timeline.registrarEvento({
        ...basePayload(payload),
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
    const p = basePayload(payload);
    if (this.historial) {
      await this.historial.registrarAccion({
        ...p,
        eventoCodigo: 'CAMBIO_ESTADO',
        descripcion: `Estado: ${payload.estadoAnterior} → ${payload.estadoNuevo}`,
        cambio: `Estado: ${payload.estadoAnterior} → ${payload.estadoNuevo}`,
        campo: 'estado',
        valorAnterior: payload.estadoAnterior,
        valorNuevo: payload.estadoNuevo,
      });
    }
    return this.registrarMovimiento(payload);
  }

  obtenerFlujoLineal() {
    return FLUJO_REQUERIMIENTO.slice();
  }

  obtenerEstadosModulo() {
    return { ...ESTADOS_MODULO };
  }
}

export function crearWorkflowManager(contexto, deps) {
  return new WorkflowManager(contexto, deps);
}

export default WorkflowManager;
