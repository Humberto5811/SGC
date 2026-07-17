// RC8.2 — Persistencia Cuadro Comparativo (matriz Bienes)
export default `
CREATE TABLE IF NOT EXISTS cuadros_comparativos (
  id SERIAL PRIMARY KEY,
  solicitud_id INT NOT NULL REFERENCES solicitudes_cotizacion(id) ON DELETE CASCADE,
  tipo VARCHAR(40) NOT NULL DEFAULT 'BIENES',
  version INT NOT NULL DEFAULT 1,
  estado VARCHAR(40) NOT NULL DEFAULT 'BORRADOR',
  datos_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  proveedor_ganador_id INT NULL,
  criterio_seleccion TEXT NULL,
  sustento_decision TEXT NULL,
  pdf_nombre VARCHAR(300) NULL,
  pdf_contenido TEXT NULL,
  firmado_nombre VARCHAR(300) NULL,
  firmado_contenido TEXT NULL,
  creado_por VARCHAR(150) DEFAULT '',
  actualizado_por VARCHAR(150) DEFAULT '',
  creado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_at TIMESTAMP NOT NULL DEFAULT NOW(),
  derivado_at TIMESTAMP NULL,
  CONSTRAINT chk_cuadros_estado CHECK (
    estado IN ('BORRADOR', 'EN_ELABORACION', 'GENERADO', 'FIRMADO', 'DERIVADO_CCP', 'ANULADO')
  ),
  CONSTRAINT uq_cuadros_solicitud_tipo_version UNIQUE (solicitud_id, tipo, version)
);

CREATE INDEX IF NOT EXISTS idx_cuadros_solicitud ON cuadros_comparativos (solicitud_id, tipo, version DESC);
CREATE INDEX IF NOT EXISTS idx_cuadros_estado ON cuadros_comparativos (estado);

-- Una versión no anulada "activa" editable por solicitud+tipo (GENERADO/FIRMADO/DERIVADO también únicos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_cuadros_activo_solicitud_tipo
  ON cuadros_comparativos (solicitud_id, tipo)
  WHERE estado <> 'ANULADO';
`;
