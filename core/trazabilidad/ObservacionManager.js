/**
 * ObservacionManager — ciclo completo Emitida → Recibida → … → Cerrada.
 */
import { CICLO_OBSERVACION, TRANSICIONES_CICLO_OBSERVACION } from '../common/ConstantesEstados.js';
import { EVENTOS_FUNCIONALES } from '../common/CatalogoEventos.js';
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

function puedeTransicionar(estadoActual, estadoNuevo) {
  const permitidos = TRANSICIONES_CICLO_OBSERVACION[estadoActual] || [];
  return permitidos.includes(estadoNuevo) || estadoActual === estadoNuevo;
}

export class ObservacionManager {
  constructor(contexto, deps = {}) {
    this.ctx = contexto;
    this.store = contexto.store;
    this.timeline = deps.timeline || null;
    this.historial = deps.historial || null;
  }

  async _emitirTrazabilidad(obs, codigoEvento, extra = {}) {
    const payload = {
      requerimientoId: obs.requerimientoId,
      codigoRequerimiento: obs.codigoRequerimiento,
      modulo: extra.modulo || obs.moduloOrigen,
      moduloOrigen: obs.moduloOrigen,
      moduloDestino: obs.moduloDestino,
      observacion: obs.motivo,
      descripcion: extra.descripcion,
      ...extra,
    };
    if (this.timeline?.registrarEventoFuncional) {
      await this.timeline.registrarEventoFuncional(codigoEvento, payload);
    }
    if (this.historial?.registrarAccion) {
      const def = EVENTOS_FUNCIONALES[codigoEvento];
      await this.historial.registrarAccion({
        ...payload,
        eventoCodigo: codigoEvento,
        evento: def?.label || codigoEvento,
        descripcion: extra.descripcion || def?.label || obs.motivo,
      });
    }
  }

  async _guardarLista(requerimientoId, lista) {
    const id = claveRequerimiento(requerimientoId);
    await this.store.set(COLECCION, `${COLECCION}:${id}`, lista);
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
      estado: payload.estado || CICLO_OBSERVACION.EMITIDA,
      motivo: payload.motivo || payload.texto || '',
      respuesta: null,
      fechaCreacion: ts,
      fecha,
      hora,
      fechaRespuesta: null,
      horaRespuesta: null,
      cerrada: false,
      historialEstados: [{ estado: CICLO_OBSERVACION.EMITIDA, fecha: ts, usuario: usuarioOrigen }],
      metadata: payload.metadata || {},
    };

    await this.store.append(COLECCION, requerimientoId, obs);
    if (!payload.omitirTrazabilidad) {
      await this._emitirTrazabilidad(obs, 'OBSERVACION_REGISTRADA', { modulo: obs.moduloOrigen });
      await this._emitirTrazabilidad(obs, 'OBSERVACION_ENVIADA', { modulo: obs.moduloOrigen, moduloDestino: obs.moduloDestino });
    }
    return obs;
  }

  async marcarRecibida(requerimientoId, observacionId, opts = {}) {
    return this._actualizarEstado(requerimientoId, observacionId, CICLO_OBSERVACION.RECIBIDA, {
      ...opts,
      eventoTimeline: 'OBSERVACION_RECIBIDA',
      modulo: opts.modulo || opts.moduloDestino,
    });
  }

  async marcarEnAtencion(requerimientoId, observacionId, opts = {}) {
    return this._actualizarEstado(requerimientoId, observacionId, CICLO_OBSERVACION.EN_ATENCION, {
      ...opts,
      eventoTimeline: 'OBSERVACION_ATENDIDA',
    });
  }

  async responderObservacion(requerimientoId, observacionId, respuesta, opts = {}) {
    return this.registrarSubsanacion(requerimientoId, observacionId, respuesta, opts);
  }

  async registrarSubsanacion(requerimientoId, observacionId, respuesta, opts = {}) {
    const id = claveRequerimiento(requerimientoId);
    const lista = await this.listarObservaciones(id);
    const idx = lista.findIndex((o) => o.id === observacionId);
    if (idx < 0) throw new Error('Observación no encontrada');

    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const texto = requerido(respuesta, 'respuesta');
    const prev = lista[idx];

    lista[idx] = {
      ...prev,
      respuesta: texto,
      subsanacion: texto,
      fechaRespuesta: ts,
      fechaRespuestaFmt: fecha,
      horaRespuesta: hora,
      estado: CICLO_OBSERVACION.SUBSANADA,
      usuarioRespuesta: opts.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema',
      historialEstados: [
        ...(prev.historialEstados || []),
        { estado: CICLO_OBSERVACION.SUBSANADA, fecha: ts, usuario: opts.usuario || 'Sistema' },
      ],
    };

    await this._guardarLista(id, lista);
    const obs = lista[idx];
    if (!opts.omitirTrazabilidad) {
      await this._emitirTrazabilidad(obs, 'SUBSANACION_INICIADA', { descripcion: texto, modulo: opts.moduloOrigen || obs.moduloDestino });
      await this._emitirTrazabilidad(obs, 'SUBSANACION_REGISTRADA', { descripcion: texto });
      await this._emitirTrazabilidad(obs, 'SUBSANACION_ENVIADA', { descripcion: texto, moduloDestino: opts.moduloDestino || obs.moduloOrigen });
    }
    return obs;
  }

  async marcarRecibidaPorEmisor(requerimientoId, observacionId, opts = {}) {
    return this._actualizarEstado(requerimientoId, observacionId, CICLO_OBSERVACION.RECIBIDA_EMISOR, {
      ...opts,
      eventoTimeline: 'SUBSANACION_RECIBIDA',
      modulo: opts.moduloOrigen,
    });
  }

  async marcarSubsanacionAceptada(requerimientoId, observacionId, opts = {}) {
    return this._actualizarEstado(requerimientoId, observacionId, CICLO_OBSERVACION.RECIBIDA_EMISOR, {
      ...opts,
      eventoTimeline: 'SUBSANACION_ACEPTADA',
    });
  }

  async cerrarObservacion(requerimientoId, observacionId, opts = {}) {
    const obs = await this._actualizarEstado(requerimientoId, observacionId, CICLO_OBSERVACION.CERRADA, {
      ...opts,
      eventoTimeline: 'OBSERVACION_CERRADA',
      cerrada: true,
    });
    return obs;
  }

  async _actualizarEstado(requerimientoId, observacionId, estadoNuevo, opts = {}) {
    const id = claveRequerimiento(requerimientoId);
    const lista = await this.listarObservaciones(id);
    const idx = lista.findIndex((o) => o.id === observacionId);
    if (idx < 0) throw new Error('Observación no encontrada');

    const prev = lista[idx];
    if (!opts.omitirValidacion && !puedeTransicionar(prev.estado, estadoNuevo)) {
      throw new Error(`Transición de observación no permitida: ${prev.estado} → ${estadoNuevo}`);
    }

    const ts = ahoraISO();
    lista[idx] = {
      ...prev,
      estado: estadoNuevo,
      cerrada: opts.cerrada ?? prev.cerrada,
      fechaCierre: estadoNuevo === CICLO_OBSERVACION.CERRADA ? ts : prev.fechaCierre,
      historialEstados: [
        ...(prev.historialEstados || []),
        { estado: estadoNuevo, fecha: ts, usuario: opts.usuario || 'Sistema' },
      ],
    };

    await this._guardarLista(id, lista);
    const obs = lista[idx];
    if (opts.eventoTimeline && !opts.omitirTrazabilidad) {
      await this._emitirTrazabilidad(obs, opts.eventoTimeline, opts);
    }
    return obs;
  }

  async listarObservaciones(requerimientoId) {
    return this.store.getLista(COLECCION, claveRequerimiento(requerimientoId));
  }

  async obtenerPendientes(requerimientoId) {
    const lista = await this.listarObservaciones(requerimientoId);
    return lista.filter((o) => o.estado !== CICLO_OBSERVACION.CERRADA && !o.cerrada);
  }

  async contarPendientes(requerimientoId) {
    const pendientes = await this.obtenerPendientes(requerimientoId);
    return pendientes.length;
  }

  async listarObservacionesPorExpediente(expedienteId) {
    return this.listarObservaciones(resolverIdLegacy(expedienteId));
  }
}

export function crearObservacionManager(contexto, deps) {
  return new ObservacionManager(contexto, deps);
}

export default ObservacionManager;
