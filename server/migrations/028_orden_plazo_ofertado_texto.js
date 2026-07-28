/**
 * OD37 — Plazo ofertado alfanumérico en ítems de orden.
 */
export default `
ALTER TABLE orden_items
  ADD COLUMN IF NOT EXISTS plazo_ofertado TEXT NULL;
`;
