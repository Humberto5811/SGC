// Tablas de Programación: asociación pedidos + paquetes consolidación
export default `
CREATE TABLE IF NOT EXISTS requerimiento_pedidos (
  id SERIAL PRIMARY KEY,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  pedido_sigamef_id INTEGER NOT NULL REFERENCES pedidos_sigamef(id) ON DELETE CASCADE,
  fecha_registro TIMESTAMP DEFAULT NOW(),
  usuario_registro VARCHAR(150),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(requerimiento_id, pedido_sigamef_id)
);
CREATE INDEX IF NOT EXISTS idx_req_ped_req ON requerimiento_pedidos (requerimiento_id);
CREATE INDEX IF NOT EXISTS idx_req_ped_ped ON requerimiento_pedidos (pedido_sigamef_id);

CREATE TABLE IF NOT EXISTS paquetes_programacion (
  id SERIAL PRIMARY KEY,
  codigo_paquete VARCHAR(20) UNIQUE,
  estado VARCHAR(30) DEFAULT 'Pendiente',
  usuario_creacion VARCHAR(150),
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  usuario_aprobacion VARCHAR(150),
  fecha_aprobacion TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paquete_requerimientos (
  id SERIAL PRIMARY KEY,
  paquete_id INTEGER NOT NULL REFERENCES paquetes_programacion(id) ON DELETE CASCADE,
  requerimiento_id INTEGER NOT NULL REFERENCES requerimientos(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(paquete_id, requerimiento_id)
);
CREATE INDEX IF NOT EXISTS idx_paq_req_paq ON paquete_requerimientos (paquete_id);
CREATE INDEX IF NOT EXISTS idx_paq_req_req ON paquete_requerimientos (requerimiento_id);
`;
