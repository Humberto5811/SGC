/**
 * TimelineManager — administración del timeline único del expediente.
 */
import { TIPOS_EVENTO_TIMELINE } from '../common/ConstantesEventos.js';
import { generarId, ahoraISO, formatearFechaHora, requerido } from '../common/Utils.js';

const COLECCION = 'timeline';

function claveExpediente(expedienteId) {
  return String(requerido(expedienteId, 'expedienteId'));
}

export class TimelineManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async registrarEvento(payload = {}) {
    const expedienteId = claveExpediente(payload.expedienteId);
    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuario = payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const evento = {
      id: generarId('tl'),
      expedienteId,
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

    await this.store.append(COLECCION, expedienteId, evento);
    return evento;
  }

  async obtenerTimeline(expedienteId) {
    const eventos = await this.listarEventos(expedienteId);
    return { expedienteId: claveExpediente(expedienteId), eventos, total: eventos.length };
  }

  async listarEventos(expedienteId) {
    const lista = await this.store.getLista(COLECCION, claveExpediente(expedienteId));
    return lista.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }

  async obtenerUltimoEvento(expedienteId) {
    const eventos = await this.listarEventos(expedienteId);
    return eventos.length ? eventos[eventos.length - 1] : null;
  }

  async filtrarEventos(expedienteId, criterios = {}) {
    const eventos = await this.listarEventos(expedienteId);
    return eventos.filter((e) => {
      if (criterios.modulo && e.modulo !== criterios.modulo) return false;
      if (criterios.submodulo && e.submodulo !== criterios.submodulo) return false;
      if (criterios.accion && e.accion !== criterios.accion) return false;
      if (criterios.desde && String(e.timestamp) < String(criterios.desde)) return false;
      if (criterios.hasta && String(e.timestamp) > String(criterios.hasta)) return false;
      return true;
    });
  }
}

export function crearTimelineManager(contexto) {
  return new TimelineManager(contexto);
}

export default TimelineManager;
