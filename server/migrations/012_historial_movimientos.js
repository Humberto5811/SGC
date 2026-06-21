// Bitácora append-only de movimientos + submódulo actual
export default `
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS sub_modulo_actual VARCHAR(120);
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS historial_movimientos JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_requerimientos_sub_modulo ON requerimientos (sub_modulo_actual);
`;
