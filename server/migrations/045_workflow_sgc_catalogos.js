/**
 * 045 — RC8.7: catálogos maestros de Workflow SGC (estados, etapas, reglas responsable).
 * Idempotente. No altera expedientes. Color solo vía categoria_visual (sin hex).
 */
export default `
CREATE TABLE IF NOT EXISTS workflow_estados_catalogo (
  codigo            VARCHAR(80) PRIMARY KEY,
  label             VARCHAR(160) NOT NULL,
  categoria_visual  VARCHAR(40) NOT NULL DEFAULT 'EN_PROCESO',
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  orden             INTEGER NOT NULL DEFAULT 100,
  tooltip           TEXT NULL,
  icono             VARCHAR(80) NULL,
  actualizado_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_wf_est_categoria CHECK (
    categoria_visual IN (
      'PENDIENTE','EN_PROCESO','DERIVADO','OBSERVADO','DEVUELTO',
      'APROBADO','COMPLETADO','FINALIZADO','ANULADO','DESCONOCIDO'
    )
  )
);

CREATE TABLE IF NOT EXISTS workflow_etapas_catalogo (
  codigo            VARCHAR(60) PRIMARY KEY,
  label             VARCHAR(160) NOT NULL,
  orden_proceso     INTEGER NOT NULL DEFAULT 100,
  modulo            VARCHAR(80) NULL,
  submodulo         VARCHAR(120) NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_reglas_responsable (
  id                  SERIAL PRIMARY KEY,
  etapa_codigo        VARCHAR(60) NOT NULL REFERENCES workflow_etapas_catalogo(codigo),
  tipo_fuente         VARCHAR(60) NOT NULL,
  prioridad           INTEGER NOT NULL DEFAULT 100,
  permite_persona     BOOLEAN NOT NULL DEFAULT TRUE,
  permite_unidad      BOOLEAN NOT NULL DEFAULT TRUE,
  permite_pendiente   BOOLEAN NOT NULL DEFAULT TRUE,
  requiere_permiso    BOOLEAN NOT NULL DEFAULT FALSE,
  submodulo_permiso   VARCHAR(80) NULL,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wf_regla_etapa_fuente UNIQUE (etapa_codigo, tipo_fuente),
  CONSTRAINT chk_wf_regla_fuente CHECK (
    tipo_fuente IN (
      'ASIGNACION_EXPLICITA','RESPONSABLE_SOLICITUD','RESPONSABLE_VALIDACION_AU',
      'RESPONSABLE_CCP','RESPONSABLE_ORDEN','RESPONSABLE_RECEPCION',
      'UNIDAD_DESTINO','PENDIENTE'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_wf_estados_activo_orden
  ON workflow_estados_catalogo (activo, orden);
CREATE INDEX IF NOT EXISTS idx_wf_etapas_activo_orden
  ON workflow_etapas_catalogo (activo, orden_proceso);
CREATE INDEX IF NOT EXISTS idx_wf_reglas_etapa
  ON workflow_reglas_responsable (etapa_codigo, prioridad);

CREATE TABLE IF NOT EXISTS workflow_reconciliacion_log (
  id                  SERIAL PRIMARY KEY,
  requerimiento_id    INTEGER NULL REFERENCES requerimientos(id) ON DELETE SET NULL,
  dry_run             BOOLEAN NOT NULL DEFAULT TRUE,
  motivo              TEXT NULL,
  actor               VARCHAR(160) NULL,
  plan_json           JSONB NULL,
  resultado_json      JSONB NULL,
  creado_at           TIMESTAMP NOT NULL DEFAULT NOW()
);
`;
