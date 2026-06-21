import { query } from '../db.js';

let usuarioMapPromise = null;

const GENERICOS = new Set([
  'sistema', 'usuario au', 'gerente', 'dec', 'programación', 'programacion',
  'director / gerente', 'programador', 'usuario',
]);

async function buildUsuarioMap() {
  const { rows } = await query(`
    SELECT dni, username,
      COALESCE(
        NULLIF(TRIM(CONCAT(COALESCE(apellidos, ''), ' ', COALESCE(nombres, ''))), ''),
        NULLIF(TRIM(nombre), ''),
        dni
      ) AS display
    FROM usuarios
    WHERE activo = TRUE
  `);
  const map = new Map();
  rows.forEach((r) => {
    const display = String(r.display || r.dni || '').trim();
    if (!display) return;
    if (r.dni) map.set(String(r.dni).trim(), display);
    if (r.username) map.set(String(r.username).trim().toLowerCase(), display);
    map.set(display, display);
  });
  return map;
}

export async function getUsuarioMap() {
  if (!usuarioMapPromise) usuarioMapPromise = buildUsuarioMap();
  return usuarioMapPromise;
}

export function resolveUsuarioNombreSync(identificador, map) {
  const id = String(identificador || '').trim();
  if (!id) return '—';
  if (GENERICOS.has(id.toLowerCase())) return id;
  if (!map) return id;
  return map.get(id) || map.get(id.toLowerCase()) || id;
}

export async function resolveUsuarioNombre(identificador) {
  const map = await getUsuarioMap();
  return resolveUsuarioNombreSync(identificador, map);
}

export function aplicarNombresUsuariosHistorial(historial, map) {
  if (!historial?.length || !map) return historial || [];
  return historial.map((h) => ({
    ...h,
    usuario: resolveUsuarioNombreSync(h.usuario, map),
  }));
}

export function invalidateUsuarioMapCache() {
  usuarioMapPromise = null;
}
