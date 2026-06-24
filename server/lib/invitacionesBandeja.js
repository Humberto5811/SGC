// Bandeja maestra Invitaciones — trazabilidad completa (no ocultar expedientes derivados)
import { query } from '../db.js';
import {
  enrichRequerimientoRow,
  TRAZA_EXTRA_SELECT,
  buildListFilters,
} from './trazabilidad.js';
import {
  REQUERIMIENTO_BANDEJA_FROM,
  REQUERIMIENTO_BANDEJA_EXTRA_SELECT,
} from './bandejaRequerimientoSql.js';

export const SUBMODULO_INVITACIONES = 'Invitaciones';

export const WHERE_BANDEJA_INVITACIONES = `
  (
    r.estado_actual = 'INVITACIONES'
    OR r.estado IN ('En Invitaciones')
    OR (
      r.estado_actual IN ('INVITACIONES', 'RECEPCION_COTIZACIONES', 'VALIDACION_USUARIO', 'CUADRO_COMPARATIVO', 'CCP', 'EJECUCION')
      AND (
        jsonb_array_length(COALESCE((COALESCE(r.payload, '{}')::jsonb -> 'historial_invitaciones'), '[]'::jsonb)) > 0
        OR EXISTS (SELECT 1 FROM invitacion_proveedores ip WHERE ip.requerimiento_id = r.id)
      )
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(r.historial_movimientos, '[]'::jsonb)) m
      WHERE UPPER(COALESCE(m->>'etapa', '')) = 'INVITACIONES'
    )
    OR EXISTS (SELECT 1 FROM solicitud_requerimientos sr WHERE sr.requerimiento_id = r.id)
  )
`;

const INVITACIONES_EXTRA_SELECT = `
  COALESCE(sc_stats.num_solicitudes, 0)::int AS num_solicitudes_cotizacion,
  COALESCE(sc_stats.num_solicitudes, 0) > 0 AS tiene_solicitud_cotizacion,
  COALESCE(sc.solicitud_id, 0) AS solicitud_id,
  COALESCE(sc.codigo_solicitud, '') AS codigo_solicitud,
  COALESCE(sc.solicitud_estado, '') AS solicitud_estado
`;

const INVITACIONES_EXTRA_JOINS = `
  LEFT JOIN LATERAL (
    SELECT COUNT(DISTINCT sr.solicitud_id)::int AS num_solicitudes
    FROM solicitud_requerimientos sr
    WHERE sr.requerimiento_id = r.id
  ) sc_stats ON TRUE
  LEFT JOIN LATERAL (
    SELECT sc.id AS solicitud_id, sc.codigo AS codigo_solicitud, sc.estado AS solicitud_estado
    FROM solicitud_requerimientos sr
    JOIN solicitudes_cotizacion sc ON sc.id = sr.solicitud_id
    WHERE sr.requerimiento_id = r.id
    ORDER BY sc.id DESC
    LIMIT 1
  ) sc ON TRUE
`;

export async function listarBandejaInvitaciones(page, pageSize, queryParams = {}, options = {}) {
  const offset = (page - 1) * pageSize;
  const { whereExtra, params: filterParams } = buildListFilters(queryParams);
  const params = [...filterParams];

  let where = `WHERE ${WHERE_BANDEJA_INVITACIONES}`;
  if (whereExtra) where += ` AND ${whereExtra}`;

  if (options.soloAsignadosA) {
    params.push(`%${options.soloAsignadosA}%`);
    where += ` AND r.responsable_actual ILIKE $${params.length}`;
  }

  const fromClause = `${REQUERIMIENTO_BANDEJA_FROM} ${INVITACIONES_EXTRA_JOINS}`;

  const countRes = await query(`SELECT COUNT(*)::int AS total ${fromClause} ${where}`, params);
  const total = countRes.rows[0].total;

  params.push(pageSize, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const { rows } = await query(`
    SELECT
      r.id, r.tipo, r.codigo, r.cmn, r.denominacion, r.area, r.responsable, r.estado,
      r.payload, r.usuario_modificacion, r.created_at, r.updated_at,
      COALESCE(c.nombre, c.codigo, a.responsable, '') AS centro_nombre,
      ${REQUERIMIENTO_BANDEJA_EXTRA_SELECT},
      ${INVITACIONES_EXTRA_SELECT},
      ${TRAZA_EXTRA_SELECT}
    ${fromClause}
    ${where}
    ORDER BY r.fecha_estado_actual DESC NULLS LAST, r.codigo ASC NULLS LAST
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  return {
    data: rows.map((row) => enrichRequerimientoRow({
      ...row,
      tiene_invitacion: row.tiene_solicitud_cotizacion,
      cantidad_invitaciones: row.num_solicitudes_cotizacion,
      total_invitaciones: row.num_solicitudes_cotizacion,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
