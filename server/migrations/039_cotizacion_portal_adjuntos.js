/**
 * 039 — Adjuntos de cotización portal (metadatos en JSON, binario en tabla).
 */
export default `
CREATE TABLE IF NOT EXISTS cotizaciones_proveedor_adjuntos (
  id SERIAL PRIMARY KEY,
  solicitud_id INT NOT NULL REFERENCES solicitudes_cotizacion(id) ON DELETE CASCADE,
  proveedor_id INT NOT NULL REFERENCES proveedores(id) ON DELETE CASCADE,
  cotizacion_id INT NULL REFERENCES cotizaciones_proveedor(id) ON DELETE SET NULL,
  slot_key TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'docs_solicitados',
  nombre_archivo TEXT NOT NULL,
  mime_type TEXT,
  contenido_base64 TEXT NOT NULL,
  tamaño_bytes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cot_portal_adj_slot
  ON cotizaciones_proveedor_adjuntos (solicitud_id, proveedor_id, slot_key);

CREATE INDEX IF NOT EXISTS idx_cot_portal_adj_solicitud
  ON cotizaciones_proveedor_adjuntos (solicitud_id, proveedor_id);

CREATE INDEX IF NOT EXISTS idx_cot_portal_adj_cotizacion
  ON cotizaciones_proveedor_adjuntos (cotizacion_id);
`;
