/**
 * Migración 048 — RC8.15.6A: versión vigente del documento presentado.
 *
 * La recepción INICIAL se edita en la misma fila mientras no exista una
 * observación formal. Los reemplazos documentales conservan el PDF anterior.
 */
export default `
ALTER TABLE entregable_recepcion_documentos
  ADD COLUMN IF NOT EXISTS vigente BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE entregable_recepcion_documentos
  ADD COLUMN IF NOT EXISTS reemplaza_id INTEGER NULL
    REFERENCES entregable_recepcion_documentos(id) ON DELETE SET NULL;

COMMENT ON COLUMN entregable_recepcion_documentos.vigente
  IS 'TRUE para el documento actualmente válido de la recepción; FALSE para versiones históricas reemplazadas';
COMMENT ON COLUMN entregable_recepcion_documentos.reemplaza_id
  IS 'Documento vigente anterior al que reemplaza esta versión';

CREATE INDEX IF NOT EXISTS idx_entregable_recepcion_docs_reemplaza
  ON entregable_recepcion_documentos (reemplaza_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_recepcion_doc_vigente
  ON entregable_recepcion_documentos (recepcion_id)
  WHERE vigente = TRUE;
`;
