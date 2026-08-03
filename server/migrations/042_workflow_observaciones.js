/**
 * 042 — Workflow observaciones: ciclo transversal de observaciones internas.
 * Estructura aprobada en Fase 0.1 (D9). Idempotente. No toca datos históricos.
 */
export default `
CREATE TABLE IF NOT EXISTS workflow_observaciones (
  id                       SERIAL PRIMARY KEY,
  expediente_id            INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  origen                   VARCHAR(60) NOT NULL,
  estado                   VARCHAR(20) NOT NULL DEFAULT 'OBS_EMITIDA'
    CHECK (estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION', 'OBS_SUBSANADA', 'OBS_CERRADA')),
  emitida_por              VARCHAR(150) NOT NULL,
  responsable_subsanacion  VARCHAR(150) NOT NULL,
  motivo                   TEXT NOT NULL,
  documentos               JSONB NOT NULL DEFAULT '[]'::jsonb,
  dias_plazo               INTEGER NOT NULL DEFAULT 5,
  emitida_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  subsanada_at             TIMESTAMP,
  cerrada_at               TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_obs_exp
  ON workflow_observaciones (expediente_id, estado);

CREATE INDEX IF NOT EXISTS idx_workflow_obs_estado
  ON workflow_observaciones (estado);
`;