/**
 * TimelineManager — eventos funcionales cronológicos del REQUERIMIENTO.
 */
import { TIPOS_EVENTO_TIMELINE } from '../common/ConstantesEventos.js';
import { obtenerEvento } from '../common/CatalogoEventos.js';
import {
  generarId,
  ahoraISO,
  formatearFechaHora,
  resolverRequerimientoId,
  resolverCodigoRequerimiento,
  resolverIdLegacy,
} from '../common/Utils.js';

const COLECCION = 'timeline';

function claveRequerimiento(idOrPayload) {
  return resolverRequerimientoId(typeof idOrPayload === 'object' ? idOrPayload : { requerimientoId: idOrPayload });
}

function construirEventoBase(payload, ctx) {
  const requerimientoId = claveRequerimiento(payload);
  const codigoRequerimiento = resolverCodigoRequerimiento(payload, requerimientoId);
  const ts = payload.timestamp || ahoraISO();
  const { fecha, hora } = formatearFechaHora(ts);
  const usuario = payload.usuario || ctx.obtenerUsuario()?.nombre || 'Sistema';
  return { requerimientoId, codigoRequerimiento, ts, fecha, hora, usuario };
}

export class TimelineManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  /** Registro genérico — compatibilidad fase 1. */
  async registrarEvento(payload = {}) {
    const base = construirEventoBase(payload, this.ctx);
    const evento = {
      id: generarId('tl'),
      requerimientoId: base.requerimientoId,
      codigoRequerimiento: base.codigoRequerimiento,
      expedienteId: payload.expedienteId || null,
      usuario: base.usuario,
      fecha: base.fecha,
      hora: base.hora,
      timestamp: base.ts,
      modulo: payload.modulo || '',
      submodulo: payload.submodulo || '',
      moduloOrigen: payload.moduloOrigen || payload.modulo_origen || null,
      moduloDestino: payload.moduloDestino || payload.modulo_destino || null,
      accion: payload.accion || '',
      eventoCodigo: payload.eventoCodigo || payload.codigoEvento || null,
      eventoLabel: payload.eventoLabel || payload.descripcion || payload.accion || '',
      descripcion: payload.descripcion || payload.observacion || '',
      estadoAnterior: payload.estadoAnterior ?? payload.estado_anterior ?? null,
      estadoNuevo: payload.estadoNuevo ?? payload.estado_nuevo ?? null,
      observacion: payload.observacion || '',
      ip: payload.ip || this.ctx.obtenerIp() || '',
      adjuntosRelacionados: payload.adjuntosRelacionados || payload.adjuntos || [],
      tipoEvento: payload.tipoEvento || TIPOS_EVENTO_TIMELINE.ETAPA,
      esEventoFuncional: !!payload.esEventoFuncional,
      metadata: payload.metadata || {},
    };
    await this.store.append(COLECCION, base.requerimientoId, evento);
    return evento;
  }

  /**
   * Registro desde catálogo EVENTOS_FUNCIONALES.
   * @param {string} codigoEvento — clave del catálogo (ej. OBSERVACION_REGISTRADA)
   */
  async registrarEventoFuncional(codigoEvento, payload = {}) {
    const def = obtenerEvento(codigoEvento);
    if (!def) throw new Error(`Evento funcional desconocido: ${codigoEvento}`);
    return this.registrarEvento({
      ...payload,
      eventoCodigo: def.codigo,
      eventoLabel: payload.eventoLabel || def.label,
      descripcion: payload.descripcion || def.label,
      accion: payload.accion || def.codigo,
      tipoEvento: payload.tipoEvento || def.tipoEvento,
      esEventoFuncional: true,
    });
  }

  async obtenerTimeline(requerimientoId) {
    const id = claveRequerimiento(requerimientoId);
    const eventos = await this.listarEventos(id);
    const codigo = eventos.length
      ? eventos[eventos.length - 1].codigoRequerimiento
      : resolverCodigoRequerimiento({}, id);
    return { requerimientoId: id, codigoRequerimiento: codigo, eventos, total: eventos.length };
  }

  async listarEventos(requerimientoId) {
    const lista = await this.store.getLista(COLECCION, claveRequerimiento(requerimientoId));
    return lista.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }

  async obtenerUltimoEvento(requerimientoId) {
    const eventos = await this.listarEventos(requerimientoId);
    return eventos.length ? eventos[eventos.length - 1] : null;
  }

  async filtrarEventos(requerimientoId, criterios = {}) {
    const eventos = await this.listarEventos(requerimientoId);
    return eventos.filter((e) => {
      if (criterios.modulo && e.modulo !== criterios.modulo) return false;
      if (criterios.submodulo && e.submodulo !== criterios.submodulo) return false;
      if (criterios.accion && e.accion !== criterios.accion) return false;
      if (criterios.eventoCodigo && e.eventoCodigo !== criterios.eventoCodigo) return false;
      if (criterios.tipoEvento && e.tipoEvento !== criterios.tipoEvento) return false;
      if (criterios.codigoRequerimiento && e.codigoRequerimiento !== criterios.codigoRequerimiento) return false;
      if (criterios.desde && String(e.timestamp) < String(criterios.desde)) return false;
      if (criterios.hasta && String(e.timestamp) > String(criterios.hasta)) return false;
      return true;
    });
  }

  /** Vista cronológica agrupada por fecha/hora (para render futuro). */
  async obtenerTimelineCronologico(requerimientoId) {
    const { eventos, ...rest } = await this.obtenerTimeline(requerimientoId);
    const linea = eventos.map((e) => ({
      id: e.id,
      fecha: e.fecha,
      hora: e.hora,
      timestamp: e.timestamp,
      modulo: e.modulo,
      evento: e.eventoLabel || e.accion,
      descripcion: e.descripcion || e.observacion,
      usuario: e.usuario,
      tipoEvento: e.tipoEvento,
      eventoCodigo: e.eventoCodigo,
    }));
    return { ...rest, linea, eventos };
  }

  /** @deprecated alias legacy */
  async obtenerTimelinePorExpediente(expedienteId) {
    return this.obtenerTimeline(resolverIdLegacy(expedienteId));
  }
}

export function crearTimelineManager(contexto) {
  return new TimelineManager(contexto);
}

export default TimelineManager;
