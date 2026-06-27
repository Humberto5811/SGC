/**
 * HistorialManager — bitácora de cambios del expediente.
 */
import { generarId, ahoraISO, formatearFechaHora, requerido } from '../common/Utils.js';

const COLECCION = 'historial';

function claveExpediente(expedienteId) {
  return String(requerido(expedienteId, 'expedienteId'));
}

export class HistorialManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async registrarCambio(payload = {}) {
    const expedienteId = claveExpediente(payload.expedienteId);
    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuario = payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const cambio = {
      id: generarId('hist'),
      expedienteId,
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

    await this.store.append(COLECCION, expedienteId, cambio);
    return cambio;
  }

  async obtenerHistorial(expedienteId) {
    const cambios = await this.listarCambios(expedienteId);
    return { expedienteId: claveExpediente(expedienteId), cambios, total: cambios.length };
  }

  async listarCambios(expedienteId) {
    const lista = await this.store.getLista(COLECCION, claveExpediente(expedienteId));
    return lista.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }
}

export function crearHistorialManager(contexto) {
  return new HistorialManager(contexto);
}

export default HistorialManager;
