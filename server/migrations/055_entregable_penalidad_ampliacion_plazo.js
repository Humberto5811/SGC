/**
 * Migración 055 — RC8.15.6G-6: ampliaciones de plazo aprobadas (Pagos / penalidad).
 */
export default `
CREATE TABLE IF NOT EXISTS entregable_pago_documentos (
  id                       SERIAL PRIMARY KEY,
  orden_id                 INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  orden_entrega_id         INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  tipo_documento           VARCHAR(40) NOT NULL DEFAULT 'AMPLIACION_PLAZO',
  nombre_archivo           VARCHAR(300) NOT NULL,
  mime_type                VARCHAR(120) NOT NULL,
  storage_path             TEXT NOT NULL,
  tamanio_bytes            INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by               VARCHAR(150) NULL,
  CONSTRAINT chk_entregable_pago_documentos_tipo
    CHECK (tipo_documento IN ('AMPLIACION_PLAZO'))
);

COMMENT ON TABLE entregable_pago_documentos
  IS 'Documentos de soporte Pagos; binario fuera de la fila operativa (storage_path)';
COMMENT ON COLUMN entregable_pago_documentos.storage_path
  IS 'Ruta relativa bajo server/storage/entregables-pago';

CREATE INDEX IF NOT EXISTS idx_entregable_pago_docs_entrega
  ON entregable_pago_documentos (orden_entrega_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS entregable_penalidad_ampliacion_plazo (
  id                       SERIAL PRIMARY KEY,
  orden_id                 INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  orden_entrega_id         INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  dias_ampliacion          INTEGER NOT NULL,
  numero_documento         VARCHAR(120) NOT NULL,
  fecha_documento          DATE NOT NULL,
  observacion              TEXT NULL,
  documento_id             INTEGER NOT NULL REFERENCES entregable_pago_documentos(id) ON DELETE RESTRICT,
  registrado_por_id        INTEGER NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_entregable_penalidad_amp_dias
    CHECK (dias_ampliacion > 0),
  CONSTRAINT chk_entregable_penalidad_amp_numero
    CHECK (BTRIM(numero_documento) <> '')
);

COMMENT ON TABLE entregable_penalidad_ampliacion_plazo
  IS 'Ampliaciones de plazo aprobadas asociadas a evaluación de penalidad en Pagos';

CREATE INDEX IF NOT EXISTS idx_entregable_penalidad_amp_entrega
  ON entregable_penalidad_ampliacion_plazo (orden_entrega_id, fecha_documento DESC, id DESC);
`;
