/**
 * EventSubscribers — registro de subscriptores por evento y canal.
 */
import { normalizarCodigoEvento } from './EventCatalog.js';

let subscriberSeq = 0;

export const CANALES = Object.freeze({
  TIMELINE: 'TIMELINE',
  HISTORIAL: 'HISTORIAL',
  OBSERVACIONES: 'OBSERVACIONES',
  AUDITORIA: 'AUDITORIA',
  DASHBOARD: 'DASHBOARD',
  KPIS: 'KPIS',
  GENERICO: 'GENERICO',
});

export class EventSubscribers {
  constructor() {
    this._byEvent = new Map();
    this._byCanal = new Map();
    this._ids = new Map();
  }

  subscribe(evento, callback, opts = {}) {
    if (typeof callback !== 'function') {
      throw new Error('El callback del subscriptor debe ser una función');
    }
    const codigo = evento ? normalizarCodigoEvento(evento) : null;
    const canal = opts.canal || CANALES.GENERICO;
    const id = opts.id || `sub_${++subscriberSeq}`;
    const entry = { id, callback, canal, evento: codigo };

    if (codigo) {
      if (!this._byEvent.has(codigo)) this._byEvent.set(codigo, new Map());
      const canalMap = this._byEvent.get(codigo);
      if (!canalMap.has(canal)) canalMap.set(canal, new Set());
      canalMap.get(canal).add(entry);
    }

    if (!this._byCanal.has(canal)) this._byCanal.set(canal, new Set());
    this._byCanal.get(canal).add(entry);
    this._ids.set(id, entry);
    return id;
  }

  unsubscribe(idOrEvento, maybeCallback) {
    if (this._ids.has(idOrEvento)) {
      const entry = this._ids.get(idOrEvento);
      this._removeEntry(entry);
      this._ids.delete(idOrEvento);
      return true;
    }

    const codigo = normalizarCodigoEvento(idOrEvento);
    if (!codigo || typeof maybeCallback !== 'function') return false;
    const canalMap = this._byEvent.get(codigo);
    if (!canalMap) return false;
    let removed = false;
    canalMap.forEach((set) => {
      set.forEach((entry) => {
        if (entry.callback === maybeCallback) {
          this._removeEntry(entry);
          removed = true;
        }
      });
    });
    return removed;
  }

  _removeEntry(entry) {
    if (entry.evento && this._byEvent.has(entry.evento)) {
      const canalMap = this._byEvent.get(entry.evento);
      const set = canalMap?.get(entry.canal);
      set?.delete(entry);
    }
    this._byCanal.get(entry.canal)?.delete(entry);
    this._ids.delete(entry.id);
  }

  obtenerSubscriptores(evento, canal = null) {
    const codigo = normalizarCodigoEvento(evento);
    if (!codigo) return [];
    const canalMap = this._byEvent.get(codigo);
    if (!canalMap) return [];
    if (canal) return [...(canalMap.get(canal) || [])];
    const out = [];
    canalMap.forEach((set) => out.push(...set));
    return out;
  }

  listarCanales() {
    return Object.values(CANALES);
  }

  contar() {
    return this._ids.size;
  }
}

export function crearEventSubscribers() {
  return new EventSubscribers();
}

export default EventSubscribers;
