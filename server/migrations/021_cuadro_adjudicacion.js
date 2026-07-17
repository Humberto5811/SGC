// RC8.3 — Adjudicación Cuadro Comparativo (estados + columnas)
export default `
ALTER TABLE cuadros_comparativos DROP CONSTRAINT IF EXISTS chk_cuadros_estado;

ALTER TABLE cuadros_comparativos
  ADD COLUMN IF NOT EXISTS valor_adjudicado NUMERIC(18,2) NULL,
  ADD COLUMN IF NOT EXISTS usuario_adjudicacion VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS fecha_adjudicacion TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS modalidad_adjudicacion VARCHAR(40) NULL;

ALTER TABLE cuadros_comparativos
  ADD CONSTRAINT chk_cuadros_estado CHECK (
    estado IN (
      'BORRADOR',
      'EN_ELABORACION',
      'GENERADO',
      'GENERADO_PRELIMINAR',
      'ADJUDICADO',
      'OBSERVADO',
      'FIRMADO',
      'DERIVADO_CCP',
      'ANULADO'
    )
  );
`;
