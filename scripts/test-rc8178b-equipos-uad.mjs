/**
 * RC8.17.8B — Equipo funcional UAD (catálogo, helpers, datos piloto).
 */
import assert from 'node:assert/strict';
import {
  EQUIPOS_UAD,
  EQUIPOS_UAD_LABELS,
  EQUIPOS_UAD_LIST,
  normalizeEquipoUadCodigo,
  isEquipoUadCodigoValido,
} from '../shared/equiposUad.js';
import {
  esCoordinadorEquipoUad,
  esOperadorEquipoUad,
  parseEquipoUadInput,
  usuarioPerteneceEquipoUad,
} from '../server/lib/equiposUadUsuario.js';
import { rolGeneralFromUsuario, ROLES_GENERALES } from '../server/utils/userRoleCatalog.js';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';

const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8B — Equipo UAD ===\n');

ok(EQUIPOS_UAD_LIST.length === 5, 'catálogo: exactamente cinco equipos');
ok(EQUIPOS_UAD_LABELS[EQUIPOS_UAD.PROGRAMACION] === 'Programación', 'label Programación');
ok(EQUIPOS_UAD_LABELS[EQUIPOS_UAD.CONT_MENORES] === 'Cont.Menores', 'label Cont.Menores');
ok(EQUIPOS_UAD_LABELS[EQUIPOS_UAD.PROC_SELECCION] === 'Proc.Selección', 'label Proc.Selección');
ok(EQUIPOS_UAD_LABELS[EQUIPOS_UAD.EJEC_CONTRACTUAL] === 'Ejec.Contractual', 'label Ejec.Contractual');
ok(EQUIPOS_UAD_LABELS[EQUIPOS_UAD.ALMACEN] === 'Almacén', 'label Almacén');

ok(normalizeEquipoUadCodigo('programacion') === EQUIPOS_UAD.PROGRAMACION, 'normaliza código');
ok(!isEquipoUadCodigoValido('CM'), 'rechaza código inválido CM como equipo');
try {
  parseEquipoUadInput('INVALIDO');
  assert.fail('debía lanzar');
} catch (e) {
  ok(e.status === 400, 'parseEquipoUadInput rechaza inválido');
}

const uadCoordProg = {
  activo: true,
  rol: 'coordinador',
  cargo: 'COORDINADOR-PROGRAM.',
  centro: 'OA',
  codigo_centro_costo: '01.04.01.02.01',
  equipo_uad: EQUIPOS_UAD.PROGRAMACION,
};
ok(
  rolGeneralFromUsuario(uadCoordProg) === ROLES_GENERALES.COORDINADOR,
  'rol general Coordinador desde columna rol',
);
ok(esCoordinadorEquipoUad(uadCoordProg, EQUIPOS_UAD.PROGRAMACION), 'coordinador UAD Programación califica');
ok(!esCoordinadorEquipoUad(uadCoordProg, EQUIPOS_UAD.CONT_MENORES), 'coordinador Programación no califica Cont.Menores');

const uadOperProg = {
  ...uadCoordProg,
  rol: 'operador',
  cargo: 'OPERADOR PROGRAMACION',
};
ok(esOperadorEquipoUad(uadOperProg, EQUIPOS_UAD.PROGRAMACION), 'operador mismo equipo califica');
ok(!esOperadorEquipoUad(uadCoordProg, EQUIPOS_UAD.PROGRAMACION), 'coordinador no es operador');

const fueraUad = {
  activo: true,
  rol: 'coordinador',
  cargo: 'COORDINADOR',
  centro: 'CNCC',
  codigo_centro_costo: 'CNCC',
  equipo_uad: EQUIPOS_UAD.PROGRAMACION,
};
ok(!usuarioPerteneceEquipoUad(fueraUad, EQUIPOS_UAD.PROGRAMACION), 'fuera UAD no califica aunque tenga equipo_uad');

const cargoNoDetermina = { ...uadCoordProg, equipo_uad: null, cargo: 'COORDINADOR-PROGRAM.' };
ok(!usuarioPerteneceEquipoUad(cargoNoDetermina, EQUIPOS_UAD.PROGRAMACION), 'cargo no determina equipo_uad');

await runMigrations();

const { rows: col } = await query(`
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'usuarios' AND column_name = 'equipo_uad' LIMIT 1
`);
ok(col.length > 0, 'columna usuarios.equipo_uad existe');

const pilots = [
  ['laguilar', EQUIPOS_UAD.PROGRAMACION, ROLES_GENERALES.COORDINADOR],
  ['wrodriguez', EQUIPOS_UAD.CONT_MENORES, ROLES_GENERALES.COORDINADOR],
  ['lespinoza', null, ROLES_GENERALES.DIRECTOR],
];
for (const [user, esperadoEquipo, esperadoRol] of pilots) {
  const { rows } = await query(
    `SELECT id, username, rol, cargo, centro, codigo_centro_costo, equipo_uad, activo
     FROM usuarios WHERE LOWER(username) = $1 AND activo = TRUE LIMIT 1`,
    [user],
  );
  const u = rows[0];
  if (!u) {
    console.log(`  ⚠ usuario ${user} no en BD`);
    continue;
  }
  ok(normalizeEquipoUadCodigo(u.equipo_uad) === esperadoEquipo, `${user} equipo_uad=${esperadoEquipo ?? 'NULL'}`);
  ok(rolGeneralFromUsuario(u) === esperadoRol, `${user} rol general ${esperadoRol}`);
  if (user === 'laguilar') {
    ok(esCoordinadorEquipoUad(u, EQUIPOS_UAD.PROGRAMACION), 'Lisset = Coordinador + PROGRAMACION');
  }
  if (user === 'wrodriguez') {
    ok(esCoordinadorEquipoUad(u, EQUIPOS_UAD.CONT_MENORES), 'Wendy = Coordinador + CONT_MENORES');
  }
  if (user === 'lespinoza') {
    ok(u.equipo_uad == null, 'lespinoza sin equipo específico');
    ok(!esCoordinadorEquipoUad(u, EQUIPOS_UAD.PROGRAMACION), 'director UAD no es coord. de equipo');
  }
}

console.log('\n✅ RC8.17.8B — OK\n');
