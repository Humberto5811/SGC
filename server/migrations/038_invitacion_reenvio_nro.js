/**
 * 038 — Reinvitación: varias invitaciones por (requerimiento, proveedor).
 * Elimina UNIQUE (requerimiento_id, proveedor_id) y agrega nro_invitacion.
 */
export default `
ALTER TABLE invitacion_proveedores
  ADD COLUMN IF NOT EXISTS nro_invitacion INT NOT NULL DEFAULT 1;

DO $migration038$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'invitacion_proveedores'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%requerimiento_id%proveedor_id%'
  LOOP
    EXECUTE format('ALTER TABLE invitacion_proveedores DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END
$migration038$;

-- Backfill: numerar por solicitud+proveedor (o requerimiento+proveedor si sin solicitud)
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(solicitud_id, 0), proveedor_id, requerimiento_id
      ORDER BY id ASC
    ) AS rn
  FROM invitacion_proveedores
)
UPDATE invitacion_proveedores ip
SET nro_invitacion = ranked.rn
FROM ranked
WHERE ip.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_inv_prov_solicitud_proveedor
  ON invitacion_proveedores (solicitud_id, proveedor_id);

CREATE INDEX IF NOT EXISTS idx_inv_prov_req_proveedor
  ON invitacion_proveedores (requerimiento_id, proveedor_id);
`;
