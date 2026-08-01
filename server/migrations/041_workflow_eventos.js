/**
 * 041 — Workflow eventos: historial canónico append-only de transiciones.
 * Idempotente. No toca datos históricos. No backfill.
 */
export default `
CREATE TABLE IF NOT EXISTS workflow_eventos (
  id                   SERIAL PRIMARY KEY,
  expediente_id        INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  tipo_contratacion    VARCHAR(30) NOT NULL,
  evento_codigo        VARCHAR(80) NOT NULL,
  etapa_origen         VARCHAR(60),
  etapa_destino        VARCHAR(60) NOT NULL,
  actor_id             INTEGER,
  actor_rol            VARCHAR(60),
  responsable_destino  VARCHAR(200),
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key      VARCHAR(160) NOT NULL UNIQUE,
  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_eventos_expediente
  ON workflow_eventos (expediente_id, created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_eventos_evento
  ON workflow_eventos (evento_codigo);

CREATE INDEX IF NOT EXISTS idx_workflow_eventos_idem
  ON workflow_eventos (idempotency_key);
`;