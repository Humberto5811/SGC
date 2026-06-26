// Contador de envíos de solicitud de cotización e historial de proveedor
export default `
ALTER TABLE solicitudes_cotizacion ADD COLUMN IF NOT EXISTS contador_envios INT NOT NULL DEFAULT 0;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS nombre_comercial VARCHAR(255) DEFAULT '';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cantidad_cotizaciones INT NOT NULL DEFAULT 0;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ultima_invitacion TIMESTAMP;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ultima_cotizacion TIMESTAMP;
`;
