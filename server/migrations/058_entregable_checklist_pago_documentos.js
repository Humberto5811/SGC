/**
 * Migración 058 — RC8.15.6G-8: checklist documental Pagos (docs Analista CM).
 */
export default `
ALTER TABLE entregable_pago_documentos
  DROP CONSTRAINT IF EXISTS chk_entregable_pago_documentos_tipo;

ALTER TABLE entregable_pago_documentos
  ADD COLUMN IF NOT EXISTS descripcion VARCHAR(300) NULL,
  ADD COLUMN IF NOT EXISTS obligatorio BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS vigente BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS reemplaza_id INTEGER NULL REFERENCES entregable_pago_documentos(id) ON DELETE SET NULL;

ALTER TABLE entregable_pago_documentos
  ADD CONSTRAINT chk_entregable_pago_documentos_tipo
    CHECK (tipo_documento IN (
      'AMPLIACION_PLAZO',
      'FORMATO_PENALIDAD',
      'FORMATO_PENALIDAD_FIRMADO',
      'CARTA_PENALIDAD',
      'FUP',
      'TCE',
      'REDAM',
      'SERVIR',
      'DEBIDA_DILIGENCIA',
      'REDJUM',
      'CHECKLIST_OTRO'
    ));

COMMENT ON COLUMN entregable_pago_documentos.descripcion
  IS 'Nombre libre para documentos CHECKLIST_OTRO del Analista CM';
COMMENT ON COLUMN entregable_pago_documentos.obligatorio
  IS 'Si el ítem cuenta para progreso obligatorio del checklist';
COMMENT ON COLUMN entregable_pago_documentos.vigente
  IS 'Soft-delete / versión vigente del documento de checklist';

CREATE INDEX IF NOT EXISTS idx_entregable_pago_docs_checklist
  ON entregable_pago_documentos (orden_entrega_id, tipo_documento, vigente, created_at DESC, id DESC);
`;
