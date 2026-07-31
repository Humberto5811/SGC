/**
 * RC120 — Alcance organizacional centro / centro de costo (Requerimientos).
 *
 * Esta prueba está diseñada para ejecutarse en el VPS (con Node + DB).
 * En PCs institucionales sin Node NO debe ejecutarse.
 *
 * Comandos VPS sugeridos:
 *   node scripts/test-rc120-alcance-centro-centro-costo.mjs
 *   # Tras migraciones y con datos de prueba
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}
function assertFileNotContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.doesNotMatch(src, re, msg || rel);
}

console.log('\n=== RC120 — Alcance centro / centro de costo ===\n');

{
  assertFileContains('server/lib/userDataScope.js', /resolveUserDataScope/, 'resolvedor');
  assertFileContains('server/lib/userDataScope.js', /buildRequerimientoScopeSql/, 'SQL scope');
  assertFileContains('server/lib/userDataScope.js', /canAccessRequirement|assertCanAccessRequirement/, 'acceso por id');
  assertFileContains('server/lib/userDataScope.js', /TRANSVERSAL_FLUJO/, 'roles transversales');
  assertFileContains('server/lib/userDataScope.js', /isRolTransversalFlujo/, 'detector transversal');
  assertFileContains('server/lib/userDataScope.js', /REQUERIMIENTO_FUERA_DE_ALCANCE/, 'código 403');
  assertFileContains('server/migrations/036_usuarios_alcance_organizacional.js', /alcance_datos/, 'migración');
  assertFileContains('server/migrations/036_usuarios_alcance_organizacional.js', /usuarios_alcance_asignaciones/, 'asignaciones');
  assertFileContains('server/routes/requerimientosEspecial.js', /buildRequerimientoScopeSql/, 'listado con alcance');
  assertFileContains('server/routes/requerimientosEspecial.js', /areas-alcance/, 'áreas por alcance');
  assertFileContains('server/routes/requerimientosEspecial.js', /guardRequirementAccess/, 'guard por id');
  assertFileContains('server/index.js', /assertAreaWithinScope|authorizeRow/, 'CRUD protegido');
  assertFileContains('server/routes/adjuntos.js', /assertCanAccessRequirement/, 'adjuntos protegidos');
  assertFileContains('src/views/requerimiento/registroRequerimientoView.js', /areas-alcance/, 'FE áreas alcance');
  // No hardcode William / CNCC
  assertFileNotContains('server/lib/userDataScope.js', /William|V[aá]squez|CNCC/, 'sin excepciones nominativas');
  // Correlativo institucional no tocado a per-centro
  assertFileContains('src/views/requerimiento/registroRequerimientoView.js', /REQ-\$\{String\(created\.id\)\.padStart\(5/, 'correlativo REQ-{id}');
  ok('Estructura RC120 presente (casos 1–23 estáticos / cableado)');
}

{
  // Unitas locales del resolvedor (sin DB): SQL builder
  const { buildRequerimientoScopeSql, SCOPE_TYPES } = await import('../server/lib/userDataScope.js');

  const inst = buildRequerimientoScopeSql({
    scopeType: SCOPE_TYPES.INSTITUCIONAL, isInstitutional: true, skipOrgFilter: true,
  });
  assert.equal(inst.clause, '');
  ok('8/22. Institucional / admin sin filtro org');

  const trans = buildRequerimientoScopeSql({
    scopeType: SCOPE_TYPES.TRANSVERSAL_FLUJO, skipOrgFilter: true,
  });
  assert.equal(trans.clause, '');
  ok('Transversal Contrataciones/Almacén sin filtro org');

  const centro = buildRequerimientoScopeSql({
    scopeType: SCOPE_TYPES.CENTRO,
    centroIds: [2],
    centroCodigos: ['CNCC'],
    skipOrgFilter: false,
  }, 1);
  assert.match(centro.clause, /c\.id = ANY/);
  assert.ok(centro.params.length >= 1);
  ok('4–6. Director/coord. centro → filtro por centro_id');

  const cc = buildRequerimientoScopeSql({
    scopeType: SCOPE_TYPES.CENTRO_COSTO,
    areaIds: [10],
    centroCostoCodigos: ['CC-01'],
    areaNombres: ['Área X'],
    skipOrgFilter: false,
  }, 1);
  assert.match(cc.clause, /a\.id = ANY|a\.codigo|r\.area/);
  ok('1–3. Operativo → filtro por centro de costo / área');

  const vacio = buildRequerimientoScopeSql({
    scopeType: SCOPE_TYPES.CENTRO_COSTO,
    areaIds: [],
    centroCostoCodigos: [],
    areaNombres: [],
    skipOrgFilter: false,
  });
  assert.match(vacio.clause, /1=0/);
  ok('9. Sin asignaciones → no concede datos');
}

{
  const { isRolTransversalFlujo } = await import('../server/lib/userDataScope.js');
  assert.equal(isRolTransversalFlujo({ rol: 'au', cargo: 'Especialista' }), false);
  assert.equal(isRolTransversalFlujo({ rol: 'dec', cargo: 'Analista de Compras' }), true);
  assert.equal(isRolTransversalFlujo({ rol: 'au', cargo: 'Coordinador de Contratos Menores' }), true);
  assert.equal(isRolTransversalFlujo({ rol: 'almacen', cargo: 'Almacenero' }), true);
  assert.equal(isRolTransversalFlujo({ rol: 'au', cargo: 'Director de Centro' }), false);
  ok('Compatibilidad roles transversales vs AU/director');
}

{
  const files = [
    'scripts/test-rc116-paquete-documental-derivacion-au.mjs',
    'scripts/test-rc117-documentos-preview-download-derivacion.mjs',
    'scripts/sql-rc120-alcance-organizacional-vps.sql',
  ];
  files.forEach((f) => assert.ok(fs.existsSync(path.join(root, f)), f));
  ok('23. Compatibilidad estructural RC anteriores + SQL VPS');
}

console.log(`
=== RC120 cableado OK (validación estática / unitaria sin bandeja DB) ===

Pendiente en VPS (con Node + PostgreSQL):
  1) Reiniciar API para aplicar migración 036
  2) node scripts/test-rc120-alcance-centro-centro-costo.mjs
  3) Ejecutar scripts/sql-rc120-alcance-organizacional-vps.sql
  4) Login William Vásquez → Registro de Requerimientos → solo su alcance
`);
