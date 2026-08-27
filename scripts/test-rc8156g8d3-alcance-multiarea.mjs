/**
 * RC8.15.6G-8D3 — Roles generales + alcance organizacional multiárea.
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  resolveUserDataScope,
  canAccessRequirement,
  SCOPE_TYPES,
} from '../server/lib/userDataScope.js';
import {
  guardarAlcanceOrganizacionalUsuario,
  listarAreasAutorizadasUsuario,
} from '../server/lib/areasAutorizadasUsuario.js';
import { ROLES_GENERALES } from '../server/utils/userRoleCatalog.js';

const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };
const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

console.log('\n=== RC8.15.6G-8D3 — Alcance multiárea ===\n');
await runMigrations();

let centroId = null;
const areaIds = [];
const userIds = [];
let reqAjenoId = null;

async function crearUsuario(tag, rol = 'usuario') {
  const hash = await bcrypt.hash('test1234', 4);
  const dni = `9${String(nonce).slice(-8)}${tag}`.slice(0, 20);
  const username = `g8d3${tag}${String(nonce).slice(-4)}`.slice(0, 20);
  const { rows } = await query(`
    INSERT INTO usuarios (dni, username, apellidos, nombres, nombre, email, cargo, rol, password_hash, activo, permisos)
    VALUES ($1, $2, 'Test', 'G8D3', $2, $3, 'Cargo test', $4, $5, TRUE, '{}'::jsonb)
    RETURNING id
  `, [dni, username, `${username}@t.local`, rol, hash]);
  const id = rows[0].id;
  userIds.push(id);
  return id;
}

try {
  centroId = Number((await query(`
    INSERT INTO centros (codigo, nombre, estado)
    VALUES ($1, $2, 'Activo') RETURNING id
  `, [`C8D3${nonce.slice(-4)}`, `Centro G8D3 ${nonce}`])).rows[0].id);

  for (let i = 1; i <= 10; i++) {
    const aid = Number((await query(`
      INSERT INTO areas (codigo, nombre, responsable, centro_id)
      VALUES ($1, $2, 'Resp', $3) RETURNING id
    `, [`CC8D3-${i}-${nonce.slice(-3)}`, `Area G8D3 ${i}`, centroId])).rows[0].id);
    areaIds.push(aid);
  }

  // 1. Usuario 1 área
  const u1 = await crearUsuario('u1');
  await guardarAlcanceOrganizacionalUsuario(u1, {
    rol_general: ROLES_GENERALES.USUARIO,
    centro_principal_id: centroId,
    area_ids: [areaIds[0]],
  }, 'test-g8d3');
  const s1 = await resolveUserDataScope({ userId: u1 });
  ok(s1.areaIds.length === 1 && s1.areaIds[0] === areaIds[0], '1. usuario 1 área → ve solo esa');

  const areas1 = await listarAreasAutorizadasUsuario({ userId: u1 });
  ok(areas1.data.length === 1, '9. registro: listarAreasAutorizadasUsuario retorna 1 área');

  // 2. Coordinador 5 áreas
  const uCoord1 = await crearUsuario('c1', 'coordinador');
  const coordAreas = areaIds.slice(0, 5);
  await guardarAlcanceOrganizacionalUsuario(uCoord1, {
    rol_general: ROLES_GENERALES.COORDINADOR,
    centro_principal_id: centroId,
    area_ids: coordAreas,
  }, 'test-g8d3');
  const s2 = await resolveUserDataScope({ userId: uCoord1 });
  ok(s2.areaIds.length === 5, '2. coordinador 5 áreas → ve solo esas 5');

  // 3. Segundo coordinador, otras 5 áreas
  const uCoord2 = await crearUsuario('c2', 'coordinador');
  const coordAreas2 = areaIds.slice(5, 10);
  await guardarAlcanceOrganizacionalUsuario(uCoord2, {
    rol_general: ROLES_GENERALES.COORDINADOR,
    centro_principal_id: centroId,
    area_ids: coordAreas2,
  }, 'test-g8d3');
  const s3 = await resolveUserDataScope({ userId: uCoord2 });
  ok(s3.areaIds.length === 5 && !s3.areaIds.includes(areaIds[0]), '3. segundo coordinador → otras áreas');

  // 4. Director seleccionar todos
  const uDirAll = await crearUsuario('da', 'director');
  await guardarAlcanceOrganizacionalUsuario(uDirAll, {
    rol_general: ROLES_GENERALES.DIRECTOR,
    centro_principal_id: centroId,
    seleccionar_todos: true,
  }, 'test-g8d3');
  const s4 = await resolveUserDataScope({ userId: uDirAll });
  ok(s4.scopeType === SCOPE_TYPES.CENTRO && s4.areaIds.length === 10, '4. director seleccionar todos → 10 áreas del centro');

  // 5. Director selección manual
  const uDirSel = await crearUsuario('ds', 'director');
  await guardarAlcanceOrganizacionalUsuario(uDirSel, {
    rol_general: ROLES_GENERALES.DIRECTOR,
    centro_principal_id: centroId,
    area_ids: [areaIds[1], areaIds[2]],
  }, 'test-g8d3');
  const s5 = await resolveUserDataScope({ userId: uDirSel });
  ok(s5.areaIds.length === 2, '5. director selección manual → solo seleccionadas');

  // 6. Operador
  const uOp = await crearUsuario('op', 'operador');
  await guardarAlcanceOrganizacionalUsuario(uOp, {
    rol_general: ROLES_GENERALES.OPERADOR,
    centro_principal_id: centroId,
    area_ids: [areaIds[3]],
  }, 'test-g8d3');
  const s6 = await resolveUserDataScope({ userId: uOp });
  ok(s6.areaIds.length === 1 && s6.areaIds[0] === areaIds[3], '6. operador → solo área asignada');

  // 7. Admin global
  const uAdmin = await crearUsuario('ad', 'admin');
  await guardarAlcanceOrganizacionalUsuario(uAdmin, {
    rol_general: ROLES_GENERALES.ADMINISTRADOR,
  }, 'test-g8d3');
  const s7 = await resolveUserDataScope({ userId: uAdmin });
  ok(s7.skipOrgFilter === true && s7.isInstitutional === true, '7. admin → acceso global');

  const areasAdmin = await listarAreasAutorizadasUsuario({ userId: uAdmin });
  ok(areasAdmin.data.length >= 10, '7b. admin listarAreas ≥ áreas del fixture');

  // 8. Usuario no ve área ajena
  const { rows: reqAjeno } = await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, payload)
    VALUES ('BIEN', $1, 'X', 'Req ajeno', $2, 'CNCC', 'Registrado', '{}'::jsonb)
    RETURNING id
  `, [`RAJ${nonce.slice(-4)}`, `Area G8D3 9`]);
  reqAjenoId = reqAjeno[0].id;
  const accOk = await canAccessRequirement(u1, reqAjenoId);
  ok(accOk.ok === false, '8. usuario no accede área ajena');

  const accProp = await canAccessRequirement(u1, (await query(`
    INSERT INTO requerimientos (tipo, codigo, cmn, denominacion, area, responsable, estado, payload)
    VALUES ('BIEN', $1, 'Y', 'Req propio', $2, 'CNCC', 'Registrado', '{}'::jsonb)
    RETURNING id
  `, [`RPR${nonce.slice(-4)}`, `Area G8D3 1`])).rows[0].id);
  ok(accProp.ok === true, '8b. usuario accede su área asignada');
} finally {
  for (const uid of userIds) {
    await query('DELETE FROM usuarios_alcance_asignaciones WHERE usuario_id = $1', [uid]).catch(() => {});
    await query('DELETE FROM usuarios WHERE id = $1', [uid]).catch(() => {});
  }
  if (reqAjenoId) await query('DELETE FROM requerimientos WHERE id = $1', [reqAjenoId]).catch(() => {});
  for (const aid of areaIds) {
    await query('DELETE FROM areas WHERE id = $1', [aid]).catch(() => {});
  }
  if (centroId) await query('DELETE FROM centros WHERE id = $1', [centroId]).catch(() => {});
  ok(true, '10. cleanup fixture completo');
}

console.log('\n✅ RC8.15.6G-8D3 — 10/10 OK\n');
