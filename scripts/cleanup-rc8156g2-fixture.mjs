/**
 * Limpieza idempotente del fixture RC8156G2 (test G-2).
 *
 * Uso:
 *   node scripts/cleanup-rc8156g2-fixture.mjs           # dry-run
 *   node scripts/cleanup-rc8156g2-fixture.mjs --apply   # ejecutar
 */
import pool from '../server/db.js';
import {
  cleanupRc8156G2Fixture,
  discoverRc8156G2Fixture,
  hasRc8156G2Residuals,
  printRc8156G2Snapshot,
} from './lib/rc8156g2-fixture-cleanup.mjs';

const APPLY = process.argv.includes('--apply');

console.log(`\n=== Cleanup RC8156G2 fixture ===`);
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const before = await discoverRc8156G2Fixture();
printRc8156G2Snapshot(before);

if (!hasRc8156G2Residuals(before)) {
  console.log('\nSin residuos RC8156G2; no requiere cambios.\n');
  await pool.end();
  process.exit(0);
}

const result = await cleanupRc8156G2Fixture({ apply: APPLY });

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

const after = await discoverRc8156G2Fixture();
printRc8156G2Snapshot(after);

if (hasRc8156G2Residuals(after)) {
  console.error('\n✗ Aún quedan residuos RC8156G2.\n');
  await pool.end();
  process.exit(1);
}

console.log('\n✓ Cero residuos RC8156G2.\n');
await pool.end();
