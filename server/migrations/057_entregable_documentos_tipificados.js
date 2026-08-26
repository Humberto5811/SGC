/**
 * Migración 057 — RC8.15.6G-7I: metadatos tipificados en entregable_recepcion_documentos.
 */
export default `
ALTER TABLE entregable_recepcion_documentos
  ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(40) NOT NULL DEFAULT 'ENTREGABLE';

ALTER TABLE entregable_recepcion_documentos
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(300) NULL;

ALTER TABLE entregable_recepcion_documentos
  ADD COLUMN IF NOT EXISTS fecha_documento DATE NULL;

ALTER TABLE entregable_recepcion_documentos
  ADD COLUMN IF NOT EXISTS vigencia_desde DATE NULL;

ALTER TABLE entregable_recepcion_documentos
  ADD COLUMN IF NOT EXISTS vigencia_hasta DATE NULL;

ALTER TABLE entregable_recepcion_documentos
  ADD COLUMN IF NOT EXISTS observacion TEXT NULL;

COMMENT ON COLUMN entregable_recepcion_documentos.tipo_documento
  IS 'Catálogo RC8.15.6G-7I: ENTREGABLE, RECIBO_HONORARIOS, SUSPENSION_4TA, COLEGIATURA, ANEXO_10_CCI, SEGURO, OTRO';
COMMENT ON COLUMN entregable_recepcion_documentos.nombre
  IS 'Nombre/descripción institucional del documento (obligatorio para OTRO)';
COMMENT ON COLUMN entregable_recepcion_documentos.fecha_documento
  IS 'Fecha del documento cuando aplica';
COMMENT ON COLUMN entregable_recepcion_documentos.vigencia_desde
  IS 'Inicio de vigencia para tipos con control de caducidad';
COMMENT ON COLUMN entregable_recepcion_documentos.vigencia_hasta
  IS 'Fin de vigencia; documento vencido no es válido para pago';

CREATE INDEX IF NOT EXISTS idx_entregable_recepcion_docs_tipo_vigente
  ON entregable_recepcion_documentos (recepcion_id, tipo_documento)
  WHERE vigente = TRUE;
`;
