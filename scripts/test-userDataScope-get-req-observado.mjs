/**
 * Regresión: GET /api/requerimientos/:id no debe fallar con ERR_MODULE_NOT_FOUND
 * por import a expedienteAsignaciones.js inexistente.
 *
 * Caso funcional: responsable vigente ERV (p. ej. REQ observado → wvasquez).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  assertCanAccessRequirementForContracting,
  canAccessRequirement,
} from '../server/lib/userDataScope.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== userDataScope — GET REQ observado / sin módulo fantasma ===\n');

const scopeSrc = readFileSync(join(__dir, '../server/lib/userDataScope.js'), 'utf8');
ok(!scopeSrc.includes('expedienteAsignaciones.js'), 'userDataScope no referencia expedienteAsignaciones.js');
ok(/usuarioTieneAsignacionActivaExpediente/.test(scopeSrc), 'usa helper sobre expediente_asignaciones');
ok(/FROM expediente_asignaciones/.test(scopeSrc), 'consulta tabla canónica 044');

await runMigrations();

const { rows: reqRows } = await query(`
  SELECT r.id, r.codigo
  FROM requerimientos r
  JOIN expediente_estado_vigente v ON v.requerimiento_id = r.id
  WHERE UPPER(TRIM(COALESCE(v.responsable_tipo, ''))) = 'PERSONA'
    AND v.responsable_usuario_id IS NOT NULL
  ORDER BY r.id ASC
  LIMIT 1
`);

if (!reqRows.length) {
  console.log('  ⚠ Sin REQ con ERV PERSONA en BD; solo pruebas estáticas + import.');
  process.exit(0);
}

const req = reqRows[0];
const { rows: uRows } = await query(
  `SELECT id, username FROM usuarios WHERE id = (
     SELECT responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1
   ) AND activo = TRUE LIMIT 1`,
  [req.id],
);
const user = uRows[0];
ok(user, `usuario responsable ERV activo para ${req.codigo}`);

let threwModule = false;
try {
  await assertCanAccessRequirementForContracting(user.id, req.id, 'VER');
  ok(true, `assertCanAccessRequirementForContracting OK (${user.username} → ${req.codigo})`);
} catch (e) {
  if (String(e?.code || e?.message || '').includes('ERR_MODULE_NOT_FOUND')
    || String(e?.message || '').includes('expedienteAsignaciones')) {
    threwModule = true;
  }
  if (e?.status === 403) {
    ok(false, `403 inesperado para responsable ERV: ${e.message}`);
  } else if (!threwModule) {
    throw e;
  }
}
ok(!threwModule, 'sin ERR_MODULE_NOT_FOUND al autorizar GET');

const direct = await canAccessRequirement(user.id, req.id, 'VER');
ok(direct.ok, `canAccessRequirement vía ${direct.via || 'alcance org'}`);

console.log('\n✅ Regresión userDataScope GET REQ OK\n');
