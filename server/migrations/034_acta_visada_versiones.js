/**
 * Migración 034 — Versiones documentales del acta visada por Almacén.
 */
export default `
CREATE TABLE IF NOT EXISTS recepcion_bienes_acta_visados (
  id SERIAL PRIMARY KEY,
  expediente_recepcion_id INTEGER NOT NULL
    REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
  acta_id INTEGER NOT NULL
    REFERENCES recepcion_bienes_actas(id) ON DELETE CASCADE,
  documento_recepcion_id INTEGER NULL
    REFERENCES recepcion_bienes_documentos(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  nombre VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
  contenido_base64 TEXT NOT NULL,
  tamano_bytes INTEGER NULL,
  estado_documental VARCHAR(64) NOT NULL DEFAULT 'ACTA_RECEPCION_VISADA_ALMACEN',
  observacion TEXT NULL,
  vigente BOOLEAN NOT NULL DEFAULT TRUE,
  reemplaza_id INTEGER NULL,
  idempotency_key VARCHAR(120) NULL,
  created_by VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP NULL,
  deleted_by VARCHAR(150) NULL,
  deleted_motivo TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_rbav_exp ON recepcion_bienes_acta_visados(expediente_recepcion_id);
CREATE INDEX IF NOT EXISTS idx_rbav_acta ON recepcion_bienes_acta_visados(acta_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rbav_idem
  ON recepcion_bienes_acta_visados(expediente_recepcion_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE recepcion_bienes_documentos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS deleted_motivo TEXT NULL;
`;
