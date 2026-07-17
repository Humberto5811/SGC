// RC8.5 — Firma Anexo 8A + metadatos de derivación a CCP
export default `
ALTER TABLE cuadros_comparativos
  ADD COLUMN IF NOT EXISTS firmado_por VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS firmado_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS derivado_por VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS responsable_ccp_id INT NULL,
  ADD COLUMN IF NOT EXISTS responsable_ccp_nombre VARCHAR(200) NULL;
`;
