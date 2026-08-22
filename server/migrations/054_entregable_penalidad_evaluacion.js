/**
 * Migración 054 — RC8.15.6G-5 / Fase 3A: evaluación de penalidad en Pagos (PEP).
 * Un registro vigente por entregable; modificable mientras permanezca en PEP.
 */
export default `
CREATE TABLE IF NOT EXISTS entregable_penalidad_evaluacion (
  id                       SERIAL PRIMARY KEY,
  orden_id                 INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  orden_entrega_id         INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  requerimiento_id         INTEGER NOT NULL,
  corresponde_penalidad    BOOLEAN NOT NULL,
  estado_penalidad         VARCHAR(30) NOT NULL,
  observacion              TEXT NULL,
  usuario_evaluador_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  fecha_evaluacion         TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_entregable_penalidad_estado
    CHECK (estado_penalidad IN ('NO_CORRESPONDE', 'CORRESPONDE')),
  CONSTRAINT chk_entregable_penalidad_coherencia
    CHECK (
      (corresponde_penalidad = TRUE AND estado_penalidad = 'CORRESPONDE')
      OR (corresponde_penalidad = FALSE AND estado_penalidad = 'NO_CORRESPONDE')
    )
);

COMMENT ON TABLE entregable_penalidad_evaluacion
  IS 'Evaluación Analista CM: ¿corresponde penalidad? antes del armado del expediente de pago';

CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_penalidad_eval_entrega
  ON entregable_penalidad_evaluacion (orden_entrega_id);

CREATE INDEX IF NOT EXISTS idx_entregable_penalidad_eval_orden
  ON entregable_penalidad_evaluacion (orden_id, orden_entrega_id);
`;
