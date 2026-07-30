/**
 * Migración 035 — Paquete documental persistido al derivar al Área Usuaria.
 */
export default `
CREATE TABLE IF NOT EXISTS recepcion_bienes_derivacion_documentos (
  id SERIAL PRIMARY KEY,
  derivacion_id INTEGER NOT NULL
    REFERENCES recepcion_bienes_derivaciones(id) ON DELETE CASCADE,
  expediente_recepcion_id INTEGER NOT NULL
    REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
  documento_key VARCHAR(120) NOT NULL,
  documento_id VARCHAR(80) NULL,
  tipo VARCHAR(80) NOT NULL,
  grupo VARCHAR(80) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  origen VARCHAR(80) NULL,
  obligatorio BOOLEAN NOT NULL DEFAULT FALSE,
  seleccionado BOOLEAN NOT NULL DEFAULT TRUE,
  recepcion_id INTEGER NULL,
  acta_id INTEGER NULL,
  version INTEGER NULL,
  vigente BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbdd_der ON recepcion_bienes_derivacion_documentos(derivacion_id);
CREATE INDEX IF NOT EXISTS idx_rbdd_exp ON recepcion_bienes_derivacion_documentos(expediente_recepcion_id);

ALTER TABLE recepcion_bienes_documentos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS deleted_motivo TEXT NULL;
`;
