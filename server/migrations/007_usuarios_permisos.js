// Extensión de usuarios: datos completos, permisos JSON y auditoría
export default `
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS apellidos VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombres VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(30);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo VARCHAR(150);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_centro_costo VARCHAR(50);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS descripcion_area VARCHAR(250);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permisos JSONB DEFAULT '{"modulos":[],"submodulos":[],"actividades":[]}'::jsonb;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auditoria JSONB DEFAULT '[]'::jsonb;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario_creacion VARCHAR(100);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario_modificacion VARCHAR(100);
`;
