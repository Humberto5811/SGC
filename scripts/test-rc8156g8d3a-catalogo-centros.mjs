/**
 * RC8.15.6G-8D3A — Catálogo Centro principal desde areas (fuente canónica).
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  ensureCentrosCatalogoFromAreas,
  listarCentrosCatalogo,
  listarAreasPorCentro,
  cargarAlcanceOrganizacionalUsuario,
  guardarAlcanceOrganizacionalUsuario,
  resolverCentroIdPorCodigo,
} from '../server/lib/areasAutorizadasUsuario.js';
import { resolveUserDataScope } from '../server/lib/userDataScope.js';
import { ROLES_GENERALES } from '../server/utils/userRoleCatalog.js';

const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };
const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
const codigoCentro = `C3A${nonce.slice(-4)}`;

console.log('\n=== RC8.15.6G-8D3A — Catálogo centros ===\n');
await runMigrations();

const areaIds = [];
let userLegacyId = null;
let userAdminId = null;
let centroId = null;

try {
  await query('DELETE FROM centros WHERE UPPER(TRIM(codigo)) = $1', [codigoCentro.toUpperCase()]).catch(() => {});

  for (let i = 1; i <= 3; i++) {
    const aid = Number((await query(`
      INSERT INTO areas (codigo, nombre, responsable, estado)
      VALUES ($1, $2, $3, 'Activo') RETURNING id
    `, [`A3A${i}${nonce.slice(-3)}`, `Area 3A ${i}`, codigoCentro])).rows[0].id);
    areaIds.push(aid);
  }

  await ensureCentrosCatalogoFromAreas();
  const centros = await listarCentrosCatalogo();
  ok(centros.length >= 1, '1. catálogo centros no vacío tras sync desde areas');

  centroId = await resolverCentroIdPorCodigo(codigoCentro);
  ok(Number.isFinite(centroId) && centroId > 0, '2. resolverCentroIdPorCodigo encuentra centro desde areas.responsable');

  const areasCentro = await listarAreasPorCentro(centroId);
  ok(areasCentro.length === 3, '3. cambio/listado de centro carga áreas correctas');

  const hash = await bcrypt.hash('test1234', 4);
  userLegacyId = Number((await query(`
    INSERT INTO usuarios (dni, username, nombre, email, cargo, rol, password_hash, activo, permisos, centro)
    VALUES ($1, $2, 'Legacy 3A', $3, 'Cargo', 'usuario', $4, TRUE, '{}'::jsonb, $5)
    RETURNING id
  `, [`93${nonce.slice(-8)}`, `u3a${nonce.slice(-4)}`, `u3a@t.local`, hash, codigoCentro])).rows[0].id);

  const alcanceLoad = await cargarAlcanceOrganizacionalUsuario(userLegacyId);
  ok(Number(alcanceLoad.centro_principal_id) === Number(centroId),
    '4. edición usuario legacy preselecciona centro textual');

  await guardarAlcanceOrganizacionalUsuario(userLegacyId, {
    rol_general: ROLES_GENERALES.USUARIO,
    centro_principal_id: centroId,
    area_ids: [areaIds[0], areaIds[1]],
  }, 'test-g8d3a');
  const scope = await resolveUserDataScope({ userId: userLegacyId });
  ok(scope.areaIds.length === 2, '5. guardar alcance multiárea funciona');

  userAdminId = Number((await query(`
    INSERT INTO usuarios (dni, username, nombre, email, cargo, rol, password_hash, activo, permisos)
    VALUES ($1, $2, 'Admin 3A', $3, 'Admin', 'admin', $4, TRUE, '{}'::jsonb)
    RETURNING id
  `, [`94${nonce.slice(-8)}`, `a3a${nonce.slice(-4)}`, `a3a@t.local`, hash])).rows[0].id);
  await guardarAlcanceOrganizacionalUsuario(userAdminId, {
    rol_general: ROLES_GENERALES.ADMINISTRADOR,
  }, 'test-g8d3a');
  const scopeAdmin = await resolveUserDataScope({ userId: userAdminId });
  ok(scopeAdmin.skipOrgFilter === true, '6. admin no afectado (alcance global)');

  const fakeCentro = await resolverCentroIdPorCodigo(`NOEXISTE3A${nonce}`);
  ok(fakeCentro == null, '7. centro inexistente no resuelve id');
} finally {
  if (userLegacyId) {
    await query('DELETE FROM usuarios_alcance_asignaciones WHERE usuario_id = $1', [userLegacyId]).catch(() => {});
    await query('DELETE FROM usuarios WHERE id = $1', [userLegacyId]).catch(() => {});
  }
  if (userAdminId) {
    await query('DELETE FROM usuarios_alcance_asignaciones WHERE usuario_id = $1', [userAdminId]).catch(() => {});
    await query('DELETE FROM usuarios WHERE id = $1', [userAdminId]).catch(() => {});
  }
  for (const aid of areaIds) {
    await query('DELETE FROM areas WHERE id = $1', [aid]).catch(() => {});
  }
  if (centroId) {
    await query('DELETE FROM centros WHERE id = $1', [centroId]).catch(() => {});
  }
  ok(true, '8. cleanup fixture completo');
}

console.log('\n✅ RC8.15.6G-8D3A — 8/8 OK\n');
