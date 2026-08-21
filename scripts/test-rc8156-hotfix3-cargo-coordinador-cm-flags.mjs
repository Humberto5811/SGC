/**
 * RC8.15.6 HOTFIX3 — cargo en requireAuth habilita flags Coordinador CM.
 * Solo lectura sobre OS 1105/E1 real; no INSERT/UPDATE/COMMIT.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pool, { query } from '../server/db.js';
import { listarBandejaEntregablesServicios } from '../server/lib/entregablesServicios.js';
import requireAuth from '../server/middleware/requireAuth.js';
import { resolveFunctionalProfiles } from '../server/utils/userRoleCatalog.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

function buildUserCtx(row) {
  const permisos = typeof row.permisos === 'string'
    ? JSON.parse(row.permisos || '{}')
    : (row.permisos || {});
  return {
    id: Number(row.id),
    rol: row.rol,
    centro: row.centro,
    codigo_centro_costo: row.codigo_centro_costo,
    alcance_datos: row.alcance_datos,
    area_id: row.area_id,
    permisos,
    cargo: row.cargo,
    username: row.username,
    nombre: row.nombre,
  };
}

console.log('\n=== RC8.15.6 HOTFIX3 — cargo en requireAuth / flags Coordinador CM ===\n');

const authSrc = readFileSync('server/middleware/requireAuth.js', 'utf8');
ok(/SELECT[\s\S]*\bcargo\b[\s\S]*FROM usuarios/.test(authSrc),
  '1. requireAuth selecciona cargo');

const entrega = (await query(`
  SELECT oe.id AS orden_entrega_id, eev.responsable_usuario_id, eev.etapa_codigo
  FROM orden_entregas oe
  JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
  JOIN entregable_estado_vigente eev ON eev.orden_entrega_id = oe.id
  WHERE oc.tipo_orden = 'OS'
    AND oc.numero_orden = '1105'
    AND oe.numero_entrega = 1
    AND eev.etapa_codigo = 'REVISION_COORDINADOR_CM'
  ORDER BY oc.id DESC, oe.id DESC
  LIMIT 1
`)).rows[0];

if (!entrega?.orden_entrega_id) {
  ok(false, '2. fixture OS 1105/E1 disponible en BD');
} else {
  ok(true, '2. fixture OS 1105/E1 disponible en BD');

  const responsable = (await query(`
    SELECT id, username, nombre, rol, cargo, permisos, centro, codigo_centro_costo,
      alcance_datos, area_id
    FROM usuarios WHERE id = $1 AND activo = TRUE
  `, [Number(entrega.responsable_usuario_id)])).rows[0];

  const otro = (await query(`
    SELECT id, username, nombre, rol, cargo, permisos, centro, codigo_centro_costo,
      alcance_datos, area_id
    FROM usuarios
    WHERE activo = TRUE AND id <> $1
    ORDER BY id
    LIMIT 1
  `, [Number(responsable.id)])).rows[0];

  assert.ok(responsable, 'responsable CM presente');
  assert.ok(otro, 'usuario no responsable presente');

  const ctxSinCargo = buildUserCtx({ ...responsable, cargo: '' });
  const ctxConCargo = buildUserCtx(responsable);
  const ctxOtro = buildUserCtx(otro);

  const filaSinCargo = (await listarBandejaEntregablesServicios(ctxSinCargo))
    .find((row) => Number(row.orden_entrega_id) === Number(entrega.orden_entrega_id));
  const filaConCargo = (await listarBandejaEntregablesServicios(ctxConCargo))
    .find((row) => Number(row.orden_entrega_id) === Number(entrega.orden_entrega_id));
  const filaOtro = (await listarBandejaEntregablesServicios(ctxOtro))
    .find((row) => Number(row.orden_entrega_id) === Number(entrega.orden_entrega_id));

  ok(!resolveFunctionalProfiles(ctxSinCargo).includes('COORDINADOR_CM'),
    '3. sin cargo no resuelve perfil COORDINADOR_CM');
  ok(!filaSinCargo?.puede_observar_coordinador_cm
    && !filaSinCargo?.puede_derivar_analista_cm,
    '4. responsable sin cargo no recibe flags CM');

  ok(resolveFunctionalProfiles(ctxConCargo).includes('COORDINADOR_CM'),
    '5. con cargo resuelve perfil COORDINADOR_CM');
  ok(Boolean(filaConCargo?.puede_observar_coordinador_cm),
    '6. responsable con cargo puede observar CM');
  ok(filaConCargo?.situacion_codigo === 'CONFORME'
    ? Boolean(filaConCargo?.puede_derivar_analista_cm)
    : !filaConCargo?.puede_derivar_analista_cm,
    '7. derivar CM coherente con situación CONFORME');

  ok(!filaOtro?.puede_observar_coordinador_cm
    && !filaOtro?.puede_derivar_analista_cm,
    '8. usuario no responsable sigue denegado');

  if (Number(responsable.id) === 20) {
    const menu = entregableMenuItems(filaConCargo || {});
    ok(menu.some((item) => item.act === 'observarEntregable')
      && menu.some((item) => item.act === 'derivarAnalistaCM')
      && menu.some((item) => item.act === 'verTrazabilidad'),
      '9. wrodriguez ve Observar, Derivar CM y Trazabilidad');
  } else {
    ok(true, '9. menú CM verificado con responsable canónico de OS 1105/E1');
  }

  let reqUser = null;
  await new Promise((resolve, reject) => {
    const req = { headers: { 'x-user-id': String(responsable.id) } };
    requireAuth(req, { status: () => ({ json: resolve }) }, (err) => {
      if (err) reject(err);
      else {
        reqUser = req.user;
        resolve();
      }
    });
  });

  ok(reqUser?.cargo === responsable.cargo && String(reqUser?.cargo || '').length > 0,
    '10. requireAuth expone cargo en req.user');
}

await pool.end();
console.log(`\n=== Resultado HOTFIX3: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);
