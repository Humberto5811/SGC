/**
 * RC8.4B — Filtros compartidos de identificadores de usuario.
 *
 * Define qué valores NO son personas reales (roles genéricos, centros, etc.)
 * Consumido por el resolvedor central y el wrapper server-side.
 */

const ROLES_GENERICOS_SET = Object.freeze(new Set([
  'usuario au', 'gerente', 'dec', 'programacion',
  'director / gerente', 'programador', 'usuario',
  'coordinador de contratos menores', 'especialista contrataciones',
  'area usuaria', 'comite de compras publicas',
  'ejecutor contractual', 'registro de ordenes',
  'almacen', 'tesoreria', 'revision', 'sistema',
  'responsable dec', 'responsable programacion',
  'responsable ccp', 'analista asignado',
  'usuario del area usuaria', 'especialista de almacen',
  'analista de pago', 'coordinador cm',
  'pendiente de asignacion',
  '—', '-',
]));

const _norm = (v) => (String(v || '').trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

export function isRolGenerico(valor) {
  const v = _norm(valor);
  if (!v) return true;
  return ROLES_GENERICOS_SET.has(v);
}

export function isCentroOrganizacional(valor, evidencia = {}) {
  const v = _norm(valor);
  if (!v) return false;
  const centros = [
    String(evidencia.responsable || '').trim().toLowerCase(),
    String(evidencia.centro_nombre || '').trim().toLowerCase(),
    String(evidencia.centro || '').trim().toLowerCase(),
    String(evidencia.centro_costo_codigo || '').trim().toLowerCase(),
  ].filter(Boolean);
  return centros.includes(v);
}

export function isUsuarioInvalido(valor, evidencia = null) {
  const v = String(valor || '').trim();
  if (!v) return true;
  if (isRolGenerico(v)) return true;
  if (evidencia && isCentroOrganizacional(v, evidencia)) return true;
  return false;
}

export function centrosProhibidos(row) {
  return new Set(
    [row?.responsable, row?.centro_nombre, row?.centro_costo_codigo, row?.centro]
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean),
  );
}

export default { isRolGenerico, isCentroOrganizacional, isUsuarioInvalido, centrosProhibidos };