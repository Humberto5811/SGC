/**
 * Utilidades compartidas del SGC Core — sin dependencias de módulos de negocio.
 */
import { crearPlantillaContextoRequerimiento } from './ConstantesJerarquia.js';

let _seq = 0;

export function generarId(prefix = 'core') {
  _seq += 1;
  return `${prefix}-${Date.now()}-${_seq}`;
}

export function ahoraISO() {
  return new Date().toISOString();
}

export function parseFecha(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatearFechaHora(iso) {
  const d = parseFecha(iso);
  if (!d) return { fecha: '', hora: '' };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    hora: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

export function requerido(valor, nombre) {
  if (valor == null || valor === '') throw new Error(`${nombre} es obligatorio`);
  return valor;
}

/**
 * Resuelve el identificador principal del requerimiento.
 * Compatibilidad: acepta expedienteId como alias legacy (fase 1).
 */
export function resolverRequerimientoId(payload = {}) {
  if (payload.requerimientoId != null && payload.requerimientoId !== '') {
    return String(payload.requerimientoId);
  }
  if (payload.expedienteId != null && payload.expedienteId !== '') {
    return String(payload.expedienteId);
  }
  if (typeof payload === 'string' || typeof payload === 'number') {
    return String(payload);
  }
  if (payload.id != null && payload.id !== '') {
    return String(payload.id);
  }
  throw new Error('requerimientoId es obligatorio');
}

/** Resuelve código visible del requerimiento (ej. REQ-2026-001). */
export function resolverCodigoRequerimiento(payload = {}, requerimientoId = null) {
  const id = requerimientoId || resolverRequerimientoId(payload);
  return String(payload.codigoRequerimiento || payload.codigo || id);
}

/** Alias legacy: expedienteId → requerimientoId (compatibilidad fase 1). */
export function resolverIdLegacy(idOrPayload) {
  if (typeof idOrPayload === 'object') return resolverRequerimientoId(idOrPayload);
  return String(requerido(idOrPayload, 'requerimientoId'));
}

export function crearStoreEnMemoria() {
  const buckets = new Map();
  return {
    async get(coleccion, id) {
      return buckets.get(coleccion)?.get(String(id)) ?? null;
    },
    async set(coleccion, id, valor) {
      if (!buckets.has(coleccion)) buckets.set(coleccion, new Map());
      buckets.get(coleccion).set(String(id), valor);
      return valor;
    },
    async delete(coleccion, id) {
      return buckets.get(coleccion)?.delete(String(id)) ?? false;
    },
    async list(coleccion, filtro = () => true) {
      const map = buckets.get(coleccion);
      if (!map) return [];
      return [...map.values()].filter(filtro);
    },
    async append(coleccion, claveLista, item) {
      const key = `${coleccion}:${claveLista}`;
      const actual = (await this.get(coleccion, key)) || [];
      const next = [...actual, item];
      await this.set(coleccion, key, next);
      return next;
    },
    async getLista(coleccion, claveLista) {
      return (await this.get(coleccion, `${coleccion}:${claveLista}`)) || [];
    },
  };
}

export function crearContextoCore(opts = {}) {
  return {
    store: opts.store || crearStoreEnMemoria(),
    obtenerUsuario: opts.obtenerUsuario || (() => ({ id: null, nombre: 'Sistema' })),
    obtenerIp: opts.obtenerIp || (() => ''),
    obtenerNavegador: opts.obtenerNavegador || (() => ''),
    /** Plantilla multientidad — sin implementación operativa. */
    crearContextoRequerimiento: (requerimientoId) => crearPlantillaContextoRequerimiento(requerimientoId),
  };
}

export default {
  generarId,
  ahoraISO,
  parseFecha,
  formatearFechaHora,
  requerido,
  resolverRequerimientoId,
  resolverCodigoRequerimiento,
  resolverIdLegacy,
  crearStoreEnMemoria,
  crearContextoCore,
};
