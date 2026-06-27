/**
 * TimelineManager — trazabilidad del REQUERIMIENTO (entidad principal).
 */
import { TIPOS_EVENTO_TIMELINE } from '../common/ConstantesEventos.js';
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

export class TimelineManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async registrarEvento(payload = {}) {
    const requerimientoId = claveRequerimiento(payload);
    const codigoRequerimiento = resolverCodigoRequerimiento(payload, requerimientoId);
    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuario = payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const evento = {
      id: generarId('tl'),
      requerimientoId,
      codigoRequerimiento,
      /** @deprecated compat fase 1 — usar requerimientoId */
      expedienteId: payload.expedienteId || null,
      usuario,
      fecha,
      hora,
      timestamp: ts,
      modulo: payload.modulo || '',
      submodulo: payload.submodulo || '',
      accion: payload.accion || '',
      estadoAnterior: payload.estadoAnterior ?? payload.estado_anterior ?? null,
      estadoNuevo: payload.estadoNuevo ?? payload.estado_nuevo ?? null,
      observacion: payload.observacion || '',
      ip: payload.ip || this.ctx.obtenerIp() || '',
      adjuntosRelacionados: payload.adjuntosRelacionados || payload.adjuntos || [],
      tipoEvento: payload.tipoEvento || TIPOS_EVENTO_TIMELINE.ETAPA,
      metadata: payload.metadata || {},
    };

    await this.store.append(COLECCION, requerimientoId, evento);
    return evento;
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
      if (criterios.codigoRequerimiento && e.codigoRequerimiento !== criterios.codigoRequerimiento) return false;
      if (criterios.desde && String(e.timestamp) < String(criterios.desde)) return false;
      if (criterios.hasta && String(e.timestamp) > String(criterios.hasta)) return false;
      return true;
    });
  }

  /** @deprecated alias legacy — expedienteId = requerimientoId en fase 1 */
  async obtenerTimelinePorExpediente(expedienteId) {
    return this.obtenerTimeline(resolverIdLegacy(expedienteId));
  }
}

export function crearTimelineManager(contexto) {
  return new TimelineManager(contexto);
}

export default TimelineManager;
