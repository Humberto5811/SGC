/**
 * Migración 056 — RC8.15.6G-7: cálculo y documentos de penalidad (Pagos).
 */
export default `
ALTER TABLE entregable_pago_documentos
  DROP CONSTRAINT IF EXISTS chk_entregable_pago_documentos_tipo;

ALTER TABLE entregable_pago_documentos
  ADD CONSTRAINT chk_entregable_pago_documentos_tipo
    CHECK (tipo_documento IN (
      'AMPLIACION_PLAZO',
      'FORMATO_PENALIDAD',
      'FORMATO_PENALIDAD_FIRMADO',
      'CARTA_PENALIDAD'
    ));

CREATE TABLE IF NOT EXISTS entregable_penalidad_calculo (
  id                       SERIAL PRIMARY KEY,
  orden_id                 INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  orden_entrega_id         INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  evaluacion_id            INTEGER NULL REFERENCES entregable_penalidad_evaluacion(id) ON DELETE SET NULL,
  version                  INTEGER NOT NULL DEFAULT 1,
  regla_version            VARCHAR(40) NOT NULL DEFAULT 'G7-ANEXO11-V1',
  entrada_json             JSONB NOT NULL,
  resultado_json           JSONB NOT NULL,
  usuario_calculador_id    INTEGER NULL REFERENCES usuarios(id) ON DELETE SET NULL,
  calculado_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  documento_generado_id    INTEGER NULL REFERENCES entregable_pago_documentos(id) ON DELETE SET NULL,
  documento_firmado_id     INTEGER NULL REFERENCES entregable_pago_documentos(id) ON DELETE SET NULL,
  carta_generada_id        INTEGER NULL REFERENCES entregable_pago_documentos(id) ON DELETE SET NULL,
  vigente                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_epc_version_pos CHECK (version >= 1)
);

COMMENT ON TABLE entregable_penalidad_calculo
  IS 'Snapshot versionado del cálculo de penalidad por entregable (PEP)';

CREATE INDEX IF NOT EXISTS idx_epc_entrega_vigente
  ON entregable_penalidad_calculo (orden_entrega_id, vigente, version DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_epc_entrega_version
  ON entregable_penalidad_calculo (orden_entrega_id, version);
`;
