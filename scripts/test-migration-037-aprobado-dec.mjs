/**
 * Pruebas A–F + idempotencia del predicado de migración 037.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  matchesMigration037,
  MIGRATION_037_UPDATES,
  default as migrationSql,
} from '../server/migrations/037_sync_estado_aprobado_dec_programacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assertMatch(row, expected, label) {
  const got = matchesMigration037(row);
  assert.equal(got, expected, `${label}: esperado ${expected}, obtuvo ${got} | ${JSON.stringify(row)}`);
  console.log(`${expected ? 'MATCH' : 'SKIP '} ${label}`);
}

console.log('=== test-migration-037-aprobado-dec ===\n');

// Seguridad: sin coincidencias amplias
assert.ok(typeof migrationSql === 'string' && migrationSql.includes('UPDATE requerimientos'), 'SQL UPDATE presente');
assert.ok(!/LIKE\s+'%APROBADO%'/i.test(migrationSql), 'sin LIKE %APROBADO%');
assert.ok(!/ILIKE\s+'%APROBADO%'/i.test(migrationSql), 'sin ILIKE %APROBADO%');
assert.ok(migrationSql.includes("'APROBADO DEC'"), 'match exacto APROBADO DEC');
assert.ok(migrationSql.includes("'APROBADO_DEC'"), 'match exacto APROBADO_DEC');
assert.ok(migrationSql.includes("'REQUERIMIENTO_APROBADO_DEC'"), 'match exacto REQUERIMIENTO_APROBADO_DEC');
assert.ok(migrationSql.includes("filas_detectadas"), 'diagnóstico detectadas');
assert.ok(migrationSql.includes("filas_actualizadas"), 'diagnóstico actualizadas');
assert.ok(!/\bestado\s*=/.test(migrationSql.replace(/estado_actual/g, 'X').replace(/COALESCE\(estado/g, 'COALESCE(X')), 'no SET estado negocio');
assert.deepEqual(MIGRATION_037_UPDATES, ['estado_actual', 'sub_modulo_actual'], 'campos actualizados');
assert.ok(!/responsable/i.test(migrationSql), 'no toca responsable');
assert.ok(!/historial/i.test(migrationSql), 'no toca historial');
assert.ok(!/updated_at/i.test(migrationSql), 'no toca updated_at');
console.log('SQL guards OK\n');

// A. Aprobado DEC + estado_actual DEC → MATCH (→ PROGRAMACION)
assertMatch({ estado: 'Aprobado DEC', estado_actual: 'DEC' }, true, 'A');

// B. Aprobado DEC + estado_actual vacío → MATCH
assertMatch({ estado: 'Aprobado DEC', estado_actual: '' }, true, 'B');
assertMatch({ estado: 'Aprobado DEC', estado_actual: null }, true, 'B-null');
assertMatch({ estado: 'APROBADO_DEC', estado_actual: '' }, true, 'B-APROBADO_DEC');
assertMatch({ estado: 'REQUERIMIENTO_APROBADO_DEC', estado_actual: 'DEC' }, true, 'B-canónico');

// C. Aprobado DEC + PROGRAMACION → sin cambio
assertMatch({ estado: 'Aprobado DEC', estado_actual: 'PROGRAMACION' }, false, 'C');

// D. REQUERIMIENTO_EN_DEC + DEC → sin cambio
assertMatch({ estado: 'REQUERIMIENTO_EN_DEC', estado_actual: 'DEC' }, false, 'D');
assertMatch({ estado: 'Aprobado', estado_actual: 'DEC' }, false, 'D-Aprobado');

// E. C.C. aprobado + CUADRO → sin cambio
assertMatch({ estado: 'C.C. aprobado', estado_actual: 'CUADRO_COMPARATIVO' }, false, 'E');
assertMatch({ estado: 'CUADRO_COMPARATIVO_APROBADO', estado_actual: 'CUADRO_COMPARATIVO' }, false, 'E-código');

// F. Aprobado Programación + COORDINACION → sin cambio
assertMatch({ estado: 'Aprobado Programación', estado_actual: 'ACTOS_PREPARATORIOS' }, false, 'F');
assertMatch({ estado: 'Aprobado Programación', estado_actual: 'COORDINACION_CM' }, false, 'F-coord');

// Idempotencia del predicado: tras “aplicar”, ya no coincide
{
  const before = { estado: 'Aprobado DEC', estado_actual: 'DEC' };
  assert.equal(matchesMigration037(before), true, 'idempotencia: antes MATCH');
  const after = { ...before, estado_actual: 'PROGRAMACION', sub_modulo_actual: 'Programación' };
  assert.equal(matchesMigration037(after), false, 'idempotencia: después SKIP');
  // Segunda pasada sobre after sigue SKIP
  assert.equal(matchesMigration037(after), false, 'idempotencia: 2.ª pasada SKIP');
  console.log('IDEM OK (predicado estable tras corrección)');
}

// Resolver vigente alineado (A/B → En programación)
{
  const { resolveEstadoExpedienteVigente } = await import('../shared/estadoExpedienteVigente.js');
  const a = resolveEstadoExpedienteVigente({ estado: 'Aprobado DEC', estado_actual: 'DEC' });
  assert.equal(a.codigo, 'EN_PROGRAMACION', 'resolver A');
  const b = resolveEstadoExpedienteVigente({ estado: 'Aprobado DEC', estado_actual: '' });
  assert.equal(b.codigo, 'EN_PROGRAMACION', 'resolver B');
  const c = resolveEstadoExpedienteVigente({ estado: 'Aprobado DEC', estado_actual: 'PROGRAMACION' });
  assert.equal(c.codigo, 'EN_PROGRAMACION', 'resolver C');
  console.log('Resolver A–C OK');
}

console.log('\nOK test-migration-037-aprobado-dec');
console.log(JSON.stringify({
  A: 'MATCH → PROGRAMACION',
  B: 'MATCH → PROGRAMACION',
  C: 'SKIP',
  D: 'SKIP',
  E: 'SKIP',
  F: 'SKIP',
  idempotente: true,
  campos: MIGRATION_037_UPDATES,
}, null, 2));
