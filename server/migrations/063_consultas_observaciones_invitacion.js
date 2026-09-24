/**
 * 063 — RC8.17.8H6-C3-D3 consultas/observaciones por invitación (nullable, sin backfill).
 */
export default `
ALTER TABLE consultas_proveedor
  ADD COLUMN IF NOT EXISTS invitacion_id INT REFERENCES invitacion_proveedores(id) ON DELETE SET NULL;

ALTER TABLE observaciones_proveedor
  ADD COLUMN IF NOT EXISTS invitacion_id INT REFERENCES invitacion_proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consultas_invitacion
  ON consultas_proveedor (invitacion_id)
  WHERE invitacion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_observaciones_invitacion
  ON observaciones_proveedor (invitacion_id)
  WHERE invitacion_id IS NOT NULL;
`;
