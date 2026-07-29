/**
 * Migración 029 — Recepción de Bienes (Ejecución).
 * Relaciona órdenes OC notificadas con recepciones, guías, actas y derivaciones.
 * No duplica la orden: orden_id es FK a ordenes_contratacion.
 */
export default `
CREATE TABLE IF NOT EXISTS recepcion_bienes_expedientes (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL UNIQUE REFERENCES ordenes_contratacion(id),
  requerimiento_id INTEGER NOT NULL,
  estado_global VARCHAR(64) NOT NULL DEFAULT 'RECEPCION_BIENES_PENDIENTE',
  estado_interno VARCHAR(64) NULL,
  bandeja_actual VARCHAR(40) NOT NULL DEFAULT 'ALMACEN',
  actor_responsable VARCHAR(150) NULL,
  actor_responsable_id INTEGER NULL,
  tipo_proceso VARCHAR(80) NULL,
  numero_contrato VARCHAR(120) NULL,
  monto_liquidar_acumulado NUMERIC(18,2) NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_by VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(150) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbe_requerimiento ON recepcion_bienes_expedientes(requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_rbe_estado ON recepcion_bienes_expedientes(estado_global);
CREATE INDEX IF NOT EXISTS idx_rbe_bandeja ON recepcion_bienes_expedientes(bandeja_actual);

CREATE TABLE IF NOT EXISTS recepciones_bienes (
  id SERIAL PRIMARY KEY,
  expediente_recepcion_id INTEGER NOT NULL REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
  orden_id INTEGER NOT NULL REFERENCES ordenes_contratacion(id),
  entrega_programada_id INTEGER NULL,
  numero_entrega INTEGER NULL,
  fecha_recepcion_guia DATE NOT NULL,
  fecha_entrega_almacen DATE NULL,
  monto_calculado NUMERIC(18,2) NULL,
  monto_liquidar NUMERIC(18,2) NOT NULL DEFAULT 0,
  tipo_proceso VARCHAR(80) NULL,
  numero_contrato VARCHAR(120) NULL,
  periodo_inicio DATE NULL,
  periodo_fin DATE NULL,
  observaciones TEXT NULL,
  estado_interno VARCHAR(64) NOT NULL DEFAULT 'REGISTRADA',
  created_by VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(150) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rb_orden ON recepciones_bienes(orden_id);
CREATE INDEX IF NOT EXISTS idx_rb_exp ON recepciones_bienes(expediente_recepcion_id);

CREATE TABLE IF NOT EXISTS recepcion_bienes_guias (
  id SERIAL PRIMARY KEY,
  recepcion_bien_id INTEGER NOT NULL REFERENCES recepciones_bienes(id) ON DELETE CASCADE,
  numero_guia VARCHAR(120) NOT NULL,
  fecha_guia DATE NULL,
  proveedor_id INTEGER NULL,
  documento_nombre VARCHAR(255) NULL,
  documento_mime VARCHAR(120) NULL,
  documento_base64 TEXT NULL,
  created_by VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (recepcion_bien_id, numero_guia)
);

CREATE TABLE IF NOT EXISTS recepcion_bienes_items (
  id SERIAL PRIMARY KEY,
  recepcion_bien_id INTEGER NOT NULL REFERENCES recepciones_bienes(id) ON DELETE CASCADE,
  orden_item_id INTEGER NULL,
  descripcion TEXT NULL,
  cantidad_contratada NUMERIC(18,4) NULL,
  cantidad_recibida NUMERIC(18,4) NOT NULL DEFAULT 0,
  cantidad_observada NUMERIC(18,4) NULL,
  unidad_medida VARCHAR(40) NULL,
  precio_unitario NUMERIC(18,4) NULL,
  importe_recibido NUMERIC(18,2) NULL
);

CREATE TABLE IF NOT EXISTS recepcion_bienes_documentos (
  id SERIAL PRIMARY KEY,
  expediente_recepcion_id INTEGER NOT NULL REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
  recepcion_bien_id INTEGER NULL REFERENCES recepciones_bienes(id) ON DELETE SET NULL,
  tipo VARCHAR(80) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NULL,
  contenido_base64 TEXT NULL,
  fecha_documento DATE NULL,
  version INTEGER NOT NULL DEFAULT 1,
  vigente BOOLEAN NOT NULL DEFAULT TRUE,
  origen VARCHAR(80) NULL,
  observacion TEXT NULL,
  created_by VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbd_exp ON recepcion_bienes_documentos(expediente_recepcion_id);

CREATE TABLE IF NOT EXISTS recepcion_bienes_actas (
  id SERIAL PRIMARY KEY,
  expediente_recepcion_id INTEGER NOT NULL REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
  recepcion_bien_id INTEGER NULL REFERENCES recepciones_bienes(id) ON DELETE SET NULL,
  numero_acta VARCHAR(80) NULL,
  version INTEGER NOT NULL DEFAULT 1,
  estado_documental VARCHAR(64) NOT NULL DEFAULT 'ACTA_RECEPCION_BORRADOR',
  contenido_html TEXT NULL,
  documento_nombre VARCHAR(255) NULL,
  documento_mime VARCHAR(120) NULL,
  documento_base64 TEXT NULL,
  generado_at TIMESTAMP NULL,
  generado_por VARCHAR(150) NULL,
  enviado_au_at TIMESTAMP NULL,
  enviado_au_por VARCHAR(150) NULL,
  destinatario_au VARCHAR(150) NULL,
  destinatario_au_id INTEGER NULL,
  firmado_au_at TIMESTAMP NULL,
  firmado_au_por VARCHAR(150) NULL,
  acta_firmada_nombre VARCHAR(255) NULL,
  acta_firmada_mime VARCHAR(120) NULL,
  acta_firmada_base64 TEXT NULL,
  revisado_almacen_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rba_exp ON recepcion_bienes_actas(expediente_recepcion_id);

CREATE TABLE IF NOT EXISTS recepcion_bienes_derivaciones (
  id SERIAL PRIMARY KEY,
  expediente_recepcion_id INTEGER NOT NULL REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
  origen_rol VARCHAR(40) NOT NULL,
  destino_rol VARCHAR(40) NOT NULL,
  destino_usuario_id INTEGER NULL,
  destino_usuario_nombre VARCHAR(150) NULL,
  accion VARCHAR(80) NOT NULL,
  motivo TEXT NULL,
  estado_anterior VARCHAR(64) NULL,
  estado_nuevo VARCHAR(64) NULL,
  metadata JSONB NULL,
  idempotency_key VARCHAR(120) NULL,
  created_by VARCHAR(150) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (expediente_recepcion_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_rbder_exp ON recepcion_bienes_derivaciones(expediente_recepcion_id);

CREATE TABLE IF NOT EXISTS recepcion_bienes_eventos (
  id SERIAL PRIMARY KEY,
  expediente_recepcion_id INTEGER NOT NULL REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
  orden_id INTEGER NULL,
  tipo VARCHAR(80) NOT NULL,
  estado_anterior VARCHAR(64) NULL,
  estado_nuevo VARCHAR(64) NULL,
  usuario VARCHAR(150) NULL,
  rol VARCHAR(40) NULL,
  motivo TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbev_exp ON recepcion_bienes_eventos(expediente_recepcion_id);
`;
