/**
 * RC9 / OD — Certificación Presupuestal (CCP):
 * códigos digitados, consolidaciones y trazabilidad.
 */
export default `
CREATE TABLE IF NOT EXISTS ccp_codigos (
  id SERIAL PRIMARY KEY,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id),
  solicitud_cotizacion_id INTEGER NULL REFERENCES solicitudes_cotizacion(id),
  codigo_ccp VARCHAR(120) NOT NULL,
  estado VARCHAR(40) NOT NULL DEFAULT 'ACTIVO',
  registrado_por VARCHAR(150) NULL,
  registrado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  modificado_por VARCHAR(150) NULL,
  modificado_at TIMESTAMP NULL,
  eliminado_por VARCHAR(150) NULL,
  eliminado_at TIMESTAMP NULL,
  motivo_eliminacion TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ccp_codigos_activo_req
  ON ccp_codigos (requerimiento_id)
  WHERE estado = 'ACTIVO';

CREATE INDEX IF NOT EXISTS idx_ccp_codigos_codigo
  ON ccp_codigos (codigo_ccp);

CREATE TABLE IF NOT EXISTS ccp_solicitudes (
  id SERIAL PRIMARY KEY,
  codigo_interno VARCHAR(40) NOT NULL UNIQUE,
  estado VARCHAR(60) NOT NULL DEFAULT 'PREPARADA',
  total_monto NUMERIC(18,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(10) NOT NULL DEFAULT 'PEN',
  observacion TEXT NULL,
  creado_por VARCHAR(150) NULL,
  fecha_creacion TIMESTAMP NOT NULL DEFAULT NOW(),
  fecha_envio TIMESTAMP NULL,
  enviado_por VARCHAR(150) NULL,
  actualizado_por VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ccp_solicitud_requerimientos (
  id SERIAL PRIMARY KEY,
  solicitud_id INTEGER NOT NULL REFERENCES ccp_solicitudes(id) ON DELETE CASCADE,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id),
  solicitud_cotizacion_id INTEGER NULL REFERENCES solicitudes_cotizacion(id),
  monto NUMERIC(18,2) NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ccp_sol_req_activo
  ON ccp_solicitud_requerimientos (requerimiento_id)
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_ccp_sol_req_solicitud
  ON ccp_solicitud_requerimientos (solicitud_id);

CREATE TABLE IF NOT EXISTS ccp_eventos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(60) NOT NULL,
  requerimiento_id INTEGER NULL,
  solicitud_id INTEGER NULL,
  codigo_ccp_id INTEGER NULL,
  usuario VARCHAR(150) NULL,
  rol VARCHAR(80) NULL,
  valor_anterior TEXT NULL,
  valor_nuevo TEXT NULL,
  observacion TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccp_eventos_req ON ccp_eventos (requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_ccp_eventos_sol ON ccp_eventos (solicitud_id);
`;
