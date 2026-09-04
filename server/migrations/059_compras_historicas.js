/**
 * Migración 059 — RC8.16B: base Compras Históricas (SIGAMEF real).
 * Una fila histórica = un ítem de una orden; cabecera + ítems + auditoría de importación.
 */
export default `
CREATE TABLE IF NOT EXISTS compras_historicas_ordenes (
  id SERIAL PRIMARY KEY,
  anio INTEGER NOT NULL,
  tipo_origen VARCHAR(20) NOT NULL,
  numero_orden VARCHAR(60) NOT NULL,
  fecha_orden DATE,
  mes VARCHAR(20),
  nombre_proveedor TEXT,
  ruc VARCHAR(20),
  monto_total NUMERIC(16,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_compras_hist_orden UNIQUE (anio, tipo_origen, numero_orden)
);

CREATE INDEX IF NOT EXISTS idx_compras_hist_ord_anio
  ON compras_historicas_ordenes (anio);
CREATE INDEX IF NOT EXISTS idx_compras_hist_ord_tipo
  ON compras_historicas_ordenes (tipo_origen);
CREATE INDEX IF NOT EXISTS idx_compras_hist_ord_numero
  ON compras_historicas_ordenes (numero_orden);
CREATE INDEX IF NOT EXISTS idx_compras_hist_ord_fecha
  ON compras_historicas_ordenes (fecha_orden);
CREATE INDEX IF NOT EXISTS idx_compras_hist_ord_proveedor
  ON compras_historicas_ordenes (nombre_proveedor);

CREATE TABLE IF NOT EXISTS compras_historicas_items (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES compras_historicas_ordenes(id) ON DELETE CASCADE,
  codigo_item VARCHAR(60),
  nombre_item TEXT,
  unidad_medida VARCHAR(30),
  centro_costo VARCHAR(60),
  nombre_dependencia TEXT,
  cantidad NUMERIC(16,4),
  precio_unitario NUMERIC(16,4),
  valor_soles NUMERIC(16,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compras_hist_item_orden
  ON compras_historicas_items (orden_id);
CREATE INDEX IF NOT EXISTS idx_compras_hist_item_codigo
  ON compras_historicas_items (codigo_item);
CREATE INDEX IF NOT EXISTS idx_compras_hist_item_nombre
  ON compras_historicas_items (nombre_item);
CREATE INDEX IF NOT EXISTS idx_compras_hist_item_centro
  ON compras_historicas_items (centro_costo);
CREATE INDEX IF NOT EXISTS idx_compras_hist_item_depend
  ON compras_historicas_items (nombre_dependencia);

CREATE TABLE IF NOT EXISTS compras_historicas_importaciones (
  id SERIAL PRIMARY KEY,
  anio INTEGER,
  archivo VARCHAR(300),
  fecha_importacion TIMESTAMP,
  usuario VARCHAR(150),
  filas_leidas INTEGER NOT NULL DEFAULT 0,
  ordenes_nuevas INTEGER NOT NULL DEFAULT 0,
  items_nuevos INTEGER NOT NULL DEFAULT 0,
  duplicados INTEGER NOT NULL DEFAULT 0,
  errores INTEGER NOT NULL DEFAULT 0,
  estado VARCHAR(40),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE compras_historicas_ordenes
  IS 'Cabecera histórica SIGAMEF por orden (TIPO+AÑO+nro_orden); monto_total sumable desde ítems';
COMMENT ON TABLE compras_historicas_items
  IS 'Ítems históricos SIGAMEF vinculados a compras_historicas_ordenes';
COMMENT ON TABLE compras_historicas_importaciones
  IS 'Auditoría de cargas Excel de Compras Históricas (fase import posterior)';
`;
