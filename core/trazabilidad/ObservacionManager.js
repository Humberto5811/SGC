/**
 * ObservacionManager — observaciones asociadas al REQUERIMIENTO.
 */
import { ESTADOS_OBSERVACION } from '../common/ConstantesEstados.js';
import {
  generarId,
  ahoraISO,
  formatearFechaHora,
  requerido,
  resolverRequerimientoId,
  resolverCodigoRequerimiento,
  resolverIdLegacy,
} from '../common/Utils.js';

const COLECCION = 'observaciones';

function claveRequerimiento(idOrPayload) {
  return resolverRequerimientoId(typeof idOrPayload === 'object' ? idOrPayload : { requerimientoId: idOrPayload });
}

export class ObservacionManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async crearObservacion(payload = {}) {
    const requerimientoId = claveRequerimiento(payload);
    const codigoRequerimiento = resolverCodigoRequerimiento(payload, requerimientoId);
    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuarioOrigen = payload.usuarioOrigen || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const obs = {
      id: generarId('obs'),
      requerimientoId,
      codigoRequerimiento,
      usuarioOrigen,
      usuarioDestino: payload.usuarioDestino || payload.destinoPersona || '',
      moduloOrigen: payload.moduloOrigen || payload.origenModulo || '',
      moduloDestino: payload.moduloDestino || payload.destinoSubmodulo || '',
      estado: payload.estado || ESTADOS_OBSERVACION.OBSERVADO,
      motivo: payload.motivo || payload.texto || '',
      respuesta: null,
      fechaCreacion: ts,
      fecha: fecha,
      hora: hora,
      fechaRespuesta: null,
      horaRespuesta: null,
      cerrada: false,
      metadata: payload.metadata || {},
    };

    await this.store.append(COLECCION, requerimientoId, obs);
    return obs;
  }

  async responderObservacion(requerimientoId, observacionId, respuesta, opts = {}) {
    const id = claveRequerimiento(requerimientoId);
    const lista = await this.listarObservaciones(id);
    const idx = lista.findIndex((o) => o.id === observacionId);
    if (idx < 0) throw new Error('Observación no encontrada');

    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    lista[idx] = {
      ...lista[idx],
      respuesta: requerido(respuesta, 'respuesta'),
      fechaRespuesta: ts,
      fechaRespuestaFmt: fecha,
      horaRespuesta: hora,
      estado: opts.estado || ESTADOS_OBSERVACION.RESPONDIDO,
      usuarioRespuesta: opts.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema',
    };

    await this.store.set(COLECCION, `${COLECCION}:${id}`, lista);
    return lista[idx];
  }

  async cerrarObservacion(requerimientoId, observacionId, opts = {}) {
    const id = claveRequerimiento(requerimientoId);
    const lista = await this.listarObservaciones(id);
    const idx = lista.findIndex((o) => o.id === observacionId);
    if (idx < 0) throw new Error('Observación no encontrada');

    lista[idx] = {
      ...lista[idx],
      cerrada: true,
      estado: opts.estado || ESTADOS_OBSERVACION.CERRADO,
      fechaCierre: ahoraISO(),
    };

    await this.store.set(COLECCION, `${COLECCION}:${id}`, lista);
    return lista[idx];
  }

  async listarObservaciones(requerimientoId) {
    return this.store.getLista(COLECCION, claveRequerimiento(requerimientoId));
  }

  async obtenerPendientes(requerimientoId) {
    const lista = await this.listarObservaciones(requerimientoId);
    return lista.filter((o) => !o.cerrada && !o.respuesta);
  }

  async contarPendientes(requerimientoId) {
    const pendientes = await this.obtenerPendientes(requerimientoId);
    return pendientes.length;
  }

  /** @deprecated alias legacy — expedienteId como requerimientoId */
  async listarObservacionesPorExpediente(expedienteId) {
    return this.listarObservaciones(resolverIdLegacy(expedienteId));
  }
}

export function crearObservacionManager(contexto) {
  return new ObservacionManager(contexto);
}

export default ObservacionManager;
