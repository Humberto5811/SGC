const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'sgc_db',
  user: 'postgres',
  password: 'postgres',
});

async function test() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexión exitosa a la base de datos SGC');
    console.log('📅 Fecha y hora del servidor:', result.rows[0].now);
    console.log('🎉 Todo funciona correctamente!');
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
  } finally {
    await pool.end();
  }
}

test();