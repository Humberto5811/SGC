// Bandeja maestra DEC — trazabilidad histórica (no ocultar expedientes tras avanzar etapa)
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

const ESTADOS_BANDEJA_DEC = `(
  'Aprobado', 'Aprobado DEC', 'Observado DEC', 'Observado Programación',
  'En Programación', 'Aprobado Programación', 'Programado', 'En Invitaciones'
)`;

/** Expedientes que pasaron por DEC o etapas posteriores — bandeja histórica. */
export const WHERE_BANDEJA_DEC = `
  (
    r.estado IN ${ESTADOS_BANDEJA_DEC}
    OR r.estado ILIKE 'Sol.Cot. Enviada%'
    OR jsonb_array_length(COALESCE((COALESCE(r.payload, '{}')::jsonb -> 'historial_dec'), '[]'::jsonb)) > 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(r.historial_estados, '[]'::jsonb)) h
      WHERE UPPER(COALESCE(h->>'etapa', h->>'estado', '')) IN ('DEC', 'PROGRAMACION', 'ACTOS_PREPARATORIOS', 'INVITACIONES')
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(r.historial_movimientos, '[]'::jsonb)) m
      WHERE UPPER(COALESCE(m->>'etapa', '')) IN ('DEC', 'PROGRAMACION', 'ACTOS_PREPARATORIOS', 'INVITACIONES')
    )
  )
`;

export async function listarBandejaDEC(page, pageSize, queryParams = {}) {
  const offset = (page - 1) * pageSize;
  const { whereExtra, params: filterParams } = buildListFilters(queryParams);
  const params = [...filterParams];

  let where = `WHERE ${WHERE_BANDEJA_DEC}`;
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
