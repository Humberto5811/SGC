/**
 * 061 — RC8.17.8H6-C3-D1 Contrato canónico invitación → cotización.
 * - invitacion_id + nro_invitacion_presentacion (nullable, sin backfill legacy).
 * - Una cotización por invitacion_id (nueva); legacy mantiene a lo sumo una fila sin invitacion_id por SC+proveedor.
 */
export default `
ALTER TABLE cotizaciones_proveedor
  ADD COLUMN IF NOT EXISTS invitacion_id INT REFERENCES invitacion_proveedores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS nro_invitacion_presentacion INT;

CREATE INDEX IF NOT EXISTS idx_cotizaciones_proveedor_invitacion
  ON cotizaciones_proveedor (invitacion_id)
  WHERE invitacion_id IS NOT NULL;

DO $migration061$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'cotizaciones_proveedor'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%solicitud_id%proveedor_id%'
  LOOP
    EXECUTE format('ALTER TABLE cotizaciones_proveedor DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END
$migration061$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cotizaciones_proveedor_invitacion_id
  ON cotizaciones_proveedor (invitacion_id)
  WHERE invitacion_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cotizaciones_proveedor_legacy_solicitud_proveedor
  ON cotizaciones_proveedor (solicitud_id, proveedor_id)
  WHERE invitacion_id IS NULL;
`;
