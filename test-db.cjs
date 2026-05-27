const db = require('./src/database/db.js');

async function test() {
  try {
    const result = await db.query('SELECT NOW()');
    console.log('✅ Conexión exitosa:', result.rows[0]);
  } catch (error) {
    console.error('❌ Error de conexión:', error);
  }
}

test();