/**
 * RC8.5-B1 — Resolución canónica de rol operativo del Cuadro Comparativo.
 * Usado por frontend y backend para la misma clasificación.
 *
 * Prioridad:
 * 1) rol institucional explícito (admin)
 * 2) cargo configurado (normalizado)
 * 3) permisos de submódulo (CCP)
 * 4) fallback ANALISTA
 *
 * Nota de seguridad: el rol de sistema `dec` NO implica rol operativo DEC
 * (Analistas de Contrataciones también usan rol de sesión `dec`).
 */

export const ROLES_REVISION = Object.freeze({
  ANALISTA: 'ANALISTA',
  COORDINADOR_CM: 'COORDINADOR_CM',
  DEC: 'DEC',
  CCP: 'CCP',
  ADMINISTRADOR: 'ADMINISTRADOR',
});

export const BANDEJA_ESTADOS_POR_ROL = Object.freeze({
  ANALISTA: [
    'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR', 'EN_ELABORACION', 'BORRADOR',
    'ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO',
    'PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR',
    'OBSERVADO_COORDINADOR', 'PENDIENTE_DEC', 'OBSERVADO_DEC',
    'APROBADO_DEC', 'PENDIENTE_CCP', 'DERIVADO_CCP', 'OBSERVADO',
  ],
  COORDINADOR_CM: ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'],
  DEC: ['PENDIENTE_DEC', 'FIRMADO_COORDINADOR'],
  CCP: ['PENDIENTE_CCP', 'DERIVADO_CCP'],
  /** Supervisión: ve todos los estados (sin actuar como Analista silencioso). */
  ADMINISTRADOR: [
    'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR', 'EN_ELABORACION', 'BORRADOR',
    'ADJUDICADO', 'GENERADO', 'GENERADO_PRELIMINAR', 'FIRMADO',
    'PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR',
    'OBSERVADO_COORDINADOR', 'PENDIENTE_DEC', 'OBSERVADO_DEC',
    'APROBADO_DEC', 'PENDIENTE_CCP', 'DERIVADO_CCP', 'OBSERVADO', 'ANULADO',
  ],
});

/** Normaliza cargo/rol para comparación (minúsculas, sin tildes, espacios colapsados). */
export function normalizeTextoInstitucional(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isRolSistemaAdmin(user = {}) {
  const rol = normalizeTextoInstitucional(user.rol || user.role || '');
  return rol === 'admin' || rol === 'administrador';
}

function esCargoCoordinadorCm(cargoNorm) {
  if (!cargoNorm) return false;
  if (/coordinacion\s*cm/.test(cargoNorm)) return true;
  if (cargoNorm === 'coordinador cm' || cargoNorm === 'coord cm') return true;
  if (/coordinador/.test(cargoNorm) && (/\bcm\b/.test(cargoNorm) || /\bcontratos\b/.test(cargoNorm) || /\buit\b/.test(cargoNorm))) {
    return true;
  }
  return false;
}

function esCargoDec(cargoNorm) {
  if (!cargoNorm) return false;
  if (cargoNorm === 'dec') return true;
  if (/^jefe\s+dec\b/.test(cargoNorm)) return true;
  if (/especialista\s+dec/.test(cargoNorm)) return true;
  if (/\bdec\b/.test(cargoNorm) && !/coordinador|analista|contrataciones|cuadro/.test(cargoNorm)) {
    return true;
  }
  return false;
}

function esCargoCcp(cargoNorm) {
  if (!cargoNorm) return false;
  return /\bccp\b/.test(cargoNorm)
    || (/comite/.test(cargoNorm) && /compras|ccp/.test(cargoNorm));
}

/**
 * Rol operativo de revisión (misma función conceptual en FE/BE).
 * @param {{ cargo?: string, rol?: string, role?: string, permisos?: object }} user
 */
export function resolveRolRevision(user = {}) {
  if (isRolSistemaAdmin(user)) {
    return ROLES_REVISION.ADMINISTRADOR;
  }

  const cargoNorm = normalizeTextoInstitucional(user.cargo || '');
  const permisos = user.permisos && typeof user.permisos === 'object' ? user.permisos : {};
  const subs = Array.isArray(permisos.submodulos)
    ? permisos.submodulos.map((s) => String(s).toUpperCase())
    : [];

  // Permiso explícito institucional (solo si el perfil lo trae del servidor de usuarios)
  const explicit = String(permisos.rol_revision_cuadro || permisos.cuadro_rol_revision || '')
    .toUpperCase()
    .trim();
  if (explicit && Object.values(ROLES_REVISION).includes(explicit) && explicit !== ROLES_REVISION.ADMINISTRADOR) {
    return explicit;
  }

  if (esCargoCoordinadorCm(cargoNorm)) {
    return ROLES_REVISION.COORDINADOR_CM;
  }

  if (esCargoDec(cargoNorm)) {
    return ROLES_REVISION.DEC;
  }

  if (subs.includes('CCP') && esCargoCcp(cargoNorm)) {
    return ROLES_REVISION.CCP;
  }

  return ROLES_REVISION.ANALISTA;
}

/** Roles permitidos en modo prueba Administrador (RC8.5-G). */
export const ROLES_ACTUAR_COMO = Object.freeze([
  ROLES_REVISION.ANALISTA,
  ROLES_REVISION.COORDINADOR_CM,
  ROLES_REVISION.DEC,
]);

export function labelRolRevision(rol) {
  const map = {
    [ROLES_REVISION.ANALISTA]: 'Analista',
    [ROLES_REVISION.COORDINADOR_CM]: 'Coordinador CM',
    [ROLES_REVISION.DEC]: 'DEC',
    [ROLES_REVISION.CCP]: 'CCP',
    [ROLES_REVISION.ADMINISTRADOR]: 'Administrador',
  };
  return map[String(rol || '').toUpperCase()] || String(rol || '—');
}

export function normalizeActuarComo(value) {
  const v = String(value || '').toUpperCase().trim();
  return ROLES_ACTUAR_COMO.includes(v) ? v : '';
}

/**
 * Rol efectivo para autorizar acciones de revisión.
 * - Sesión/rol real no se modifica.
 * - `actuarComo` solo aplica si el usuario real es Administrador.
 * - Cualquier otro perfil que envíe actuar_como → error (anti-suplantación).
 */
export function resolveRolEfectivoRevision(userCtx = {}, actuarComo = '') {
  const rolReal = resolveRolRevision(userCtx);
  const ctx = normalizeActuarComo(actuarComo);
  if (!ctx) {
    return {
      rolEfectivo: rolReal,
      rolReal,
      actuarComo: '',
      modoPrueba: false,
    };
  }
  if (rolReal !== ROLES_REVISION.ADMINISTRADOR) {
    const err = new Error('Solo el Administrador puede utilizar el modo de prueba (actuar como)');
    err.code = 'ADMIN_ACTUAR_COMO_FORBIDDEN';
    throw err;
  }
  return {
    rolEfectivo: ctx,
    rolReal,
    actuarComo: ctx,
    modoPrueba: true,
  };
}

/** Modo de apertura del expediente según etapa (Admin: sugerencia de contexto de prueba). */
export function resolveModoAperturaExpediente(estadoCuadro, rolSesion) {
  const e = String(estadoCuadro || '').toUpperCase();
  const rol = String(rolSesion || '').toUpperCase();

  if (rol === ROLES_REVISION.ADMINISTRADOR) {
    if (['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'].includes(e)) {
      return ROLES_REVISION.COORDINADOR_CM;
    }
    if (e === 'PENDIENTE_DEC') {
      return ROLES_REVISION.DEC;
    }
    return ROLES_REVISION.ANALISTA;
  }

  if (rol === ROLES_REVISION.COORDINADOR_CM || rol === ROLES_REVISION.DEC
    || rol === ROLES_REVISION.CCP || rol === ROLES_REVISION.ANALISTA) {
    return rol;
  }
  return ROLES_REVISION.ANALISTA;
}

/** CCP solo tras aprobación DEC / listo para CCP. */
export function puedeMostrarBotonesCcp(estadoCuadro) {
  const e = String(estadoCuadro || '').toUpperCase();
  return ['APROBADO_DEC', 'PENDIENTE_CCP', 'DERIVADO_CCP'].includes(e);
}

export function esEstadoRevisionExterna(estadoCuadro) {
  const e = String(estadoCuadro || '').toUpperCase();
  return [
    'PENDIENTE_COORDINADOR',
    'FIRMADO_COORDINADOR',
    'PENDIENTE_DEC',
  ].includes(e);
}
