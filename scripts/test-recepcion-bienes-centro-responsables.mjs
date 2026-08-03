/**
 * RB8.1B — Centro organizacional y responsables para Recepción de Bienes.
 * Prueba estática + unitaria del helper y del cableado (sin BD obligatoria).
 *
 * Cubre:
 *   1. CNSP resuelve CNSP
 *   2. CNCC no accede a CNSP
 *   3. CNSP sí accede
 *   4. Admin/global accede
 *   5. Destinatarios solo del mismo centro
 *   6. Usuarios inactivos excluidos
 *   7. Responsable de otro centro rechazado
 *   8. Centro del frontend ignorado
 *   9. Bandeja restringida por centro
 *  10. Detalle protegido
 *  11. Derivación válida conserva contrato actual
 *  12. Centro no resoluble bloquea
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

console.log('\n=== RB8.1B — Centro organizacional y responsables (Recepción Bienes) ===\n');

// 1. CNSP resuelve CNSP (normaliza puntos: C.N.S.P. → CNSP)
{
  const { normalizarCodigoCentro, resolverCentroDesdeRequerimiento } = await import('../server/lib/recepcionBienesAlcance.js');
  assert.equal(normalizarCodigoCentro('  cnsp  '), 'CNSP');
  assert.equal(normalizarCodigoCentro('cn   sp'), 'CNSP');
  assert.equal(normalizarCodigoCentro('C.N.S.P.'), 'CNSP');
  const centro = resolverCentroDesdeRequerimiento({
    cmn: JSON.stringify({ centro: 'C.N.S.P.' }),
  });
  assert.equal(centro.centro_codigo, 'CNSP');
  ok('1. CNSP resuelve CNSP desde cmn estructurado (C.N.S.P. normalizado a CNSP)');
}

// 2–3. Acceso por centro
{
  const { puedeAccederRecepcionBienes } = await import('../server/lib/recepcionBienesAlcance.js');
  const cnsp = { centro: 'CNSP', codigo_centro_costo: 'CC-01' };
  const cncc = { centro: 'CNCC', codigo_centro_costo: 'CC-02' };
  assert.equal(puedeAccederRecepcionBienes(cncc, { centro_codigo: 'C.N.S.P.' }), false);
  assert.equal(puedeAccederRecepcionBienes(cnsp, { centro_codigo: 'C.N.S.P.' }), true);
  assert.equal(puedeAccederRecepcionBienes(cnsp, { centro_codigo: 'CNSP' }), true);
  ok('2–3. CNCC no accede a CNSP; CNSP sí accede');
}

// 4. Admin/global accede
{
  const { puedeAccederRecepcionBienes, esAlcanceGlobal } = await import('../server/lib/recepcionBienesAlcance.js');
  assert.equal(esAlcanceGlobal({ rol: 'admin' }), true);
  assert.equal(esAlcanceGlobal({ rol: 'dec' }), true);
  assert.equal(esAlcanceGlobal({ alcance_datos: 'GLOBAL' }), true);
  assert.equal(puedeAccederRecepcionBienes({ rol: 'admin' }, { centro_codigo: 'X' }), true);
  ok('4. Admin/DEC/alcance global accede a cualquier centro');
}

// 5–6. Destinatarios solo mismo centro; inactivos excluidos (verificación en SQL del endpoint)
{
  assertFileContains('server/lib/recepcionBienes.js', /u\.activo = TRUE/, 'destinatarios activos');
  assertFileContains('server/lib/recepcionBienes.js', /COALESCE\(u\.centro, ''\) = \$2 OR COALESCE\(u\.codigo_centro_costo, ''\) = \$2/, 'mismo centro');
  ok('5–6. Endpoint destinatarios filtra activos y mismo centro (SQL)');
}

// 7. Responsable de otro centro rechazado (mock de la validación)
{
  const { validarResponsableCentro } = await import('../server/lib/recepcionBienesAlcance.js');
  const db = {
    async query() {
      return { rows: [{ id: 99, activo: true, centro: 'CNCC', codigo_centro_costo: 'CC-02', area_id: null }] };
    },
  };
  await assert.rejects(
    () => validarResponsableCentro(99, { centro_codigo: 'C.N.S.P.' }, null, db),
    (err) => err.code === 'RESPONSABLE_CENTRO_INVALIDO' && err.status === 422,
  );
  ok('7. Responsable de otro centro rechazado (RESPONSABLE_CENTRO_INVALIDO / 422)');
}

// 8. Centro del frontend ignorado (solo req.user en rutas + constructor userCtx)
{
  const routes = fs.readFileSync(path.join(root, 'server/routes/recepcionBienes.js'), 'utf8');
  assert.match(routes, /req\.user/, 'rutas usan req.user');
  assert.match(routes, /rbUserCtx/, 'builder userCtx presente');
  assertFileNotContains('server/routes/recepcionBienes.js', /x-user-centro/, 'no header x-user-centro');
  assertFileNotContains('server/routes/recepcionBienes.js', /x-user-.*centro/, 'sin header centro');
  const helper = fs.readFileSync(path.join(root, 'server/lib/recepcionBienesAlcance.js'), 'utf8');
  // row?.area / payload?.area no deben aparecer como fuente de centro_codigo
  assert.doesNotMatch(helper, /cmnObj\?\.area \|\| payload\?\.area/, 'area no es fuente de centro');
  assert.doesNotMatch(helper, /centro_codigo: row\?\.area/, 'area no se asigna a centro_codigo');
  // Área sí se conserva como dato separado (área_id/area_nombre), no como centro
  assert.match(helper, /area_id: row\?\.cmn_obj\?\.area_id/, 'área como dato separado');
  ok('8. Centro siempre desde BD (req.user), nunca headers x-user-*; área no usada como centro');
}

// 9. Bandeja restringida por centro (código filtra por centro)
{
  assertFileContains('server/lib/recepcionBienes.js', /resolverCentroDesdeRequerimiento\(/, 'bandeja resuelve centro');
  assertFileContains('server/lib/recepcionBienes.js', /puedeAccederRecepcionBienes\(ctx, centro\)/, 'bandeja filtra por centro');
  assertFileContains('server/lib/recepcionBienes.js', /if \(ctx && !global\)/, 'filtro solo restringido');
  assertFileContains('server/lib/recepcionBienes.js', /userCtx/, 'bandeja recibe userCtx');
  ok('9. Bandeja filtra por centro resolviendo desde requerimiento (sin N+1, post-query)');
}

// 10. Detalle protegido por centro
{
  assertFileContains('server/lib/recepcionBienes.js', /export async function getDetalleRecepcionBienes\(id, userCtx/, 'detalle recibe userCtx');
  assertFileContains('server/lib/recepcionBienes.js', /assertAccesoRecepcionBienes/, 'detalle valida acceso');
  ok('10. Detalle protegido por centro (403 ACCESO_CENTRO_DENEGADO)');
}

// 11. Derivación válida conserva contrato actual (firma no cambia)
{
  const { derivarAreaUsuaria } = await import('../server/lib/recepcionBienes.js');
  assert.equal(typeof derivarAreaUsuaria, 'function');
  assertFileContains('server/lib/recepcionBienes.js', /verif/.source ? /derivarAreaUsuaria\(expedienteId, body = \{\}, usuario = '', rol = '', userCtx = null\)/ : /x/, 'firma derivar');
  assertFileContains('server/lib/recepcionBienes.js', /validarResponsableCentro\(destId, centroResp/, 'derivación valida responsable');
  ok('11. Derivación valida responsable del centro del expediente antes de escribir');
}

// 12. Centro no resoluble bloquea
{
  const { resolverCentroDesdeRequerimiento } = await import('../server/lib/recepcionBienesAlcance.js');
  assert.throws(
    () => resolverCentroDesdeRequerimiento({ cmn: null, payload: null }),
    (err) => err.code === 'CENTRO_NO_RESUELTO',
  );
  ok('12. Centro no resoluble lanza CENTRO_NO_RESUELTO (422 en API)');
}

console.log('\nRB8.1B centro/responsables OK\n');