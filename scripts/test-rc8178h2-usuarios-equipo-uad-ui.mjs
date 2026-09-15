/**
 * RC8.17.8H2 — Mantenimiento usuarios: CRUD equipo_uad + catálogo compartido.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import {
  listEquiposUadCatalogo,
  normalizeEquipoUadCodigo,
  labelEquipoUad,
  EQUIPOS_UAD,
} from '../shared/equiposUad.js';
import { parseEquipoUadInput } from '../server/lib/equiposUadUsuario.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H2 — Usuarios equipo_uad (CRUD + catálogo) ===\n');

const catalogo = listEquiposUadCatalogo();
ok(catalogo.length === 5, 'catálogo tiene 5 equipos UAD');
ok(catalogo.some((e) => e.codigo === EQUIPOS_UAD.PROGRAMACION && e.label === 'Programación'), 'label Programación');
ok(catalogo.some((e) => e.codigo === EQUIPOS_UAD.CONT_MENORES && e.label === 'Cont.Menores'), 'label Cont.Menores');

ok(parseEquipoUadInput('') === null, 'vacío → null');
ok(parseEquipoUadInput('PROGRAMACION') === 'PROGRAMACION', 'parse PROGRAMACION');

const { rows: col } = await query(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'usuarios' AND column_name = 'equipo_uad' LIMIT 1
`);
ok(col.length === 1, 'columna usuarios.equipo_uad en BD');

const checks = [
  ['hnizama', null],
  ['laguilar', 'PROGRAMACION'],
  ['wrodriguez', 'CONT_MENORES'],
  ['jcrisostomo', 'CONT_MENORES'],
  ['lespinoza', null],
];

for (const [username, esperado] of checks) {
  const { rows } = await query(
    `SELECT username, equipo_uad FROM usuarios WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [username],
  );
  if (!rows.length) {
    console.log(`  ⚠ usuario ${username} no existe en BD local — omitido`);
    continue;
  }
  const norm = normalizeEquipoUadCodigo(rows[0].equipo_uad);
  if (norm === esperado) {
    ok(true, `${username} equipo_uad=${norm ?? 'NULL'} (coincide ejemplo validación)`);
  } else {
    console.log(`  ⚠ ${username} equipo_uad=${norm ?? 'NULL'} (ejemplo manual sugerido: ${esperado ?? 'NULL'}) — no se modifica automáticamente`);
  }
  if (norm) ok(labelEquipoUad(norm) !== '', `${username} tiene label UI`);
}

console.log('\n=== RC8.17.8H2 OK ===\n');
