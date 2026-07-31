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

/** Valores de centro del expediente (nunca válidos como usuario creador). */
export function centrosProhibidosFromRow(row) {
  return new Set(
    [row?.responsable, row?.centro_nombre, row?.centro_costo_codigo, row?.centro]
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * True si el valor es centro, rol genérico o vacío — no usable como usuario creador.
 * `requerimientos.responsable` es el centro del área (p.ej. CNCC), no una persona.
 */
export function isUsuarioCreadorInvalido(valor, row = null, roleLabels = []) {
  const v = String(valor || '').trim();
  if (!v) return true;
  const low = v.toLowerCase();
  if (isIdentificadorGenerico(v)) return true;
  if (centrosProhibidosFromRow(row).has(low)) return true;
  for (const r of roleLabels || []) {
    if (String(r || '').trim().toLowerCase() === low) return true;
  }
  return false;
}

/**
 * Resuelve el usuario creador real del requerimiento.
 * Nunca acepta centro (`row.responsable`), roles ni "Usuario AU".
 */
export function resolveUsuarioCreadorRequerimiento(row, ...candidatos) {
  for (const c of candidatos) {
    const v = String(c || '').trim();
    if (!isUsuarioCreadorInvalido(v, row)) return v;
  }
  return null;
}

function parseJsonArray(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Persona para columna Responsable (bandeja Registro).
 *
 * Prioridad:
 * 1) usuario del primer movimiento CREADO (creador real del alta)
 * 2) historial_estados[0].usuario (o entrada accion creacion)
 * 3) usuario_modificacion (respaldo)
 * 4) responsable_actual solo si es persona real (no rol ni centro)
 *
 * Nunca usa requerimientos.responsable / centro_nombre (son centro, p.ej. CNCC).
 */
export function resolveResponsablePersonaDisplay(row, roleLabels = []) {
  const roles = new Set(
    (Array.isArray(roleLabels) ? roleLabels : [])
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean),
  );

  const pick = (valor) => {
    const v = String(valor || '').trim();
    if (!v) return null;
    if (roles.has(v.toLowerCase())) return null;
    if (isUsuarioCreadorInvalido(v, row)) return null;
    return v;
  };

  // 1) Primer movimiento CREADO
  const movs = parseJsonArray(row?.historial_movimientos);
  const movCreado = movs.find((m) => /^CREADO$|CREACI[OÓ]N/i.test(String(m?.accion || '').trim()));
  const fromCreado = pick(movCreado?.usuario || movCreado?.actor);
  if (fromCreado) return fromCreado;

  // 2) historial_estados — entrada de creación o [0]
  const hist = parseJsonArray(row?.historial_estados);
  const histCreacion = hist.find((h) => /creaci[oó]n|creado|create/i.test(String(h?.accion || '')))
    || hist[0];
  const fromHist = pick(histCreacion?.usuario);
  if (fromHist) return fromHist;

  // 3) usuario_modificacion (respaldo; suele ser el creador en el alta)
  const fromUm = pick(row?.usuario_modificacion);
  if (fromUm) return fromUm;

  // 4) responsable_actual solo si es usuario real (nunca rol "Usuario AU" ni centro CNCC)
  const fromActual = pick(row?.responsable_actual || row?.responsableActual);
  if (fromActual) return fromActual;

  // Sin persona asociada: no inventar centro; rol genérico solo como último recurso visual
  return 'Usuario AU';
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
