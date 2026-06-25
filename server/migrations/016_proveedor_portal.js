// Portal externo de proveedores — entidad proveedor_portal y token de invitación
export default `
CREATE TABLE IF NOT EXISTS proveedor_portal (
  id SERIAL PRIMARY KEY,
  proveedor_id INT NOT NULL UNIQUE REFERENCES proveedores(id) ON DELETE CASCADE,
  ruc VARCHAR(11) NOT NULL UNIQUE,
  razon_social VARCHAR(255) NOT NULL DEFAULT '',
  correo VARCHAR(255) DEFAULT '',
  telefono VARCHAR(40) DEFAULT '',
  usuario VARCHAR(20) NOT NULL DEFAULT '',
  usuario_portal VARCHAR(20) NOT NULL DEFAULT '',
  password_temporal VARCHAR(80) DEFAULT '',
  password_hash TEXT,
  primer_ingreso BOOLEAN NOT NULL DEFAULT TRUE,
  estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVO',
  fecha_ultimo_envio TIMESTAMP,
  estado_invitacion VARCHAR(40) DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proveedor_portal_ruc ON proveedor_portal (ruc);
CREATE INDEX IF NOT EXISTS idx_proveedor_portal_usuario ON proveedor_portal (usuario_portal);

ALTER TABLE invitacion_proveedores ADD COLUMN IF NOT EXISTS token_acceso VARCHAR(64) UNIQUE;
ALTER TABLE invitacion_proveedores ADD COLUMN IF NOT EXISTS url_invitacion TEXT DEFAULT '';
ALTER TABLE invitacion_proveedores ADD COLUMN IF NOT EXISTS fecha_ultimo_envio TIMESTAMP;
ALTER TABLE invitacion_proveedores ADD COLUMN IF NOT EXISTS estado_invitacion VARCHAR(40) DEFAULT 'PENDIENTE';

CREATE INDEX IF NOT EXISTS idx_inv_prov_token ON invitacion_proveedores (token_acceso);
`;
