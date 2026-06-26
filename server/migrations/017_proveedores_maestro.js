// Maestro de Proveedores — campos institucionales y trazabilidad
export default `
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS direccion VARCHAR(500) DEFAULT '';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS correo VARCHAR(255) DEFAULT '';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS persona_contacto VARCHAR(200) DEFAULT '';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS rubro VARCHAR(80) DEFAULT '';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'Activo';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(40) DEFAULT 'Registro Manual';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS ultima_participacion TIMESTAMP;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cantidad_invitaciones INT NOT NULL DEFAULT 0;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS cantidad_cotizaciones INT NOT NULL DEFAULT 0;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS historial JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

UPDATE proveedores SET correo = COALESCE(NULLIF(correo, ''), emails->>0, '')
  WHERE correo IS NULL OR correo = '';

UPDATE proveedores SET estado = CASE WHEN activo = FALSE THEN 'Inactivo' ELSE 'Activo' END
  WHERE estado IS NULL OR estado = '';

CREATE INDEX IF NOT EXISTS idx_proveedores_ruc ON proveedores (ruc);
CREATE INDEX IF NOT EXISTS idx_proveedores_razon ON proveedores (razon_social);
CREATE INDEX IF NOT EXISTS idx_proveedores_rubro ON proveedores (rubro);
CREATE INDEX IF NOT EXISTS idx_proveedores_estado ON proveedores (estado);
`;
