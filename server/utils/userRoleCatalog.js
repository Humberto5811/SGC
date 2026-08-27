/**
 * Catálogo central de roles de seguridad y perfiles funcionales.
 *
 * OBJETIVO: Centralizar todas las definiciones de roles, perfiles y
 * aliases en un solo lugar. Compatibilidad total con valores legacy.
 *
 * REGLAS:
 * - NO modificar comportamiento de autorización.
 * - NO ampliar privilegios.
 * - Ante la duda, devolver menos perfiles.
 * - Las inferencias por cargo están marcadas con // LEGACY.
 *
 * CONTRATO del objeto `usuario`:
 *   { id, rol, cargo, permisos, alcance_datos }
 * Si alguna propiedad falta, la función retorna su valor más restrictivo.
 */

// ---------------------------------------------------------------------------
// A. CONSTANTES
// ---------------------------------------------------------------------------

/** Roles de seguridad legacy (valores en BD). NO modificar. */
export const ROLES_SEGURIDAD_LEGACY = {
  ADMIN: 'admin',
  USUARIO: 'usuario',
  AU: 'au',
  DEC: 'dec',
};

/** RC8.15.6G-8D3 — Roles generales de actuación (UI / alcance). */
export const ROLES_GENERALES = Object.freeze({
  DIRECTOR: 'DIRECTOR',
  COORDINADOR: 'COORDINADOR',
  USUARIO: 'USUARIO',
  OPERADOR: 'OPERADOR',
  ADMINISTRADOR: 'ADMINISTRADOR',
});

export const ROLES_GENERALES_LABELS = Object.freeze({
  [ROLES_GENERALES.DIRECTOR]: 'Director',
  [ROLES_GENERALES.COORDINADOR]: 'Coordinador',
  [ROLES_GENERALES.USUARIO]: 'Usuario',
  [ROLES_GENERALES.OPERADOR]: 'Operador',
  [ROLES_GENERALES.ADMINISTRADOR]: 'Administrador',
});

/** Etiquetas visuales para los roles legacy. */
export const ROLES_SEGURIDAD_LABELS = {
  [ROLES_SEGURIDAD_LEGACY.ADMIN]: 'Administrador',
  [ROLES_SEGURIDAD_LEGACY.USUARIO]: 'Usuario',
  [ROLES_SEGURIDAD_LEGACY.AU]: 'Área Usuaria',
  [ROLES_SEGURIDAD_LEGACY.DEC]: 'DEC',
};

/** Perfiles funcionales (modelo objetivo). */
export const PERFILES_FUNCIONALES = {
  AREA_USUARIA: 'AREA_USUARIA',
  DIRECTOR_CENTRO: 'DIRECTOR_CENTRO',
  COORDINADOR_CENTRO: 'COORDINADOR_CENTRO',
  DEC: 'DEC',
  PROGRAMACION: 'PROGRAMACION',
  COORDINADOR_CM: 'COORDINADOR_CM',
  ANALISTA_CONTRATACIONES: 'ANALISTA_CONTRATACIONES',
  COORDINADOR_ALMACEN: 'COORDINADOR_ALMACEN',
  ALMACENERO: 'ALMACENERO',
  ESPECIALISTA_RECEPCION: 'ESPECIALISTA_RECEPCION',
  RESPONSABLE_CONFORMIDAD: 'RESPONSABLE_CONFORMIDAD',
  ANALISTA_PAGO: 'ANALISTA_PAGO',
};

/** Etiquetas legibles para perfiles funcionales. */
export const PERFILES_FUNCIONALES_LABELS = {
  [PERFILES_FUNCIONALES.AREA_USUARIA]: 'Área Usuaria',
  [PERFILES_FUNCIONALES.DIRECTOR_CENTRO]: 'Director / Gerente de Centro',
  [PERFILES_FUNCIONALES.COORDINADOR_CENTRO]: 'Coordinador Administrativo de Centro',
  [PERFILES_FUNCIONALES.DEC]: 'DEC',
  [PERFILES_FUNCIONALES.PROGRAMACION]: 'Programación',
  [PERFILES_FUNCIONALES.COORDINADOR_CM]: 'Coordinador CM',
  [PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES]: 'Analista de Contrataciones',
  [PERFILES_FUNCIONALES.COORDINADOR_ALMACEN]: 'Coordinador de Almacén',
  [PERFILES_FUNCIONALES.ALMACENERO]: 'Almacenero',
  [PERFILES_FUNCIONALES.ESPECIALISTA_RECEPCION]: 'Especialista de Recepción',
  [PERFILES_FUNCIONALES.RESPONSABLE_CONFORMIDAD]: 'Responsable de Conformidad',
  [PERFILES_FUNCIONALES.ANALISTA_PAGO]: 'Analista de Pago',
};

/** Perfiles que tienen alcance transversal (ven todos los centros). */
export const PERFILES_TRANSVERSALES = new Set([
  PERFILES_FUNCIONALES.DEC,
  PERFILES_FUNCIONALES.PROGRAMACION,
  PERFILES_FUNCIONALES.COORDINADOR_CM,
  PERFILES_FUNCIONALES.COORDINADOR_ALMACEN,
  PERFILES_FUNCIONALES.ALMACENERO,
  PERFILES_FUNCIONALES.ESPECIALISTA_RECEPCION,
  PERFILES_FUNCIONALES.ANALISTA_PAGO,
]);

// ---------------------------------------------------------------------------
// B. FUNCIONES DE NORMALIZACIÓN
// ---------------------------------------------------------------------------

/**
 * Normaliza texto para comparación institucional.
 * Minúsculas, sin tildes, espacios colapsados.
 */
export function normalizeTextoInstitucional(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza un valor de rol legacy a su clave canónica.
 * Ej: 'AU' → 'au', 'Admin' → 'admin'.
 */
export function normalizeSecurityRole(valor) {
  if (valor == null || valor === '') return ROLES_SEGURIDAD_LEGACY.USUARIO;
  const v = normalizeTextoInstitucional(String(valor));
  if (v === 'admin' || v === 'administrador') return ROLES_SEGURIDAD_LEGACY.ADMIN;
  if (v === 'au' || v === 'area_usuaria' || v === 'area usuaria') return ROLES_SEGURIDAD_LEGACY.AU;
  if (v === 'dec') return ROLES_SEGURIDAD_LEGACY.DEC;
  if (v === 'usuario' || v === 'director' || v === 'coordinador' || v === 'operador') {
    return ROLES_SEGURIDAD_LEGACY.USUARIO;
  }
  // Valor desconocido → usuario mínimo
  return ROLES_SEGURIDAD_LEGACY.USUARIO;
}

/** Normaliza rol general institucional. */
export function normalizeRolGeneral(valor, fallback = ROLES_GENERALES.USUARIO) {
  const v = String(valor || '').trim().toUpperCase();
  if (ROLES_GENERALES[v]) return ROLES_GENERALES[v];
  if (v === 'ADMIN' || v === 'ADMINISTRADOR') return ROLES_GENERALES.ADMINISTRADOR;
  if (v === 'AU' || v === 'AREA USUARIA') return ROLES_GENERALES.USUARIO;
  return fallback;
}

/** Rol general persistido en BD (columna rol) a partir del usuario. */
export function rolGeneralFromUsuario(usuario = {}) {
  const rolRaw = String(usuario.rol || '').trim();
  const mapped = normalizeRolGeneral(rolRaw, '');
  if (mapped) return mapped;
  if (normalizeSecurityRole(rolRaw) === ROLES_SEGURIDAD_LEGACY.ADMIN) {
    return ROLES_GENERALES.ADMINISTRADOR;
  }
  if (normalizeSecurityRole(rolRaw) === ROLES_SEGURIDAD_LEGACY.DEC) {
    return ROLES_GENERALES.USUARIO;
  }
  const cargoNorm = normalizeTextoInstitucional(usuario.cargo || '');
  if (/director|gerente/.test(cargoNorm)) return ROLES_GENERALES.DIRECTOR;
  if (/coordinador/.test(cargoNorm) && /centro|administrativ/.test(cargoNorm)) {
    return ROLES_GENERALES.COORDINADOR;
  }
  if (/operador|especialista/.test(cargoNorm)) return ROLES_GENERALES.OPERADOR;
  return ROLES_GENERALES.USUARIO;
}

/** Valor de columna usuarios.rol para un rol general (compat legacy). */
export function rolGeneralToLegacyRol(rolGeneral) {
  const g = normalizeRolGeneral(rolGeneral);
  if (g === ROLES_GENERALES.ADMINISTRADOR) return ROLES_SEGURIDAD_LEGACY.ADMIN;
  if (g === ROLES_GENERALES.DIRECTOR) return 'director';
  if (g === ROLES_GENERALES.COORDINADOR) return 'coordinador';
  if (g === ROLES_GENERALES.OPERADOR) return 'operador';
  return ROLES_SEGURIDAD_LEGACY.USUARIO;
}

// ---------------------------------------------------------------------------
// C. FUNCIONES DE SEGURIDAD (LEGACY COMPAT)
// ---------------------------------------------------------------------------

/**
 * Retorna true si el usuario tiene rol de administrador.
 * @param {{ rol?: string }} usuario
 */
export function isAdminSecurityRole(usuario) {
  if (!usuario) return false;
  const r = normalizeSecurityRole(usuario.rol);
  return r === ROLES_SEGURIDAD_LEGACY.ADMIN;
}

// ---------------------------------------------------------------------------
// D. RESOLUCIÓN DE PERFILES FUNCIONALES
// ---------------------------------------------------------------------------
// Prioridad:
//   1) permisos.perfil explícito
//   2) inferencia por cargo (LEGACY — regex)
//   3) default: AREA_USUARIA

/**
 * Retorna perfil explícito si el JSON de permisos contiene una clave
 * 'perfil' o 'perfil_funcional'.
 */
function extractExplicitProfile(permisos) {
  if (!permisos || typeof permisos !== 'object') return null;
  const raw = permisos.perfil || permisos.perfil_funcional || permisos.profile || '';
  const v = String(raw).trim().toUpperCase();
  if (!v) return null;
  // Mapear alias comunes
  const aliasMap = {
    'ANALISTA': PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES,
    'ANALISTA_CM': PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES,
    'ANALISTA CONTRATACIONES': PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES,
    'COORDINADOR': PERFILES_FUNCIONALES.COORDINADOR_CM,
    'COORDINADOR_CM': PERFILES_FUNCIONALES.COORDINADOR_CM,
    'COORDINADOR CM': PERFILES_FUNCIONALES.COORDINADOR_CM,
    'DEC': PERFILES_FUNCIONALES.DEC,
    'ALMACEN': PERFILES_FUNCIONALES.ALMACENERO,
    'ALMACENERO': PERFILES_FUNCIONALES.ALMACENERO,
  };
  if (aliasMap[v]) return aliasMap[v];
  if (Object.values(PERFILES_FUNCIONALES).includes(v)) return v;
  return null;
}

// --- LEGACY: Funciones de inferencia por cargo (regex) ---
// Estas funciones se eliminarán cuando exista tabla de perfiles.
// NO modificar su comportamiento actual.

/**
 * LEGACY: Detecta perfil de Coordinador CM por cargo.
 */
function legacyIsCoordinadorCM(cargoNorm) {
  if (!cargoNorm) return false;
  if (/coordinacion\s*cm/.test(cargoNorm)) return true;
  if (cargoNorm === 'coordinador cm' || cargoNorm === 'coord cm') return true;
  if (/coordinador/.test(cargoNorm) && (/\bcm\b/.test(cargoNorm) || /\bcontratos\b/.test(cargoNorm) || /\buit\b/.test(cargoNorm))) {
    return true;
  }
  return false;
}

/**
 * LEGACY: Detecta perfil DEC por cargo.
 */
function legacyIsDec(cargoNorm) {
  if (!cargoNorm) return false;
  if (cargoNorm === 'dec') return true;
  if (/^jefe\s+dec\b/.test(cargoNorm)) return true;
  if (/especialista\s+dec/.test(cargoNorm)) return true;
  if (/\bdec\b/.test(cargoNorm) && !/coordinador|analista|contrataciones|cuadro/.test(cargoNorm)) {
    return true;
  }
  return false;
}

/**
 * LEGACY: Detecta perfil de Programación por cargo.
 */
function legacyIsProgramacion(cargoNorm) {
  if (!cargoNorm) return false;
  return /\bprogramacion\b/.test(cargoNorm) || /\bprogramador\b/.test(cargoNorm);
}

/**
 * LEGACY: Detecta perfil de Director/Centro por cargo.
 */
function legacyIsDirectorCentro(cargoNorm) {
  if (!cargoNorm) return false;
  if (/coordinador/.test(cargoNorm) && (/\bcm\b/.test(cargoNorm) || /contratos/.test(cargoNorm) || /contratacion/.test(cargoNorm) || /\buit\b/.test(cargoNorm))) {
    return false; // es Coord CM, no Director
  }
  if (/director/.test(cargoNorm) || /gerente/.test(cargoNorm)) return true;
  if (/coordinador\s*administrativ/.test(cargoNorm)) return true;
  if (/coordinador/.test(cargoNorm) && /centro/.test(cargoNorm)) return true;
  return false;
}

/**
 * LEGACY: Detecta perfil de Almacén por cargo.
 */
function legacyIsAlmacen(cargoNorm) {
  if (!cargoNorm) return false;
  return /almacen/.test(cargoNorm) || /almacenero/.test(cargoNorm);
}

/**
 * LEGACY: Detecta perfil de analista de contrataciones por cargo.
 */
function legacyIsAnalistaContrataciones(cargoNorm) {
  if (!cargoNorm) return false;
  if (legacyIsCoordinadorCM(cargoNorm)) return false;
  if (cargoNorm === 'analista' || cargoNorm === 'analista cm' || cargoNorm === 'especialista cm') {
    return true;
  }
  return /analista/.test(cargoNorm)
    && (/compra/.test(cargoNorm) || /contrat/.test(cargoNorm) || /\bccp\b/.test(cargoNorm) || /\bcm\b/.test(cargoNorm));
}

/**
 * LEGACY: Detecta perfil CCP por cargo.
 */
function legacyIsCcp(cargoNorm) {
  if (!cargoNorm) return false;
  return /\bccp\b/.test(cargoNorm)
    || (/comite/.test(cargoNorm) && /compras|ccp/.test(cargoNorm));
}

/**
 * LEGACY: Detecta perfil de Analista de Pago / Tesorería por cargo.
 */
function legacyIsAnalistaPago(cargoNorm) {
  if (!cargoNorm) return false;
  return /tesorer/.test(cargoNorm) || /pago/.test(cargoNorm) || /finanza/.test(cargoNorm);
}

// --- FIN LEGACY ---

/**
 * Resuelve los perfiles funcionales del usuario según las reglas de prioridad:
 *   1) permisos.perfil explícito
 *   2) inferencia LEGACY por cargo
 *   3) default: AREA_USUARIA
 *
 * @param {{ id?: *, rol?: string, cargo?: string, permisos?: object, alcance_datos?: string }} usuario
 * @returns {string[]} Array de códigos de perfil funcional
 */
export function resolveFunctionalProfiles(usuario) {
  if (!usuario) return [PERFILES_FUNCIONALES.AREA_USUARIA];

  const perfiles = [];

  // --- 1) Perfil explícito en permisos ---
  const explicit = extractExplicitProfile(usuario.permisos);
  if (explicit) {
    perfiles.push(explicit);
  }

  // --- 2) LEGACY: Inferencia por cargo ---
  const cargoNorm = normalizeTextoInstitucional(usuario.cargo || '');

  if (cargoNorm) {
    if (legacyIsDec(cargoNorm)) {
      perfiles.push(PERFILES_FUNCIONALES.DEC);
    }
    if (legacyIsCoordinadorCM(cargoNorm)) {
      perfiles.push(PERFILES_FUNCIONALES.COORDINADOR_CM);
    }
    if (legacyIsProgramacion(cargoNorm)) {
      perfiles.push(PERFILES_FUNCIONALES.PROGRAMACION);
    }
    if (legacyIsDirectorCentro(cargoNorm)) {
      perfiles.push(PERFILES_FUNCIONALES.DIRECTOR_CENTRO);
    }
    if (legacyIsAlmacen(cargoNorm)) {
      perfiles.push(
        cargoNorm.includes('coordinador') || cargoNorm.includes('jefe')
          ? PERFILES_FUNCIONALES.COORDINADOR_ALMACEN
          : PERFILES_FUNCIONALES.ALMACENERO,
      );
    }
    if (legacyIsAnalistaContrataciones(cargoNorm)) {
      perfiles.push(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES);
    }
    if (legacyIsCcp(cargoNorm)) {
      perfiles.push(PERFILES_FUNCIONALES.RESPONSABLE_CONFORMIDAD);
    }
    if (legacyIsAnalistaPago(cargoNorm)) {
      perfiles.push(PERFILES_FUNCIONALES.ANALISTA_PAGO);
    }
  }

  // --- 3) Default: AREA_USUARIA ---
  if (!perfiles.length) {
    perfiles.push(PERFILES_FUNCIONALES.AREA_USUARIA);
  }

  // Deducir Coordinador de Centro si es director y no tiene ya ese perfil
  // LEGACY: se infiere de isDirectorOCoordinadorCentro original
  if (cargoNorm && legacyIsDirectorCentro(cargoNorm) && !perfiles.includes(PERFILES_FUNCIONALES.COORDINADOR_CENTRO)) {
    // Si es director/gerente, ya tiene DIRECTOR_CENTRO. Si es coordinador
    // administrativo (no cm), agregar COORDINADOR_CENTRO.
    if (!/director|gerente/.test(cargoNorm)) {
      // Es coordinador administrativo (no cm)
      if (!perfiles.includes(PERFILES_FUNCIONALES.DIRECTOR_CENTRO)) {
        perfiles.push(PERFILES_FUNCIONALES.COORDINADOR_CENTRO);
      }
    }
  }

  // Deducir Especialista de Recepción si es almacenero y no coordinador
  if (legacyIsAlmacen(cargoNorm) && !perfiles.includes(PERFILES_FUNCIONALES.COORDINADOR_ALMACEN)) {
    if (!perfiles.includes(PERFILES_FUNCIONALES.ESPECIALISTA_RECEPCION)) {
      perfiles.push(PERFILES_FUNCIONALES.ESPECIALISTA_RECEPCION);
    }
  }

  return [...new Set(perfiles)];
}

function normalizePermisosObj(permisos) {
  if (permisos && typeof permisos === 'object') return permisos;
  try { return JSON.parse(permisos || '{}'); } catch (_) { return {}; }
}

/** Actividades de TESORERIA distintas de solo lectura (VER). */
const ACTIVIDADES_OPERATIVAS_TESORERIA = new Set([
  'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR', 'OBSERVAR', 'DERIVAR',
  'RECHAZAR', 'EXPORTAR', 'FIRMAR', 'DESCARGAR',
]);

/**
 * Acceso operativo al submódulo TESORERIA (derivación/gestión, no solo VER).
 * @param {object} permisos
 */
export function hasTesoreriaOperationalAccess(permisos) {
  const p = normalizePermisosObj(permisos);
  const submodulos = Array.isArray(p.submodulos)
    ? p.submodulos.map((s) => String(s).trim().toUpperCase())
    : [];
  if (!submodulos.includes('TESORERIA')) return false;

  const acts = p.actividadesPorSubmodulo?.TESORERIA;
  if (!Array.isArray(acts) || !acts.length) return false;
  return acts
    .map((a) => String(a).trim().toUpperCase())
    .filter(Boolean)
    .some((a) => ACTIVIDADES_OPERATIVAS_TESORERIA.has(a));
}

function hasExplicitOrLegacyAnalistaPago(usuario) {
  const permisos = normalizePermisosObj(usuario?.permisos);
  if (extractExplicitProfile(permisos) === PERFILES_FUNCIONALES.ANALISTA_PAGO) return true;
  const cargoNorm = normalizeTextoInstitucional(usuario?.cargo || '');
  return legacyIsAnalistaPago(cargoNorm);
}

/**
 * Candidato a Analista de Pago para derivación de entregables:
 * perfil explícito/legacy ANALISTA_PAGO o TESORERIA con gestión operativa.
 * @param {{ activo?: boolean, rol?: string, cargo?: string, permisos?: object }} usuario
 */
export function hasAnalistaPagoDerivacionAccess(usuario) {
  if (!usuario || usuario.activo === false) return false;
  if (isAdminSecurityRole(usuario)) return true;
  const permisos = normalizePermisosObj(usuario.permisos);
  if (hasExplicitOrLegacyAnalistaPago({ ...usuario, permisos })) return true;
  return hasTesoreriaOperationalAccess(permisos);
}

// ---------------------------------------------------------------------------
// E. FUNCIONES DE CONSULTA DE PERFILES
// ---------------------------------------------------------------------------

/**
 * Verifica si el usuario posee un perfil funcional específico.
 *
 * @param {object} usuario
 * @param {string} perfil - Código de perfil (de PERFILES_FUNCIONALES)
 * @returns {boolean}
 */
export function hasFunctionalProfile(usuario, perfil) {
  if (!usuario || !perfil) return false;
  // Admin tiene todos los perfiles implícitamente
  if (isAdminSecurityRole(usuario)) return true;
  const code = String(perfil).toUpperCase();
  if (code === PERFILES_FUNCIONALES.ANALISTA_PAGO) {
    return hasAnalistaPagoDerivacionAccess(usuario);
  }
  const perfiles = resolveFunctionalProfiles(usuario);
  return perfiles.includes(code);
}

/**
 * Determina si el perfil es transversal (sin filtro por centro).
 * Compatible con la lógica actual de isRolTransversalFlujo.
 *
 * @param {object} usuario
 * @param {string} [etapa] - Etapa opcional (no usada actualmente)
 * @returns {boolean}
 */
export function isTransversalProfile(usuario, etapa) {
  if (!usuario) return false;
  if (isAdminSecurityRole(usuario)) return true;

  // LEGACY: Misma lógica que isRolTransversalFlujo actual
  const rol = normalizeSecurityRole(usuario.rol);
  const cargoNorm = normalizeTextoInstitucional(usuario.cargo || '');

  // Roles de sistema transversales
  // LEGACY: dec/cm/almacen son transversales; au nunca
  if (['dec', 'cm', 'almacen', 'analista', 'ccp'].includes(rol) && rol !== 'au') {
    if (rol === 'dec' || rol === 'cm' || rol === 'almacen') return true;
  }

  // LEGACY: Inferencia por cargo (misma regex que isRolTransversalFlujo actual)
  if (/coordinador/.test(cargoNorm) && (/\bcm\b/.test(cargoNorm) || /contratos\s*menores/.test(cargoNorm) || /\buit\b/.test(cargoNorm))) {
    return true;
  }
  if (/analista/.test(cargoNorm) && (/compra/.test(cargoNorm) || /contrat/.test(cargoNorm) || /\bccp\b/.test(cargoNorm) || /\bcm\b/.test(cargoNorm))) {
    return true;
  }
  if (/\bdec\b/.test(cargoNorm) || /^jefe\s+dec/.test(cargoNorm) || /especialista\s+dec/.test(cargoNorm)) {
    return true;
  }
  if (/\bccp\b/.test(cargoNorm) || /certificacion\s*de\s*credito/.test(cargoNorm)) {
    return true;
  }
  if (/coordinador/.test(cargoNorm) && /contratacion/.test(cargoNorm)) {
    return true;
  }
  if (/almacen/.test(cargoNorm) || /almacenero/.test(cargoNorm)) {
    return true;
  }

  return false;
}

/**
 * Obtiene el alcance operativo del usuario.
 * Valores posibles: 'institucional', 'transversal', 'centro', 'centro_costo', 'expediente', 'personalizado'
 *
 * @param {object} usuario
 * @returns {string}
 */
export function getUserOperationalScope(usuario) {
  if (!usuario) return 'centro_costo';

  if (isAdminSecurityRole(usuario)) return 'institucional';

  const explicit = String(usuario.alcance_datos || '').trim().toUpperCase();
  if (explicit === 'INSTITUCIONAL') return 'institucional';

  if (isTransversalProfile(usuario)) return 'transversal';

  if (explicit === 'CENTRO') return 'centro';
  if (explicit === 'PERSONALIZADO') return 'personalizado';

  // LEGACY: Director/Coordinador de centro → alcance centro
  const cargoNorm = normalizeTextoInstitucional(usuario.cargo || '');
  if (legacyIsDirectorCentro(cargoNorm)) return 'centro';

  return 'centro_costo';
}

export default {
  ROLES_SEGURIDAD_LEGACY,
  ROLES_GENERALES,
  ROLES_GENERALES_LABELS,
  ROLES_SEGURIDAD_LABELS,
  PERFILES_FUNCIONALES,
  PERFILES_FUNCIONALES_LABELS,
  PERFILES_TRANSVERSALES,
  normalizeTextoInstitucional,
  normalizeSecurityRole,
  normalizeRolGeneral,
  rolGeneralFromUsuario,
  rolGeneralToLegacyRol,
  isAdminSecurityRole,
  resolveFunctionalProfiles,
  hasFunctionalProfile,
  hasTesoreriaOperationalAccess,
  hasAnalistaPagoDerivacionAccess,
  isTransversalProfile,
  getUserOperationalScope,
};