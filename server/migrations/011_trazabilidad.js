// Trazabilidad transversal de expedientes / requerimientos
export default `
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS estado_actual VARCHAR(60);
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS responsable_actual VARCHAR(200);
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS fecha_estado_actual TIMESTAMP;
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS historial_estados JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_requerimientos_estado_actual ON requerimientos (estado_actual);
CREATE INDEX IF NOT EXISTS idx_requerimientos_responsable_actual ON requerimientos (responsable_actual);
`;
