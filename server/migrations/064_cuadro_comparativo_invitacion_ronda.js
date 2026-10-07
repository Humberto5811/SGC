/**
 * 064 — RC8.17.8H6-C3-D10-A Cuadro Comparativo por contexto operativo de invitación.
 *
 * nro_invitacion: agrupación operativa (ordinal por proveedor; NO es ID global de ronda SC).
 * invitacion_id / cotizacion_ancla_id: ancla y trazabilidad.
 * Sin backfill: legacy conserva nro_invitacion NULL.
 */
export default `
ALTER TABLE cuadros_comparativos
  ADD COLUMN IF NOT EXISTS invitacion_id INT REFERENCES invitacion_proveedores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS nro_invitacion INT,
  ADD COLUMN IF NOT EXISTS cotizacion_ancla_id INT REFERENCES cotizaciones_proveedor(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cuadros_invitacion
  ON cuadros_comparativos (invitacion_id)
  WHERE invitacion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cuadros_nro_invitacion
  ON cuadros_comparativos (solicitud_id, nro_invitacion)
  WHERE nro_invitacion IS NOT NULL;

DROP INDEX IF EXISTS idx_cuadros_activo_solicitud_tipo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cuadros_activo_solicitud_tipo_nro
  ON cuadros_comparativos (solicitud_id, tipo, nro_invitacion)
  WHERE estado <> 'ANULADO' AND nro_invitacion IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cuadros_activo_solicitud_tipo_legacy
  ON cuadros_comparativos (solicitud_id, tipo)
  WHERE estado <> 'ANULADO' AND nro_invitacion IS NULL;
`;
