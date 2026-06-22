// Trazabilidad de expedientes + campos de asignación en requerimientos
export default `
CREATE TABLE IF NOT EXISTS trazabilidad_expedientes (
  id SERIAL PRIMARY KEY,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  accion VARCHAR(50) NOT NULL,
  origen VARCHAR(100),
  destino VARCHAR(100),
  usuario_origen VARCHAR(150),
  usuario_destino VARCHAR(150),
  observacion TEXT,
  fecha TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_traz_req ON trazabilidad_expedientes (requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_traz_fecha ON trazabilidad_expedientes (fecha DESC);

ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS submodulo_actual VARCHAR(100) DEFAULT '';
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS responsable_actual VARCHAR(150) DEFAULT '';
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS fecha_estado_actual TIMESTAMP;
`;
