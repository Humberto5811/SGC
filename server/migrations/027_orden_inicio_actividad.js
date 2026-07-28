/**
 * OD36 — Inicio de actividad + ampliación de estados de órdenes de contratación.
 * Idempotente: no altera catálogo `ordenes`.
 */
export default `
CREATE TABLE IF NOT EXISTS orden_inicio_actividad (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NULL REFERENCES ordenes_contratacion(id) ON DELETE CASCADE,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id),
  condicion_inicio VARCHAR(60) NOT NULL,
  fecha_evento DATE NULL,
  fecha_efectiva_inicio DATE NULL,
  tipo_dias VARCHAR(20) NOT NULL DEFAULT 'calendario',
  sustento TEXT NULL,
  creado_por VARCHAR(150) NULL,
  creado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_por VARCHAR(150) NULL,
  actualizado_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orden_inicio_actividad_orden
  ON orden_inicio_actividad (orden_id)
  WHERE orden_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orden_inicio_actividad_req_sin_orden
  ON orden_inicio_actividad (requerimiento_id)
  WHERE orden_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_orden_inicio_actividad_req
  ON orden_inicio_actividad (requerimiento_id);

-- Ampliar CHECK de estados (drop + recreate si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ordenes_contratacion'
      AND constraint_name = 'chk_ordenes_contratacion_estado'
  ) THEN
    ALTER TABLE ordenes_contratacion DROP CONSTRAINT chk_ordenes_contratacion_estado;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ordenes_contratacion'
  ) THEN
    ALTER TABLE ordenes_contratacion
      ADD CONSTRAINT chk_ordenes_contratacion_estado CHECK (
        estado IN (
          'REGISTRO_ORDENES',
          'ORDEN_BORRADOR',
          'ORDEN_REGISTRADA',
          'CRONOGRAMA_DEFINIDO',
          'ORDEN_FIRMADA',
          'ORDEN_LISTA_NOTIFICACION',
          'ORDEN_ENVIADA',
          'ORDEN_ENVIADA_PENDIENTE_CONFIRMACION',
          'ORDEN_NOTIFICADA',
          'ORDEN_RECEPCION_CONFIRMADA',
          'ORDEN_EN_EJECUCION',
          'EN_EJECUCION',
          'ORDEN_OBSERVADA',
          'ORDEN_ANULADA',
          'DERIVADO_EJECUCION'
        )
      );
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

ALTER TABLE ordenes_contratacion
  ADD COLUMN IF NOT EXISTS condicion_inicio VARCHAR(60) NULL;
ALTER TABLE ordenes_contratacion
  ADD COLUMN IF NOT EXISTS fecha_evento_inicio DATE NULL;
ALTER TABLE ordenes_contratacion
  ADD COLUMN IF NOT EXISTS fecha_efectiva_inicio DATE NULL;
`;
