// RC8.4 — Estados de revisión institucional del Cuadro Comparativo
export default `
ALTER TABLE cuadros_comparativos DROP CONSTRAINT IF EXISTS chk_cuadros_estado;

ALTER TABLE cuadros_comparativos
  ADD CONSTRAINT chk_cuadros_estado CHECK (
    estado IN (
      'BORRADOR',
      'EN_ELABORACION',
      'CUADRO_BORRADOR',
      'GENERADO',
      'GENERADO_PRELIMINAR',
      'ADJUDICADO',
      'OBSERVADO',
      'PENDIENTE_COORDINADOR',
      'OBSERVADO_COORDINADOR',
      'FIRMADO_COORDINADOR',
      'PENDIENTE_DEC',
      'OBSERVADO_DEC',
      'APROBADO_DEC',
      'PENDIENTE_CCP',
      'FIRMADO',
      'DERIVADO_CCP',
      'ANULADO'
    )
  );
`;
