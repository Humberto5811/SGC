-- Migración 003: Crear tabla vista materializada de estado actual del requerimiento
-- Propósito: Fuente única de verdad para bandeja, estado, responsable y trazabilidad
-- Garantiza consistencia y permite consultas rápidas sin queries complejas

CREATE TABLE IF NOT EXISTS vista_requerimiento_actual (
  requerimiento_id BIGINT PRIMARY KEY REFERENCES requerimientos(id) ON DELETE CASCADE,
  codigo_requerimiento VARCHAR(50) NOT NULL,
  etapa_actual VARCHAR(50) NOT NULL DEFAULT 'REGISTRADO',
  estado_label VARCHAR(100) NOT NULL,
  responsable_actual VARCHAR(200),
  modulo_anterior VARCHAR(50),
  modulo_siguiente VARCHAR(50),
  observacion_activa BOOLEAN DEFAULT FALSE,
  observacion_id BIGINT REFERENCES observaciones(id) ON DELETE SET NULL,
  fecha_ingreso_etapa TIMESTAMP DEFAULT NOW(),
  dias_en_etapa INT GENERATED ALWAYS AS (EXTRACT(DAY FROM (NOW() - fecha_ingreso_etapa))) STORED,
  usuario_ultima_actualizacion VARCHAR(100),
  timestamp_ultima_actualizacion TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_etapa_valida CHECK (etapa_actual IN ('REGISTRADO', 'EVALUACION', 'DEC', 'PROGRAMACION', 'ACTOS_PREPARATORIOS', 'INVITACIONES', 'VALIDACION', 'CUADRO_COMPARATIVO', 'CCP', 'EJECUCION', 'FINALIZADO'))
);

CREATE INDEX IF NOT EXISTS idx_vista_etapa ON vista_requerimiento_actual(etapa_actual);
CREATE INDEX IF NOT EXISTS idx_vista_responsable ON vista_requerimiento_actual(responsable_actual);
CREATE INDEX IF NOT EXISTS idx_vista_observacion ON vista_requerimiento_actual(observacion_activa);
CREATE INDEX IF NOT EXISTS idx_vista_fecha_ingreso ON vista_requerimiento_actual(fecha_ingreso_etapa);
CREATE INDEX IF NOT EXISTS idx_vista_codigo ON vista_requerimiento_actual(codigo_requerimiento);

COMMENT ON TABLE vista_requerimiento_actual IS 'Vista materializada: estado único y confiable de cada requerimiento';

CREATE TABLE IF NOT EXISTS timeline (
  id BIGSERIAL PRIMARY KEY,
  requerimiento_id BIGINT NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  codigo_requerimiento VARCHAR(50),
  etapa_origen VARCHAR(50),
  etapa_destino VARCHAR(50),
  accion VARCHAR(50) NOT NULL,
  tipo_evento VARCHAR(50) DEFAULT 'derivacion',
  responsable VARCHAR(200),
  usuario VARCHAR(100),
  motivo TEXT,
  fecha TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_requerimiento ON timeline(requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_timeline_fecha ON timeline(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_etapa_destino ON timeline(etapa_destino);

COMMENT ON TABLE timeline IS 'Registro cronológico de eventos funcionales por requerimiento';

CREATE TABLE IF NOT EXISTS sincronizacion_control (
  id BIGSERIAL PRIMARY KEY,
  requerimiento_id BIGINT NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  estado_bd VARCHAR(100),
  estado_actual_bd VARCHAR(50),
  responsable_actual_bd VARCHAR(200),
  estado_vista VARCHAR(100),
  etapa_vista VARCHAR(50),
  responsable_vista VARCHAR(200),
  sincronizado BOOLEAN DEFAULT TRUE,
  motivo_desincronizacion TEXT,
  timestamp_verificacion TIMESTAMP DEFAULT NOW(),
  timestamp_resolucion TIMESTAMP,
  UNIQUE(requerimiento_id)
);

CREATE INDEX IF NOT EXISTS idx_sincro_desincronizado ON sincronizacion_control(sincronizado);

COMMENT ON TABLE sincronizacion_control IS 'Control de coherencia entre tabla requerimientos y vista_requerimiento_actual';

CREATE OR REPLACE FUNCTION sincronizar_vista_requerimiento()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO vista_requerimiento_actual (
    requerimiento_id,
    codigo_requerimiento,
    etapa_actual,
    estado_label,
    responsable_actual,
    observacion_activa,
    usuario_ultima_actualizacion,
    timestamp_ultima_actualizacion
  ) VALUES (
    NEW.id,
    NEW.codigo,
    COALESCE(NEW.estado_actual, 'REGISTRADO'),
    COALESCE(NEW.estado, 'Sin estado'),
    COALESCE(NEW.responsable_actual, 'Sin asignar'),
    FALSE,
    NEW.usuario_modificacion,
    NOW()
  )
  ON CONFLICT (requerimiento_id) DO UPDATE SET
    etapa_actual = COALESCE(NEW.estado_actual, 'REGISTRADO'),
    estado_label = COALESCE(NEW.estado, 'Sin estado'),
    responsable_actual = COALESCE(NEW.responsable_actual, 'Sin asignar'),
    timestamp_ultima_actualizacion = NOW(),
    usuario_ultima_actualizacion = NEW.usuario_modificacion;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sincronizar_vista_requerimiento ON requerimientos;
CREATE TRIGGER trg_sincronizar_vista_requerimiento
AFTER INSERT OR UPDATE ON requerimientos
FOR EACH ROW
EXECUTE FUNCTION sincronizar_vista_requerimiento();
