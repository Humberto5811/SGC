/**
 * ObservacionManager — gestión unificada de observaciones.
 */
import { ESTADOS } from '../common/ConstantesEstados.js';
import { generarId, ahoraISO, requerido } from '../common/Utils.js';

const COLECCION = 'observaciones';

function claveExpediente(expedienteId) {
  return String(requerido(expedienteId, 'expedienteId'));
}

export class ObservacionManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async crearObservacion(payload = {}) {
    const expedienteId = claveExpediente(payload.expedienteId);
    const ts = ahoraISO();
    const usuarioOrigen = payload.usuarioOrigen || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const obs = {
      id: generarId('obs'),
      expedienteId,
      usuarioOrigen,
      usuarioDestino: payload.usuarioDestino || payload.destinoPersona || '',
      moduloOrigen: payload.moduloOrigen || payload.origenModulo || '',
      moduloDestino: payload.moduloDestino || payload.destinoSubmodulo || '',
      estado: payload.estado || ESTADOS.OBSERVADO,
      motivo: payload.motivo || payload.texto || '',
      respuesta: null,
      fechaCreacion: ts,
      fechaRespuesta: null,
      cerrada: false,
      metadata: payload.metadata || {},
    };

    await this.store.append(COLECCION, expedienteId, obs);
    return obs;
  }

  async responderObservacion(expedienteId, observacionId, respuesta, opts = {}) {
    const lista = await this.listarObservaciones(expedienteId);
    const idx = lista.findIndex((o) => o.id === observacionId);
    if (idx < 0) throw new Error('Observación no encontrada');

    const ts = ahoraISO();
    lista[idx] = {
      ...lista[idx],
      respuesta: requerido(respuesta, 'respuesta'),
      fechaRespuesta: ts,
      estado: opts.estado || ESTADOS.RESPONDIDO,
      usuarioRespuesta: opts.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema',
    };

    const storeKey = `${COLECCION}:${claveExpediente(expedienteId)}`;
    await this.store.set(COLECCION, storeKey, lista);
    return lista[idx];
  }

  async cerrarObservacion(expedienteId, observacionId, opts = {}) {
    const lista = await this.listarObservaciones(expedienteId);
    const idx = lista.findIndex((o) => o.id === observacionId);
    if (idx < 0) throw new Error('Observación no encontrada');

    lista[idx] = {
      ...lista[idx],
      cerrada: true,
      estado: opts.estado || ESTADOS.CERRADO,
      fechaCierre: ahoraISO(),
    };

    const storeKey = `${COLECCION}:${claveExpediente(expedienteId)}`;
    await this.store.set(COLECCION, storeKey, lista);
    return lista[idx];
  }

  async listarObservaciones(expedienteId) {
    return this.store.getLista(COLECCION, claveExpediente(expedienteId));
  }

  async obtenerPendientes(expedienteId) {
    const lista = await this.listarObservaciones(expedienteId);
    return lista.filter((o) => !o.cerrada && !o.respuesta);
  }

  async contarPendientes(expedienteId) {
    const pendientes = await this.obtenerPendientes(expedienteId);
    return pendientes.length;
  }
}

export function crearObservacionManager(contexto) {
  return new ObservacionManager(contexto);
}

export default ObservacionManager;
