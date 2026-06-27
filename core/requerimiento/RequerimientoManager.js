/**
 * RequerimientoManager — centro del Core SGC (entidad principal).
 */
import { ESTADOS_REQUERIMIENTO } from '../common/ConstantesEstados.js';
import { crearPlantillaContextoRequerimiento } from '../common/ConstantesJerarquia.js';
import { resolverRequerimientoId, resolverCodigoRequerimiento, requerido } from '../common/Utils.js';

const COLECCION_REQ = 'requerimientos';

export class RequerimientoManager {
  constructor(contexto, deps = {}) {
    this.ctx = contexto;
    this.store = contexto.store;
    this.timeline = deps.timeline;
    this.historial = deps.historial;
    this.observaciones = deps.observaciones;
    this.adjuntos = deps.adjuntos;
    this.auditoria = deps.auditoria;
    this.workflow = deps.workflow;
    this.derivaciones = deps.derivaciones;
    this.expediente = deps.expediente;
  }

  async _obtenerSnapshot(requerimientoId) {
    const id = resolverRequerimientoId({ requerimientoId });
    const snap = await this.store.get(COLECCION_REQ, id);
    return snap || {
      id,
      codigoRequerimiento: id,
      estadoActual: ESTADOS_REQUERIMIENTO.BORRADOR,
      responsableActual: null,
      moduloActual: null,
      expedienteId: null,
      contextoMultientidad: crearPlantillaContextoRequerimiento(id),
      metadata: {},
    };
  }

  async registrarRequerimiento(payload = {}) {
    const id = resolverRequerimientoId(payload);
    const codigoRequerimiento = resolverCodigoRequerimiento(payload, id);
    const snap = {
      id,
      codigoRequerimiento,
      estadoActual: payload.estadoActual || ESTADOS_REQUERIMIENTO.BORRADOR,
      responsableActual: payload.responsableActual || null,
      moduloActual: payload.moduloActual || 'Registro',
      expedienteId: payload.expedienteId || null,
      contextoMultientidad: crearPlantillaContextoRequerimiento(id),
      metadata: payload.metadata || {},
    };
    await this.store.set(COLECCION_REQ, id, snap);
    return snap;
  }

  async obtenerRequerimiento(requerimientoId) {
    const snap = await this._obtenerSnapshot(requerimientoId);
    const id = snap.id;
    const [timeline, historial, obs, adj, derivaciones] = await Promise.all([
      this.obtenerTimeline(id),
      this.obtenerHistorial(id),
      this.listarObservaciones(id),
      this.listarAdjuntos(id),
      this.derivaciones?.obtenerDerivaciones(id) ?? [],
    ]);
    const expediente = snap.expedienteId && this.expediente
      ? this.expediente.consultarDocumentos(snap.expedienteId)
      : null;

    return {
      ...snap,
      timeline,
      historial,
      observaciones: obs,
      adjuntos: adj,
      derivaciones,
      expedienteDocumental: expediente,
    };
  }

  async obtenerEstadoActual(requerimientoId) {
    const snap = await this._obtenerSnapshot(requerimientoId);
    return snap.estadoActual;
  }

  async obtenerResponsableActual(requerimientoId) {
    const snap = await this._obtenerSnapshot(requerimientoId);
    return snap.responsableActual;
  }

  async obtenerModuloActual(requerimientoId) {
    const snap = await this._obtenerSnapshot(requerimientoId);
    return snap.moduloActual;
  }

  async actualizarEstado(requerimientoId, estadoNuevo, opts = {}) {
    const snap = await this._obtenerSnapshot(requerimientoId);
    const estadoAnterior = snap.estadoActual;
    const next = {
      ...snap,
      estadoActual: estadoNuevo,
      moduloActual: opts.moduloActual ?? snap.moduloActual,
      responsableActual: opts.responsableActual ?? snap.responsableActual,
    };
    await this.store.set(COLECCION_REQ, snap.id, next);

    if (this.workflow) {
      await this.workflow.registrarCambioEstado({
        requerimientoId: snap.id,
        codigoRequerimiento: snap.codigoRequerimiento,
        estadoAnterior,
        estadoNuevo,
        modulo: opts.modulo || snap.moduloActual,
        submodulo: opts.submodulo || '',
        observacion: opts.observacion || '',
        omitirValidacion: opts.omitirValidacion,
      });
    }
    return next;
  }

  async vincularExpediente(requerimientoId, expedienteId) {
    const snap = await this._obtenerSnapshot(requerimientoId);
    const next = { ...snap, expedienteId: String(expedienteId) };
    await this.store.set(COLECCION_REQ, snap.id, next);
    return next;
  }

  async obtenerTimeline(requerimientoId) {
    if (!this.timeline) return { eventos: [], total: 0 };
    return this.timeline.obtenerTimeline(requerimientoId);
  }

  async obtenerHistorial(requerimientoId) {
    if (!this.historial) return { cambios: [], total: 0 };
    return this.historial.obtenerHistorial(requerimientoId);
  }

  async listarObservaciones(requerimientoId) {
    if (!this.observaciones) return [];
    return this.observaciones.listarObservaciones(requerimientoId);
  }

  async listarAdjuntos(requerimientoId) {
    if (!this.adjuntos) return [];
    return this.adjuntos.listarAdjuntosPorRequerimiento(requerimientoId);
  }

  /** Estructura multientidad reservada — sin implementación operativa. */
  obtenerContextoMultientidad(requerimientoId) {
    return crearPlantillaContextoRequerimiento(resolverRequerimientoId({ requerimientoId }));
  }
}

export function crearRequerimientoManager(contexto, deps) {
  return new RequerimientoManager(contexto, deps);
}

export default RequerimientoManager;
