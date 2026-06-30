/**
 * EventDispatcher — distribuye eventos hacia subscriptores por canal.
 * Fase 2: infraestructura únicamente; no escribe en Timeline/Historial/etc.
 */
import { CANALES } from './EventSubscribers.js';
import { obtenerEventoCatalogo } from './EventCatalog.js';

/** Rutas preparadas para migración Fase 3+. */
export const RUTAS_DISTRIBUCION = Object.freeze({
  TIMELINE: Object.freeze([CANALES.TIMELINE]),
  HISTORIAL: Object.freeze([CANALES.HISTORIAL]),
  OBSERVACIONES: Object.freeze([CANALES.OBSERVACIONES]),
  AUDITORIA: Object.freeze([CANALES.AUDITORIA]),
  DASHBOARD: Object.freeze([CANALES.DASHBOARD, CANALES.KPIS]),
});

const RUTAS_POR_CATEGORIA = Object.freeze({
  RECEPCION: RUTAS_DISTRIBUCION.TIMELINE.concat(RUTAS_DISTRIBUCION.HISTORIAL),
  DERIVACION: RUTAS_DISTRIBUCION.TIMELINE.concat(RUTAS_DISTRIBUCION.HISTORIAL, RUTAS_DISTRIBUCION.DASHBOARD),
  OBSERVACION: RUTAS_DISTRIBUCION.OBSERVACIONES.concat(RUTAS_DISTRIBUCION.TIMELINE, RUTAS_DISTRIBUCION.HISTORIAL),
  SUBSANACION: RUTAS_DISTRIBUCION.OBSERVACIONES.concat(RUTAS_DISTRIBUCION.TIMELINE, RUTAS_DISTRIBUCION.HISTORIAL),
  APROBACION: RUTAS_DISTRIBUCION.TIMELINE.concat(RUTAS_DISTRIBUCION.HISTORIAL, RUTAS_DISTRIBUCION.KPIS),
  DOCUMENTO: RUTAS_DISTRIBUCION.AUDITORIA.concat(RUTAS_DISTRIBUCION.TIMELINE),
  INVITACION: RUTAS_DISTRIBUCION.TIMELINE.concat(RUTAS_DISTRIBUCION.HISTORIAL, RUTAS_DISTRIBUCION.DASHBOARD),
  VALIDACION: RUTAS_DISTRIBUCION.TIMELINE.concat(RUTAS_DISTRIBUCION.HISTORIAL),
  CONTRATO: RUTAS_DISTRIBUCION.TIMELINE.concat(RUTAS_DISTRIBUCION.HISTORIAL, RUTAS_DISTRIBUCION.AUDITORIA),
  LIQUIDACION: RUTAS_DISTRIBUCION.TIMELINE.concat(RUTAS_DISTRIBUCION.HISTORIAL),
  ETAPA: RUTAS_DISTRIBUCION.TIMELINE.concat(RUTAS_DISTRIBUCION.HISTORIAL),
});

export class EventDispatcher {
  /**
   * @param {import('./EventSubscribers.js').EventSubscribers} subscribers
   */
  constructor(subscribers) {
    this.subscribers = subscribers;
  }

  resolverCanales(eventContext) {
    const def = eventContext.eventoDef || obtenerEventoCatalogo(eventContext.evento);
    const cat = def?.categoria || 'ETAPA';
    const rutas = RUTAS_POR_CATEGORIA[cat] || RUTAS_DISTRIBUCION.TIMELINE;
    return [...new Set(rutas)];
  }

  /**
   * Despacha el evento a subscriptores registrados.
   * @returns {{ entregas: number, errores: Array, canales: string[] }}
   */
  dispatch(eventContext, opts = {}) {
    const canales = opts.canales || this.resolverCanales(eventContext);
    const entregas = [];
    const errores = [];

    canales.forEach((canal) => {
      const subs = this.subscribers.obtenerSubscriptores(eventContext.evento, canal);
      subs.forEach((sub) => {
        try {
          const result = sub.callback(eventContext, { canal, dispatcher: this });
          entregas.push({ canal, subscriberId: sub.id, result: result ?? null });
        } catch (err) {
          errores.push({ canal, subscriberId: sub.id, error: err.message || String(err) });
        }
      });
    });

    return {
      evento: eventContext.evento,
      entregas: entregas.length,
      detalleEntregas: entregas,
      errores,
      canales,
      fase: 2,
      persistido: false,
    };
  }

  async dispatchAsync(eventContext, opts = {}) {
    const sync = this.dispatch(eventContext, opts);
    return sync;
  }
}

export function crearEventDispatcher(subscribers) {
  return new EventDispatcher(subscribers);
}

export default EventDispatcher;
