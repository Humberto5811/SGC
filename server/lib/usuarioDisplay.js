import { query } from '../db.js';

let usuarioMapPromise = null;

const GENERICOS = new Set([
  'sistema', 'usuario au', 'gerente', 'dec', 'programación', 'programacion',
  'director / gerente', 'programador', 'usuario',
  'coordinador de contratos menores', 'especialista contrataciones',
  'área usuaria', 'area usuaria', 'comité de compras públicas', 'comite de compras públicas',
  'ejecutor contractual', 'registro de órdenes', 'registro de ordenes',
  'almacén', 'almacen', 'tesorería', 'tesoreria', 'revisión', 'revision', '—', '-',
]);

/** True si el texto es rol de etapa / placeholder, no una persona real. */
export function isIdentificadorGenerico(valor) {
  const v = String(valor || '').trim().toLowerCase();
  if (!v) return true;
  return GENERICOS.has(v);
}

/**
 * Persona para columna Responsable (bandeja Registro).
 * Prefiere el creador/modificador real cuando responsable_actual es un rol genérico
 * (p.ej. "Usuario AU" escrito por inicializarTrazabilidad / ETAPAS).
 */
export function resolveResponsablePersonaDisplay(row, roleLabels = []) {
  const roles = new Set(
    (Array.isArray(roleLabels) ? roleLabels : [])
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean),
  );
  const isRol = (valor) => {
    const v = String(valor || '').trim();
    if (!v) return true;
    if (isIdentificadorGenerico(v)) return true;
    return roles.has(v.toLowerCase());
  };

  const candidatos = [];

  // 1) Creador desde historial (entrada inicial / CREACION)
  try {
    const raw = row?.historial_estados;
    const hist = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    if (Array.isArray(hist) && hist.length) {
      const creacion = hist.find((h) => /creaci[oó]n|creado|create/i.test(String(h?.accion || '')))
        || hist[0];
      const u = String(creacion?.usuario || '').trim();
      if (u) candidatos.push(u);
    }
  } catch (_) { /* ignore */ }

  try {
    const movRaw = row?.historial_movimientos;
    const movs = typeof movRaw === 'string' ? JSON.parse(movRaw || '[]') : (movRaw || []);
    if (Array.isArray(movs) && movs.length) {
      const creacion = movs.find((m) => /CREADO|CREACION|CREACIÓN/i.test(String(m?.accion || '')))
        || movs[0];
      const u = String(creacion?.usuario || creacion?.actor || '').trim();
      if (u) candidatos.push(u);
    }
  } catch (_) { /* ignore */ }

  // 2) Último usuario de modificación persistido en el expediente
  const um = String(row?.usuario_modificacion || '').trim();
  if (um) candidatos.push(um);

  for (const c of candidatos) {
    if (!isRol(c)) return c;
  }

  const actual = String(row?.responsable_actual || row?.responsableActual || '').trim();
  if (actual && !isRol(actual)) return actual;
  if (um) return um;
  return actual || 'Usuario AU';
}

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
