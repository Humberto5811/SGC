/**
 * Migración 052 — RC8.15.6F-1: enrutamiento institucional canónico de
 * observaciones vinculadas a una presentación concreta de entregable.
 *
 * Todos los campos son nullable para conservar históricos sin inferencias.
 */
export default `
ALTER TABLE workflow_observaciones
  ADD COLUMN IF NOT EXISTS origen_submodulo_codigo VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS destino_submodulo_codigo VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS usuario_origen_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS usuario_destino_id INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_workflow_obs_usuario_origen'
      AND conrelid = 'workflow_observaciones'::regclass
  ) THEN
    ALTER TABLE workflow_observaciones
      ADD CONSTRAINT fk_workflow_obs_usuario_origen
      FOREIGN KEY (usuario_origen_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_workflow_obs_usuario_destino'
      AND conrelid = 'workflow_observaciones'::regclass
  ) THEN
    ALTER TABLE workflow_observaciones
      ADD CONSTRAINT fk_workflow_obs_usuario_destino
      FOREIGN KEY (usuario_destino_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE entregable_observaciones
  ADD COLUMN IF NOT EXISTS workflow_observacion_id INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_entregable_obs_workflow'
      AND conrelid = 'entregable_observaciones'::regclass
  ) THEN
    ALTER TABLE entregable_observaciones
      ADD CONSTRAINT fk_entregable_obs_workflow
      FOREIGN KEY (workflow_observacion_id)
      REFERENCES workflow_observaciones(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_obs_workflow
  ON entregable_observaciones (workflow_observacion_id)
  WHERE workflow_observacion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_obs_destino
  ON workflow_observaciones (destino_submodulo_codigo, usuario_destino_id, estado);

COMMENT ON COLUMN entregable_observaciones.workflow_observacion_id
  IS 'Routing institucional 1:1 asociado. NULL identifica observaciones históricas sin vínculo canónico';
`;
