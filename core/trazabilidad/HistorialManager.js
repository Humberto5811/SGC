/**
 * HistorialManager — historial del REQUERIMIENTO a lo largo del flujo SGC.
 */
import { MODULOS_FLUJO } from '../common/ConstantesEventos.js';
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

  async registrarCambio(payload = {}) {
    const requerimientoId = claveRequerimiento(payload);
    const codigoRequerimiento = resolverCodigoRequerimiento(payload, requerimientoId);
    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuario = payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const cambio = {
      id: generarId('hist'),
      requerimientoId,
      codigoRequerimiento,
      usuario,
      cambio: payload.cambio || payload.descripcion || '',
      fecha,
      hora,
      timestamp: ts,
      modulo: payload.modulo || '',
      submodulo: payload.submodulo || '',
      valorAnterior: payload.valorAnterior ?? payload.valor_anterior ?? null,
      valorNuevo: payload.valorNuevo ?? payload.valor_nuevo ?? null,
      campo: payload.campo || '',
      metadata: payload.metadata || {},
    };

    await this.store.append(COLECCION, requerimientoId, cambio);
    return cambio;
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

  /** Resumen por módulo del flujo (Registro → DEC → … → Ejecución). */
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
