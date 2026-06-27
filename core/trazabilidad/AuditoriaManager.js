/**
 * AuditoriaManager — registro de operaciones del sistema.
 */
import { TIPOS_OPERACION_AUDITORIA } from '../common/ConstantesEventos.js';
import { generarId, ahoraISO, formatearFechaHora } from '../common/Utils.js';

const COLECCION = 'auditoria';

export class AuditoriaManager {
  constructor(contexto) {
    this.ctx = contexto;
    this.store = contexto.store;
  }

  async registrar(payload = {}) {
    const ts = ahoraISO();
    const { fecha, hora } = formatearFechaHora(ts);
    const usuario = payload.usuario || this.ctx.obtenerUsuario()?.nombre || 'Sistema';

    const entry = {
      id: generarId('aud'),
      usuario,
      ip: payload.ip || this.ctx.obtenerIp() || '',
      navegador: payload.navegador || this.ctx.obtenerNavegador() || '',
      fecha,
      hora,
      timestamp: ts,
      accion: payload.accion || '',
      modulo: payload.modulo || '',
      submodulo: payload.submodulo || '',
      tipoOperacion: payload.tipoOperacion || payload.tipo_operacion || TIPOS_OPERACION_AUDITORIA.UPDATE,
      entidad: payload.entidad || '',
      entidadId: payload.entidadId || payload.entidad_id || null,
      detalle: payload.detalle || {},
    };

    await this.store.append(COLECCION, 'global', entry);
    return entry;
  }

  async listar(filtro = {}) {
    const lista = await this.store.getLista(COLECCION, 'global');
    return lista.filter((e) => {
      if (filtro.usuario && e.usuario !== filtro.usuario) return false;
      if (filtro.modulo && e.modulo !== filtro.modulo) return false;
      if (filtro.tipoOperacion && e.tipoOperacion !== filtro.tipoOperacion) return false;
      return true;
    });
  }
}

export function crearAuditoriaManager(contexto) {
  return new AuditoriaManager(contexto);
}

export default AuditoriaManager;
