/**
 * AuditoriaManager — auditoría con REQUERIMIENTO como entidad principal.
 */
import { ENTIDAD_PRINCIPAL, TIPOS_OPERACION_AUDITORIA } from '../common/ConstantesEventos.js';
import {
  generarId,
  ahoraISO,
  formatearFechaHora,
  resolverRequerimientoId,
  resolverCodigoRequerimiento,
} from '../common/Utils.js';

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

    let requerimientoId = null;
    let codigoRequerimiento = null;
    try {
      requerimientoId = resolverRequerimientoId(payload);
      codigoRequerimiento = resolverCodigoRequerimiento(payload, requerimientoId);
    } catch {
      requerimientoId = payload.requerimientoId || null;
      codigoRequerimiento = payload.codigoRequerimiento || null;
    }

    const entry = {
      id: generarId('aud'),
      entidadPrincipal: ENTIDAD_PRINCIPAL.REQUERIMIENTO,
      requerimientoId,
      codigoRequerimiento,
      expedienteId: payload.expedienteId || null,
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
      entidad: payload.entidad || ENTIDAD_PRINCIPAL.REQUERIMIENTO,
      entidadId: requerimientoId || payload.entidadId || payload.entidad_id || null,
      detalle: payload.detalle || {},
    };

    const clave = requerimientoId || 'global';
    await this.store.append(COLECCION, clave, entry);
    return entry;
  }

  async listar(filtro = {}) {
    const clave = filtro.requerimientoId ? resolverRequerimientoId(filtro) : 'global';
    const lista = await this.store.getLista(COLECCION, clave);
    return lista.filter((e) => {
      if (filtro.usuario && e.usuario !== filtro.usuario) return false;
      if (filtro.modulo && e.modulo !== filtro.modulo) return false;
      if (filtro.tipoOperacion && e.tipoOperacion !== filtro.tipoOperacion) return false;
      if (filtro.codigoRequerimiento && e.codigoRequerimiento !== filtro.codigoRequerimiento) return false;
      if (filtro.expedienteId && e.expedienteId !== filtro.expedienteId) return false;
      return true;
    });
  }

  async listarPorRequerimiento(requerimientoId, filtro = {}) {
    return this.listar({ ...filtro, requerimientoId });
  }
}

export function crearAuditoriaManager(contexto) {
  return new AuditoriaManager(contexto);
}

export default AuditoriaManager;
