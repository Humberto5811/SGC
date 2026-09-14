// Bandeja maestra de Programación — trazabilidad de todos los expedientes que pasaron por Programación
import { query } from '../db.js';
import {
  enrichRequerimientoRow,
  enrichRequerimientoRowsWithCcp,
  TRAZA_EXTRA_SELECT,
  buildListFilters,
} from './trazabilidad.js';
import {
  REQUERIMIENTO_BANDEJA_FROM,
  REQUERIMIENTO_BANDEJA_EXTRA_SELECT,
} from './bandejaRequerimientoSql.js';

const ESTADOS_BANDEJA_PROGRAMACION = `(
  'Aprobado DEC', 'Observado DEC', 'Observado Programación', 'En Programación',
  'En tramite de aprobación', 'Aprobado Programación', 'Programado', 'En Invitaciones'
)`;

/** SQL: expedientes cuyo flujo incluye Programación (bandeja maestra de seguimiento). */
/**
 * RC8.17.8E — Primer ingreso histórico a Programación (sin N+1).
 * 1) workflow_eventos hacia PROGRAMACION con cambio de ubicación.
 * 2) MIN(asignado_at) en asignaciones PROGRAMACION.
 */
export const FECHA_INGRESO_PROGRAMACION_JOINS = `
  LEFT JOIN LATERAL (
    SELECT MIN(we.created_at) AS fecha_evento
    FROM workflow_eventos we
    WHERE we.expediente_id = r.id
      AND UPPER(TRIM(COALESCE(we.etapa_destino, ''))) = 'PROGRAMACION'
      AND (
        COALESCE((we.metadata->>'cambia_ubicacion')::text, '') IN ('true', '1')
        OR UPPER(TRIM(COALESCE(we.etapa_origen, ''))) IS DISTINCT FROM 'PROGRAMACION'
        OR UPPER(TRIM(COALESCE(we.evento_codigo, ''))) = 'DEC_APROBADO'
      )
  ) fip_ev ON TRUE
  LEFT JOIN LATERAL (
    SELECT MIN(ea.asignado_at) AS fecha_asig
    FROM expediente_asignaciones ea
    WHERE ea.requerimiento_id = r.id
      AND UPPER(TRIM(COALESCE(ea.etapa_codigo, ''))) = 'PROGRAMACION'
  ) fip_asig ON TRUE
`;

export const FECHA_INGRESO_PROGRAMACION_SELECT = `
  COALESCE(fip_ev.fecha_evento, fip_asig.fecha_asig) AS fecha_ingreso_programacion
`;

export const WHERE_BANDEJA_PROGRAMACION = `
  (
    r.estado_actual = 'PROGRAMACION'
    OR r.estado IN ${ESTADOS_BANDEJA_PROGRAMACION}
    OR r.estado ILIKE 'Sol.Cot. Enviada%'
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
      ${FECHA_INGRESO_PROGRAMACION_SELECT},
      ${TRAZA_EXTRA_SELECT}
    ${REQUERIMIENTO_BANDEJA_FROM}
    ${FECHA_INGRESO_PROGRAMACION_JOINS}
    ${where}
    ORDER BY r.created_at DESC NULLS LAST, r.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, params);

  return {
    data: await enrichRequerimientoRowsWithCcp(rows),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
