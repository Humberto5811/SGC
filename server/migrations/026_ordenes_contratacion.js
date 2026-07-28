/**
 * RC9 / OD — Registro de Órdenes (Contrataciones).
 * Tablas propias: NO reutiliza catálogo mantenimiento `ordenes`
 * ni el placeholder Ejecución → Registro de Orden.
 */
export default `
CREATE TABLE IF NOT EXISTS ccp_firmados (
  id SERIAL PRIMARY KEY,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id),
  ccp_codigo_id INTEGER NULL REFERENCES ccp_codigos(id),
  codigo_ccp VARCHAR(120) NOT NULL,
  expediente_sgd_envio VARCHAR(120) NULL,
  fecha_envio_oppm DATE NULL,
  expediente_sgd_retorno VARCHAR(120) NULL,
  fecha_retorno DATE NULL,
  nombre_archivo VARCHAR(300) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  contenido_base64 TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  subido_por VARCHAR(150) NULL,
  subido_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ccp_firmados_activo_req
  ON ccp_firmados (requerimiento_id)
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_ccp_firmados_req
  ON ccp_firmados (requerimiento_id);

CREATE TABLE IF NOT EXISTS ordenes_contratacion (
  id SERIAL PRIMARY KEY,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id),
  solicitud_cotizacion_id INTEGER NULL REFERENCES solicitudes_cotizacion(id),
  cuadro_comparativo_id INTEGER NULL REFERENCES cuadros_comparativos(id),
  ccp_codigo_id INTEGER NULL REFERENCES ccp_codigos(id),
  ccp_firmado_id INTEGER NULL REFERENCES ccp_firmados(id),
  proveedor_id INTEGER NOT NULL,
  tipo_orden VARCHAR(10) NOT NULL,
  numero_orden VARCHAR(80) NOT NULL,
  anio_orden INTEGER NOT NULL,
  fecha_orden DATE NOT NULL,
  moneda VARCHAR(10) NOT NULL DEFAULT 'PEN',
  monto_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  tipo_contratacion VARCHAR(40) NULL,
  regla_inicio_plazo VARCHAR(60) NOT NULL DEFAULT 'INICIO_PLAZO_CONFIRMACION_RECEPCION',
  fecha_base_manual DATE NULL,
  observaciones TEXT NULL,
  estado VARCHAR(60) NOT NULL DEFAULT 'ORDEN_BORRADOR',
  version INTEGER NOT NULL DEFAULT 1,
  cronograma_version INTEGER NOT NULL DEFAULT 1,
  creado_por VARCHAR(150) NULL,
  creado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_por VARCHAR(150) NULL,
  actualizado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  anulado_por VARCHAR(150) NULL,
  anulado_at TIMESTAMP NULL,
  motivo_anulacion TEXT NULL,
  enviado_proveedor_por VARCHAR(150) NULL,
  enviado_proveedor_at TIMESTAMP NULL,
  recibido_proveedor_at TIMESTAMP NULL,
  derivado_ejecucion_por VARCHAR(150) NULL,
  derivado_ejecucion_at TIMESTAMP NULL,
  CONSTRAINT chk_ordenes_contratacion_tipo CHECK (tipo_orden IN ('OC', 'OS')),
  CONSTRAINT chk_ordenes_contratacion_estado CHECK (
    estado IN (
      'REGISTRO_ORDENES',
      'ORDEN_BORRADOR', 'ORDEN_REGISTRADA', 'CRONOGRAMA_DEFINIDO', 'ORDEN_FIRMADA',
      'ORDEN_LISTA_NOTIFICACION',
      'ORDEN_ENVIADA', 'ORDEN_ENVIADA_PENDIENTE_CONFIRMACION', 'ORDEN_NOTIFICADA',
      'ORDEN_RECEPCION_CONFIRMADA', 'ORDEN_EN_EJECUCION', 'EN_EJECUCION',
      'ORDEN_OBSERVADA', 'ORDEN_ANULADA', 'DERIVADO_EJECUCION'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ordenes_contratacion_tipo_numero_anio
  ON ordenes_contratacion (tipo_orden, numero_orden, anio_orden)
  WHERE estado <> 'ORDEN_ANULADA';

CREATE INDEX IF NOT EXISTS idx_ordenes_contratacion_req
  ON ordenes_contratacion (requerimiento_id);

CREATE INDEX IF NOT EXISTS idx_ordenes_contratacion_estado
  ON ordenes_contratacion (estado);

CREATE INDEX IF NOT EXISTS idx_ordenes_contratacion_proveedor
  ON ordenes_contratacion (proveedor_id);

CREATE TABLE IF NOT EXISTS orden_items (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE CASCADE,
  item_adjudicado_ref VARCHAR(80) NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  unidad_medida VARCHAR(60) NULL,
  cantidad NUMERIC(18,4) NOT NULL DEFAULT 0,
  precio_unitario NUMERIC(18,4) NOT NULL DEFAULT 0,
  precio_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(10) NOT NULL DEFAULT 'PEN',
  orden_item INTEGER NOT NULL DEFAULT 1,
  meta VARCHAR(120) NULL,
  fuente_financiamiento VARCHAR(120) NULL,
  especifica_gasto VARCHAR(120) NULL,
  plazo_ofertado_dias INTEGER NULL,
  observaciones_propuesta TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_items_orden ON orden_items (orden_id);

CREATE TABLE IF NOT EXISTS orden_entregas (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE CASCADE,
  numero_entrega INTEGER NOT NULL,
  tipo_entrega VARCHAR(30) NOT NULL DEFAULT 'ENTREGA',
  descripcion TEXT NOT NULL DEFAULT '',
  dias_plazo INTEGER NOT NULL DEFAULT 0,
  tipo_dias VARCHAR(20) NOT NULL DEFAULT 'calendario',
  evento_inicio_plazo VARCHAR(60) NULL,
  fecha_base DATE NULL,
  fecha_maxima DATE NULL,
  lugar_entrega TEXT NULL,
  observaciones TEXT NULL,
  porcentaje NUMERIC(8,4) NULL,
  importe NUMERIC(18,2) NULL,
  estado VARCHAR(40) NOT NULL DEFAULT 'ACTIVO',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_orden_entregas_tipo CHECK (tipo_entrega IN ('ENTREGA', 'ENTREGABLE', 'PRESTACION')),
  CONSTRAINT chk_orden_entregas_dias CHECK (tipo_dias IN ('calendario', 'habiles'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orden_entregas_numero
  ON orden_entregas (orden_id, numero_entrega)
  WHERE estado <> 'ANULADO';

CREATE INDEX IF NOT EXISTS idx_orden_entregas_orden ON orden_entregas (orden_id);

CREATE TABLE IF NOT EXISTS orden_entrega_items (
  id SERIAL PRIMARY KEY,
  orden_entrega_id INTEGER NOT NULL REFERENCES orden_entregas(id) ON DELETE CASCADE,
  orden_item_id INTEGER NOT NULL REFERENCES orden_items(id) ON DELETE CASCADE,
  cantidad NUMERIC(18,4) NOT NULL DEFAULT 0,
  precio_unitario NUMERIC(18,4) NOT NULL DEFAULT 0,
  precio_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  porcentaje NUMERIC(8,4) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_entrega_items_entrega
  ON orden_entrega_items (orden_entrega_id);

CREATE TABLE IF NOT EXISTS orden_documentos (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE CASCADE,
  tipo_documento VARCHAR(60) NOT NULL DEFAULT 'ORDEN_FIRMADA',
  nombre_archivo VARCHAR(300) NOT NULL,
  mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  contenido_base64 TEXT NOT NULL,
  tamanio INTEGER NULL,
  version INTEGER NOT NULL DEFAULT 1,
  firmado BOOLEAN NOT NULL DEFAULT TRUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  subido_por VARCHAR(150) NULL,
  subido_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orden_documentos_activo
  ON orden_documentos (orden_id, tipo_documento)
  WHERE activo = TRUE;

CREATE INDEX IF NOT EXISTS idx_orden_documentos_orden ON orden_documentos (orden_id);

CREATE TABLE IF NOT EXISTS orden_envios_proveedor (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE CASCADE,
  proveedor_id INTEGER NOT NULL,
  documento_version INTEGER NOT NULL DEFAULT 1,
  cronograma_version INTEGER NOT NULL DEFAULT 1,
  correo_destino VARCHAR(300) NULL,
  token_hash VARCHAR(128) NOT NULL,
  token_plain_hint VARCHAR(16) NULL,
  url_acceso TEXT NULL,
  enviado_por VARCHAR(150) NULL,
  enviado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  estado VARCHAR(40) NOT NULL DEFAULT 'ENVIADO',
  intento INTEGER NOT NULL DEFAULT 1,
  error TEXT NULL,
  confirmado_at TIMESTAMP NULL,
  confirmado_ip VARCHAR(80) NULL,
  confirmado_user_agent TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_envios_orden ON orden_envios_proveedor (orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_envios_token ON orden_envios_proveedor (token_hash);
CREATE INDEX IF NOT EXISTS idx_orden_envios_proveedor ON orden_envios_proveedor (proveedor_id);

CREATE TABLE IF NOT EXISTS orden_eventos (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NULL REFERENCES ordenes_contratacion(id) ON DELETE SET NULL,
  requerimiento_id INTEGER NULL,
  tipo_evento VARCHAR(80) NOT NULL,
  estado_anterior VARCHAR(60) NULL,
  estado_nuevo VARCHAR(60) NULL,
  usuario_id VARCHAR(150) NULL,
  rol VARCHAR(80) NULL,
  observacion TEXT NULL,
  datos_json JSONB NULL,
  creado_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orden_eventos_orden ON orden_eventos (orden_id);
CREATE INDEX IF NOT EXISTS idx_orden_eventos_req ON orden_eventos (requerimiento_id);

CREATE TABLE IF NOT EXISTS orden_ejecucion_derivaciones (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ordenes_contratacion(id) ON DELETE CASCADE,
  requerimiento_id INTEGER NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  derivado_por VARCHAR(150) NULL,
  derivado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_orden_ejecucion_derivacion UNIQUE (orden_id)
);
`;
