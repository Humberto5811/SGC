/**
 * RC8.15.6G-8D3 — Helper central de áreas autorizadas por usuario.
 */
import { query, getClient } from '../db.js';
import {
  ensureAlcanceTables,
  resolveUserDataScope,
  SCOPE_TYPES,
} from './userDataScope.js';
import {
  ROLES_GENERALES,
  rolGeneralFromUsuario,
  rolGeneralToLegacyRol,
  normalizeRolGeneral,
} from '../utils/userRoleCatalog.js';

function uniqNums(arr) {
  return [...new Set((arr || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
}

function normCentroKey(valor) {
  return String(valor || '').trim().toUpperCase();
}

/**
 * Sincroniza catálogo `centros` desde `areas` (fuente canónica SGC: areas.responsable / centro_id).
 * Idempotente: no duplica códigos existentes.
 */
export async function ensureCentrosCatalogoFromAreas(client = null) {
  const q = client ? client.query.bind(client) : query;

  await q(`
    INSERT INTO centros (codigo, nombre, estado)
    SELECT DISTINCT UPPER(TRIM(a.responsable)), UPPER(TRIM(a.responsable)), 'Activo'
    FROM areas a
    WHERE a.responsable IS NOT NULL AND TRIM(a.responsable) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM centros c
        WHERE UPPER(TRIM(COALESCE(c.codigo, ''))) = UPPER(TRIM(a.responsable))
           OR UPPER(TRIM(COALESCE(c.nombre, ''))) = UPPER(TRIM(a.responsable))
      )
  `).catch(() => {});

  await q(`
    UPDATE areas a
    SET centro_id = c.id
    FROM centros c
    WHERE a.centro_id IS NULL
      AND a.responsable IS NOT NULL AND TRIM(a.responsable) <> ''
      AND (
        UPPER(TRIM(COALESCE(c.codigo, ''))) = UPPER(TRIM(a.responsable))
        OR UPPER(TRIM(COALESCE(c.nombre, ''))) = UPPER(TRIM(a.responsable))
      )
  `).catch(() => {});
}

export async function resolverCentroIdPorCodigo(codigoCentro) {
  const key = normCentroKey(codigoCentro);
  if (!key) return null;
  await ensureCentrosCatalogoFromAreas();
  const { rows } = await query(`
    SELECT id FROM centros
    WHERE UPPER(TRIM(COALESCE(codigo, ''))) = $1
       OR UPPER(TRIM(COALESCE(nombre, ''))) = $1
    ORDER BY id ASC
    LIMIT 1
  `, [key]);
  return rows[0]?.id || null;
}

/**
 * Lista áreas autorizadas para el contexto del usuario (Registro, filtros, etc.).
 *
 * @param {{ userId?: number|string, id?: number|string, scope?: object }} userCtx
 * @param {{ q?: string, limit?: number, centroId?: number|null }} [opts]
 */
export async function listarAreasAutorizadasUsuario(userCtx = {}, opts = {}) {
  const userId = userCtx?.userId ?? userCtx?.id;
  if (!userId) return { data: [], scopeType: SCOPE_TYPES.CENTRO_COSTO };

  const scope = userCtx?.scopeType ? userCtx : await resolveUserDataScope({ userId });
  const q = String(opts.q || '').trim();
  const limit = Math.min(200, Math.max(1, parseInt(opts.limit || '50', 10)));
  const centroIdFilter = opts.centroId != null ? parseInt(opts.centroId, 10) : null;

  const params = [];
  let where = 'WHERE 1=1';

  if (!scope.skipOrgFilter && !scope.isInstitutional) {
    if (scope.scopeType === SCOPE_TYPES.CENTRO) {
      if (scope.centroIds?.length) {
        params.push(scope.centroIds);
        where += ` AND a.centro_id = ANY($${params.length}::int[])`;
      } else {
        return { data: [], scopeType: scope.scopeType };
      }
    } else {
      const parts = [];
      if (scope.areaIds?.length) {
        params.push(scope.areaIds);
        parts.push(`a.id = ANY($${params.length}::int[])`);
      }
      if (scope.centroCostoCodigos?.length) {
        params.push(scope.centroCostoCodigos);
        parts.push(`UPPER(TRIM(a.codigo)) = ANY($${params.length}::text[])`);
      }
      if (!parts.length) return { data: [], scopeType: scope.scopeType };
      where += ` AND (${parts.join(' OR ')})`;
    }
  }

  if (Number.isFinite(centroIdFilter) && centroIdFilter > 0) {
    params.push(centroIdFilter);
    where += ` AND a.centro_id = $${params.length}`;
  }

  if (q.length >= 2) {
    params.push(`%${q}%`);
    const i = params.length;
    where += ` AND (a.codigo ILIKE $${i} OR a.nombre ILIKE $${i} OR a.responsable ILIKE $${i} OR c.codigo ILIKE $${i})`;
  }

  params.push(limit);
  const { rows } = await query(`
    SELECT a.id, a.codigo, a.nombre, a.responsable,
           c.id AS centro_id, COALESCE(c.codigo, '') AS centro,
           COALESCE(c.nombre, '') AS centro_nombre,
           COALESCE(a.codigo, '') AS codigo_centro_costo
    FROM areas a
    LEFT JOIN centros c ON a.centro_id = c.id
    ${where}
    ORDER BY a.nombre ASC
    LIMIT $${params.length}
  `, params);

  return { data: rows, scopeType: scope.scopeType, scope };
}

export async function listarCentrosCatalogo() {
  await ensureCentrosCatalogoFromAreas();
  const { rows } = await query(`
    SELECT id, codigo, nombre
    FROM centros
    WHERE COALESCE(estado, 'Activo') = 'Activo'
    ORDER BY codigo ASC NULLS LAST, nombre ASC NULLS LAST, id ASC
  `);
  return rows;
}

export async function listarAreasPorCentro(centroId) {
  const cid = parseInt(centroId, 10);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  await ensureCentrosCatalogoFromAreas();
  const { rows: cRows } = await query(
    'SELECT codigo, nombre FROM centros WHERE id = $1',
    [cid],
  );
  const centroCodigo = cRows[0]?.codigo || cRows[0]?.nombre || '';
  const { rows } = await query(`
    SELECT a.id, a.codigo, a.nombre, a.responsable,
           COALESCE(a.codigo, '') AS codigo_centro_costo
    FROM areas a
    WHERE (
      a.centro_id = $1
      OR ($2 <> '' AND UPPER(TRIM(COALESCE(a.responsable, ''))) = UPPER(TRIM($2)))
    )
      AND COALESCE(a.estado, 'Activo') = 'Activo'
    ORDER BY a.nombre ASC
  `, [cid, centroCodigo]);
  return rows;
}

export async function cargarAlcanceOrganizacionalUsuario(usuarioId) {
  await ensureAlcanceTables();
  const uid = parseInt(usuarioId, 10);
  if (!Number.isFinite(uid)) return null;

  const { rows: uRows } = await query(`
    SELECT u.id, u.rol, u.cargo, u.centro, u.area_id, u.alcance_datos,
           a.centro_id AS area_centro_id
    FROM usuarios u
    LEFT JOIN areas a ON u.area_id = a.id
    WHERE u.id = $1
  `, [uid]);
  if (!uRows.length) return null;
  const user = uRows[0];

  const { rows: asigs } = await query(`
    SELECT id, tipo, centro_id, area_id, codigo_centro_costo
    FROM usuarios_alcance_asignaciones
    WHERE usuario_id = $1 AND vigente = TRUE AND eliminado_at IS NULL
    ORDER BY id ASC
  `, [uid]).catch(() => ({ rows: [] }));

  const centroIds = uniqNums(asigs.filter((a) => a.tipo === 'CENTRO').map((a) => a.centro_id));
  const areaIds = uniqNums(asigs.filter((a) => a.tipo === 'CENTRO_COSTO').map((a) => a.area_id));
  let centroPrincipalId = centroIds[0] || user.area_centro_id || null;

  if (!centroPrincipalId && user.centro) {
    centroPrincipalId = await resolverCentroIdPorCodigo(user.centro);
  }

  return {
    rol_general: rolGeneralFromUsuario(user),
    alcance_datos: user.alcance_datos || null,
    centro_principal_id: centroPrincipalId,
    seleccionar_todos: asigs.some((a) => a.tipo === 'CENTRO'),
    area_ids: areaIds,
    asignaciones: asigs,
  };
}

/**
 * Persiste alcance multiárea explícito (tabla usuarios_alcance_asignaciones).
 */
export async function guardarAlcanceOrganizacionalUsuario(usuarioId, payload = {}, actor = 'Sistema') {
  await ensureAlcanceTables();
  const uid = parseInt(usuarioId, 10);
  if (!Number.isFinite(uid)) throw new Error('usuarioId inválido');

  const rolGeneral = normalizeRolGeneral(payload.rol_general || payload.rolGeneral);
  let centroId = parseInt(payload.centro_principal_id ?? payload.centroId, 10);
  const selectAll = payload.seleccionar_todos === true || payload.selectAll === true;
  const areaIds = uniqNums(payload.area_ids || payload.areaIds || []);

  if (rolGeneral !== ROLES_GENERALES.ADMINISTRADOR) {
    if (!Number.isFinite(centroId) || centroId <= 0) {
      const codigoLegacy = payload.centro_codigo || payload.centro || null;
      centroId = await resolverCentroIdPorCodigo(codigoLegacy);
    }
    if ((!Number.isFinite(centroId) || centroId <= 0) && !selectAll && areaIds.length) {
      const err = new Error('Primero seleccione el centro');
      err.status = 400;
      throw err;
    }
  }

  let alcanceDatos = null;
  if (rolGeneral === ROLES_GENERALES.ADMINISTRADOR) {
    alcanceDatos = SCOPE_TYPES.INSTITUCIONAL;
  } else if (selectAll && Number.isFinite(centroId)) {
    alcanceDatos = SCOPE_TYPES.CENTRO;
  } else if (areaIds.length) {
    alcanceDatos = SCOPE_TYPES.PERSONALIZADO;
  }

  const legacyRol = rolGeneralToLegacyRol(rolGeneral);
  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(`
      UPDATE usuarios_alcance_asignaciones
      SET vigente = FALSE, eliminado_at = NOW()
      WHERE usuario_id = $1 AND vigente = TRUE AND eliminado_at IS NULL
    `, [uid]);

    if (rolGeneral !== ROLES_GENERALES.ADMINISTRADOR) {
      if (selectAll && Number.isFinite(centroId)) {
        await client.query(`
          INSERT INTO usuarios_alcance_asignaciones
            (usuario_id, tipo, centro_id, created_by, observacion)
          VALUES ($1, 'CENTRO', $2, $3, 'RC8.15.6G-8D3 seleccionar todos')
        `, [uid, centroId, actor]);
      } else {
        for (const areaId of areaIds) {
          const { rows: aRows } = await client.query(
            'SELECT id, codigo FROM areas WHERE id = $1',
            [areaId],
          );
          if (!aRows.length) continue;
          await client.query(`
            INSERT INTO usuarios_alcance_asignaciones
              (usuario_id, tipo, area_id, codigo_centro_costo, created_by, observacion)
            VALUES ($1, 'CENTRO_COSTO', $2, $3, $4, 'RC8.15.6G-8D3 area autorizada')
          `, [uid, areaId, aRows[0].codigo || null, actor]);
        }
      }
    }

    let centroCodigo = null;
    if (Number.isFinite(centroId)) {
      const { rows: cRows } = await client.query('SELECT codigo FROM centros WHERE id = $1', [centroId]);
      centroCodigo = cRows[0]?.codigo || null;
    }

    await client.query(`
      UPDATE usuarios SET
        rol = $2,
        alcance_datos = $3,
        centro = COALESCE($4, centro),
        updated_at = NOW()
      WHERE id = $1
    `, [uid, legacyRol, alcanceDatos, centroCodigo]);

    await client.query('COMMIT');
    return cargarAlcanceOrganizacionalUsuario(uid);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export default {
  listarAreasAutorizadasUsuario,
  ensureCentrosCatalogoFromAreas,
  resolverCentroIdPorCodigo,
  listarCentrosCatalogo,
  listarAreasPorCentro,
  cargarAlcanceOrganizacionalUsuario,
  guardarAlcanceOrganizacionalUsuario,
};
