/**
 * Migración 050 — RC8.15.6C-2A: estado, asignación e historial canónicos
 * por entregable. Coexiste con el workflow global por requerimiento.
 */
export default `
CREATE UNIQUE INDEX IF NOT EXISTS uq_ordenes_contratacion_id_requerimiento
  ON ordenes_contratacion (id, requerimiento_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orden_entregas_id_orden
  ON orden_entregas (id, orden_id);

CREATE TABLE IF NOT EXISTS entregable_estado_vigente (
  id                     SERIAL PRIMARY KEY,
  orden_id               INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  orden_entrega_id       INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  requerimiento_id       INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE RESTRICT,
  estado_codigo          VARCHAR(80) NOT NULL,
  estado_label           VARCHAR(160) NOT NULL,
  etapa_codigo           VARCHAR(80) NOT NULL,
  etapa_label            VARCHAR(160) NOT NULL,
  responsable_tipo       VARCHAR(20) NOT NULL,
  responsable_usuario_id INTEGER NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  responsable_unidad     VARCHAR(160) NULL,
  responsable_fuente    VARCHAR(80) NOT NULL,
  version                INTEGER NOT NULL DEFAULT 1,
  actualizado_por        VARCHAR(150) NULL,
  actualizado_at         TIMESTAMP NOT NULL DEFAULT NOW(),
  metadata_json          JSONB NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_entregable_estado_vigente_entrega UNIQUE (orden_entrega_id),
  CONSTRAINT chk_entregable_estado_version CHECK (version >= 1),
  CONSTRAINT chk_entregable_estado_responsable_tipo
    CHECK (responsable_tipo IN ('PERSONA', 'UNIDAD', 'PENDIENTE')),
  CONSTRAINT chk_entregable_estado_responsable_coherente CHECK (
    (responsable_tipo = 'PERSONA' AND responsable_usuario_id IS NOT NULL)
    OR (responsable_tipo = 'UNIDAD' AND responsable_usuario_id IS NULL
        AND BTRIM(COALESCE(responsable_unidad, '')) <> '')
    OR (responsable_tipo = 'PENDIENTE' AND responsable_usuario_id IS NULL)
  ),
  CONSTRAINT fk_entregable_estado_entrega_orden
    FOREIGN KEY (orden_entrega_id, orden_id)
    REFERENCES orden_entregas(id, orden_id) ON DELETE RESTRICT,
  CONSTRAINT fk_entregable_estado_orden_requerimiento
    FOREIGN KEY (orden_id, requerimiento_id)
    REFERENCES ordenes_contratacion(id, requerimiento_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_entregable_estado_orden
  ON entregable_estado_vigente (orden_id);
CREATE INDEX IF NOT EXISTS idx_entregable_estado_requerimiento
  ON entregable_estado_vigente (requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_entregable_estado_etapa
  ON entregable_estado_vigente (etapa_codigo);

CREATE TABLE IF NOT EXISTS entregable_asignaciones (
  id                SERIAL PRIMARY KEY,
  orden_id          INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  orden_entrega_id  INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  requerimiento_id  INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE RESTRICT,
  etapa_codigo      VARCHAR(80) NOT NULL,
  usuario_id        INTEGER NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  unidad_codigo     VARCHAR(160) NULL,
  tipo_responsable  VARCHAR(20) NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  asignado_por      VARCHAR(150) NULL,
  asignado_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  cerrado_por       VARCHAR(150) NULL,
  cerrado_at        TIMESTAMP NULL,
  motivo            TEXT NULL,
  origen_asignacion VARCHAR(80) NOT NULL DEFAULT 'inicializacion',
  metadata_json     JSONB NULL,
  CONSTRAINT chk_entregable_asig_responsable_tipo
    CHECK (tipo_responsable IN ('PERSONA', 'UNIDAD', 'PENDIENTE')),
  CONSTRAINT chk_entregable_asig_responsable_coherente CHECK (
    (tipo_responsable = 'PERSONA' AND usuario_id IS NOT NULL)
    OR (tipo_responsable = 'UNIDAD' AND usuario_id IS NULL
        AND BTRIM(COALESCE(unidad_codigo, '')) <> '')
    OR (tipo_responsable = 'PENDIENTE' AND usuario_id IS NULL)
  ),
  CONSTRAINT chk_entregable_asig_cierre CHECK (
    (activo = TRUE AND cerrado_at IS NULL)
    OR (activo = FALSE AND cerrado_at IS NOT NULL)
  ),
  CONSTRAINT fk_entregable_asig_entrega_orden
    FOREIGN KEY (orden_entrega_id, orden_id)
    REFERENCES orden_entregas(id, orden_id) ON DELETE RESTRICT,
  CONSTRAINT fk_entregable_asig_orden_requerimiento
    FOREIGN KEY (orden_id, requerimiento_id)
    REFERENCES ordenes_contratacion(id, requerimiento_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entregable_asignacion_activa
  ON entregable_asignaciones (orden_entrega_id)
  WHERE activo = TRUE;
CREATE INDEX IF NOT EXISTS idx_entregable_asig_historial
  ON entregable_asignaciones (orden_entrega_id, asignado_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS entregable_eventos (
  id                            SERIAL PRIMARY KEY,
  orden_id                      INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE RESTRICT,
  orden_entrega_id              INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE RESTRICT,
  requerimiento_id              INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE RESTRICT,
  evento_codigo                 VARCHAR(100) NOT NULL,
  estado_anterior_codigo        VARCHAR(80) NULL,
  estado_anterior_label         VARCHAR(160) NULL,
  estado_nuevo_codigo           VARCHAR(80) NOT NULL,
  estado_nuevo_label            VARCHAR(160) NOT NULL,
  etapa_anterior_codigo         VARCHAR(80) NULL,
  etapa_nueva_codigo            VARCHAR(80) NOT NULL,
  responsable_anterior_tipo     VARCHAR(20) NULL,
  responsable_anterior_usuario  INTEGER NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  responsable_anterior_unidad   VARCHAR(160) NULL,
  responsable_nuevo_tipo        VARCHAR(20) NOT NULL,
  responsable_nuevo_usuario     INTEGER NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  responsable_nuevo_unidad      VARCHAR(160) NULL,
  ejecutado_usuario_id          INTEGER NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  ejecutado_por                 VARCHAR(150) NULL,
  ocurrido_at                   TIMESTAMP NOT NULL DEFAULT NOW(),
  motivo                        TEXT NULL,
  metadata_json                 JSONB NULL,
  CONSTRAINT fk_entregable_evento_entrega_orden
    FOREIGN KEY (orden_entrega_id, orden_id)
    REFERENCES orden_entregas(id, orden_id) ON DELETE RESTRICT,
  CONSTRAINT fk_entregable_evento_orden_requerimiento
    FOREIGN KEY (orden_id, requerimiento_id)
    REFERENCES ordenes_contratacion(id, requerimiento_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_entregable_eventos_historial
  ON entregable_eventos (orden_entrega_id, ocurrido_at DESC, id DESC);

COMMENT ON TABLE entregable_estado_vigente
  IS 'Fuente canónica de estado y responsable por orden_entrega_id; no reemplaza el estado global del requerimiento';
COMMENT ON TABLE entregable_asignaciones
  IS 'Asignaciones activas e históricas por entregable';
COMMENT ON TABLE entregable_eventos
  IS 'Trazabilidad de transiciones canónicas por entregable';
`;
