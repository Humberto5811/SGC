/**
 * RC8.15.6 — Candidatos Analista de Pago (perfil explícito o TESORERIA operativa).
 */
import pool, { query } from '../server/db.js';
import { listarAnalistasPagoEntregable } from '../server/lib/entregablesServicios.js';
import {
  PERFILES_FUNCIONALES,
  hasAnalistaPagoDerivacionAccess,
  hasFunctionalProfile,
  hasTesoreriaOperationalAccess,
} from '../server/utils/userRoleCatalog.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

let passed = 0;
let failed = 0;
function ok(c, m) {
  if (c) { passed++; console.log(`  ✓ ${m}`); }
  else { failed++; console.error(`  ✗ ${m}`); }
}

console.log('\n=== RC8.15.6 — Candidatos Analista de Pago ===\n');

ok(hasAnalistaPagoDerivacionAccess({
  activo: true,
  cargo: 'Analista de Pago',
  permisos: { perfil: 'ANALISTA_PAGO' },
}), 'perfil explícito ANALISTA_PAGO → incluido');

ok(hasAnalistaPagoDerivacionAccess({
  activo: true,
  cargo: 'ESPECIALISTA',
  permisos: {
    submodulos: ['TESORERIA'],
    actividadesPorSubmodulo: { TESORERIA: ['VER', 'DERIVAR'] },
  },
}), 'TESORERIA + DERIVAR → incluido');

ok(hasAnalistaPagoDerivacionAccess({
  activo: true,
  cargo: 'ESPECIALISTA',
  permisos: {
    submodulos: ['TESORERIA'],
    actividadesPorSubmodulo: { TESORERIA: ['VER', 'CREAR', 'EDITAR'] },
  },
}), 'TESORERIA + gestión (CREAR/EDITAR) → incluido');

ok(!hasAnalistaPagoDerivacionAccess({
  activo: true,
  cargo: 'ESPECIALISTA',
  permisos: {
    submodulos: ['TESORERIA'],
    actividadesPorSubmodulo: { TESORERIA: ['VER'] },
  },
}), 'TESORERIA solo VER → excluido');

ok(!hasAnalistaPagoDerivacionAccess({
  activo: false,
  cargo: 'Analista de Pago',
  permisos: { perfil: 'ANALISTA_PAGO' },
}), 'inactivo → excluido');

ok(!hasAnalistaPagoDerivacionAccess({
  activo: true,
  cargo: 'ESPECIALISTA',
  permisos: { submodulos: ['PRESENTACION_ENTREGABLES'] },
}), 'sin TESORERIA → excluido');

ok(hasFunctionalProfile(
  { activo: true, permisos: { perfil: 'ANALISTA_PAGO' } },
  PERFILES_FUNCIONALES.ANALISTA_PAGO,
), 'hasFunctionalProfile delega ANALISTA_PAGO al helper');

ok(!hasTesoreriaOperationalAccess({
  submodulos: ['TESORERIA'],
  actividadesPorSubmodulo: { TESORERIA: ['VER'] },
}), 'hasTesoreriaOperationalAccess excluye solo VER');

const gyllapuma = (await query(`
  SELECT id, username, nombre, cargo, rol, activo, permisos
  FROM usuarios WHERE LOWER(username) = 'gyllapuma' AND activo LIMIT 1
`)).rows[0];
const jcrisostomo = (await query(`
  SELECT id, username, nombre, cargo, rol, activo, permisos
  FROM usuarios WHERE LOWER(username) = 'jcrisostomo' AND activo LIMIT 1
`)).rows[0];
const wvasquez = (await query(`
  SELECT id, username, nombre, cargo, rol, activo, permisos
  FROM usuarios WHERE LOWER(username) = 'wvasquez' AND activo LIMIT 1
`)).rows[0];

ok(gyllapuma && hasAnalistaPagoDerivacionAccess(gyllapuma), 'gyllapuma incluido');
ok(jcrisostomo && hasAnalistaPagoDerivacionAccess(jcrisostomo), 'jcrisostomo incluido');
ok(wvasquez && !hasAnalistaPagoDerivacionAccess(wvasquez), 'wvasquez excluido');

const os = (await query(`
  SELECT oe.id AS orden_entrega_id, ev.etapa_codigo, u.id AS responsable_id,
    u.username, u.nombre, u.rol, u.cargo, u.permisos
  FROM ordenes_contratacion oc
  JOIN orden_entregas oe ON oe.orden_id = oc.id AND oe.numero_entrega = 1 AND oe.estado = 'ACTIVO'
  LEFT JOIN entregable_estado_vigente ev ON ev.orden_entrega_id = oe.id
  LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
  WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = '1105'
  ORDER BY oc.id LIMIT 1
`)).rows[0];

if (os?.orden_entrega_id && jcrisostomo && os.etapa_codigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO) {
  const lista = await listarAnalistasPagoEntregable(os.orden_entrega_id, {
    id: Number(jcrisostomo.id),
    username: jcrisostomo.username,
    nombre: jcrisostomo.nombre,
    cargo: jcrisostomo.cargo,
    rol: jcrisostomo.rol,
    permisos: jcrisostomo.permisos,
  });
  const usernames = lista.map((u) => String(u.username || '').toLowerCase());
  ok(usernames.includes('gyllapuma') && usernames.includes('jcrisostomo'),
    'OS 1105/E1 listarAnalistasPagoEntregable incluye gyllapuma y jcrisostomo');
  ok(!usernames.includes('wvasquez'),
    'OS 1105/E1 excluye wvasquez (TESORERIA solo VER)');
} else {
  ok(true, 'OS 1105/E1 omitida (etapa distinta a PREPARACION_EXPEDIENTE_PAGO para listado Pago)');
}

await pool.end();
console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);
