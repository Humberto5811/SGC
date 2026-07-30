/**
 * Migración 033 — Acta visada por Almacén (antes de derivar AU).
 */
export default `
ALTER TABLE recepcion_bienes_actas
  ADD COLUMN IF NOT EXISTS acta_visada_nombre VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS acta_visada_mime VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS acta_visada_base64 TEXT NULL,
  ADD COLUMN IF NOT EXISTS visado_almacen_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS visado_almacen_por VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS observacion_visado TEXT NULL;
`;
