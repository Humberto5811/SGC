// Sistema de migraciones versionado (estilo Flyway/Liquibase).
// Flujo: schema.sql → schema_migrations → migraciones pendientes (una sola vez cada una).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import bcrypt from 'bcrypt';
import pool, { query } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const DEFAULT_USERS = [
  { dni: 'admin', nombre: 'Administrador', rol: 'admin', email: 'admin@sgc.pe', password: 'admin' },
  { dni: 'au', nombre: 'Usuario AU', rol: 'au', email: 'au@sgc.pe', password: 'au' },
  { dni: 'dec', nombre: 'Usuario DEC', rol: 'dec', email: 'dec@sgc.pe', password: 'dec' },
];

async function applyBaseSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(schema);
  console.log('[db] Esquema base aplicado (schema.sql).');
}

async function ensureSchemaMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed
      ON schema_migrations (executed_at DESC);
  `);
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.js'))
    .sort();
}

async function getAppliedMigrationSet() {
  const { rows } = await query('SELECT migration FROM schema_migrations ORDER BY migration');
  return new Set(rows.map((r) => r.migration));
}

async function columnExists(table, column) {
  const { rows } = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function tableExists(table) {
  const { rows } = await query('SELECT to_regclass($1) AS t', [`public.${table}`]);
  return !!rows[0]?.t;
}

/**
 * Instalaciones existentes (pre-versionado): si ya hay usuarios pero ningún registro
 * en schema_migrations, se registran como aplicadas todas las migraciones cuyos
 * efectos ya están presentes, dejando pendientes solo las que falten físicamente.
 */
async function baselineLegacyDatabaseIfNeeded(allFiles, applied) {
  if (applied.size > 0) return;

  const { rows: userCountRows } = await query('SELECT COUNT(*)::int AS n FROM usuarios');
  if ((userCountRows[0]?.n || 0) === 0) return;

  const pending = [];
  if (await tableExists('pedidos_sigamef') && !(await columnExists('pedidos_sigamef', 'pedido_sigamef'))) {
    pending.push('019_registro_datos_rc6.js');
  }

  const toRegister = allFiles.filter((f) => !pending.includes(f));
  if (!toRegister.length) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const file of toRegister) {
      await client.query(
        'INSERT INTO schema_migrations (migration, executed_at) VALUES ($1, NOW()) ON CONFLICT (migration) DO NOTHING',
        [file],
      );
    }
    await client.query('COMMIT');
    console.log(`[db] Baseline instalación existente: ${toRegister.length} migración(es) registradas sin re-ejecutar.`);
    if (pending.length) {
      console.log(`[db] Pendiente(s) detectada(s): ${pending.join(', ')}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function loadMigrationSql(file) {
  const migrationPath = path.join(MIGRATIONS_DIR, file);
  const migrationModule = await import(pathToFileURL(migrationPath).href);
  const sql = migrationModule.default;
  if (!sql || typeof sql !== 'string') {
    throw new Error(`La migración ${file} no exporta SQL válido (default string).`);
  }
  return sql;
}

async function runPendingMigrations() {
  const files = listMigrationFiles();
  if (!files.length) {
    console.log('[db] No hay archivos de migración.');
    return;
  }

  await baselineLegacyDatabaseIfNeeded(files, await getAppliedMigrationSet());
  const applied = await getAppliedMigrationSet();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[db] Migración omitida (ya aplicada): ${file}`);
      continue;
    }

    const sql = await loadMigrationSql(file);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (migration, executed_at) VALUES ($1, NOW())',
        [file],
      );
      await client.query('COMMIT');
      applied.add(file);
      console.log(`[db] Migración aplicada y registrada: ${file}`);
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
      const wrapped = new Error(`[db] Migración fallida: ${file} — ${err.message}`);
      wrapped.cause = err;
      wrapped.migration = file;
      throw wrapped;
    } finally {
      client.release();
    }
  }
}

async function seedDefaultUsers() {
  for (const u of DEFAULT_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await query(
      `INSERT INTO usuarios (dni, username, nombre, rol, email, password_hash, debe_cambiar_password)
       VALUES ($1, $1, $2, $3, $4, $5, FALSE)
       ON CONFLICT (dni) DO UPDATE SET username = COALESCE(usuarios.username, EXCLUDED.username)`,
      [u.dni, u.nombre, u.rol, u.email, hash],
    );
  }
  console.log('[db] Usuarios por defecto verificados.');
}

async function postMigrationMaintenance() {
  try {
    const { rebuildAllHistorial } = await import('./lib/trazabilidad.js');
    const n = await rebuildAllHistorial();
    if (n > 0) console.log(`[db] Historial de trazabilidad reconstruido en ${n} requerimiento(s).`);
  } catch (err) {
    console.warn('[db] Rebuild trazabilidad:', err.message);
  }

  const { rows } = await query('SELECT COUNT(*)::int AS n FROM entidad');
  if (rows[0].n === 0) {
    await query(
      `INSERT INTO entidad (ruc, nombre, siglas) VALUES ($1, $2, $3)`,
      ['', 'Entidad del Estado', 'SGC'],
    );
  }
}

export async function runMigrations() {
  await applyBaseSchema();
  await ensureSchemaMigrationsTable();
  await runPendingMigrations();
  await seedDefaultUsers();
  await postMigrationMaintenance();
}

export async function getMigrationStatus() {
  await ensureSchemaMigrationsTable();
  const files = listMigrationFiles();
  const applied = await getAppliedMigrationSet();
  return {
    total: files.length,
    applied: files.filter((f) => applied.has(f)),
    pending: files.filter((f) => !applied.has(f)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(async () => {
      const status = await getMigrationStatus();
      console.log('[db] Migración completa.');
      console.log(`[db] Estado: ${status.applied.length} aplicadas, ${status.pending.length} pendientes.`);
      return pool.end();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message || err);
      if (err.cause?.detail) console.error('[db] Detalle:', err.cause.detail);
      if (err.cause?.hint) console.error('[db] Hint:', err.cause.hint);
      process.exit(1);
    });
}
