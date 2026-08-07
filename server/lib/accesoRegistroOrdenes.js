/**
 * RC8.9 — Autorización Registro de Órdenes: GLOBAL vs ASIGNACION.
 * Espejo de accesoCcp (sin hardcode de usernames).
 */
import { query } from '../db.js';
import {
  normalizePermisos,
  getActividadesForSubmodulo,
  resolveUserPermissions,
} from './permissionsCatalog.js';
import { isAdminSecurityRole } from '../utils/userRoleCatalog.js';

export const MODO_ACCESO_RO = Object.freeze({
  GLOBAL: 'GLOBAL',
  ASIGNACION: 'ASIGNACION',
  DENEGADO: 'DENEGADO',
});

const SUBMODULO_RO = 'REGISTRO_ORDENES_CONTRATACION';

const ACTIVIDADES_ASIGNACION = new Set([
  'VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'OBSERVAR', 'DESCARGAR', 'DERIVAR', 'FIRMAR',
]);

const ACTIVIDADES_SOLO_GLOBAL = new Set([
  'APROBAR', 'RECHAZAR', 'EXPORTAR', 'CONSOLIDAR',
]);

function httpError(message, status = 403, code = 'ORDEN_FORBIDDEN') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function normAct(actividad) {
  return String(actividad || 'VER').trim().toUpperCase() || 'VER';
}

function parsePermisos(raw, rol) {
  const userLike = { rol, permisos: raw };
  if (raw != null && typeof raw === 'object') {
    return resolveUserPermissions({ ...userLike, permisos: raw });
  }
  return normalizePermisos(raw, rol, { explicit: false });
}

function tieneRoActividad(permisos, actividad) {
  const acts = getActividadesForSubmodulo(permisos, SUBMODULO_RO);
  const act = normAct(actividad);
  if (acts.includes(act)) return true;
  if (act === 'VER' && (permisos.submodulos || []).includes(SUBMODULO_RO)) return true;
  return false;
}

/**
 * IDs consultables por asignación RO o responsable PERSONA vigente en RO.
 */
export async function listRequerimientoIdsAsignacionRo(usuarioId, client = null) {
  const uid = parseInt(usuarioId, 10);
  if (!Number.isFinite(uid) || uid <= 0) return [];
  const q = client?.query?.bind(client) || query;
  const { rows } = await q(`
    SELECT DISTINCT rid FROM (
      SELECT a.requerimiento_id AS rid
      FROM expediente_asignaciones a
      JOIN usuarios u ON u.id = a.usuario_id AND u.activo = TRUE
      WHERE a.usuario_id = $1
        AND a.activo = TRUE
        AND UPPER(BTRIM(a.etapa_codigo)) IN ('REGISTRO_ORDEN', 'REGISTRO_ORDENES', 'ORDEN')
      UNION
      SELECT v.requerimiento_id AS rid
      FROM expediente_estado_vigente v
      WHERE v.responsable_usuario_id = $1
        AND UPPER(COALESCE(v.responsable_tipo, '')) = 'PERSONA'
        AND UPPER(COALESCE(v.etapa_codigo, '')) IN ('REGISTRO_ORDEN', 'REGISTRO_ORDENES', 'ORDEN')
    ) t
    ORDER BY rid
  `, [uid]);
  return rows.map((r) => Number(r.rid)).filter((n) => Number.isFinite(n));
}

export async function tieneAsignacionActivaRoSobre(usuarioId, requerimientoId, client = null) {
  const uid = parseInt(usuarioId, 10);
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(uid) || !Number.isFinite(rid)) {
    return { ok: false, motivo: 'Parámetros inválidos' };
  }
  const ids = await listRequerimientoIdsAsignacionRo(uid, client);
  if (ids.includes(rid)) {
    return { ok: true, motivo: 'Asignación / responsable vigente RO' };
  }
  return { ok: false, motivo: 'Expediente fuera de su asignación de Registro de Órdenes' };
}

/**
 * Prioridad (igual CCP):
 * 1) admin → GLOBAL
 * 2) rol dec + RO → GLOBAL
 * 3) asignación / responsable RO → ASIGNACION (prioridad sobre JSON en no-DEC)
 * 4) permiso RO → GLOBAL
 * 5) DENEGADO
 */
export async function resolveAccesoRegistroOrdenes({
  usuarioId,
  requerimientoId = null,
  actividad = 'VER',
  client = null,
  userRow = null,
} = {}) {
  const act = normAct(actividad);
  const uid = parseInt(usuarioId, 10);
  if (!Number.isFinite(uid) || uid <= 0) {
    return {
      permitido: false,
      modo: MODO_ACCESO_RO.DENEGADO,
      alcanceRequerimientoIds: [],
      motivo: 'Usuario no autenticado',
      actividadesPermitidas: [],
    };
  }

  const q = client?.query?.bind(client) || query;
  let user = userRow;
  if (!user) {
    const { rows } = await q(
      `SELECT id, username, rol, activo, permisos FROM usuarios WHERE id = $1`,
      [uid],
    );
    user = rows[0] || null;
  }
  if (!user || user.activo === false) {
    return {
      permitido: false,
      modo: MODO_ACCESO_RO.DENEGADO,
      alcanceRequerimientoIds: [],
      motivo: 'Usuario inactivo o inexistente',
      actividadesPermitidas: [],
    };
  }

  const rol = String(user.rol || '').toLowerCase();
  const permisos = parsePermisos(user.permisos, user.rol);
  const hasRoVer = tieneRoActividad(permisos, 'VER');
  const hasRoAct = tieneRoActividad(permisos, act);

  const deny = (motivo) => ({
    permitido: false,
    modo: MODO_ACCESO_RO.DENEGADO,
    alcanceRequerimientoIds: [],
    motivo,
    actividadesPermitidas: [],
  });

  if (isAdminSecurityRole(user) || rol === 'admin') {
    return {
      permitido: true,
      modo: MODO_ACCESO_RO.GLOBAL,
      alcanceRequerimientoIds: null,
      motivo: 'Acceso global Registro de Órdenes (admin)',
      actividadesPermitidas: ['*'],
    };
  }

  if (rol === 'dec' && (hasRoAct || (act === 'VER' && hasRoVer))) {
    return {
      permitido: true,
      modo: MODO_ACCESO_RO.GLOBAL,
      alcanceRequerimientoIds: null,
      motivo: 'Acceso global Registro de Órdenes (rol DEC + permiso)',
      actividadesPermitidas: ['*'],
    };
  }

  const idsAsig = await listRequerimientoIdsAsignacionRo(uid, client);
  if (idsAsig.length && ACTIVIDADES_SOLO_GLOBAL.has(act)) {
    return deny(`La actividad ${act} requiere acceso global de Registro de Órdenes`);
  }
  if (idsAsig.length && (ACTIVIDADES_ASIGNACION.has(act) || act === 'VER')) {
    if (requerimientoId != null) {
      const check = await tieneAsignacionActivaRoSobre(uid, requerimientoId, client);
      if (check.ok) {
        return {
          permitido: true,
          modo: MODO_ACCESO_RO.ASIGNACION,
          alcanceRequerimientoIds: idsAsig,
          motivo: check.motivo,
          actividadesPermitidas: [...ACTIVIDADES_ASIGNACION],
        };
      }
      return deny(check.motivo || 'Expediente fuera de su asignación RO');
    }
    return {
      permitido: true,
      modo: MODO_ACCESO_RO.ASIGNACION,
      alcanceRequerimientoIds: idsAsig,
      motivo: 'Acceso por asignación / responsable vigente RO',
      actividadesPermitidas: [...ACTIVIDADES_ASIGNACION],
    };
  }

  if (hasRoAct || (act === 'VER' && hasRoVer)) {
    return {
      permitido: true,
      modo: MODO_ACCESO_RO.GLOBAL,
      alcanceRequerimientoIds: null,
      motivo: 'Acceso global Registro de Órdenes (permiso)',
      actividadesPermitidas: ['*'],
    };
  }

  return deny('No autorizado para Registro de Órdenes');
}

export async function assertAccesoRegistroOrdenes(opts = {}) {
  const acceso = await resolveAccesoRegistroOrdenes(opts);
  if (!acceso.permitido) {
    throw httpError(
      acceso.motivo || 'No autorizado para Registro de Órdenes',
      403,
      'ORDEN_FORBIDDEN',
    );
  }
  return acceso;
}

export async function resolveFlagAccesoRoMenu(usuarioId, userRow = null) {
  const acceso = await resolveAccesoRegistroOrdenes({
    usuarioId,
    actividad: 'VER',
    userRow,
  });
  return {
    acceso_registro_ordenes: acceso.permitido,
    acceso_registro_ordenes_modo: acceso.modo,
    acceso_registro_ordenes_por_asignacion: acceso.modo === MODO_ACCESO_RO.ASIGNACION,
  };
}

export { httpError as accesoRoHttpError, ACTIVIDADES_ASIGNACION, ACTIVIDADES_SOLO_GLOBAL, SUBMODULO_RO };
