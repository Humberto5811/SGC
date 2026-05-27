// Migración para crear la tabla de catálogos IGAMEF (PostgreSQL)
exports.up = async function(db) {
  const query = `
    CREATE TABLE IF NOT EXISTS catalogos_igamef (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(50) NOT NULL UNIQUE,
      nombre VARCHAR(200) NOT NULL,
      descripcion TEXT,
      activo BOOLEAN DEFAULT TRUE,
      orden INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_catalogos_igamef_codigo ON catalogos_igamef(codigo);
    CREATE INDEX IF NOT EXISTS idx_catalogos_igamef_activo ON catalogos_igamef(activo);
  `;
  
  await db.query(query);
  console.log('   Tabla catalogos_igamef creada/verificada');
};

exports.down = async function(db) {
  const query = `DROP TABLE IF EXISTS catalogos_igamef`;
  await db.query(query);
  console.log('   Tabla catalogos_igamef eliminada');
};