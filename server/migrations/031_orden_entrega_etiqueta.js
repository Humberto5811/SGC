/**
 * Migración 031 — Etiqueta contractual de entregas (ÚNICO, etc.).
 * Conserva numero_entrega como identificador secuencial.
 */
export default `
ALTER TABLE orden_entregas
  ADD COLUMN IF NOT EXISTS etiqueta_entrega VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS codigo_entrega VARCHAR(40) NULL;

COMMENT ON COLUMN orden_entregas.etiqueta_entrega IS 'Etiqueta contractual visible (ej. ÚNICO, PRIMER ENTREGABLE)';
COMMENT ON COLUMN orden_entregas.codigo_entrega IS 'Código técnico normalizado (ej. UNICO, E1)';

-- Backfill histórico: entrega única → ÚNICO
UPDATE orden_entregas oe
SET
  codigo_entrega = COALESCE(NULLIF(oe.codigo_entrega, ''), 'UNICO'),
  etiqueta_entrega = COALESCE(NULLIF(TRIM(oe.etiqueta_entrega), ''), 'ÚNICO')
WHERE oe.estado <> 'ANULADO'
  AND oe.numero_entrega = 1
  AND oe.orden_id IN (
    SELECT orden_id FROM orden_entregas
    WHERE estado <> 'ANULADO'
    GROUP BY orden_id
    HAVING COUNT(*) = 1
  )
  AND (
    oe.descripcion ILIKE '%única%'
    OR oe.descripcion ILIKE '%unica%'
    OR oe.descripcion ILIKE '%único%'
    OR oe.descripcion ILIKE '%unico%'
    OR COALESCE(TRIM(oe.descripcion), '') = ''
    OR oe.descripcion ILIKE 'Entrega 1'
    OR oe.descripcion ILIKE 'Entregable 1'
  );

-- Resto: etiqueta = descripción o fallback Entrega N
UPDATE orden_entregas
SET
  etiqueta_entrega = COALESCE(
    NULLIF(TRIM(etiqueta_entrega), ''),
    NULLIF(TRIM(descripcion), ''),
    'Entrega ' || numero_entrega::text
  ),
  codigo_entrega = COALESCE(
    NULLIF(TRIM(codigo_entrega), ''),
    'E' || numero_entrega::text
  )
WHERE estado <> 'ANULADO'
  AND (etiqueta_entrega IS NULL OR TRIM(etiqueta_entrega) = '');

CREATE INDEX IF NOT EXISTS idx_orden_entregas_etiqueta
  ON orden_entregas (orden_id, etiqueta_entrega);
`;
