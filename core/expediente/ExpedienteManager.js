/**
 * ExpedienteManager — contenedor documental asociado al requerimiento.
 * Sin workflow, estado ni timeline. Incluye adaptador de compatibilidad legacy.
 */
import { ENTIDADES_ADJUNTABLES, TIPOS_DOCUMENTO_EXPEDIENTE } from '../common/ConstantesEventos.js';
import { generarId, ahoraISO, requerido, resolverIdLegacy } from '../common/Utils.js';

const COLECCION_EXP = 'expedientes';
const COLECCION_DOCS = 'expediente_documentos';
const COLECCION_CARPETAS = 'expediente_carpetas';

export class ExpedienteManager {
  constructor(contexto, deps = {}) {
    this.ctx = contexto;
    this.store = contexto.store;
    this.adjuntos = deps.adjuntos;
    /** Adaptador: delegación al RequerimientoManager para compatibilidad fase 1. */
    this.requerimiento = deps.requerimiento || null;
  }

  async _obtenerSnapshot(expedienteId) {
    const id = String(requerido(expedienteId, 'expedienteId'));
    const snap = await this.store.get(COLECCION_EXP, id);
    return snap || {
      id,
      requerimientoId: null,
      nombre: `Expediente ${id}`,
      carpetas: [],
      metadata: {},
    };
  }

  async crearExpediente(requerimientoId, opts = {}) {
    const reqId = String(requerido(requerimientoId, 'requerimientoId'));
    const id = opts.expedienteId || generarId('exp');
    const snap = {
      id,
      requerimientoId: reqId,
      nombre: opts.nombre || `Expediente ${reqId}`,
      carpetas: opts.carpetas || [],
      fechaCreacion: ahoraISO(),
      metadata: opts.metadata || {},
    };
    await this.store.set(COLECCION_EXP, id, snap);
    if (this.requerimiento) {
      await this.requerimiento.vincularExpediente(reqId, id);
    }
    return snap;
  }

  async agregarDocumento(expedienteId, documento = {}) {
    const exp = await this._obtenerSnapshot(expedienteId);
    const doc = {
      id: generarId('doc'),
      expedienteId: exp.id,
      requerimientoId: exp.requerimientoId,
      tipo: documento.tipo || TIPOS_DOCUMENTO_EXPEDIENTE.ADJUNTO,
      nombre: documento.nombre || 'documento',
      version: documento.version || 1,
      carpeta: documento.carpeta || '/',
      referencia: documento.referencia || null,
      fechaRegistro: ahoraISO(),
      metadata: documento.metadata || {},
    };
    await this.store.append(COLECCION_DOCS, exp.id, doc);
    return doc;
  }

  async consultarDocumentos(expedienteId, filtros = {}) {
    const lista = await this.store.getLista(COLECCION_DOCS, String(expedienteId));
    return lista.filter((d) => {
      if (filtros.tipo && d.tipo !== filtros.tipo) return false;
      if (filtros.carpeta && d.carpeta !== filtros.carpeta) return false;
      return true;
    });
  }

  async versionarDocumento(expedienteId, documentoId, nuevaVersion = {}) {
    const docs = await this.consultarDocumentos(expedienteId);
    const prev = docs.find((d) => d.id === documentoId);
    if (!prev) throw new Error('Documento no encontrado');

    const version = (prev.version || 1) + 1;
    return this.agregarDocumento(expedienteId, {
      ...prev,
      ...nuevaVersion,
      version,
      documentoAnteriorId: prev.id,
    });
  }

  async organizarCarpetas(expedienteId, estructura = []) {
    const id = String(expedienteId);
    await this.store.set(COLECCION_CARPETAS, id, estructura);
    const exp = await this._obtenerSnapshot(id);
    const next = { ...exp, carpetas: estructura };
    await this.store.set(COLECCION_EXP, id, next);
    return next;
  }

  async adjuntarArchivo(expedienteId, archivo = {}) {
    if (!this.adjuntos) throw new Error('AdjuntoManager no configurado');
    const exp = await this._obtenerSnapshot(expedienteId);
    return this.adjuntos.agregarAdjunto({
      ...archivo,
      requerimientoId: exp.requerimientoId || archivo.requerimientoId,
      expedienteId: exp.id,
      tipoEntidad: ENTIDADES_ADJUNTABLES.EXPEDIENTE,
      entidadId: exp.id,
    });
  }

  async listarAdjuntos(expedienteId) {
    if (!this.adjuntos) return [];
    return this.adjuntos.listarAdjuntos(ENTIDADES_ADJUNTABLES.EXPEDIENTE, expedienteId);
  }

  async obtenerExpedienteDocumental(expedienteId) {
    const snap = await this._obtenerSnapshot(expedienteId);
    const [documentos, adjuntos, carpetas] = await Promise.all([
      this.consultarDocumentos(expedienteId),
      this.listarAdjuntos(expedienteId),
      this.store.get(COLECCION_CARPETAS, String(expedienteId)) || snap.carpetas,
    ]);
    return { ...snap, documentos, adjuntos, carpetas: carpetas || [] };
  }

  // ─── Compatibilidad legacy (fase 1) ───────────────────────────────────────

  /** @deprecated Alias — delega en RequerimientoManager si está configurado. */
  async obtenerExpediente(expedienteId) {
    if (this.requerimiento) {
      return this.requerimiento.obtenerRequerimiento(resolverIdLegacy(expedienteId));
    }
    return this.obtenerExpedienteDocumental(expedienteId);
  }

  /** @deprecated Alias legacy — estado pertenece al requerimiento. */
  async obtenerEstadoActual(expedienteId) {
    if (this.requerimiento) {
      return this.requerimiento.obtenerEstadoActual(resolverIdLegacy(expedienteId));
    }
    return null;
  }

  /** @deprecated Alias legacy */
  async obtenerResponsableActual(expedienteId) {
    if (this.requerimiento) {
      return this.requerimiento.obtenerResponsableActual(resolverIdLegacy(expedienteId));
    }
    return null;
  }

  /** @deprecated Alias legacy */
  async obtenerModuloActual(expedienteId) {
    if (this.requerimiento) {
      return this.requerimiento.obtenerModuloActual(resolverIdLegacy(expedienteId));
    }
    return null;
  }

  /** @deprecated Alias legacy */
  async obtenerSubmoduloActual() {
    return null;
  }

  /** @deprecated Alias legacy */
  async obtenerTimeline(expedienteId) {
    if (this.requerimiento) {
      return this.requerimiento.obtenerTimeline(resolverIdLegacy(expedienteId));
    }
    return { eventos: [], total: 0 };
  }

  /** @deprecated Alias legacy */
  async obtenerHistorial(expedienteId) {
    if (this.requerimiento) {
      return this.requerimiento.obtenerHistorial(resolverIdLegacy(expedienteId));
    }
    return { cambios: [], total: 0 };
  }

  /** @deprecated Alias legacy */
  async listarObservaciones(expedienteId) {
    if (this.requerimiento) {
      return this.requerimiento.listarObservaciones(resolverIdLegacy(expedienteId));
    }
    return [];
  }

  /** @deprecated Alias legacy — ya no actualiza estado en expediente. */
  async actualizarVigencia(expedienteId, datos = {}) {
    if (this.requerimiento && (datos.estadoActual || datos.moduloActual)) {
      const reqId = resolverIdLegacy(expedienteId);
      if (datos.estadoActual) {
        await this.requerimiento.actualizarEstado(reqId, datos.estadoActual, {
          moduloActual: datos.moduloActual,
          responsableActual: datos.responsableActual,
          omitirValidacion: true,
        });
      }
    }
    const exp = await this._obtenerSnapshot(expedienteId);
    const next = { ...exp, metadata: { ...exp.metadata, ...(datos.metadata || {}) } };
    await this.store.set(COLECCION_EXP, exp.id, next);
    return next;
  }
}

export function crearExpedienteManager(contexto, deps) {
  return new ExpedienteManager(contexto, deps);
}

export default ExpedienteManager;
