/**
 * Limpieza idempotente del fixture RC8156G3 (test G-3).
 *
 * Uso:
 *   node scripts/cleanup-rc8156g3-fixture.mjs           # dry-run
 *   node scripts/cleanup-rc8156g3-fixture.mjs --apply   # ejecutar
 */
import pool from '../server/db.js';
import {
  cleanupRc8156G3Fixture,
  discoverRc8156G3Fixture,
  hasRc8156G3Residuals,
  printRc8156G3Snapshot,
} from './lib/rc8156g3-fixture-cleanup.mjs';

const APPLY = process.argv.includes('--apply');

console.log(`\n=== Cleanup RC8156G3 fixture ===`);
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const before = await discoverRc8156G3Fixture();
printRc8156G3Snapshot(before);

if (!hasRc8156G3Residuals(before)) {
  console.log('\nSin residuos RC8156G3; no requiere cambios.\n');
  await pool.end();
  process.exit(0);
}

const result = await cleanupRc8156G3Fixture({ apply: APPLY });

if (!APPLY) {
  console.log('\nPlan de borrado (IDs concretos):');
  for (const [key, ids] of Object.entries(result.plan)) {
    if (ids.length) console.log(`  ${key}: ${ids.length} → [${ids.join(', ')}]`);
  }
  console.log('\nEjecute con --apply para borrar.\n');
  await pool.end();
  process.exit(0);
}

console.log('\nEliminados:');
for (const [key, count] of Object.entries(result.deleted)) {
  console.log(`  ${key}: ${count}`);
}

const after = await discoverRc8156G3Fixture();
printRc8156G3Snapshot(after);

if (hasRc8156G3Residuals(after)) {
  console.error('\n✗ Aún quedan residuos RC8156G3.\n');
  await pool.end();
  process.exit(1);
}

console.log('\n✓ Cero residuos RC8156G3.\n');
await pool.end();
