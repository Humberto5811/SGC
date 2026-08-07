/**
 * RC8.6E — Autorización CCP: acceso global vs acceso por asignación activa.
 * No hardcodea usernames. No modifica estado/responsable/workflow.
 */
import { query } from '../db.js';
import {
  normalizePermisos,
  getActividadesForSubmodulo,
  resolveUserPermissions,
} from './permissionsCatalog.js';
import { isAdminSecurityRole } from '../utils/userRoleCatalog.js';

export const MODO_ACCESO_CCP = Object.freeze({
  GLOBAL: 'GLOBAL',
  ASIGNACION: 'ASIGNACION',
  DENEGADO: 'DENEGADO',
});

/** Actividades que el modo ASIGNACION puede ejercer sobre SUS expedientes. */
const ACTIVIDADES_ASIGNACION = new Set([
  'VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'OBSERVAR', 'DESCARGAR', 'DERIVAR',
]);

/**
 * Actividades solo GLOBAL (masivas / administración).
 * DERIVAR individual NO está aquí: el asignado puede derivar SU expediente a Órdenes.
 * CONSOLIDAR permanece exclusivo de GLOBAL.
 */
const ACTIVIDADES_SOLO_GLOBAL = new Set([
  'CONSOLIDAR', 'APROBAR', 'FIRMAR', 'RECHAZAR', 'EXPORTAR',
]);

function httpError(message, status = 403, code = 'CCP_FORBIDDEN') {
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

function tieneCcpActividad(permisos, actividad) {
  const acts = getActividadesForSubmodulo(permisos, 'CCP');
  const act = normAct(actividad);
  if (acts.includes(act)) return true;
  if (act === 'VER' && (permisos.submodulos || []).includes('CCP')) return true;
  return false;
}

/**
 * Lista IDs de requerimientos con asignación activa CCP para el usuario.
 */
export async function listRequerimientoIdsAsignacionCcp(usuarioId, client = null) {
  const uid = parseInt(usuarioId, 10);
  if (!Number.isFinite(uid) || uid <= 0) return [];
  const q = client?.query?.bind(client) || query;
  const { rows } = await q(`
    SELECT DISTINCT a.requerimiento_id
    FROM expediente_asignaciones a
    JOIN usuarios u ON u.id = a.usuario_id AND u.activo = TRUE
    WHERE a.usuario_id = $1
      AND a.activo = TRUE
      AND UPPER(BTRIM(a.etapa_codigo)) = 'CCP'
    ORDER BY a.requerimiento_id
  `, [uid]);
  return rows.map((r) => Number(r.requerimiento_id)).filter((n) => Number.isFinite(n));
}

export async function usuarioTieneAsignacionActivaCcp(usuarioId, client = null) {
  const ids = await listRequerimientoIdsAsignacionCcp(usuarioId, client);
  return ids.length > 0;
}

/**
 * Valida asignación activa CCP sobre un requerimiento concreto.
 */
export async function tieneAsignacionActivaCcpSobre(usuarioId, requerimientoId, client = null) {
  const uid = parseInt(usuarioId, 10);
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(uid) || !Number.isFinite(rid)) {
    return { ok: false, motivo: 'Parámetros inválidos' };
  }
  const q = client?.query?.bind(client) || query;

  const { rows: uRows } = await q(
    `SELECT id, activo FROM usuarios WHERE id = $1`,
    [uid],
  );
  if (!uRows.length || !uRows[0].activo) {
    return { ok: false, motivo: 'Usuario inactivo o inexistente' };
  }

  const { rows: asg } = await q(`
    SELECT a.id, a.etapa_codigo, a.usuario_id, a.activo
    FROM expediente_asignaciones a
    WHERE a.requerimiento_id = $1
      AND a.usuario_id = $2
      AND a.activo = TRUE
      AND UPPER(BTRIM(a.etapa_codigo)) = 'CCP'
    ORDER BY a.asignado_at DESC NULLS LAST, a.id DESC
    LIMIT 1
  `, [rid, uid]);
  if (!asg.length) {
    return { ok: false, motivo: 'Sin asignación activa CCP' };
  }

  const { rows: vig } = await q(`
    SELECT etapa_codigo, responsable_usuario_id, responsable_tipo
    FROM expediente_estado_vigente
    WHERE requerimiento_id = $1
  `, [rid]);
  if (vig.length) {
    const etapa = String(vig[0].etapa_codigo || '').toUpperCase();
    if (etapa && etapa !== 'CCP') {
      return { ok: false, motivo: 'Expediente no está en etapa CCP' };
    }
    const respUid = vig[0].responsable_usuario_id != null
      ? Number(vig[0].responsable_usuario_id)
      : null;
    if (respUid != null && respUid !== uid) {
      return { ok: false, motivo: 'Responsable vigente distinto del usuario' };
    }
  }

  return { ok: true, asignacionId: asg[0].id, motivo: 'Asignación activa CCP' };
}

/**
 * Helper canónico de acceso CCP.
 *
 * Prioridad:
 * 1) admin → GLOBAL
 * 2) rol dec + CCP+actividad → GLOBAL
 * 3) asignación activa CCP → ASIGNACION (si actividad permitida)
 * 4) permiso CCP+actividad → GLOBAL
 * 5) DENEGADO
 */
export async function resolveAccesoCcp({
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
      modo: MODO_ACCESO_CCP.DENEGADO,
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
      modo: MODO_ACCESO_CCP.DENEGADO,
      alcanceRequerimientoIds: [],
      motivo: 'Usuario inactivo o inexistente',
      actividadesPermitidas: [],
    };
  }

  const rol = String(user.rol || '').toLowerCase();
  const permisos = parsePermisos(user.permisos, user.rol);
  const hasCcpVer = tieneCcpActividad(permisos, 'VER');
  const hasCcpAct = (() => {
    if (act === 'CONSOLIDAR') {
      return tieneCcpActividad(permisos, 'DERIVAR')
        || tieneCcpActividad(permisos, 'APROBAR')
        || tieneCcpActividad(permisos, 'CREAR')
        || tieneCcpActividad(permisos, 'EDITAR');
    }
    return tieneCcpActividad(permisos, act);
  })();

  const deny = (motivo) => ({
    permitido: false,
    modo: MODO_ACCESO_CCP.DENEGADO,
    alcanceRequerimientoIds: [],
    motivo,
    actividadesPermitidas: [],
  });

  // 1) Admin → GLOBAL
  if (isAdminSecurityRole(user) || rol === 'admin') {
    return {
      permitido: true,
      modo: MODO_ACCESO_CCP.GLOBAL,
      alcanceRequerimientoIds: null,
      motivo: 'Acceso global CCP (admin)',
      actividadesPermitidas: ['*'],
    };
  }

  // 2) Rol DEC + permiso CCP → GLOBAL
  if (rol === 'dec' && (hasCcpAct || (act === 'VER' && hasCcpVer))) {
    return {
      permitido: true,
      modo: MODO_ACCESO_CCP.GLOBAL,
      alcanceRequerimientoIds: null,
      motivo: 'Acceso global CCP (rol DEC + permiso)',
      actividadesPermitidas: ['*'],
    };
  }

  // 3) Asignación activa CCP (prioridad sobre permiso JSON en roles no-DEC)
  const idsAsig = await listRequerimientoIdsAsignacionCcp(uid, client);
  // CONSOLIDAR nunca por asignación (aunque el JSON tenga DERIVAR/CREAR).
  if (act === 'CONSOLIDAR' && idsAsig.length) {
    return deny('La actividad CONSOLIDAR requiere acceso global CCP (no basta la asignación)');
  }
  if (idsAsig.length && !ACTIVIDADES_SOLO_GLOBAL.has(act)) {
    if (ACTIVIDADES_ASIGNACION.has(act) || act === 'VER') {
      if (requerimientoId != null) {
        const check = await tieneAsignacionActivaCcpSobre(uid, requerimientoId, client);
        if (check.ok) {
          return {
            permitido: true,
            modo: MODO_ACCESO_CCP.ASIGNACION,
            alcanceRequerimientoIds: idsAsig,
            motivo: check.motivo,
            actividadesPermitidas: [...ACTIVIDADES_ASIGNACION],
          };
        }
        return deny(check.motivo || 'Expediente fuera de su asignación CCP');
      }
      // DERIVAR sin requerimientoId: denegar (solo individual)
      if (act === 'DERIVAR') {
        return deny('Derivar requiere indicar el requerimiento asignado');
      }
      return {
        permitido: true,
        modo: MODO_ACCESO_CCP.ASIGNACION,
        alcanceRequerimientoIds: idsAsig,
        motivo: 'Acceso por asignación activa CCP',
        actividadesPermitidas: [...ACTIVIDADES_ASIGNACION],
      };
    }
  }

  // Actividades masivas: no se conceden solo por asignación.
  if (idsAsig.length && ACTIVIDADES_SOLO_GLOBAL.has(act)) {
    return deny(`La actividad ${act} requiere acceso global CCP (no basta la asignación)`);
  }

  // 4) Permiso CCP + actividad → GLOBAL (usuarios sin asignación activa CCP)
  if (hasCcpAct || (act === 'VER' && hasCcpVer)) {
    if (act === 'CONSOLIDAR' && !hasCcpAct) {
      return deny('Consolidar CCP requiere permiso de creación/derivación');
    }
    return {
      permitido: true,
      modo: MODO_ACCESO_CCP.GLOBAL,
      alcanceRequerimientoIds: null,
      motivo: 'Acceso global CCP (permiso)',
      actividadesPermitidas: ['*'],
    };
  }

  return deny('No autorizado para Certificación Presupuestal (CCP)');
}

export async function assertAccesoCcp(opts = {}) {
  const acceso = await resolveAccesoCcp(opts);
  if (!acceso.permitido) {
    throw httpError(
      acceso.motivo || 'No autorizado para Certificación Presupuestal (CCP)',
      403,
      'CCP_FORBIDDEN',
    );
  }
  return acceso;
}

export async function resolveFlagAccesoCcpMenu(usuarioId, userRow = null) {
  const acceso = await resolveAccesoCcp({
    usuarioId,
    actividad: 'VER',
    userRow,
  });
  return {
    acceso_ccp: acceso.permitido,
    acceso_ccp_modo: acceso.modo,
    acceso_ccp_por_asignacion: acceso.modo === MODO_ACCESO_CCP.ASIGNACION,
  };
}

export { httpError as accesoCcpHttpError, ACTIVIDADES_ASIGNACION, ACTIVIDADES_SOLO_GLOBAL };
