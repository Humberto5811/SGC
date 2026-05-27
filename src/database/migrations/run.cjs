// Script para ejecutar migraciones (CommonJS - PostgreSQL)
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Configuración desde connection.js
const dbConfig = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'sgc_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(dbConfig);

async function runMigrations() {
  console.log('🔄 Conectando a PostgreSQL...');
  console.log(`📌 Base de datos: ${dbConfig.database}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  try {
    // Probar conexión
    const client = await pool.connect();
    console.log('✅ Conexión establecida correctamente');
    client.release();
    
    // Obtener todas las migraciones
    const migrationsDir = __dirname;
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.cjs') && f !== 'run.cjs')
      .sort();
    
    console.log(`📋 Migraciones encontradas: ${files.length}`);
    
    for (const file of files) {
      console.log(`\n📝 Ejecutando: ${file}`);
      
      // Limpiar caché para recargar el archivo
      delete require.cache[require.resolve(path.join(migrationsDir, file))];
      const migration = require(path.join(migrationsDir, file));
      
      if (migration.up) {
        await migration.up(pool);
        console.log(`   ✅ Completado: ${file}`);
      } else {
        console.log(`   ⚠️  El archivo ${file} no tiene función up(), se omite`);
      }
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TODAS LAS MIGRACIONES COMPLETADAS');
    
  } catch (error) {
    console.error('\n❌ ERROR ejecutando migraciones:');
    console.error(error.message);
  } finally {
    await pool.end();
    console.log('🔌 Conexión cerrada');
  }
}

console.log('🚀 Iniciando migraciones...\n');
console.log('Configuración:');
console.log(`   Host: ${dbConfig.host}`);
console.log(`   Puerto: ${dbConfig.port}`);
console.log(`   Usuario: ${dbConfig.user}`);
console.log(`   Base de datos: ${dbConfig.database}\n`);

runMigrations();