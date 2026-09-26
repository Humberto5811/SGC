/**
 * RC8.17.8H6-C3-D4.1 — Tests reconciliador legacy cotización ↔ invitación.
 *
 *   node scripts/test-rc8178h6-c3d41-cotizacion-invitacion-legacy.mjs
 */
import assert from 'node:assert/strict';
import pool, { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  resolveLegacyCotizacionInvitacionLink,
  applyLegacyCotizacionInvitacionLink,
  analyzeLegacyCotizaciones,
  isLegacyCotizacionRow,
} from '../server/lib/reconcileCotizacionInvitacionLegacy.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

function rucForTag(tag) {
  const salt = String(tag).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return String(20000000000 + ((ts + salt) % 999999999)).slice(0, 11);
}

async function seedBase(tag) {
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test D4.1', 'Area', 'CNCC', 'En tramite', 'RECEPCION_COTIZACIONES', '{}'::jsonb)
    RETURNING id
  `, [`REQ-D41-${tag}-${ts}`]);
  const rid = reqRows[0].id;
  const corr = (ts % 70000) + 7000 + Math.abs(tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 300);
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, tipo, detalle_items)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'Bienes', '[]'::jsonb) RETURNING id
  `, [`SC-D41-${tag}-${ts}`, corr]);
  const sid = scRows[0].id;
  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);
  const { rows: pRows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov D41', TRUE) RETURNING id
  `, [rucForTag(tag)]);
  return { rid, sid, proveedorId: pRows[0].id };
}

async function insertInv(sid, rid, proveedorId, nro, estado, fechaEnvio) {
  const { rows } = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion, fecha_envio)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
  `, [sid, rid, proveedorId, estado, nro, fechaEnvio]);
  return rows[0];
}

async function insertLegacyCp(sid, rid, proveedorId, fechaPresentacion) {
  const { rows } = await query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado,
      propuesta_tecnica, propuesta_economica, anexos, certificados, fecha_presentacion
    ) VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{"monto":1}'::jsonb, '[]'::jsonb, '[]'::jsonb, $4)
    RETURNING *
  `, [sid, proveedorId, rid, fechaPresentacion]);
  return rows[0];
}

console.log('\n=== RC8.17.8H6-C3-D4.1 — reconciliador legacy ===\n');
await runMigrations({ silent: true });

// A — caso real equivalente
const baseA = await seedBase('A');
const fp = new Date('2026-09-21T23:27:56Z');
await insertInv(baseA.sid, baseA.rid, baseA.proveedorId, 1, 'ENVIADA', new Date('2026-09-18T17:47:54Z'));
const inv2 = await insertInv(baseA.sid, baseA.rid, baseA.proveedorId, 2, 'COTIZACION_PRESENTADA', new Date('2026-09-18T19:27:04Z'));
const cpA = await insertLegacyCp(baseA.sid, baseA.rid, baseA.proveedorId, fp);
await insertInv(baseA.sid, baseA.rid, baseA.proveedorId, 3, 'ENVIADA', new Date('2026-09-23T17:09:30Z'));
const allInvA = (await query('SELECT * FROM invitacion_proveedores WHERE solicitud_id = $1', [baseA.sid])).rows;
const resA = resolveLegacyCotizacionInvitacionLink(cpA, allInvA);
ok(resA.status === 'reconciliable' && Number(resA.invitacion.id) === Number(inv2.id), 'A — solo Inv.2 COTIZACION_PRESENTADA elegible');

// B — ambiguo: dos ip COTIZACION_PRESENTADA
const baseB = await seedBase('B');
const fpB = new Date('2026-09-25T12:00:00Z');
await insertInv(baseB.sid, baseB.rid, baseB.proveedorId, 1, 'COTIZACION_PRESENTADA', new Date('2026-09-20T10:00:00Z'));
await insertInv(baseB.sid, baseB.rid, baseB.proveedorId, 2, 'COTIZACION_PRESENTADA', new Date('2026-09-21T10:00:00Z'));
const cpB = await insertLegacyCp(baseB.sid, baseB.rid, baseB.proveedorId, fpB);
const invsB = (await query('SELECT * FROM invitacion_proveedores WHERE solicitud_id = $1', [baseB.sid])).rows;
ok(resolveLegacyCotizacionInvitacionLink(cpB, invsB).status === 'ambiguous', 'B — dos COTIZACION_PRESENTADA => ambiguo');

// C — ninguna elegible (solo ENVIADA)
const baseC = await seedBase('C');
await insertInv(baseC.sid, baseC.rid, baseC.proveedorId, 1, 'ENVIADA', new Date('2026-09-18T10:00:00Z'));
const cpC = await insertLegacyCp(baseC.sid, baseC.rid, baseC.proveedorId, new Date('2026-09-22T10:00:00Z'));
const invsC = (await query('SELECT * FROM invitacion_proveedores WHERE solicitud_id = $1', [baseC.sid])).rows;
ok(resolveLegacyCotizacionInvitacionLink(cpC, invsC).status === 'no_candidate', 'C — sin ip COTIZACION_PRESENTADA => 0 update');

// D — invitación posterior a fecha_presentacion
const baseD = await seedBase('D');
const fpD = new Date('2026-09-20T12:00:00Z');
await insertInv(baseD.sid, baseD.rid, baseD.proveedorId, 1, 'COTIZACION_PRESENTADA', new Date('2026-09-25T12:00:00Z'));
const cpD = await insertLegacyCp(baseD.sid, baseD.rid, baseD.proveedorId, fpD);
const invsD = (await query('SELECT * FROM invitacion_proveedores WHERE solicitud_id = $1', [baseD.sid])).rows;
ok(resolveLegacyCotizacionInvitacionLink(cpD, invsD).status === 'no_candidate', 'D — ip posterior a fecha_presentacion => no candidata');

// E — otro proveedor no cuenta
const baseE = await seedBase('E');
const fpE = new Date('2026-09-22T10:00:00Z');
const { rows: p2 } = await query(`INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1,'Otro',TRUE) RETURNING id`, [rucForTag('E-alt')]);
await insertInv(baseE.sid, baseE.rid, p2[0].id, 1, 'COTIZACION_PRESENTADA', new Date('2026-09-18T10:00:00Z'));
const cpE = await insertLegacyCp(baseE.sid, baseE.rid, baseE.proveedorId, fpE);
const invsE = (await query('SELECT * FROM invitacion_proveedores WHERE solicitud_id = $1', [baseE.sid])).rows;
ok(resolveLegacyCotizacionInvitacionLink(cpE, invsE).status === 'no_candidate', 'E — candidata en otro proveedor => no reconciliar');

// F — ya canónica
const baseF = await seedBase('F');
const invF = await insertInv(baseF.sid, baseF.rid, baseF.proveedorId, 1, 'COTIZACION_PRESENTADA', new Date('2026-09-18T10:00:00Z'));
const { rows: cpFRows } = await query(`
  INSERT INTO cotizaciones_proveedor (
    solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion, estado,
    propuesta_tecnica, propuesta_economica, anexos, certificados, fecha_presentacion
  ) VALUES ($1,$2,$3,$4,1,'COTIZACION_PRESENTADA','{}'::jsonb,'{"monto":1}'::jsonb,'[]'::jsonb,'[]'::jsonb,NOW())
  RETURNING *
`, [baseF.sid, baseF.proveedorId, baseF.rid, invF.id]);
ok(!isLegacyCotizacionRow(cpFRows[0]), 'F — cp ya canónica => ignorar');

// G/H/I — apply en transacción de prueba
const baseG = await seedBase('G');
await insertInv(baseG.sid, baseG.rid, baseG.proveedorId, 1, 'ENVIADA', new Date('2026-09-18T17:00:00Z'));
await insertInv(baseG.sid, baseG.rid, baseG.proveedorId, 2, 'COTIZACION_PRESENTADA', new Date('2026-09-18T19:00:00Z'));
const cpG = await insertLegacyCp(baseG.sid, baseG.rid, baseG.proveedorId, new Date('2026-09-21T23:00:00Z'));

const client = { query: (...args) => query(...args) };
const dry = await analyzeLegacyCotizaciones(client, { cotizacionId: cpG.id });
ok(dry.reconciliable.length === 1, 'G — dry-run detecta reconciliable');
const before = (await query('SELECT invitacion_id, nro_invitacion_presentacion FROM cotizaciones_proveedor WHERE id = $1', [cpG.id])).rows[0];
ok(before.invitacion_id == null, 'G — dry-run no modifica');

const pg = await pool.connect();
try {
  await pg.query('BEGIN');
  const applied1 = await applyLegacyCotizacionInvitacionLink(pg, cpG.id);
  ok(applied1.status === 'applied', 'H — apply modifica enlace');
  await pg.query('COMMIT');
} catch (e) {
  await pg.query('ROLLBACK');
  throw e;
} finally {
  pg.release();
}
const after = (await query('SELECT invitacion_id, nro_invitacion_presentacion, estado, fecha_presentacion FROM cotizaciones_proveedor WHERE id = $1', [cpG.id])).rows[0];
ok(after.invitacion_id != null && after.nro_invitacion_presentacion === 2, 'H — solo invitacion_id y nro_invitacion_presentacion');
ok(String(after.estado).toUpperCase() === 'COTIZACION_PRESENTADA', 'H — estado cp intacto');

const applied2 = await applyLegacyCotizacionInvitacionLink({ query: (...a) => query(...a) }, cpG.id);
ok(applied2.status === 'not_legacy', 'I — segunda apply idempotente (not_legacy)');

// J — trigger impide cambiar invitacion_id ya fijado
const inv1G = (await query('SELECT id FROM invitacion_proveedores WHERE solicitud_id = $1 AND nro_invitacion = 1', [baseG.sid])).rows[0];
let triggerBlocked = false;
try {
  await query('UPDATE cotizaciones_proveedor SET invitacion_id = $1 WHERE id = $2', [inv1G.id, cpG.id]);
} catch (e) {
  triggerBlocked = /inmutable/i.test(String(e.message));
}
ok(triggerBlocked, 'J — trigger mantiene inmutabilidad post-reconciliación');

console.log('\n✅ RC8.17.8H6-C3-D4.1 tests OK\n');
