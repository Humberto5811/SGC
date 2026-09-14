/**
 * RC8.17.8B — Equipo funcional UAD (dato organizacional en usuarios).
 */
export default `
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS equipo_uad VARCHAR(30);

COMMENT ON COLUMN usuarios.equipo_uad IS
  'Equipo funcional UAD: PROGRAMACION, CONT_MENORES, PROC_SELECCION, EJEC_CONTRACTUAL, ALMACEN. NULL si no aplica.';

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_equipo_uad;
ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_equipo_uad
  CHECK (
    equipo_uad IS NULL
    OR equipo_uad IN (
      'PROGRAMACION',
      'CONT_MENORES',
      'PROC_SELECCION',
      'EJEC_CONTRACTUAL',
      'ALMACEN'
    )
  );

-- Datos piloto (idempotente; no altera cargo/rol/permisos)
UPDATE usuarios SET equipo_uad = 'PROGRAMACION'
WHERE activo = TRUE
  AND LOWER(TRIM(COALESCE(username, ''))) = 'laguilar';

UPDATE usuarios SET equipo_uad = 'CONT_MENORES'
WHERE activo = TRUE
  AND LOWER(TRIM(COALESCE(username, ''))) = 'wrodriguez';

UPDATE usuarios SET equipo_uad = NULL
WHERE activo = TRUE
  AND LOWER(TRIM(COALESCE(username, ''))) = 'lespinoza';
`;
