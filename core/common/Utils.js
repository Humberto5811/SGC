/**
 * Utilidades compartidas del SGC Core — sin dependencias de módulos de negocio.
 */

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

/**
 * Adaptador de persistencia inyectable.
 * En fase 2 se reemplazará por adaptador PostgreSQL sin cambiar managers.
 */
export function crearContextoCore(opts = {}) {
  return {
    store: opts.store || crearStoreEnMemoria(),
    obtenerUsuario: opts.obtenerUsuario || (() => ({ id: null, nombre: 'Sistema' })),
    obtenerIp: opts.obtenerIp || (() => ''),
    obtenerNavegador: opts.obtenerNavegador || (() => ''),
  };
}

export default {
  generarId,
  ahoraISO,
  parseFecha,
  formatearFechaHora,
  requerido,
  crearStoreEnMemoria,
  crearContextoCore,
};
