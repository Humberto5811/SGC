/**
 * Punto de entrada del Event Engine — Fase 2 SGC.
 */
import { EventEngine, crearEventEngine, EVENTOS } from './EventEngine.js';
import { EventContext, crearEventContext } from './EventContext.js';
import { EventSubscribers, crearEventSubscribers, CANALES } from './EventSubscribers.js';
import { EventDispatcher, crearEventDispatcher, RUTAS_DISTRIBUCION } from './EventDispatcher.js';
import {
  EVENTO_DEFINICIONES,
  esEventoValido,
  normalizarCodigoEvento,
  obtenerEventoCatalogo,
  mapPlanWorkflowToEvento,
  listarEventosCatalogo,
} from './EventCatalog.js';

export { RegistroEventAdapter, crearRegistroEventAdapter } from './adapters/index.js';

export {
  EVENTOS,
  EVENTO_DEFINICIONES,
  esEventoValido,
  normalizarCodigoEvento,
  obtenerEventoCatalogo,
  mapPlanWorkflowToEvento,
  listarEventosCatalogo,
  EventEngine,
  crearEventEngine,
  EventContext,
  crearEventContext,
  EventSubscribers,
  crearEventSubscribers,
  CANALES,
  EventDispatcher,
  crearEventDispatcher,
  RUTAS_DISTRIBUCION,
};

export default {
  EventEngine,
  crearEventEngine,
  EVENTOS,
  CANALES,
};
