// Campos adicionales solicitudes de cotización — tipo, ítems y lugares de entrega
export default `
ALTER TABLE solicitudes_cotizacion ADD COLUMN IF NOT EXISTS tipo VARCHAR(40) DEFAULT '';
ALTER TABLE solicitudes_cotizacion ADD COLUMN IF NOT EXISTS detalle_items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE solicitudes_cotizacion ADD COLUMN IF NOT EXISTS lugares_entrega_item JSONB NOT NULL DEFAULT '[]'::jsonb;
`;
