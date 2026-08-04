/**
 * Resolvedor central de alcance organizacional de datos.
 *
 * Separación:
 *  A) Permiso funcional (módulos/actividades)
 *  B) Alcance de datos (centro / centro de costo / institucional)
 *  C) Alcance operativo del flujo (roles transversales Contrataciones/Almacén)
 *
 * Prioridad:
 *  1. ADMIN / INSTITUCIONAL
 *  2. ROL TRANSVERSAL CONTRATACIONES → etapa/bandeja/asignación (sin filtro org)
 *  3. ROL TRANSVERSAL ALMACÉN → etapa recepción (sin filtro org en AU)
 *  4. DIRECTOR / COORD. ADMIN. DE CENTRO: todos los CC del centro
 *  5. USUARIO OPERATIVO: solo sus centros de costo
 *  6. PERSONALIZADO: asignaciones explicitas
 */
import { query } from '../db.js';
import {
  normalizeTextoInstitucional,
  isAdminSecurityRole,
  isTransversalProfile,
} from '../utils/userRoleCatalog.js';

export const SCOPE_TYPES = Object.freeze({
  INSTITUCIONAL: 'INSTITUCIONAL',
  TRANSVERSAL_FLUJO: 'TRANSVERSAL_FLUJO',
  CENTRO: 'CENTRO',
  CENTRO_COSTO: 'CENTRO_COSTO',
  PERSONALIZADO: 'PERSONALIZADO',
});

function httpError(message, status = 403, code = 'REQUERIMIENTO_FUERA_DE_ALCANCE') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function uniqNums(arr) {
  return [...new Set((arr || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
}

function uniqStr(arr) {
  return [...new Set((arr || []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))];
}

let _tableReady = false;
export async function ensureAlcanceTables() {
  if (_tableReady) return;
  await query(`
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS alcance_datos VARCHAR(40)
  `).catch(() => {});
  await query(`
    CREATE TABLE IF NOT EXISTS usuarios_alcance_asignaciones (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo VARCHAR(20) NOT NULL,
      centro_id INTEGER NULL REFERENCES centros(id) ON DELETE CASCADE,
      area_id INTEGER NULL REFERENCES areas(id) ON DELETE CASCADE,
      codigo_centro_costo VARCHAR(50) NULL,
      vigente BOOLEAN NOT NULL DEFAULT TRUE,
      eliminado_at TIMESTAMP NULL,
      vigente_desde DATE NULL,
      vigente_hasta DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_by VARCHAR(150) NULL,
      observacion TEXT NULL
    )
  `).catch(() => {});
  _tableReady = true;
}

function isAdminRol(rol) {
  // Delegado al catálogo central: isAdminSecurityRole
  return isAdminSecurityRole({ rol });
}

/** Roles/cargos transversales: no se restringen por centro en bandejas AU. */
export function isRolTransversalFlujo(user = {}) {
  // Delegado al catálogo central para mantener ÚNICA fuente de verdad.
  // Mismo comportamiento → mismo set de usuarios afectados.
  return isTransversalProfile(user);
}

function isDirectorOCoordinadorCentro(cargo = '') {
  const c = normalizeTextoInstitucional(cargo);
  if (!c) return false;
  // Coordinador CM / contrataciones no es coordinador de centro
  if (/coordinador/.test(c) && (/\bcm\b/.test(c) || /contratos/.test(c) || /contratacion/.test(c) || /\buit\b/.test(c))) {
    return false;
  }
  if (/director/.test(c) || /gerente/.test(c)) return true;
  if (/coordinador\s*administrativ/.test(c)) return true;
  if (/coordinador/.test(c) && /centro/.test(c)) return true;
  return false;
}

async function loadUsuarioOrg(userId) {
  const id = parseInt(userId, 10);
  if (!Number.isFinite(id)) return null;
  const { rows } = await query(`
    SELECT u.id, u.rol, u.cargo, u.area_id, u.codigo_centro_costo, u.centro,
           u.alcance_datos, u.activo,
           a.id AS area_pk, a.codigo AS area_codigo, a.nombre AS area_nombre,
           a.centro_id AS area_centro_id,
           c.id AS centro_pk, c.codigo AS centro_codigo, c.nombre AS centro_nombre
    FROM usuarios u
    LEFT JOIN areas a ON u.area_id = a.id
    LEFT JOIN centros c ON COALESCE(a.centro_id, (
      SELECT c2.id FROM centros c2
      WHERE UPPER(TRIM(c2.codigo)) = UPPER(TRIM(COALESCE(u.centro,'')))
      LIMIT 1
    )) = c.id
    WHERE u.id = $1 AND u.activo = TRUE
  `, [id]).catch(async () => {
    // Compat si aún no existe alcance_datos
    const r = await query(`
      SELECT u.id, u.rol, u.cargo, u.area_id, u.codigo_centro_costo, u.centro,
             NULL::varchar AS alcance_datos, u.activo,
             a.id AS area_pk, a.codigo AS area_codigo, a.nombre AS area_nombre,
             a.centro_id AS area_centro_id,
             c.id AS centro_pk, c.codigo AS centro_codigo, c.nombre AS centro_nombre
      FROM usuarios u
      LEFT JOIN areas a ON u.area_id = a.id
      LEFT JOIN centros c ON a.centro_id = c.id
      WHERE u.id = $1 AND u.activo = TRUE
    `, [id]);
    return r;
  });
  return rows[0] || null;
}

async function loadAsignacionesVigentes(usuarioId) {
  await ensureAlcanceTables();
  const today = new Date().toISOString().slice(0, 10);
  const { rows } = await query(`
    SELECT tipo, centro_id, area_id, codigo_centro_costo
    FROM usuarios_alcance_asignaciones
    WHERE usuario_id = $1
      AND vigente = TRUE
      AND eliminado_at IS NULL
      AND (vigente_desde IS NULL OR vigente_desde <= $2::date)
      AND (vigente_hasta IS NULL OR vigente_hasta >= $2::date)
  `, [usuarioId, today]).catch(() => ({ rows: [] }));
  return rows;
}

async function resolveCentroIdsByCodigo(codigo) {
  const code = String(codigo || '').trim().toUpperCase();
  if (!code) return [];
  const { rows } = await query(`
    SELECT id FROM centros
    WHERE UPPER(TRIM(codigo)) = $1
       OR UPPER(TRIM(nombre)) = $1
  `, [code]);
  return rows.map((r) => r.id);
}

async function resolveAreasByCentroIds(centroIds) {
  const ids = uniqNums(centroIds);
  if (!ids.length) return { areaIds: [], ccCodigos: [], areaNombres: [] };
  const { rows } = await query(`
    SELECT id, codigo, nombre FROM areas
    WHERE centro_id = ANY($1::int[])
  `, [ids]);
  return {
    areaIds: rows.map((r) => r.id),
    ccCodigos: rows.map((r) => r.codigo).filter(Boolean),
    areaNombres: rows.map((r) => r.nombre).filter(Boolean),
  };
}

/**
 * @param {{ userId: number|string, moduleCode?: string, actionCode?: string }} opts
 */
export async function resolveUserDataScope(opts = {}) {
  await ensureAlcanceTables();
  const user = await loadUsuarioOrg(opts.userId);
  if (!user) {
    return {
      scopeType: SCOPE_TYPES.CENTRO_COSTO,
      centroIds: [],
      centroCodigos: [],
      centroCostoIds: [],
      centroCostoCodigos: [],
      areaIds: [],
      areaNombres: [],
      isInstitutional: false,
      skipOrgFilter: false,
      userId: null,
    };
  }

  const explicit = String(user.alcance_datos || '').trim().toUpperCase();

  // 1) Admin / institucional explícito
  if (isAdminRol(user.rol) || explicit === SCOPE_TYPES.INSTITUCIONAL) {
    return {
      scopeType: SCOPE_TYPES.INSTITUCIONAL,
      centroIds: [],
      centroCodigos: [],
      centroCostoIds: [],
      centroCostoCodigos: [],
      areaIds: [],
      areaNombres: [],
      isInstitutional: true,
      skipOrgFilter: true,
      userId: user.id,
      cargo: user.cargo,
      rol: user.rol,
    };
  }

  // 2–3) Roles transversales (Contrataciones / Almacén)
  if (isRolTransversalFlujo(user)) {
    return {
      scopeType: SCOPE_TYPES.TRANSVERSAL_FLUJO,
      centroIds: [],
      centroCodigos: [],
      centroCostoIds: [],
      centroCostoCodigos: [],
      areaIds: [],
      areaNombres: [],
      isInstitutional: false,
      skipOrgFilter: true,
      userId: user.id,
      cargo: user.cargo,
      rol: user.rol,
    };
  }

  // 6) PERSONALIZADO
  if (explicit === SCOPE_TYPES.PERSONALIZADO) {
    const asigs = await loadAsignacionesVigentes(user.id);
    const centroIds = uniqNums(asigs.filter((a) => a.tipo === 'CENTRO').map((a) => a.centro_id));
    const areaIds = uniqNums(asigs.filter((a) => a.tipo === 'CENTRO_COSTO').map((a) => a.area_id));
    const ccCodigos = uniqStr(asigs.filter((a) => a.tipo === 'CENTRO_COSTO').map((a) => a.codigo_centro_costo));
    const fromCentros = await resolveAreasByCentroIds(centroIds);
    return {
      scopeType: SCOPE_TYPES.PERSONALIZADO,
      centroIds,
      centroCodigos: [],
      centroCostoIds: uniqNums([...areaIds, ...fromCentros.areaIds]),
      centroCostoCodigos: uniqStr([...ccCodigos, ...fromCentros.ccCodigos]),
      areaIds: uniqNums([...areaIds, ...fromCentros.areaIds]),
      areaNombres: fromCentros.areaNombres,
      isInstitutional: false,
      skipOrgFilter: false,
      userId: user.id,
      cargo: user.cargo,
      rol: user.rol,
    };
  }

  // Resolver centro del usuario
  let centroIds = uniqNums([user.centro_pk, user.area_centro_id]);
  if (!centroIds.length && user.centro) {
    centroIds = await resolveCentroIdsByCodigo(user.centro);
  }
  const centroCodigos = uniqStr([user.centro_codigo, user.centro]);

  // 4) Director / Coordinador administrativo de centro → CENTRO
  const forceCentro = explicit === SCOPE_TYPES.CENTRO || isDirectorOCoordinadorCentro(user.cargo);
  if (forceCentro) {
    const areas = await resolveAreasByCentroIds(centroIds);
    return {
      scopeType: SCOPE_TYPES.CENTRO,
      centroIds,
      centroCodigos,
      centroCostoIds: areas.areaIds,
      centroCostoCodigos: uniqStr(areas.ccCodigos),
      areaIds: areas.areaIds,
      areaNombres: areas.areaNombres,
      isInstitutional: false,
      skipOrgFilter: false,
      userId: user.id,
      cargo: user.cargo,
      rol: user.rol,
    };
  }

  // 5) Operativo / CENTRO_COSTO (default AU)
  const areaIds = uniqNums([user.area_id, user.area_pk]);
  const ccCodigos = uniqStr([user.codigo_centro_costo, user.area_codigo]);
  const areaNombreRaw = user.area_nombre ? [user.area_nombre] : [];

  // Asignaciones adicionales vigentes (multi-CC)
  const asigs = await loadAsignacionesVigentes(user.id);
  for (const a of asigs) {
    if (a.tipo === 'CENTRO_COSTO') {
      if (a.area_id) areaIds.push(a.area_id);
      if (a.codigo_centro_costo) ccCodigos.push(String(a.codigo_centro_costo).toUpperCase());
    }
    if (a.tipo === 'CENTRO' && a.centro_id) {
      const extra = await resolveAreasByCentroIds([a.centro_id]);
      areaIds.push(...extra.areaIds);
      ccCodigos.push(...extra.ccCodigos);
      areaNombreRaw.push(...extra.areaNombres);
    }
  }

  return {
    scopeType: SCOPE_TYPES.CENTRO_COSTO,
    centroIds: uniqNums(centroIds),
    centroCodigos,
    centroCostoIds: uniqNums(areaIds),
    centroCostoCodigos: uniqStr(ccCodigos),
    areaIds: uniqNums(areaIds),
    areaNombres: [...new Set(areaNombreRaw.filter(Boolean))],
    isInstitutional: false,
    skipOrgFilter: false,
    userId: user.id,
    cargo: user.cargo,
    rol: user.rol,
  };
}

/**
 * Construye fragmento SQL AND ... para filtrar requerimientos.
 * Alias esperados: r (requerimientos), a (areas), c (centros) — igual que BASE_FROM.
 *
 * @returns {{ clause: string, params: any[], scope: object }}
 */
export function buildRequerimientoScopeSql(scope, paramStartIndex = 1) {
  if (!scope || scope.skipOrgFilter || scope.isInstitutional
    || scope.scopeType === SCOPE_TYPES.INSTITUCIONAL
    || scope.scopeType === SCOPE_TYPES.TRANSVERSAL_FLUJO) {
    return { clause: '', params: [], scope };
  }

  const params = [];
  const parts = [];
  let i = paramStartIndex;

  if (scope.scopeType === SCOPE_TYPES.CENTRO) {
    if (scope.centroIds?.length) {
      params.push(scope.centroIds);
      parts.push(`c.id = ANY($${i}::int[])`);
      i += 1;
    }
    if (scope.centroCodigos?.length) {
      params.push(scope.centroCodigos);
      parts.push(`UPPER(TRIM(COALESCE(c.codigo,''))) = ANY($${i}::text[])`);
      i += 1;
    }
    if (!parts.length) {
      // Sin centro asignado: no ver nada (seguro por defecto)
      return { clause: ' AND 1=0', params: [], scope };
    }
    return { clause: ` AND (${parts.join(' OR ')})`, params, scope };
  }

  // CENTRO_COSTO | PERSONALIZADO
  if (scope.areaIds?.length) {
    params.push(scope.areaIds);
    parts.push(`a.id = ANY($${i}::int[])`);
    i += 1;
  }
  if (scope.centroCostoCodigos?.length) {
    params.push(scope.centroCostoCodigos);
    parts.push(`UPPER(TRIM(COALESCE(a.codigo,''))) = ANY($${i}::text[])`);
    i += 1;
  }
  if (scope.areaNombres?.length) {
    params.push(scope.areaNombres.map((n) => String(n).trim().toUpperCase()));
    parts.push(`UPPER(TRIM(COALESCE(r.area,''))) = ANY($${i}::text[])`);
    i += 1;
  }

  if (!parts.length) {
    return { clause: ' AND 1=0', params: [], scope };
  }
  return { clause: ` AND (${parts.join(' OR ')})`, params, scope };
}

/**
 * Valida acceso a un requerimiento por id.
 */
export async function canAccessRequirement(userId, requerimientoId, action = 'VER') {
  const scope = await resolveUserDataScope({ userId, actionCode: action });
  if (scope.skipOrgFilter || scope.isInstitutional) {
    return { ok: true, scope };
  }

  const id = parseInt(requerimientoId, 10);
  const { clause, params } = buildRequerimientoScopeSql(scope, 2);
  const sql = `
    SELECT r.id
    FROM requerimientos r
    LEFT JOIN areas a ON r.area = a.nombre OR UPPER(TRIM(a.codigo)) = UPPER(TRIM(r.area))
    LEFT JOIN centros c ON a.centro_id = c.id
    WHERE r.id = $1
    ${clause}
    LIMIT 1
  `;
  const { rows } = await query(sql, [id, ...params]);
  if (!rows.length) {
    return {
      ok: false,
      scope,
      error: httpError(
        'No tiene autorización para acceder a este requerimiento.',
        403,
        'REQUERIMIENTO_FUERA_DE_ALCANCE',
      ),
    };
  }
  return { ok: true, scope };
}

export async function assertCanAccessRequirement(userId, requerimientoId, action = 'VER') {
  const result = await canAccessRequirement(userId, requerimientoId, action);
  if (!result.ok) throw result.error;
  return result.scope;
}

/**
 * RC8.2E — Autorización por asignación contractual en Invitaciones.
 *
 * Verifica si un usuario es creador (created_by = username) o responsable
 * (texto normalizado) de al menos una solicitud de cotización vinculada
 * al requerimiento. No otorga acceso global; es una vía adicional a la
 * autorización por alcance organizacional.
 *
 * @returns {{ ok: boolean, motivo?: string, solicitud_id?: number, codigo_solicitud?: string }}
 */
export async function canAccessRequirementByContractAssignment(userId, requerimientoId) {
  const uid = parseInt(userId, 10);
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(uid) || !Number.isFinite(rid)) {
    return { ok: false, motivo: 'Parámetros inválidos' };
  }

  // Cargar usuario: username + nombre completo normalizado
  const { rows: uRows } = await query(
    `SELECT id, username,
            TRIM(LOWER(COALESCE(apellidos || ' ' || nombres, nombre, ''))) AS nombre_normalizado,
            TRIM(LOWER(COALESCE(nombre, ''))) AS nombre_solo
     FROM usuarios WHERE id = $1 AND activo = TRUE`,
    [uid],
  );
  if (!uRows.length) return { ok: false, motivo: 'Usuario no encontrado o inactivo' };

  const user = uRows[0];
  const username = String(user.username || '').trim().toLowerCase();

  // Buscar solicitudes vinculadas al requerimiento
  const { rows: scRows } = await query(
    `SELECT sc.id, sc.codigo,
            TRIM(LOWER(COALESCE(sc.created_by, ''))) AS created_by_lc,
            TRIM(LOWER(COALESCE(sc.responsable, ''))) AS responsable_lc
     FROM solicitud_requerimientos sr
     JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
     WHERE sr.requerimiento_id = $1`,
    [rid],
  );

  for (const sc of scRows) {
    // Regla A: created_by = username (vínculo fuerte, exacto)
    if (sc.created_by_lc === username) {
      return {
        ok: true,
        motivo: 'Creador de la solicitud',
        solicitud_id: sc.id,
        codigo_solicitud: sc.codigo,
      };
    }

    // Regla B: responsable textual normalizado coincide con nombre del usuario
    if (sc.responsable_lc) {
      const resp = sc.responsable_lc;
      const uNorm = user.nombre_normalizado;
      const uSimple = user.nombre_solo;

      // Coincidencia exacta normalizada (nombre completo)
      if (uNorm && resp === uNorm) {
        return {
          ok: true,
          motivo: 'Responsable de la solicitud',
          solicitud_id: sc.id,
          codigo_solicitud: sc.codigo,
        };
      }

      // Coincidencia exacta solo con nombre (ej. "juan ulises")
      if (uSimple && resp === uSimple) {
        return {
          ok: true,
          motivo: 'Responsable de la solicitud',
          solicitud_id: sc.id,
          codigo_solicitud: sc.codigo,
        };
      }

    }
  }

  return { ok: false, motivo: 'Sin asignación contractual activa al requerimiento' };
}

/**
 * Valida que un área (código/nombre) esté dentro del alcance para crear.
 */
export async function assertAreaWithinScope(userId, areaRef = {}) {
  const scope = await resolveUserDataScope({ userId, actionCode: 'CREAR' });
  if (scope.skipOrgFilter || scope.isInstitutional) return scope;

  const codigo = String(areaRef.codigo || areaRef.codigo_centro_costo || '').trim();
  const nombre = String(areaRef.nombre || areaRef.area || '').trim();
  if (!codigo && !nombre) {
    throw httpError('Debe indicar el área / centro de costo autorizado.', 400, 'AREA_REQUERIDA');
  }

  const { rows } = await query(`
    SELECT a.id, a.codigo, a.nombre, a.centro_id, c.codigo AS centro_codigo
    FROM areas a
    LEFT JOIN centros c ON a.centro_id = c.id
    WHERE ($1 <> '' AND UPPER(TRIM(a.codigo)) = UPPER(TRIM($1)))
       OR ($2 <> '' AND UPPER(TRIM(a.nombre)) = UPPER(TRIM($2)))
    LIMIT 1
  `, [codigo, nombre]);

  if (!rows.length) {
    // Fallback histórico: solo nombre en requerimiento sin fila areas
    if (nombre && scope.areaNombres.some((n) => n.toUpperCase() === nombre.toUpperCase())) {
      return scope;
    }
    throw httpError('El área indicada está fuera de su alcance organizacional.', 403, 'REQUERIMIENTO_FUERA_DE_ALCANCE');
  }

  const area = rows[0];
  const okCentro = scope.scopeType === SCOPE_TYPES.CENTRO
    && (scope.centroIds.includes(area.centro_id)
      || scope.centroCodigos.includes(String(area.centro_codigo || '').toUpperCase()));
  const okCc = scope.areaIds.includes(area.id)
    || scope.centroCostoCodigos.includes(String(area.codigo || '').toUpperCase())
    || scope.areaNombres.some((n) => n.toUpperCase() === String(area.nombre || '').toUpperCase());

  if (!(okCentro || okCc)) {
    throw httpError('El área indicada está fuera de su alcance organizacional.', 403, 'REQUERIMIENTO_FUERA_DE_ALCANCE');
  }
  return scope;
}

export { httpError as scopeHttpError };

/**
 * RC8.2H — Guard central para autorizar acceso a requerimiento en contexto
 * de Contrataciones (Invitaciones, Solicitudes de Cotización).
 *
 * Orden obligatorio:
 *   1) Asignación contractual real (created_by exacto / responsable exacto normalizado)
 *   2) Alcance organizacional existente (centro / CC)
 *   3) Denegar 403
 *
 * Solo usa req.user.id. No confía en x-user-id ni x-user-rol.
 *
 * @param {number} userId - req.user.id
 * @param {number} requerimientoId
 * @param {string} [action='VER']
 * @returns {Promise<object>} scope si autorizado; lanza error 403 si no.
 */
export async function assertCanAccessRequirementForContracting(userId, requerimientoId, action = 'VER') {
  // 1) Asignación contractual real (RC8.2E)
  const contract = await canAccessRequirementByContractAssignment(userId, requerimientoId);
  if (contract.ok) {
    // Autorizado por asignación contractual. Devolver scope TRANSVERSAL_FLUJO
    // para que no se filtre por centro.
    return {
      scopeType: SCOPE_TYPES.TRANSVERSAL_FLUJO,
      centroIds: [],
      centroCodigos: [],
      centroCostoIds: [],
      centroCostoCodigos: [],
      areaIds: [],
      areaNombres: [],
      isInstitutional: false,
      skipOrgFilter: true,
      userId,
      motivo: contract.motivo,
    };
  }

  // 2) Asignación dinámica por expediente (RC8.3D)
  // Permite que un Coordinador CM asigne explícitamente un expediente a un analista.
  const { isAssignedExpediente } = await import('./expedienteAsignaciones.js');
  const assigned = await isAssignedExpediente(userId, 'REQUERIMIENTO', requerimientoId);
  if (assigned) {
    return {
      scopeType: SCOPE_TYPES.TRANSVERSAL_FLUJO,
      centroIds: [],
      centroCodigos: [],
      centroCostoIds: [],
      centroCostoCodigos: [],
      areaIds: [],
      areaNombres: [],
      isInstitutional: false,
      skipOrgFilter: true,
      userId,
      motivo: 'Asignado al expediente (RC8.3D)',
    };
  }

  // 3) Fallback a alcance organizacional existente
  return assertCanAccessRequirement(userId, requerimientoId, action);
}
