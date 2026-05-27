import db from './src/database/db.js';

async function test() {
  try {
    const result = await db.query('SELECT NOW() as ahora');
    console.log('✅ Conexión exitosa:', result.rows[0]);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();