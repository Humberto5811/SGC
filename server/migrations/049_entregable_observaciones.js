/**
 * Migración 049 — RC8.15.6B-1: observaciones formales por entregable.
 *
 * Unidad funcional: recepción concreta de un orden_entrega. Reutiliza los
 * estados institucionales de workflow_observaciones sin mover la etapa global.
 * recepcion_subsanacion_id vincula cada observación con su nueva presentación.
 */
export default `
-- Claves compuestas necesarias para impedir relaciones cruzadas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orden_entregas_id_orden
  ON orden_entregas (id, orden_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_recepciones_id_entrega_orden
  ON entregable_recepciones (id, orden_entrega_id, orden_id);

CREATE TABLE IF NOT EXISTS entregable_observaciones (
  id                       SERIAL PRIMARY KEY,
  orden_id                 INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  orden_entrega_id         INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  recepcion_id             INTEGER NOT NULL REFERENCES entregable_recepciones(id) ON DELETE RESTRICT,
  motivo                   TEXT NOT NULL,
  estado                   VARCHAR(20) NOT NULL DEFAULT 'OBS_EMITIDA',
  observado_por            VARCHAR(150) NOT NULL,
  observado_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  subsanado_por            VARCHAR(150) NULL,
  subsanado_at             TIMESTAMP NULL,
  recepcion_subsanacion_id INTEGER NULL REFERENCES entregable_recepciones(id) ON DELETE RESTRICT,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_entregable_observaciones_motivo
    CHECK (BTRIM(motivo) <> ''),
  CONSTRAINT chk_entregable_observaciones_estado
    CHECK (estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION', 'OBS_SUBSANADA', 'OBS_CERRADA')),
  CONSTRAINT fk_entregable_obs_entrega_orden
    FOREIGN KEY (orden_entrega_id, orden_id)
    REFERENCES orden_entregas(id, orden_id) ON DELETE RESTRICT,
  CONSTRAINT fk_entregable_obs_recepcion_contexto
    FOREIGN KEY (recepcion_id, orden_entrega_id, orden_id)
    REFERENCES entregable_recepciones(id, orden_entrega_id, orden_id) ON DELETE RESTRICT,
  CONSTRAINT fk_entregable_obs_subsanacion_contexto
    FOREIGN KEY (recepcion_subsanacion_id, orden_entrega_id, orden_id)
    REFERENCES entregable_recepciones(id, orden_entrega_id, orden_id) ON DELETE RESTRICT
);

COMMENT ON TABLE entregable_observaciones
  IS 'Observaciones formales e históricas emitidas sobre una recepción de entregable de servicio';
COMMENT ON COLUMN entregable_observaciones.recepcion_id
  IS 'Presentación concreta observada (INICIAL o futura SUBSANACION)';
COMMENT ON COLUMN entregable_observaciones.recepcion_subsanacion_id
  IS 'Presentación SUBSANACION que atiende esta observación; nullable mientras permanezca abierta';

CREATE INDEX IF NOT EXISTS idx_entregable_obs_entrega
  ON entregable_observaciones (orden_entrega_id, observado_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_entregable_obs_recepcion
  ON entregable_observaciones (recepcion_id, observado_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_entregable_obs_estado
  ON entregable_observaciones (estado);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_obs_abierta_recepcion
  ON entregable_observaciones (recepcion_id)
  WHERE estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION');
`;
