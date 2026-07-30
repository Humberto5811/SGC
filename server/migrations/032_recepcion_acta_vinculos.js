/**
 * Migración 032 — Vínculos Orden–Ítem–Entrega–Recepción del Acta + baja lógica.
 */
export default `
ALTER TABLE recepcion_bienes_actas
  ADD COLUMN IF NOT EXISTS orden_item_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS orden_entrega_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS monto_entregable NUMERIC(14,2) NULL,
  ADD COLUMN IF NOT EXISTS corresponde_penalidad BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS lugar_entrega TEXT NULL,
  ADD COLUMN IF NOT EXISTS observacion_acta TEXT NULL,
  ADD COLUMN IF NOT EXISTS eliminado_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS eliminado_por VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS eliminado_motivo TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_rba_item ON recepcion_bienes_actas(orden_item_id);
CREATE INDEX IF NOT EXISTS idx_rba_entrega ON recepcion_bienes_actas(orden_entrega_id);
CREATE INDEX IF NOT EXISTS idx_rba_recepcion ON recepcion_bienes_actas(recepcion_bien_id);
`;
