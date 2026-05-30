import fs from 'fs';
import path from 'path';
import db from './db.js';

const sqlPath = path.join('src', 'database', 'migrations', '003_create_catalogo_table.sql');

async function run() {
  try {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await db.query(sql);
    console.log('Migration applied successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    process.exit(1);
  }
}

run();
