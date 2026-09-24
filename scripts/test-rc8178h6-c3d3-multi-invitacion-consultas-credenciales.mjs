/**
 * RC8.17.8H6-C3-D3 — Multi-invitación consultas/observaciones + credenciales portal.
 *
 *   node scripts/test-rc8178h6-c3d3-multi-invitacion-consultas-credenciales.mjs
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  listConsultasProveedor,
  registrarConsulta,
  registrarObservacion,
  portalChangePassword,
  portalLogin,
} from '../server/lib/portalProveedores.js';
import {
  ensureProveedorPortalAccount,
  prepararInvitacionPortal,
} from '../server/lib/proveedorPortal.js';
import { buildInvitacionEmailContent } from '../server/lib/emailService.js';
import { assertInvitacionPortalAccion } from '../server/lib/cotizacionInvitacionContract.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

async function pickAnalistaId() {
  const { rows } = await query('SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
  return rows[0]?.id || 920;
}

async function seedSc(analistaId, suffix = '') {
  const tag = `D3-${ts}${suffix}`;
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test C3-D3', 'Area', 'CNCC', 'Esperando cotizaciones', 'INVITACIONES', '{}'::jsonb)
    RETURNING id
  `, [`REQ-${tag}`]);
  const rid = reqRows[0].id;
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version, metadata_json
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', $2, 'Esperando cotizaciones',
      'UNIDAD', NULL, $3, 'unidad_etapa', 1, '{}'::jsonb)
  `, [rid, ESTADO_ESPERANDO_COTIZACIONES, UNIDAD_RESPONSABLE_PROVEEDORES]);
  await query(`
    INSERT INTO expediente_asignaciones (
      requerimiento_id, usuario_id, etapa_codigo, tipo_responsable, activo, origen_asignacion
    ) VALUES ($1, $2, 'INVITACIONES', 'PERSONA', TRUE, 'test-d3')
  `, [rid, analistaId]);

  const corr = (ts % 90000) + 4000 + (suffix ? suffix.charCodeAt(0) * 17 : 0);
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion, tipo,
      consultas_fin, cotizaciones_fin, detalle_items
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC D3', 'Bienes',
      NOW() + INTERVAL '7 days', NOW() + INTERVAL '30 days', '[]'::jsonb)
    RETURNING id
  `, [`SC-${tag}`, corr]);
  const sid = scRows[0].id;
  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const ruc = `20${String(Math.abs(tag.split('').reduce((a, c) => a + c.charCodeAt(0), ts))).slice(-9)}`;
  const { rows: pRows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo, emails) VALUES ($1, 'Prov D3', TRUE, $2::jsonb) RETURNING id, ruc
  `, [ruc, JSON.stringify([`${ruc}@test.local`])]);
  return { rid, sid, proveedorId: pRows[0].id, ruc: pRows[0].ruc };
}

async function insertInv(sid, rid, proveedorId, nro) {
  const { rows } = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', $4) RETURNING id, nro_invitacion
  `, [sid, rid, proveedorId, nro]);
  return rows[0];
}

const fakeReq = { portalProveedor: { ruc: 'PORTAL-D3' }, headers: {}, socket: {} };

console.log('\n=== RC8.17.8H6-C3-D3 — consultas + credenciales ===\n');
await runMigrations({ silent: true });

const analistaId = await pickAnalistaId();
const { rid, sid, proveedorId, ruc } = await seedSc(analistaId);
fakeReq.portalProveedor.id = proveedorId;

const inv1 = await insertInv(sid, rid, proveedorId, 1);
ok(inv1.id, 'Inv.1 creada');

const cInv1 = await registrarConsulta(proveedorId, {
  solicitud_id: sid,
  invitacion_id: inv1.id,
  asunto: 'Q1',
  consulta: 'Consulta invitación 1',
}, fakeReq);
ok(Number(cInv1.invitacion_id) === Number(inv1.id), '3 — consulta Inv.1 asociada a Inv.1');

const inv2 = await insertInv(sid, rid, proveedorId, 2);
ok(inv2.id, '4 — Inv.2 creada');

const cInv2 = await registrarConsulta(proveedorId, {
  solicitud_id: sid,
  invitacion_id: inv2.id,
  asunto: 'Q2',
  consulta: 'Consulta invitación 2',
}, fakeReq);
ok(Number(cInv2.invitacion_id) === Number(inv2.id), '5 — consulta Inv.2 asociada a Inv.2');

const { rows: c1Row } = await query('SELECT invitacion_id FROM consultas_proveedor WHERE id = $1', [cInv1.id]);
ok(Number(c1Row[0].invitacion_id) === Number(inv1.id), '6 — Inv.1 conserva su consulta');

const obs2 = await registrarObservacion(proveedorId, {
  solicitud_id: sid,
  invitacion_id: inv2.id,
  observacion: 'Obs Inv.2',
}, fakeReq);
ok(Number(obs2.invitacion_id) === Number(inv2.id), '7 — observación Inv.2 no atribuida a Inv.1');

const { rows: obsInv1 } = await query(
  'SELECT id FROM observaciones_proveedor WHERE invitacion_id = $1',
  [inv1.id],
);
ok(obsInv1.length === 0, '7b — sin observaciones en Inv.1');

let rejected = false;
try {
  await registrarConsulta(proveedorId, {
    solicitud_id: sid,
    invitacion_id: inv2.id + 99999,
    consulta: 'x',
  }, fakeReq);
} catch (e) {
  rejected = e.status === 403;
}
ok(rejected, '8 — invitacion_id ajeno → rechazo');

const { sid: sidOther, rid: ridOther, proveedorId: pidOther } = await seedSc(analistaId, '-other');
const invOther = await insertInv(sidOther, ridOther, pidOther, 1);
rejected = false;
try {
  await assertInvitacionPortalAccion(proveedorId, sid, invOther.id);
} catch (e) {
  rejected = e.status === 403;
}
ok(rejected, '9 — invitacion_id de otra SC → rechazo');

await query(`
  INSERT INTO consultas_proveedor (solicitud_id, proveedor_id, requerimiento_id, invitacion_id, asunto, consulta)
  VALUES ($1, $2, $3, NULL, 'Legacy', 'Consulta sin invitacion_id')
`, [sid, proveedorId, rid]);
const allCons = await listConsultasProveedor(proveedorId, sid);
ok(allCons.some((r) => r.asunto === 'Legacy' && r.invitacion_id == null), '10 — legacy NULL listable sin filtro invitación');

const onlyInv2 = await listConsultasProveedor(proveedorId, sid, inv2.id);
ok(onlyInv2.every((r) => Number(r.invitacion_id) === Number(inv2.id)), 'C — listado Inv.2 no mezcla Inv.1');

// --- Credenciales ---
const proveedorObj = { id: proveedorId, ruc, razon_social: 'Prov D3', emails: [`${ruc}@test.local`] };

const accNew = await ensureProveedorPortalAccount(proveedorObj, {
  passwordTemporal: ruc,
  estadoInvitacion: 'ENVIADA',
});
ok(accNew.primer_ingreso === true, '11-12 — cuenta nueva primer_ingreso TRUE');
const hashRef1 = accNew.password_hash;
ok(hashRef1, '11 — hash inicial presente');

await portalChangePassword(proveedorId, { actual: ruc, nueva: 'MiClaveSegura1' });
const { rows: ppAfter } = await query('SELECT primer_ingreso, password_hash FROM proveedor_portal WHERE proveedor_id = $1', [proveedorId]);
ok(ppAfter[0].primer_ingreso === false, '14 — primer_ingreso FALSE tras cambio');
const hashRef = ppAfter[0].password_hash;
ok(hashRef !== hashRef1, '13 — hash cambió tras password válido');

await prepararInvitacionPortal(inv2.id, proveedorObj);
const { rows: ppRe2 } = await query('SELECT password_hash, primer_ingreso FROM proveedor_portal WHERE proveedor_id = $1', [proveedorId]);
ok(ppRe2[0].password_hash === hashRef, '17 — reinvitar Inv.2 no cambia hash');
ok(ppRe2[0].primer_ingreso === false, '18 — primer_ingreso sigue FALSE');

await prepararInvitacionPortal(inv1.id, proveedorObj);
const { rows: ppRe3 } = await query('SELECT password_hash FROM proveedor_portal WHERE proveedor_id = $1', [proveedorId]);
ok(ppRe3[0].password_hash === hashRef, '20 — reinvitar Inv.3/1 no cambia hash');

const loginOk = await portalLogin(ruc, 'MiClaveSegura1', fakeReq);
ok(loginOk?.id === proveedorId, '21 — login con contraseña establecida');

const mailNuevo = buildInvitacionEmailContent({
  proveedor: proveedorObj,
  solicitud: { codigo: 'SC-X' },
  credenciales: { usuario: ruc, clave: ruc },
});
ok(mailNuevo.text.includes('Contraseña temporal'), '22a — cuenta nueva incluye clave temporal');

const mailExist = buildInvitacionEmailContent({
  proveedor: proveedorObj,
  solicitud: { codigo: 'SC-X' },
  credenciales: { usuario: ruc, cuentaExistente: true },
});
ok(!mailExist.text.includes('Contraseña temporal:'), '22b — reinvitación cuenta existente sin clave temporal falsa');
ok(mailExist.text.includes('contraseña que usted definió'), '22c — texto cuenta activa');

let pwdErrStatus = null;
try {
  await portalChangePassword(proveedorId, { actual: 'wrong-pass', nueva: 'OtraClave9' });
} catch (e) {
  pwdErrStatus = e.status;
}
ok(pwdErrStatus === 401, '23 — contraseña actual incorrecta → 401, no 500');

let missingInv = false;
try {
  await registrarConsulta(proveedorId, { solicitud_id: sid, consulta: 'sin inv' }, fakeReq);
} catch (e) {
  missingInv = e.status === 400 && /invitacion_id/i.test(e.message);
}
ok(missingInv, '8b — falta invitacion_id con N invitaciones → 400');

console.log('\n✅ C3-D3 OK\n');
