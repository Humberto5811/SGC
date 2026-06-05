// Migración: Agregar tabla de centros y relación con áreas
export default `
  -- Crear tabla centros si no existe
  CREATE TABLE IF NOT EXISTS centros (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(60),
    nombre VARCHAR(200),
    estado VARCHAR(30) DEFAULT 'Activo',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- Agregar columna centro_id a areas si no existe
  ALTER TABLE areas 
  ADD COLUMN IF NOT EXISTS centro_id INTEGER REFERENCES centros(id) ON DELETE SET NULL;

  -- Crear índice si no existe
  CREATE INDEX IF NOT EXISTS idx_areas_centro_id ON areas (centro_id);
`;
