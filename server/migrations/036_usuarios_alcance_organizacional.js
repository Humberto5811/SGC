/**
 * Migración 036 — Alcance organizacional de datos (centro / centro de costo).
 * No altera el correlativo institucional REQ-{id}.
 */
export default `
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS alcance_datos VARCHAR(40);

COMMENT ON COLUMN usuarios.alcance_datos IS
  'CENTRO_COSTO | CENTRO | PERSONALIZADO | INSTITUCIONAL. NULL = inferido por cargo/rol.';

CREATE TABLE IF NOT EXISTS usuarios_alcance_asignaciones (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('CENTRO', 'CENTRO_COSTO')),
  centro_id INTEGER NULL REFERENCES centros(id) ON DELETE CASCADE,
  area_id INTEGER NULL REFERENCES areas(id) ON DELETE CASCADE,
  codigo_centro_costo VARCHAR(50) NULL,
  vigente BOOLEAN NOT NULL DEFAULT TRUE,
  eliminado_at TIMESTAMP NULL,
  vigente_desde DATE NULL,
  vigente_hasta DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(150) NULL,
  observacion TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_uaa_usuario
  ON usuarios_alcance_asignaciones (usuario_id)
  WHERE vigente = TRUE AND eliminado_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_uaa_centro
  ON usuarios_alcance_asignaciones (centro_id)
  WHERE vigente = TRUE AND eliminado_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_uaa_area
  ON usuarios_alcance_asignaciones (area_id)
  WHERE vigente = TRUE AND eliminado_at IS NULL;
`;
