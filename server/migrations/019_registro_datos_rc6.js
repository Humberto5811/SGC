// RC6 — Registro de Datos: pedido_sigamef, auditoría de importaciones, índices UPSERT
export default `
-- Campo operativo Pedido SIGAMEF
ALTER TABLE pedidos_sigamef ADD COLUMN IF NOT EXISTS pedido_sigamef VARCHAR(50);

UPDATE pedidos_sigamef SET pedido_sigamef = CASE
  WHEN UPPER(LEFT(COALESCE(tipo, ''), 1)) = 'B' AND TRIM(COALESCE(nro_pedido, '')) <> '' THEN 'PB-' || TRIM(nro_pedido)
  WHEN UPPER(LEFT(COALESCE(tipo, ''), 1)) = 'S' AND TRIM(COALESCE(nro_pedido, '')) <> '' THEN 'PS-' || TRIM(nro_pedido)
  WHEN UPPER(LEFT(COALESCE(tipo, ''), 1)) = 'L' AND TRIM(COALESCE(nro_pedido, '')) <> '' THEN 'PL-' || TRIM(nro_pedido)
  WHEN TRIM(COALESCE(nro_pedido, '')) <> '' THEN 'P-' || TRIM(nro_pedido)
  ELSE pedido_sigamef
END
WHERE pedido_sigamef IS NULL OR TRIM(pedido_sigamef) = '';

-- Desduplicar códigos generados (datos históricos con mismo tipo+nro_pedido)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY pedido_sigamef ORDER BY id) AS rn
  FROM pedidos_sigamef
  WHERE pedido_sigamef IS NOT NULL AND TRIM(pedido_sigamef) <> ''
)
UPDATE pedidos_sigamef p
SET pedido_sigamef = p.pedido_sigamef || '-DUP-' || p.id::text
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_pedido_sigamef_uq
  ON pedidos_sigamef (pedido_sigamef)
  WHERE pedido_sigamef IS NOT NULL AND TRIM(pedido_sigamef) <> '';

-- Auditoría de importaciones
CREATE TABLE IF NOT EXISTS importaciones_audit (
  id SERIAL PRIMARY KEY,
  catalogo VARCHAR(80) NOT NULL,
  usuario VARCHAR(150) DEFAULT 'Sistema',
  archivo VARCHAR(300) DEFAULT '',
  registros_leidos INTEGER DEFAULT 0,
  insertados INTEGER DEFAULT 0,
  actualizados INTEGER DEFAULT 0,
  omitidos INTEGER DEFAULT 0,
  errores_count INTEGER DEFAULT 0,
  duracion_ms INTEGER DEFAULT 0,
  detalle_errores JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_audit_catalogo ON importaciones_audit (catalogo, created_at DESC);

-- Claves naturales para UPSERT en catálogos maestros
WITH cat_ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY item_bien ORDER BY id) AS rn
  FROM catalogo_sigamef
  WHERE item_bien IS NOT NULL AND TRIM(item_bien) <> ''
)
UPDATE catalogo_sigamef c
SET item_bien = c.item_bien || '-DUP-' || c.id::text
FROM cat_ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogo_item_bien_uq
  ON catalogo_sigamef (item_bien)
  WHERE item_bien IS NOT NULL AND TRIM(item_bien) <> '';

WITH fn_ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY idcartcodigosiga ORDER BY id) AS rn
  FROM ficha_net
  WHERE idcartcodigosiga IS NOT NULL AND TRIM(idcartcodigosiga) <> ''
)
UPDATE ficha_net f
SET idcartcodigosiga = f.idcartcodigosiga || '-DUP-' || f.id::text
FROM fn_ranked r
WHERE f.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fichanet_codigo_siga_uq
  ON ficha_net (idcartcodigosiga)
  WHERE idcartcodigosiga IS NOT NULL AND TRIM(idcartcodigosiga) <> '';

WITH metas_ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY codigo ORDER BY id) AS rn
  FROM metas
  WHERE codigo IS NOT NULL AND TRIM(codigo) <> ''
)
UPDATE metas m
SET codigo = m.codigo || '-DUP-' || m.id::text
FROM metas_ranked r
WHERE m.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_metas_codigo_uq
  ON metas (codigo)
  WHERE codigo IS NOT NULL AND TRIM(codigo) <> '';

WITH areas_ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY codigo ORDER BY id) AS rn
  FROM areas
  WHERE codigo IS NOT NULL AND TRIM(codigo) <> ''
)
UPDATE areas a
SET codigo = a.codigo || '-DUP-' || a.id::text
FROM areas_ranked r
WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_areas_codigo_uq
  ON areas (codigo)
  WHERE codigo IS NOT NULL AND TRIM(codigo) <> '';

WITH ord_ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY numero ORDER BY id) AS rn
  FROM ordenes
  WHERE numero IS NOT NULL AND TRIM(numero) <> ''
)
UPDATE ordenes o
SET numero = o.numero || '-DUP-' || o.id::text
FROM ord_ranked r
WHERE o.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ordenes_numero_uq
  ON ordenes (numero)
  WHERE numero IS NOT NULL AND TRIM(numero) <> '';

WITH cfg_ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY objeto, nombre ORDER BY id) AS rn
  FROM configuracion_doc
  WHERE objeto IS NOT NULL AND TRIM(objeto) <> '' AND nombre IS NOT NULL AND TRIM(nombre) <> ''
)
UPDATE configuracion_doc c
SET nombre = c.nombre || '-DUP-' || c.id::text
FROM cfg_ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_config_doc_obj_nombre_uq
  ON configuracion_doc (objeto, nombre)
  WHERE objeto IS NOT NULL AND TRIM(objeto) <> '' AND nombre IS NOT NULL AND TRIM(nombre) <> '';
`;
