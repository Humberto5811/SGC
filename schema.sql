-- Tabla principal de glosas
CREATE TABLE glosas_bienes (
  id SERIAL PRIMARY KEY,
  literal VARCHAR(10),
  numero INT,
  titulo TEXT,
  contenido TEXT,
  total_cantidad INT DEFAULT 0,
  fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  usuario_modificacion VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de entregas asociadas a cada glosa
CREATE TABLE glosas_entregas (
  id SERIAL PRIMARY KEY,
  glosa_id INT REFERENCES glosas_bienes(id) ON DELETE CASCADE,
  numero_entrega INT,
  entregable TEXT,
  cantidad INT,
  plazo TEXT,
  condicion TEXT
);

-- Tabla de glosas de servicios
CREATE TABLE glosas_servicios (
  id SERIAL PRIMARY KEY,
  literal VARCHAR(10),
  numero INT,
  titulo TEXT,
  contenido TEXT,
  total_cantidad INT DEFAULT 0,
  fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  usuario_modificacion VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);