/**
 * EventContext — contexto compartido para todos los motores suscriptores.
 */
import { obtenerEventoCatalogo, normalizarCodigoEvento } from './EventCatalog.js';
import { computeMotorSnapshot } from '../../shared/observacionesMotor.js';

function nowParts(date = new Date()) {
  const iso = date.toISOString();
  return {
    fecha: iso.slice(0, 10),
    hora: iso.slice(11, 19),
    timestamp: iso,
  };
}

export class EventContext {
  constructor(fields = {}) {
    const parts = nowParts(fields.timestamp ? new Date(fields.timestamp) : new Date());
    this.evento = normalizarCodigoEvento(fields.evento || fields.codigoEvento) || null;
    this.eventoDef = fields.eventoDef || (this.evento ? obtenerEventoCatalogo(this.evento) : null);
    this.requerimientoId = fields.requerimientoId ?? fields.id ?? null;
    this.codigoRequerimiento = fields.codigoRequerimiento || fields.codigo || null;
    this.moduloOrigen = fields.moduloOrigen || fields.modulo || null;
    this.moduloDestino = fields.moduloDestino || fields.destino || null;
    this.usuario = fields.usuario || 'Sistema';
    this.fecha = fields.fecha || parts.fecha;
    this.hora = fields.hora || parts.hora;
    this.timestamp = fields.timestamp || parts.timestamp;
    this.payload = fields.payload && typeof fields.payload === 'object' ? { ...fields.payload } : {};
    this.workflowSnapshot = fields.workflowSnapshot || null;
    this.observacionesSnapshot = fields.observacionesSnapshot ?? null;
    this.metadata = fields.metadata && typeof fields.metadata === 'object' ? { ...fields.metadata } : {};
  }

  static fromRow(evento, row = {}, extras = {}) {
    const obsSnap = extras.observacionesSnapshot
      ?? (row ? computeMotorSnapshot(row, extras.moduloLabel || extras.moduloOrigen) : null);
    return new EventContext({
      evento,
      requerimientoId: row.id ?? row.requerimientoId,
      codigoRequerimiento: row.codigo ?? row.codigoRequerimiento,
      moduloOrigen: extras.moduloOrigen,
      moduloDestino: extras.moduloDestino,
      usuario: extras.usuario,
      payload: extras.payload,
      workflowSnapshot: extras.workflowSnapshot,
      observacionesSnapshot: obsSnap,
      metadata: extras.metadata,
    });
  }

  obtenerEventSnapshot() {
    return {
      evento: this.evento,
      eventoLabel: this.eventoDef?.label || this.evento,
      categoria: this.eventoDef?.categoria || null,
      origen: this.moduloOrigen,
      destino: this.moduloDestino,
      requerimientoId: this.requerimientoId,
      codigoRequerimiento: this.codigoRequerimiento,
      workflow: this.workflowSnapshot,
      observaciones: this.observacionesSnapshot,
      usuario: this.usuario,
      fecha: this.fecha,
      hora: this.hora,
      timestamp: this.timestamp,
      payload: this.payload,
    };
  }

  toJSON() {
    return this.obtenerEventSnapshot();
  }
}

export function crearEventContext(fields = {}) {
  return new EventContext(fields);
}

export default EventContext;
