/**
 * HistorialManager — bitácora completa de acciones del REQUERIMIENTO.
 */
import { MODULOS_FLUJO } from '../common/ConstantesEventos.js';
import { obtenerEvento } from '../common/CatalogoEventos.js';
import {
  generarId,
  ahoraISO,
  formatearFechaHora,
  resolverRequerimientoId,
  resolverCodigoRequerimiento,
  resolverIdLegacy,
} from '../common/Utils.js';

const COLECCION = 'historial';

function claveRequerimiento(idOrPayload) {
  return resolverRequerimientoId(typeof idOrPayload === 'object' ? idOrPayload : { requerimientoId: idOrPayload });
}

export class HistorialManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  /**
   * Registro completo de una acción (esquema estabilizado).
   * Campos: fecha, hora, usuario, módulo, evento, descripción, estados, observación, adjuntos.
   */
  async registrarAccion(payload = {}) {
    const requerimientoId = claveRequerimiento(payload);
    const codigoRequerimiento = resolverCodigoRequerimiento(payload, requerimientoId);
    const ts = payload.timestamp || ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuario = payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    let eventoLabel = payload.evento || payload.eventoLabel || '';
    if (!eventoLabel && payload.eventoCodigo) {
      const def = obtenerEvento(payload.eventoCodigo);
      eventoLabel = def?.label || payload.eventoCodigo;
    }

    const registro = {
      id: generarId('hist'),
      requerimientoId,
      codigoRequerimiento,
      usuario,
      fecha,
      hora,
      timestamp: ts,
      modulo: payload.modulo || '',
      submodulo: payload.submodulo || '',
      evento: eventoLabel,
      eventoCodigo: payload.eventoCodigo || null,
      descripcion: payload.descripcion || payload.cambio || payload.observacion || eventoLabel || '',
      cambio: payload.cambio || payload.descripcion || eventoLabel || '',
      estadoAnterior: payload.estadoAnterior ?? payload.valorAnterior ?? payload.estado_anterior ?? null,
      estadoNuevo: payload.estadoNuevo ?? payload.valorNuevo ?? payload.estado_nuevo ?? null,
      valorAnterior: payload.valorAnterior ?? payload.estadoAnterior ?? null,
      valorNuevo: payload.valorNuevo ?? payload.estadoNuevo ?? null,
      observacion: payload.observacion || '',
      adjuntosRelacionados: payload.adjuntosRelacionados || payload.adjuntos || [],
      campo: payload.campo || '',
      metadata: payload.metadata || {},
    };

    await this.store.append(COLECCION, requerimientoId, registro);
    return registro;
  }

  /** Alias legacy — delega en registrarAccion. */
  async registrarCambio(payload = {}) {
    return this.registrarAccion({
      ...payload,
      eventoCodigo: payload.eventoCodigo || (payload.campo === 'estado' ? 'CAMBIO_ESTADO' : null),
      descripcion: payload.cambio || payload.descripcion || `Cambio: ${payload.campo || 'general'}`,
    });
  }

  async obtenerHistorial(requerimientoId) {
    const id = claveRequerimiento(requerimientoId);
    const cambios = await this.listarCambios(id);
    return {
      requerimientoId: id,
      modulosFlujo: MODULOS_FLUJO.slice(),
      cambios,
      total: cambios.length,
    };
  }

  async listarCambios(requerimientoId) {
    const lista = await this.store.getLista(COLECCION, claveRequerimiento(requerimientoId));
    return lista.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }

  async obtenerResumenPorModulo(requerimientoId) {
    const cambios = await this.listarCambios(requerimientoId);
    return MODULOS_FLUJO.map((modulo) => ({
      modulo,
      cambios: cambios.filter((c) => c.modulo === modulo),
    }));
  }

  /** @deprecated alias legacy */
  async obtenerHistorialPorExpediente(expedienteId) {
    return this.obtenerHistorial(resolverIdLegacy(expedienteId));
  }
}

export function crearHistorialManager(contexto) {
  return new HistorialManager(contexto);
}

export default HistorialManager;
