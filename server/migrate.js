// Ejecuta el esquema (idempotente) y siembra usuarios por defecto.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import bcrypt from 'bcrypt';
import pool, { query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_USERS = [
  { dni: 'admin', nombre: 'Administrador', rol: 'admin', email: 'admin@sgc.pe', password: 'admin' },
  { dni: 'au', nombre: 'Usuario AU', rol: 'au', email: 'au@sgc.pe', password: 'au' },
  { dni: 'dec', nombre: 'Usuario DEC', rol: 'dec', email: 'dec@sgc.pe', password: 'dec' },
];

export async function runMigrations() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
  console.log('[db] Esquema aplicado correctamente.');

  // Ejecutar migraciones adicionales definidas en server/migrations
  const migrationsDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.js'))
      .sort();

    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      const migrationModule = await import(pathToFileURL(migrationPath).href);
      const sql = migrationModule.default;
      if (sql && typeof sql === 'string') {
        await query(sql);
        console.log(`[db] Migración aplicada: ${file}`);
      }
    }
  }

  for (const u of DEFAULT_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await query(
      `INSERT INTO usuarios (dni, nombre, rol, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (dni) DO NOTHING`,
      [u.dni, u.nombre, u.rol, u.email, hash]
    );
  }
  console.log('[db] Usuarios por defecto verificados.');

  // Asegura un registro de entidad
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM entidad');
  if (rows[0].n === 0) {
    await query(
      `INSERT INTO entidad (ruc, nombre, siglas) VALUES ($1, $2, $3)`,
      ['', 'Entidad del Estado', 'SGC']
    );
  }
}

// Permite ejecutarlo directamente: `node server/migrate.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => { console.log('[db] Migración completa.'); return pool.end(); })
    .then(() => process.exit(0))
    .catch((err) => { console.error('[db] Error en migración:', err); process.exit(1); });
}
