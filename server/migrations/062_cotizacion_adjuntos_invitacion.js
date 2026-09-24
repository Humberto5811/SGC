/**
 * 062 — RC8.17.8H6-C3-D1.1 Adjuntos por invitación/cotización (sin compartir slot SC+proveedor).
 * + trigger inmutabilidad invitacion_id / nro_invitacion_presentacion en cotizaciones.
 */
export default `
ALTER TABLE cotizaciones_proveedor_adjuntos
  ADD COLUMN IF NOT EXISTS invitacion_id INT REFERENCES invitacion_proveedores(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS uq_cot_portal_adj_slot;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cot_portal_adj_invitacion_slot
  ON cotizaciones_proveedor_adjuntos (invitacion_id, slot_key)
  WHERE invitacion_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cot_portal_adj_legacy_sol_prov_slot
  ON cotizaciones_proveedor_adjuntos (solicitud_id, proveedor_id, slot_key)
  WHERE invitacion_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cot_portal_adj_invitacion
  ON cotizaciones_proveedor_adjuntos (invitacion_id)
  WHERE invitacion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION trg_cotizacion_invitacion_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.invitacion_id IS NOT NULL AND NEW.invitacion_id IS DISTINCT FROM OLD.invitacion_id THEN
    RAISE EXCEPTION 'cotizaciones_proveedor.invitacion_id es inmutable';
  END IF;
  IF OLD.nro_invitacion_presentacion IS NOT NULL
     AND NEW.nro_invitacion_presentacion IS DISTINCT FROM OLD.nro_invitacion_presentacion THEN
    RAISE EXCEPTION 'cotizaciones_proveedor.nro_invitacion_presentacion es inmutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cotizacion_invitacion_immutable ON cotizaciones_proveedor;
CREATE TRIGGER cotizacion_invitacion_immutable
  BEFORE UPDATE ON cotizaciones_proveedor
  FOR EACH ROW
  EXECUTE PROCEDURE trg_cotizacion_invitacion_immutable();
`;
