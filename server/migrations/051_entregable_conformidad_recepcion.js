/**
 * Migración 051 — RC8.15.6D-1A: vínculo inequívoco entre Acta de Conformidad
 * y la presentación/recepción evaluada.
 *
 * Nullable por compatibilidad: las actas existentes permanecen visibles como
 * legacy históricas y no se realiza backfill heurístico.
 */
export default `
CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_recepciones_id_entrega_orden
  ON entregable_recepciones (id, orden_entrega_id, orden_id);

ALTER TABLE entregable_conformidad_actas
  ADD COLUMN IF NOT EXISTS recepcion_id INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_eca_recepcion'
      AND conrelid = 'entregable_conformidad_actas'::regclass
  ) THEN
    ALTER TABLE entregable_conformidad_actas
      ADD CONSTRAINT fk_eca_recepcion
      FOREIGN KEY (recepcion_id)
      REFERENCES entregable_recepciones(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_eca_recepcion_contexto'
      AND conrelid = 'entregable_conformidad_actas'::regclass
  ) THEN
    ALTER TABLE entregable_conformidad_actas
      ADD CONSTRAINT fk_eca_recepcion_contexto
      FOREIGN KEY (recepcion_id, orden_entrega_id, orden_id)
      REFERENCES entregable_recepciones(id, orden_entrega_id, orden_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_eca_recepcion
  ON entregable_conformidad_actas (recepcion_id);

COMMENT ON COLUMN entregable_conformidad_actas.recepcion_id
  IS 'Presentación concreta evaluada por el acta. NULL identifica actas legacy sin vínculo seguro; no se backfillea por fecha ni versión';
`;
