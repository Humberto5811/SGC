/**
 * 044 — RC8.6A: fuente única persistida de estado y responsable vigente.
 * Idempotente. No elimina columnas legacy de requerimientos.
 * No crea asignaciones activas (responsable_tipo = PENDIENTE, sin persona).
 * No altera workflow ni tablas de negocio.
 */
export default `
CREATE TABLE IF NOT EXISTS expediente_estado_vigente (
  requerimiento_id        INTEGER PRIMARY KEY REFERENCES requerimientos(id) ON DELETE CASCADE,
  estado_codigo           VARCHAR(80) NOT NULL,
  estado_label            VARCHAR(160) NOT NULL DEFAULT '',
  etapa_codigo            VARCHAR(60) NOT NULL,
  etapa_label             VARCHAR(160) NOT NULL DEFAULT '',
  responsable_tipo        VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  responsable_usuario_id  INTEGER NULL,
  responsable_unidad      VARCHAR(160) NULL,
  responsable_fuente      VARCHAR(80) NOT NULL DEFAULT 'pendiente',
  actualizado_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_por         VARCHAR(160) NULL,
  version                 INTEGER NOT NULL DEFAULT 1,
  metadata_json           JSONB NULL,
  CONSTRAINT chk_exp_estado_version_positive CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS idx_exp_estado_vigente_etapa
  ON expediente_estado_vigente (etapa_codigo);

CREATE INDEX IF NOT EXISTS idx_exp_estado_vigente_resp_usuario
  ON expediente_estado_vigente (responsable_usuario_id)
  WHERE responsable_usuario_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS expediente_asignaciones (
  id                   SERIAL PRIMARY KEY,
  requerimiento_id     INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  etapa_codigo         VARCHAR(60) NOT NULL,
  usuario_id           INTEGER NULL,
  unidad_codigo        VARCHAR(160) NULL,
  tipo_responsable     VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  origen_asignacion    VARCHAR(80) NOT NULL DEFAULT 'transicion',
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  asignado_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  cerrado_at           TIMESTAMP NULL,
  asignado_por         VARCHAR(160) NULL,
  motivo               TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_exp_asig_req
  ON expediente_asignaciones (requerimiento_id, asignado_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_exp_asig_activa_por_req
  ON expediente_asignaciones (requerimiento_id)
  WHERE activo = TRUE;

-- Backfill inicial: solo filas sin registro vigente. No infiere persona.
-- Re-ejecutable: WHERE NOT EXISTS evita duplicados.
INSERT INTO expediente_estado_vigente (
  requerimiento_id, estado_codigo, estado_label, etapa_codigo, etapa_label,
  responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente,
  actualizado_at, actualizado_por, version, metadata_json
)
SELECT
  r.id,
  COALESCE(NULLIF(TRIM(r.estado), ''), COALESCE(NULLIF(TRIM(r.estado_actual), ''), 'REGISTRO')),
  COALESCE(NULLIF(TRIM(r.estado), ''), COALESCE(NULLIF(TRIM(r.estado_actual), ''), 'REGISTRO')),
  CASE UPPER(TRIM(COALESCE(r.estado_actual, '')))
    WHEN 'VALIDACION_USUARIO' THEN 'VALIDACIONES'
    WHEN 'VALIDACION' THEN 'VALIDACIONES'
    WHEN 'ACTOS_PREPARATORIOS' THEN 'COORDINACION_CM'
    WHEN 'EN_EJECUCION' THEN 'RECEPCION_BIENES'
    WHEN 'ORDEN' THEN 'REGISTRO_ORDEN'
    WHEN '' THEN 'REGISTRO'
    ELSE UPPER(TRIM(COALESCE(NULLIF(TRIM(r.estado_actual), ''), 'REGISTRO')))
  END,
  COALESCE(NULLIF(TRIM(r.sub_modulo_actual), ''), COALESCE(NULLIF(TRIM(r.estado_actual), ''), 'REGISTRO')),
  'PENDIENTE',
  NULL,
  NULL,
  'backfill_inicial',
  COALESCE(r.fecha_estado_actual, r.updated_at, NOW()),
  'migracion_044',
  1,
  jsonb_build_object(
    'origen', 'backfill_044',
    'legacy_responsable_actual', r.responsable_actual,
    'nota', 'sin_inferencia_persona'
  )
FROM requerimientos r
WHERE NOT EXISTS (
  SELECT 1 FROM expediente_estado_vigente e WHERE e.requerimiento_id = r.id
);
`;
