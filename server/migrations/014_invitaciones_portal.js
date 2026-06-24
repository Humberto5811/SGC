// Invitaciones, Portal de Proveedores, consultas, cotizaciones y validaciones
export default `
CREATE TABLE IF NOT EXISTS proveedores (
  id SERIAL PRIMARY KEY,
  ruc VARCHAR(11) NOT NULL UNIQUE,
  razon_social VARCHAR(255) NOT NULL DEFAULT '',
  telefono VARCHAR(40) DEFAULT '',
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  rnp_estado VARCHAR(40) DEFAULT 'VIGENTE',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proveedor_acceso (
  id SERIAL PRIMARY KEY,
  proveedor_id INT NOT NULL UNIQUE REFERENCES proveedores(id) ON DELETE CASCADE,
  password_hash TEXT,
  debe_cambiar_password BOOLEAN NOT NULL DEFAULT TRUE,
  clave_temporal VARCHAR(80),
  clave_temporal_expira TIMESTAMP,
  ultimo_acceso TIMESTAMP,
  ultimo_ip VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solicitudes_cotizacion (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  anio INT NOT NULL,
  correlativo INT NOT NULL,
  sigla_entidad VARCHAR(20) DEFAULT 'INS',
  estado VARCHAR(40) NOT NULL DEFAULT 'BORRADOR',
  objeto TEXT DEFAULT '',
  area_usuaria VARCHAR(200) DEFAULT '',
  cmn VARCHAR(80) DEFAULT '',
  denominacion TEXT DEFAULT '',
  tipo_evaluacion VARCHAR(80) DEFAULT '',
  consultas_inicio TIMESTAMP,
  consultas_fin TIMESTAMP,
  cotizaciones_inicio TIMESTAMP,
  cotizaciones_fin TIMESTAMP,
  lugar_entrega TEXT DEFAULT '',
  docs_convocatoria JSONB NOT NULL DEFAULT '[]'::jsonb,
  docs_solicitados JSONB NOT NULL DEFAULT '[]'::jsonb,
  requisitos_tecnicos JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsable VARCHAR(200) DEFAULT '',
  created_by VARCHAR(150) DEFAULT '',
  fecha_publicacion TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_cotizacion_estado ON solicitudes_cotizacion (estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_cotizacion_anio ON solicitudes_cotizacion (anio, correlativo);

CREATE TABLE IF NOT EXISTS solicitud_requerimientos (
  solicitud_id INT NOT NULL REFERENCES solicitudes_cotizacion(id) ON DELETE CASCADE,
  requerimiento_id INT NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  PRIMARY KEY (solicitud_id, requerimiento_id)
);

CREATE INDEX IF NOT EXISTS idx_solicitud_req_requerimiento ON solicitud_requerimientos (requerimiento_id);

CREATE TABLE IF NOT EXISTS invitacion_proveedores (
  id SERIAL PRIMARY KEY,
  solicitud_id INT REFERENCES solicitudes_cotizacion(id) ON DELETE SET NULL,
  requerimiento_id INT NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  estado VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
  correos JSONB NOT NULL DEFAULT '[]'::jsonb,
  fecha_envio TIMESTAMP,
  fecha_apertura_correo TIMESTAMP,
  usuario_portal VARCHAR(20),
  clave_temporal VARCHAR(80),
  historial JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (requerimiento_id, proveedor_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_prov_requerimiento ON invitacion_proveedores (requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_inv_prov_proveedor ON invitacion_proveedores (proveedor_id);

CREATE TABLE IF NOT EXISTS consultas_proveedor (
  id SERIAL PRIMARY KEY,
  solicitud_id INT NOT NULL REFERENCES solicitudes_cotizacion(id) ON DELETE CASCADE,
  proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  requerimiento_id INT REFERENCES requerimientos(id) ON DELETE SET NULL,
  asunto VARCHAR(300) NOT NULL DEFAULT '',
  consulta TEXT NOT NULL DEFAULT '',
  adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  respuesta TEXT DEFAULT '',
  respuesta_adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb,
  absolucion_publica BOOLEAN NOT NULL DEFAULT FALSE,
  responsable_actual VARCHAR(150) DEFAULT '',
  historial JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultas_solicitud ON consultas_proveedor (solicitud_id);
CREATE INDEX IF NOT EXISTS idx_consultas_estado ON consultas_proveedor (estado);

CREATE TABLE IF NOT EXISTS observaciones_proveedor (
  id SERIAL PRIMARY KEY,
  solicitud_id INT NOT NULL REFERENCES solicitudes_cotizacion(id) ON DELETE CASCADE,
  proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  requerimiento_id INT REFERENCES requerimientos(id) ON DELETE SET NULL,
  asunto VARCHAR(300) NOT NULL DEFAULT '',
  observacion TEXT NOT NULL DEFAULT '',
  adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  respuesta TEXT DEFAULT '',
  responsable_actual VARCHAR(150) DEFAULT '',
  historial JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cotizaciones_proveedor (
  id SERIAL PRIMARY KEY,
  solicitud_id INT NOT NULL REFERENCES solicitudes_cotizacion(id) ON DELETE CASCADE,
  proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  requerimiento_id INT REFERENCES requerimientos(id) ON DELETE SET NULL,
  estado VARCHAR(40) NOT NULL DEFAULT 'BORRADOR',
  propuesta_tecnica JSONB,
  propuesta_economica JSONB,
  anexos JSONB NOT NULL DEFAULT '[]'::jsonb,
  certificados JSONB NOT NULL DEFAULT '[]'::jsonb,
  fecha_presentacion TIMESTAMP,
  validacion_estado VARCHAR(40) DEFAULT '',
  validacion_observacion TEXT DEFAULT '',
  validacion_informe JSONB,
  validacion_responsable VARCHAR(150) DEFAULT '',
  historial JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (solicitud_id, proveedor_id)
);

CREATE TABLE IF NOT EXISTS ampliaciones_plazo (
  id SERIAL PRIMARY KEY,
  solicitud_id INT NOT NULL REFERENCES solicitudes_cotizacion(id) ON DELETE CASCADE,
  tipo VARCHAR(40) NOT NULL DEFAULT 'CRONOGRAMA',
  campo VARCHAR(40) NOT NULL DEFAULT 'cotizaciones_fin',
  nueva_fecha TIMESTAMP NOT NULL,
  motivo TEXT NOT NULL DEFAULT '',
  usuario VARCHAR(150) DEFAULT '',
  notificado BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trazabilidad_portal (
  id SERIAL PRIMARY KEY,
  solicitud_id INT REFERENCES solicitudes_cotizacion(id) ON DELETE SET NULL,
  proveedor_id INT REFERENCES proveedores(id) ON DELETE SET NULL,
  requerimiento_id INT REFERENCES requerimientos(id) ON DELETE SET NULL,
  evento VARCHAR(80) NOT NULL,
  detalle TEXT DEFAULT '',
  usuario VARCHAR(150) DEFAULT '',
  ip VARCHAR(64) DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traza_portal_solicitud ON trazabilidad_portal (solicitud_id);
`;
