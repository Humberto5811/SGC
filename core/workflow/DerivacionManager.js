/**
 * DerivacionManager — registro de derivaciones entre módulos.
 */
import { ESTADOS } from '../common/ConstantesEstados.js';
import { generarId, ahoraISO, formatearFechaHora, requerido } from '../common/Utils.js';

const COLECCION = 'derivaciones';

function claveExpediente(expedienteId) {
  return String(requerido(expedienteId, 'expedienteId'));
}

export class DerivacionManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async derivar(payload = {}) {
    const expedienteId = claveExpediente(payload.expedienteId);
    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuario = payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const reg = {
      id: generarId('der'),
      expedienteId,
      origen: requerido(payload.origen, 'origen'),
      destino: requerido(payload.destino, 'destino'),
      usuario,
      fecha,
      hora,
      timestamp: ts,
      estado: payload.estado || ESTADOS.DERIVADO,
      comentario: payload.comentario || payload.observacion || '',
      recibida: false,
      fechaRecepcion: null,
      metadata: payload.metadata || {},
    };

    await this.store.append(COLECCION, expedienteId, reg);
    return reg;
  }

  async obtenerDerivaciones(expedienteId) {
    return this.listarPorExpediente(expedienteId);
  }

  async listarPorExpediente(expedienteId) {
    const lista = await this.store.getLista(COLECCION, claveExpediente(expedienteId));
    return lista.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }

  async listarPendientes(expedienteId) {
    const lista = await this.listarPorExpediente(expedienteId);
    return lista.filter((d) => !d.recibida);
  }

  async registrarRecepcion(expedienteId, derivacionId, opts = {}) {
    const lista = await this.listarPorExpediente(expedienteId);
    const idx = lista.findIndex((d) => d.id === derivacionId);
    if (idx < 0) throw new Error('Derivación no encontrada');

    lista[idx] = {
      ...lista[idx],
      recibida: true,
      fechaRecepcion: ahoraISO(),
      usuarioRecepcion: opts.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema',
      estado: opts.estado || ESTADOS.EN_PROCESO,
    };

    const storeKey = `${COLECCION}:${claveExpediente(expedienteId)}`;
    await this.store.set(COLECCION, storeKey, lista);
    return lista[idx];
  }
}

export function crearDerivacionManager(contexto) {
  return new DerivacionManager(contexto);
}

export default DerivacionManager;
