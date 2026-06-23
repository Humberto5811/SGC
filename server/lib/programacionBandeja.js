// Bandeja maestra de Programación — trazabilidad de todos los expedientes que pasaron por Programación
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

const ESTADOS_BANDEJA_PROGRAMACION = `(
  'Aprobado DEC', 'Observado Programación', 'En Programación',
  'Aprobado Programación', 'Programado'
)`;

/** SQL: expedientes cuyo flujo incluye Programación (bandeja maestra de seguimiento). */
export const WHERE_BANDEJA_PROGRAMACION = `
  (
    r.estado IN ${ESTADOS_BANDEJA_PROGRAMACION}
    OR jsonb_array_length(COALESCE((COALESCE(r.payload, '{}')::jsonb -> 'historial_programacion'), '[]'::jsonb)) > 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(r.historial_estados, '[]'::jsonb)) h
      WHERE UPPER(COALESCE(h->>'etapa', h->>'estado', '')) = 'PROGRAMACION'
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(r.historial_movimientos, '[]'::jsonb)) m
      WHERE UPPER(COALESCE(m->>'etapa', '')) = 'PROGRAMACION'
    )
  )
`;

export async function listarBandejaProgramacion(page, pageSize, queryParams = {}) {
  const offset = (page - 1) * pageSize;
  const { whereExtra, params: filterParams } = buildListFilters(queryParams);
  const params = [...filterParams];

  let where = `WHERE ${WHERE_BANDEJA_PROGRAMACION}`;
  if (whereExtra) where += ` AND ${whereExtra}`;

  const countRes = await query(`SELECT COUNT(*)::int AS total ${REQUERIMIENTO_BANDEJA_FROM} ${where}`, params);
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
      ${TRAZA_EXTRA_SELECT}
    ${REQUERIMIENTO_BANDEJA_FROM}
    ${where}
    ORDER BY r.fecha_estado_actual DESC NULLS LAST, r.codigo ASC NULLS LAST
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  return {
    data: rows.map(enrichRequerimientoRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
