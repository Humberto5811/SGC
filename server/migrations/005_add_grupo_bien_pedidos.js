// Agrega columna grupo_bien a pedidos_sigamef si no existe
export default `
ALTER TABLE pedidos_sigamef ADD COLUMN IF NOT EXISTS grupo_bien VARCHAR(100) DEFAULT '';
`;
