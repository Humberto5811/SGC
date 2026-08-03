/**
 * 043 — Workflow alertas: monitor persistente de consistencia.
 * Idempotente. No toca datos históricos. No bloquea el motor (solo notifica).
 */
export default `
CREATE TABLE IF NOT EXISTS workflow_alertas (
  id             SERIAL PRIMARY KEY,
  expediente_id  INTEGER REFERENCES requerimientos(id) ON DELETE CASCADE,
  codigo_alerta  VARCHAR(60) NOT NULL,
  severidad      VARCHAR(10) NOT NULL
    CHECK (severidad IN ('ALTA', 'MEDIA', 'BAJA')),
  condicion      JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado         VARCHAR(20) NOT NULL DEFAULT 'ABIERTA'
    CHECK (estado IN ('ABIERTA', 'REVISADA', 'CERRADA')),
  creado_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  resuelto_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workflow_alertas_exp
  ON workflow_alertas (expediente_id, estado);

CREATE INDEX IF NOT EXISTS idx_workflow_alertas_cod
  ON workflow_alertas (codigo_alerta, estado);
`;