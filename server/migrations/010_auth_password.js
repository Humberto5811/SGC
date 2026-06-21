// Autenticación: username, cambio obligatorio de contraseña, auditoría de acceso
export default `
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username VARCHAR(60);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_cambio_password TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS fecha_reset_password TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario_reset_password VARCHAR(100);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso TIMESTAMP;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_cierre_sesion TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios (LOWER(username)) WHERE username IS NOT NULL AND TRIM(username) <> '';

UPDATE usuarios SET username = dni WHERE username IS NULL OR TRIM(username) = '';
UPDATE usuarios SET debe_cambiar_password = FALSE WHERE debe_cambiar_password IS NULL;
`;
