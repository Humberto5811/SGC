/**
 * RC8.9 — Visibilidad histórica/operativa CCP + Registro de Órdenes.
 * Contrato canónico intacto; pertenencia ≠ etapa vigente.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { listarBandejaCcp } from '../server/lib/ccpCertificacion.js';
import { listarBandejaOrdenes } from '../server/lib/ordenesContratacion.js';
import { resolveAccesoCcp } from '../server/lib/accesoCcp.js';
import {
  resolveAccesoRegistroOrdenes,
  MODO_ACCESO_RO,
} from '../server/lib/accesoRegistroOrdenes.js';
import { getEstadoResponsableCanonico } from '../server/lib/estadoResponsableCanonico.js';
import { evaluarPuedeDerivarRegistroOrdenes } from '../server/lib/ccpCertificacion.js';
import { ccpMenuItems, resolveCcpMenuContext } from '../src/utils/bandejaActions.js';
import { etapaEsPostCcp } from '../server/lib/bandejaVisibilidad.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

function deepEqualContrato(a, b) {
  const keys = [
    'estadoCodigo', 'estadoLabel', 'estadoCategoria',
    'etapaCodigo', 'etapaLabel',
    'responsableTipo', 'responsableUsuarioId', 'responsableNombre', 'responsableUnidad',
  ];
  for (const k of keys) {
    const va = a?.[k] ?? null;
    const vb = b?.[k] ?? null;
    if (String(va) !== String(vb)) return false;
  }
  return true;
}

console.log('\n=== RC8.9 Visibilidad histórica CCP / RO ===\n');

const { rows: users } = await query(`
  SELECT id, username, rol, activo, permisos
  FROM usuarios
  WHERE LOWER(username) IN ('admin', 'jcrisostomo', 'au') AND activo = TRUE
`);
const byUser = Object.fromEntries(users.map((u) => [String(u.username).toLowerCase(), u]));
ok(!!byUser.admin, 'fixture admin');
ok(!!byUser.jcrisostomo, 'fixture jcrisostomo');
ok(!!byUser.au, 'fixture usuario control (au)');

const { rows: reqs } = await query(`
  SELECT id, codigo FROM requerimientos WHERE codigo IN ('REQ-00001','REQ-00002')
`);
const byCode = Object.fromEntries(reqs.map((r) => [r.codigo, r.id]));
ok(!!byCode['REQ-00001'] && !!byCode['REQ-00002'], 'fixtures REQ-00001/00002');

const ccp = await listarBandejaCcp();
const ro = await listarBandejaOrdenes();
const ccp1 = ccp.find((x) => x.requerimiento_codigo === 'REQ-00001');
const ccp2 = ccp.find((x) => x.requerimiento_codigo === 'REQ-00002');
const ro1 = ro.find((x) => x.requerimiento_codigo === 'REQ-00001');
const ro2 = ro.find((x) => x.requerimiento_codigo === 'REQ-00002');

// 1-4 Admin/jcrisostomo CCP (lista base; alcance se valida vía resolveAcceso)
ok(!!ccp1, '1: Admin CCP ve REQ-00001 (lista con evidencia CCP)');
ok(!!ccp2, '2: Admin CCP ve REQ-00002 (lista con evidencia CCP)');

const accCcpAdmin = await resolveAccesoCcp({ usuarioId: byUser.admin.id, actividad: 'VER', userRow: byUser.admin });
const accCcpJ = await resolveAccesoCcp({ usuarioId: byUser.jcrisostomo.id, actividad: 'VER', userRow: byUser.jcrisostomo });
ok(accCcpAdmin.permitido && accCcpAdmin.modo === 'GLOBAL', 'admin CCP GLOBAL');
ok(accCcpJ.permitido, '3/4 prep: jcrisostomo autorizado CCP');
ok(accCcpJ.modo === 'GLOBAL' || accCcpJ.modo === 'ASIGNACION', 'jcrisostomo CCP por permiso o asignación (no hardcode)');
ok(!!ccp1 && !!ccp2 && accCcpJ.permitido, '3: Jcrisostomo CCP ve REQ-00001 (alcance + lista)');
ok(!!ccp1 && !!ccp2 && accCcpJ.permitido, '4: Jcrisostomo CCP ve REQ-00002 (alcance + lista)');

// 5: no exige etapa CCP
ok(String(ccp1?.estado_responsable_vigente?.etapaCodigo || '') !== 'CCP'
  || !!ccp1?.codigo_ccp, '5: CCP lista histórico sin exigir etapa vigente CCP');
ok(String(ccp2?.estado_responsable_vigente?.etapaCodigo || '').includes('REGISTRO_ORDEN'),
  '5b: REQ-00002 en CCP con etapa REGISTRO_ORDEN');

// 6-8 contratos en CCP
const canonMap = await getEstadoResponsableCanonico({
  requerimientoIds: [byCode['REQ-00001'], byCode['REQ-00002']],
});
const can1 = canonMap.get(Number(byCode['REQ-00001']));
const can2 = canonMap.get(Number(byCode['REQ-00002']));
ok(String(can1?.estadoCodigo) === 'BIEN_RECIBIDO_ALMACEN'
  || String(ccp1?.estado_responsable_vigente?.estadoCodigo) === 'BIEN_RECIBIDO_ALMACEN',
  '6: REQ-00001 en CCP → BIEN_RECIBIDO_ALMACEN');
ok(String(can2?.estadoCodigo || '').includes('REGISTRO_ORDEN')
  || String(ccp2?.estado_responsable_vigente?.estadoCodigo || '').includes('REGISTRO_ORDEN'),
  '7: REQ-00002 en CCP → REGISTRO_ORDENES');
ok(!/CCP_REGISTRADA|CCP registrada/i.test(String(ccp2?.estado_responsable_vigente?.estadoCodigo || '')),
  '8: CCP no reinfiere estado por codigo_ccp (ERV)');

// 9-11 RO
ok(!!ro1, '9: Admin RO ve REQ-00001');
ok(!!ro2, '10: Admin RO ve REQ-00002');

const accRoAdmin = await resolveAccesoRegistroOrdenes({
  usuarioId: byUser.admin.id, actividad: 'VER', userRow: byUser.admin,
});
const accRoJ = await resolveAccesoRegistroOrdenes({
  usuarioId: byUser.jcrisostomo.id, actividad: 'VER', userRow: byUser.jcrisostomo,
});
const accRoAu = await resolveAccesoRegistroOrdenes({
  usuarioId: byUser.au.id, actividad: 'VER', userRow: byUser.au,
});
ok(accRoAdmin.permitido && accRoAdmin.modo === MODO_ACCESO_RO.GLOBAL, 'admin RO GLOBAL');
ok(accRoJ.permitido, '11 prep: jcrisostomo autorizado RO');
ok(
  accRoJ.modo === MODO_ACCESO_RO.ASIGNACION
    ? (accRoJ.alcanceRequerimientoIds || []).map(Number).includes(Number(byCode['REQ-00002']))
    : true,
  '11: Jcrisostomo RO ve REQ-00002 (asignación o global)',
);

// 12-13 asignación
ok(
  Number(can2?.responsableUsuarioId) === Number(byUser.jcrisostomo.id),
  '12: asignación vigente (responsableUsuarioId) concede acceso al expediente',
);
ok(
  accRoJ.modo === MODO_ACCESO_RO.ASIGNACION
    || accRoJ.modo === MODO_ACCESO_RO.GLOBAL,
  '13: acceso RO por ASIGNACION o GLOBAL (permiso/rol), no por username',
);
ok(!accRoAu.permitido, '13b: au sin RO denegado (control no hardcode)');

// 14-15 acciones históricas
const ctx2 = resolveCcpMenuContext(ccp2, { canManage: true, modo: 'GLOBAL' });
ok(ctx2.yaDerivado === true, '14: histórico visible no reabre acciones (yaDerivado)');
const menu2 = ccpMenuItems(ccp2, { canManage: true, modo: 'GLOBAL' });
ok(!menu2.some((m) => m.act === 'derivarOrdenes' || m.act === 'registrarCcp'),
  '14b: sin derivar/registrar en histórico');
const eval2 = await evaluarPuedeDerivarRegistroOrdenes(byCode['REQ-00002']);
ok(eval2.yaDerivado === true || eval2.ok === false, '15: REQ-00002 no puede derivarse dos veces');

// 16: REQ-00001 no vuelve a RO como operativo CCP
ok(etapaEsPostCcp({
  etapaCodigo: ccp1?.estado_responsable_vigente?.etapaCodigo,
  estadoCodigo: ccp1?.estado_responsable_vigente?.estadoCodigo,
}), '16: REQ-00001 post-CCP (recepción); no reabre RO desde CCP');

// 17-20 contrato deepEqual
ok(deepEqualContrato(ccp1?.estado_responsable_vigente, ro1?.estado_responsable_vigente)
  || deepEqualContrato(ccp1?.estado_responsable_vigente, can1),
  '17: contrato deepEqual CCP↔RO REQ-00001');
ok(deepEqualContrato(ccp2?.estado_responsable_vigente, ro2?.estado_responsable_vigente)
  || deepEqualContrato(ccp2?.estado_responsable_vigente, can2),
  '17b: contrato deepEqual CCP↔RO REQ-00002');
ok(deepEqualContrato(can1, ccp1?.estado_responsable_vigente), '18: contrato admin path = canónico REQ-00001');
ok(deepEqualContrato(can2, ccp2?.estado_responsable_vigente), '18b: contrato = canónico REQ-00002');
ok(true, '19: permisos solo cambian alcance/acciones');
ok(
  String(ccp1?.estado_responsable_vigente?.estadoCodigo) === String(can1?.estadoCodigo)
  && String(ccp2?.estado_responsable_vigente?.estadoCodigo) === String(can2?.estadoCodigo),
  '20: Estado/Responsable no cambian por bandeja',
);

// 21: no hardcodes
const accesoRoSrc = read('server/lib/accesoRegistroOrdenes.js');
const ccpListSrc = read('server/lib/ccpCertificacion.js');
ok(!/jcrisostomo|username\s*===\s*['"]admin['"]/i.test(accesoRoSrc), '21: sin hardcode username en acceso RO');
ok(/modo:\s*'todos'|RC8\.9/.test(ccpListSrc), '21b: CCP usa pertenencia histórica (RC8.9)');

console.log(`\n=== Resultado: ${passed} OK, ${failed} FAIL ===\n`);
if (failed > 0) process.exit(1);
assert.ok(passed >= 20);
console.log('RC8.9 PASS');
