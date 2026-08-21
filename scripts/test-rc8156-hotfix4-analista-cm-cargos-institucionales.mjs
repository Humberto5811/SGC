/**
 * RC8.15.6 HOTFIX4 — Cargos institucionales Analista CM en resolveFunctionalProfiles.
 * Valida catálogo y selector GET .../analistas-cm (solo lectura sobre usuarios reales).
 */
import assert from 'node:assert/strict';
import pool, { query } from '../server/db.js';
import { listarAnalistasCMEntregable } from '../server/lib/entregablesServicios.js';
import { PERFILES_FUNCIONALES, resolveFunctionalProfiles } from '../server/utils/userRoleCatalog.js';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

function perfiles(cargo, permisos = null) {
  return resolveFunctionalProfiles({ cargo, permisos: permisos || {} });
}

console.log('\n=== RC8.15.6 HOTFIX4 — Analista CM cargos institucionales ===\n');

for (const cargo of ['ANALISTA', 'ANALISTA-CM', 'ANALISTA CM', 'ESPECIALISTA-CM', 'ESPECIALISTA CM']) {
  ok(perfiles(cargo).includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES),
    `cargo ${cargo} resuelve ANALISTA_CONTRATACIONES`);
}

ok(perfiles('Analista de Contrataciones').includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES),
  'variante Analista de Contrataciones sigue soportada');
ok(!perfiles('COORDINADOR-CM').includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES),
  'COORDINADOR-CM no se clasifica como Analista CM');
ok(perfiles('COORDINADOR-CM').includes(PERFILES_FUNCIONALES.COORDINADOR_CM),
  'COORDINADOR-CM conserva perfil Coordinador CM');
ok(!perfiles('ESPECIALISTA').includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES),
  'ESPECIALISTA genérico no es Analista CM');
ok(!perfiles('Analista de Sistemas').includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES),
  'Analista de Sistemas no es falso positivo');

function esAnalistaCMActivo(row) {
  return row?.activo === true && resolveFunctionalProfiles(row)
    .includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES);
}
ok(!esAnalistaCMActivo({ activo: false, cargo: 'ANALISTA', permisos: {} }),
  'usuario inactivo no entra al selector aunque el cargo califique');
ok(esAnalistaCMActivo({ activo: true, cargo: 'ANALISTA', permisos: {} }),
  'usuario activo con cargo ANALISTA entra al selector');

ok(resolveFunctionalProfiles({ cargo: 'ANALISTA', activo: false })
  .includes(PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES),
  'inactivo sigue resolviendo perfil (filtro activo queda en listarUsuariosAnalistaCM)');

const entrega = (await query(`
  SELECT oe.id AS orden_entrega_id
  FROM orden_entregas oe
  JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
  JOIN entregable_estado_vigente eev ON eev.orden_entrega_id = oe.id
  WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = '1105' AND oe.numero_entrega = 1
    AND eev.etapa_codigo = 'REVISION_COORDINADOR_CM'
  ORDER BY oe.id DESC LIMIT 1
`)).rows[0];

if (entrega) {
  const wendy = (await query(`
    SELECT id, username, cargo, permisos, rol FROM usuarios
    WHERE username = 'wrodriguez' AND activo = TRUE LIMIT 1
  `)).rows[0];
  assert.ok(wendy, 'wrodriguez activo');
  const permisos = typeof wendy.permisos === 'string'
    ? JSON.parse(wendy.permisos || '{}')
    : (wendy.permisos || {});
  const lista = await listarAnalistasCMEntregable(entrega.orden_entrega_id, {
    id: wendy.id, rol: wendy.rol, cargo: wendy.cargo, permisos,
    username: wendy.username,
  });
  const ids = lista.map((u) => Number(u.id));
  ok(ids.includes(120), 'selector incluye jcrisostomo (ANALISTA)');
  ok(ids.includes(21), 'selector incluye gyllapuma (ESPECIALISTA-CM)');
  ok(!ids.includes(Number(wendy.id)), 'selector excluye wrodriguez (COORDINADOR-CM)');
  ok(lista.length >= 2, 'selector devuelve al menos dos Analistas CM');
} else {
  ok(false, 'fixture OS 1105/E1 en REVISION_COORDINADOR_CM para validar selector');
}

await pool.end();
console.log(`\n=== Resultado HOTFIX4: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);
