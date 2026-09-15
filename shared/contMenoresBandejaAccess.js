/**
 * RC8.17.8H1 — Acceso bandeja Cont.Menores (localizar expedientes PERSONA).
 * Separado de permisos operativos ACTOS_PREPARATORIOS.
 */
import { normalizeEquipoUadCodigo, EQUIPOS_UAD } from './equiposUad.js';

export function usuarioEnUadBasico(usuario = {}) {
  const c = String(usuario.centro || '').trim().toUpperCase();
  if (c === 'OA') return true;
  const cc = String(usuario.codigo_centro_costo || '').replace(/\./g, '').trim().toUpperCase();
  return cc.length > 0 && cc.startsWith('010401');
}

export function rolGeneralBasicoFromUsuario(usuario = {}) {
  const rg = String(usuario.rol_general || '').trim().toUpperCase();
  if (rg === 'COORDINADOR' || rg === 'OPERADOR' || rg === 'DIRECTOR') return rg;
  const rol = String(usuario.rol || '').trim().toLowerCase();
  if (rol === 'coordinador') return 'COORDINADOR';
  if (rol === 'operador') return 'OPERADOR';
  if (rol === 'director') return 'DIRECTOR';
  return rg || rol.toUpperCase() || '';
}

/** Acceso VER a dec/actos: equipo CONT_MENORES + COORD/OPER + UAD básico. */
export function esMiembroContMenoresBandejaAcceso(usuario = {}) {
  if (!usuario || usuario.activo === false) return false;
  if (!usuarioEnUadBasico(usuario)) return false;
  const eq = normalizeEquipoUadCodigo(usuario.equipo_uad);
  if (eq !== EQUIPOS_UAD.CONT_MENORES) return false;
  const rg = rolGeneralBasicoFromUsuario(usuario);
  return rg === 'COORDINADOR' || rg === 'OPERADOR';
}

/** Coordinador CM (vista amplia) — por cargo/rol, no por equipo_uad solo. */
export function esCoordinadorActosUsuario(usuario = {}) {
  const cargo = String(usuario.cargo || '').toLowerCase();
  if (cargo.includes('coordinador') && cargo.includes('contratos')) return true;
  if (String(usuario.rol || '').toLowerCase() === 'admin') return true;
  if (rolGeneralBasicoFromUsuario(usuario) === 'COORDINADOR'
    && normalizeEquipoUadCodigo(usuario.equipo_uad) === EQUIPOS_UAD.CONT_MENORES) {
    return true;
  }
  return false;
}
