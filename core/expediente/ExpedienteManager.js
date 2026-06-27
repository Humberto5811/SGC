/**
 * ExpedienteManager — fachada unificada del expediente (Core).
 */
import { ENTIDADES_ADJUNTABLES } from '../common/ConstantesEventos.js';
import { requerido } from '../common/Utils.js';

const COLECCION_EXP = 'expedientes';

export class ExpedienteManager {
  constructor(contexto, deps = {}) {
    this.ctx = contexto;
    this.store = contexto.store;
    this.timeline = deps.timeline;
    this.historial = deps.historial;
    this.observaciones = deps.observaciones;
    this.adjuntos = deps.adjuntos;
  }

  async _obtenerSnapshot(expedienteId) {
    const id = String(requerido(expedienteId, 'expedienteId'));
    const snap = await this.store.get(COLECCION_EXP, id);
    return snap || {
      id,
      estadoActual: null,
      responsableActual: null,
      moduloActual: null,
      submoduloActual: null,
      metadata: {},
    };
  }

  async obtenerExpediente(expedienteId) {
    const snap = await this._obtenerSnapshot(expedienteId);
    const [timeline, historial, obs, adj] = await Promise.all([
      this.obtenerTimeline(expedienteId),
      this.obtenerHistorial(expedienteId),
      this.listarObservaciones(expedienteId),
      this.listarAdjuntos(expedienteId),
    ]);
    return {
      ...snap,
      timeline,
      historial,
      observaciones: obs,
      adjuntos: adj,
    };
  }

  async obtenerEstadoActual(expedienteId) {
    const snap = await this._obtenerSnapshot(expedienteId);
    return snap.estadoActual;
  }

  async obtenerResponsableActual(expedienteId) {
    const snap = await this._obtenerSnapshot(expedienteId);
    return snap.responsableActual;
  }

  async obtenerModuloActual(expedienteId) {
    const snap = await this._obtenerSnapshot(expedienteId);
    return snap.moduloActual;
  }

  async obtenerSubmoduloActual(expedienteId) {
    const snap = await this._obtenerSnapshot(expedienteId);
    return snap.submoduloActual;
  }

  async actualizarVigencia(expedienteId, datos = {}) {
    const id = String(expedienteId);
    const prev = await this._obtenerSnapshot(id);
    const next = {
      ...prev,
      estadoActual: datos.estadoActual ?? prev.estadoActual,
      responsableActual: datos.responsableActual ?? prev.responsableActual,
      moduloActual: datos.moduloActual ?? prev.moduloActual,
      submoduloActual: datos.submoduloActual ?? prev.submoduloActual,
      metadata: { ...prev.metadata, ...(datos.metadata || {}) },
    };
    await this.store.set(COLECCION_EXP, id, next);
    return next;
  }

  async obtenerTimeline(expedienteId) {
    if (!this.timeline) return { eventos: [], total: 0 };
    return this.timeline.obtenerTimeline(expedienteId);
  }

  async obtenerHistorial(expedienteId) {
    if (!this.historial) return { cambios: [], total: 0 };
    return this.historial.obtenerHistorial(expedienteId);
  }

  async listarObservaciones(expedienteId) {
    if (!this.observaciones) return [];
    return this.observaciones.listarObservaciones(expedienteId);
  }

  async listarAdjuntos(expedienteId) {
    if (!this.adjuntos) return [];
    return this.adjuntos.listarAdjuntos(ENTIDADES_ADJUNTABLES.EXPEDIENTE, expedienteId);
  }
}

export function crearExpedienteManager(contexto, deps) {
  return new ExpedienteManager(contexto, deps);
}

export default ExpedienteManager;
