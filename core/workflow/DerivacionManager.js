/**
 * DerivacionManager — derivaciones asociadas al REQUERIMIENTO.
 */
import { ESTADOS_REQUERIMIENTO } from '../common/ConstantesEstados.js';
import {
  generarId,
  ahoraISO,
  formatearFechaHora,
  resolverRequerimientoId,
  resolverCodigoRequerimiento,
  resolverIdLegacy,
} from '../common/Utils.js';

const COLECCION = 'derivaciones';

function claveRequerimiento(idOrPayload) {
  return resolverRequerimientoId(typeof idOrPayload === 'object' ? idOrPayload : { requerimientoId: idOrPayload });
}

export class DerivacionManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async derivar(payload = {}) {
    const requerimientoId = claveRequerimiento(payload);
    const codigoRequerimiento = resolverCodigoRequerimiento(payload, requerimientoId);
    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuario = payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const reg = {
      id: generarId('der'),
      requerimientoId,
      codigoRequerimiento,
      origen: payload.origen,
      destino: payload.destino,
      usuario,
      fecha,
      hora,
      timestamp: ts,
      estado: payload.estado || ESTADOS_REQUERIMIENTO.DEC,
      comentario: payload.comentario || payload.observacion || '',
      recibida: false,
      fechaRecepcion: null,
      metadata: payload.metadata || {},
    };

    if (!reg.origen) throw new Error('origen es obligatorio');
    if (!reg.destino) throw new Error('destino es obligatorio');

    await this.store.append(COLECCION, requerimientoId, reg);
    return reg;
  }

  async obtenerDerivaciones(requerimientoId) {
    return this.listarPorRequerimiento(requerimientoId);
  }

  async listarPorRequerimiento(requerimientoId) {
    const lista = await this.store.getLista(COLECCION, claveRequerimiento(requerimientoId));
    return lista.slice().sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  }

  async listarPendientes(requerimientoId) {
    const lista = await this.listarPorRequerimiento(requerimientoId);
    return lista.filter((d) => !d.recibida);
  }

  async registrarRecepcion(requerimientoId, derivacionId, opts = {}) {
    const id = claveRequerimiento(requerimientoId);
    const lista = await this.listarPorRequerimiento(id);
    const idx = lista.findIndex((d) => d.id === derivacionId);
    if (idx < 0) throw new Error('Derivación no encontrada');

    lista[idx] = {
      ...lista[idx],
      recibida: true,
      fechaRecepcion: ahoraISO(),
      usuarioRecepcion: opts.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema',
      estado: opts.estado || ESTADOS_REQUERIMIENTO.REGISTRADO,
    };

    await this.store.set(COLECCION, `${COLECCION}:${id}`, lista);
    return lista[idx];
  }

  /** @deprecated alias legacy */
  async obtenerDerivacionesPorExpediente(expedienteId) {
    return this.obtenerDerivaciones(resolverIdLegacy(expedienteId));
  }
}

export function crearDerivacionManager(contexto) {
  return new DerivacionManager(contexto);
}

export default DerivacionManager;
