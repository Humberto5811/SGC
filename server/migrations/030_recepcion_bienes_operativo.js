/**
 * Migración 030 — Campos operativos Recepción de Bienes (Almacén).
 */
export default `
ALTER TABLE recepciones_bienes
  ADD COLUMN IF NOT EXISTS responsable VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS estado_fisico VARCHAR(40) NULL DEFAULT 'CONFORME';

ALTER TABLE recepcion_bienes_guias
  ADD COLUMN IF NOT EXISTS transportista VARCHAR(200) NULL;

CREATE INDEX IF NOT EXISTS idx_rb_estado_fisico ON recepciones_bienes(estado_fisico);
`;
