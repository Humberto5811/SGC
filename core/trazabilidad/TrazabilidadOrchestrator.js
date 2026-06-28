/**
 * TrazabilidadOrchestrator — secuencias compuestas derivación/recepción y ciclos observación.
 * No modifica APIs ni pantallas; coordina Timeline + Historial + Workflow internamente.
 */
import { obtenerEventoDerivacion } from '../common/CatalogoEventos.js';
import { MODULOS_FLUJO } from '../common/ConstantesEventos.js';
import { resolverRequerimientoId, resolverCodigoRequerimiento } from '../common/Utils.js';

function basePayload(payload) {
  const requerimientoId = resolverRequerimientoId(payload);
  return {
    ...payload,
    requerimientoId,
    codigoRequerimiento: resolverCodigoRequerimiento(payload, requerimientoId),
  };
}

export class TrazabilidadOrchestrator {
  constructor(deps = {}) {
    this.timeline = deps.timeline || null;
    this.historial = deps.historial || null;
    this.workflow = deps.workflow || null;
    this.observaciones = deps.observaciones || null;
    this.derivaciones = deps.derivaciones || null;
  }

  /**
   * Registra par derivación → recepción en destino (cronología fiel al flujo real).
   */
  async registrarDerivacionConRecepcion(payload = {}) {
    const p = basePayload(payload);
    const origen = p.moduloOrigen || p.modulo || p.origen;
    const destino = p.moduloDestino || p.destino;

    if (this.derivaciones?.derivar) {
      await this.derivaciones.derivar({
        ...p,
        origen,
        destino,
        comentario: p.observacion || p.comentario,
      });
    }

    if (this.workflow?.registrarDerivado) {
      return this.workflow.registrarDerivado({
        ...p,
        modulo: origen,
        moduloOrigen: origen,
        moduloDestino: destino,
        registrarRecepcionDestino: p.registrarRecepcionDestino !== false,
      });
    }

    const def = obtenerEventoDerivacion(destino);
    const codigo = def?.codigo || 'DERIVADO';
    if (this.timeline?.registrarEventoFuncional) {
      await this.timeline.registrarEventoFuncional(codigo, { ...p, moduloOrigen: origen, moduloDestino: destino });
      await this.timeline.registrarEventoFuncional('REQUERIMIENTO_RECIBIDO', { ...p, modulo: destino, moduloOrigen: origen });
    }
    return p;
  }

  /**
   * Ciclo observación: emitida → enviada → recibida en destino.
   */
  async registrarObservacionConRecepcion(payload = {}) {
    const p = basePayload(payload);
    let obs = null;
    if (this.observaciones?.crearObservacion) {
      obs = await this.observaciones.crearObservacion({ ...p, omitirTrazabilidad: true });
      if (this.timeline?.registrarEventoFuncional) {
        await this.timeline.registrarEventoFuncional('OBSERVACION_REGISTRADA', { ...p, observacion: p.motivo || p.texto });
        await this.timeline.registrarEventoFuncional('OBSERVACION_ENVIADA', { ...p, moduloDestino: p.moduloDestino });
        await this.timeline.registrarEventoFuncional('OBSERVACION_RECIBIDA', {
          ...p,
          modulo: p.moduloDestino,
          observacion: p.motivo || p.texto,
        });
      }
      if (this.historial?.registrarAccion) {
        await this.historial.registrarAccion({
          ...p,
          eventoCodigo: 'OBSERVACION_REGISTRADA',
          observacion: p.motivo || p.texto,
        });
      }
      if (obs?.id && this.observaciones.marcarRecibida) {
        await this.observaciones.marcarRecibida(p.requerimientoId, obs.id, {
          ...p,
          omitirTrazabilidad: true,
          omitirValidacion: true,
        });
      }
    }
    return obs;
  }

  /**
   * Ciclo subsanación: registrada → enviada → recibida por emisor.
   */
  async registrarSubsanacionConRecepcion(requerimientoId, observacionId, respuesta, opts = {}) {
    const p = basePayload({ requerimientoId, ...opts });
    let obs = null;
    if (this.observaciones?.registrarSubsanacion) {
      obs = await this.observaciones.registrarSubsanacion(p.requerimientoId, observacionId, respuesta, {
        ...opts,
        omitirTrazabilidad: true,
      });
      if (this.timeline?.registrarEventoFuncional) {
        await this.timeline.registrarEventoFuncional('SUBSANACION_REGISTRADA', { ...p, descripcion: respuesta });
        await this.timeline.registrarEventoFuncional('SUBSANACION_ENVIADA', { ...p, moduloDestino: opts.moduloDestino || opts.moduloOrigen });
        await this.timeline.registrarEventoFuncional('SUBSANACION_RECIBIDA', { ...p, modulo: opts.moduloOrigen, descripcion: respuesta });
      }
      if (this.observaciones.marcarRecibidaPorEmisor) {
        await this.observaciones.marcarRecibidaPorEmisor(p.requerimientoId, observacionId, {
          ...opts,
          omitirTrazabilidad: true,
          omitirValidacion: true,
        });
      }
    }
    return obs;
  }

  /**
   * Construye la línea de trazabilidad entre módulos (flujo principal + ramas por observación).
   */
  async obtenerRecorridoModulos(requerimientoId) {
    const id = resolverRequerimientoId(requerimientoId);
    const eventos = this.timeline ? await this.timeline.listarEventos(id) : [];
    const recorrido = [];
    const modulosVisitados = new Set();

    for (const ev of eventos) {
      const esDerivacion = ev.tipoEvento === 'DERIVACION' || String(ev.eventoCodigo || '').startsWith('DERIVADO');
      const esObservacion = ev.tipoEvento === 'OBSERVACION' || ev.tipoEvento === 'SUBSANACION';
      if (ev.modulo && !modulosVisitados.has(ev.modulo)) {
        modulosVisitados.add(ev.modulo);
      }
      recorrido.push({
        timestamp: ev.timestamp,
        modulo: ev.modulo,
        moduloDestino: ev.moduloDestino,
        evento: ev.eventoLabel || ev.accion,
        esDerivacion,
        esObservacion,
        esRama: esObservacion,
      });
    }

    const lineaBase = MODULOS_FLUJO.filter((m) => modulosVisitados.has(m));
    return { requerimientoId: id, lineaBase, recorrido, modulosVisitados: [...modulosVisitados] };
  }
}

export function crearTrazabilidadOrchestrator(deps) {
  return new TrazabilidadOrchestrator(deps);
}

export default TrazabilidadOrchestrator;
