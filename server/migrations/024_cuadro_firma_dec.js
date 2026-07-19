// RC8.6 — PDF firmado por el DEC (aparte del firmado del Coordinador)
export default `
ALTER TABLE cuadros_comparativos
  ADD COLUMN IF NOT EXISTS firmado_dec_nombre VARCHAR(300) NULL,
  ADD COLUMN IF NOT EXISTS firmado_dec_contenido TEXT NULL,
  ADD COLUMN IF NOT EXISTS firmado_dec_por VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS firmado_dec_at TIMESTAMP NULL;
`;
