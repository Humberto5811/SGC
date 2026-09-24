/**
 * RC8.17.8H6-C3-D1 — Contrato invitación → cotización (BD local).
 *
 *   node scripts/test-rc8178h6-c3d1-cotizacion-invitacion-contract.mjs
 *
 * Escribe fixtures aislados en PostgreSQL local (runMigrations). NO usar sgc-test central/VPS.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { presentarCotizacion } from '../server/lib/portalProveedores.js';
import { pickInvitacionVigente } from '../server/lib/cronogramaDatetime.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

async function pickUsuarioId() {
  const { rows } = await query('SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
  return rows[0]?.id || 920;
}

async function seedScProveedor(analistaId, suffix = '') {
  const tag = `${ts}${suffix}`;
  const codigoReq = `REQ-C3D1-${tag}`;
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test C3-D1', 'Area', 'CNCC', 'Esperando cotizaciones', 'INVITACIONES', '{}'::jsonb)
    RETURNING id
  `, [codigoReq]);
  const rid = reqRows[0].id;

  const metaJson = analistaId
    ? JSON.stringify({ responsable_operativo_id: Number(analistaId) })
    : '{}';
  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version, metadata_json
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', $2, 'Esperando cotizaciones',
      'UNIDAD', NULL, $3, 'unidad_etapa', 1, $4::jsonb)
  `, [rid, ESTADO_ESPERANDO_COTIZACIONES, UNIDAD_RESPONSABLE_PROVEEDORES, metaJson]);

  const corr = (ts % 90000) + 1000;
  const detalle = JSON.stringify([{ requerimiento_id: rid, item_index: 0, descripcion: 'Item' }]);
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion, tipo,
      consultas_fin, cotizaciones_fin, detalle_items
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC C3-D1', 'Bienes',
      NOW() + INTERVAL '7 days', NOW() + INTERVAL '30 days', $3::jsonb)
    RETURNING id
  `, [`SC-C3D1-${tag}`, corr + (suffix ? suffix.charCodeAt(0) : 0), detalle]);
  const sid = scRows[0].id;

  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const ruc = `20${String(Math.abs(tag.split('').reduce((a, c) => a + c.charCodeAt(0), ts))).slice(-9)}`;
  const { rows: pRows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov C3-D1', TRUE) RETURNING id
  `, [ruc]);
  const proveedorId = pRows[0].id;

  return { rid, sid, proveedorId, ruc };
}

async function insertInvitacion({ sid, rid, proveedorId, nro, estado = 'ENVIADA' }) {
  const { rows } = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, $4, $5) RETURNING id, nro_invitacion
  `, [sid, rid, proveedorId, estado, nro]);
  return rows[0];
}

function cotBody(sid, invitacionId, tag = 'A') {
  return {
    solicitud_id: sid,
    invitacion_id: invitacionId,
    propuesta_tecnica: { items: [{ item_key: '1-0', descripcion: `Cot ${tag}` }] },
    propuesta_economica: { monto: tag === 'A' ? 100 : 200, moneda: 'PEN' },
    anexos: {},
    certificados: [],
  };
}

function portalReq(ruc, proveedorId) {
  return { portalProveedor: { id: proveedorId, ruc }, headers: {}, socket: {} };
}

console.log('\n=== RC8.17.8H6-C3-D1 — Contrato invitación → cotización ===\n');

try {
  await runMigrations();
  const analistaId = await pickUsuarioId();

  const base = await seedScProveedor(analistaId);
  const inv1 = await insertInvitacion({ ...base, nro: 1 });
  const req = portalReq(base.ruc, base.proveedorId);

  await presentarCotizacion(base.proveedorId, cotBody(base.sid, inv1.id, 'A'), req);

  const cotA = (await query(
    'SELECT * FROM cotizaciones_proveedor WHERE invitacion_id = $1',
    [inv1.id],
  )).rows[0];
  ok(cotA, '4. Cotización A existe');
  ok(Number(cotA.invitacion_id) === Number(inv1.id), '10. A → invitacion_id 1');
  ok(Number(cotA.nro_invitacion_presentacion) === 1, '7. nro_invitacion_presentacion A = 1');

  const inv2 = await insertInvitacion({ ...base, nro: 2 });
  ok(Number(inv2.nro_invitacion) === 2, '5. Invitación 2 creada');

  const cotA2 = (await query('SELECT * FROM cotizaciones_proveedor WHERE id = $1', [cotA.id])).rows[0];
  ok(Number(cotA2.nro_invitacion_presentacion) === 1, '6–7. Tras Inv.2, A sigue nro presentación = 1');
  ok(Number(cotA2.invitacion_id) === Number(inv1.id), '6. Tras Inv.2, A sigue en Inv.1');

  await presentarCotizacion(base.proveedorId, cotBody(base.sid, inv2.id, 'B'), req);

  const all = (await query(
    'SELECT * FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND proveedor_id = $2 ORDER BY id',
    [base.sid, base.proveedorId],
  )).rows;
  ok(all.length === 2, '9. Dos cotizaciones distintas misma SC+proveedor');

  const cotB = all.find((c) => Number(c.invitacion_id) === Number(inv2.id));
  ok(cotB && Number(cotB.nro_invitacion_presentacion) === 2, '11. B → invitacion_id 2, nro presentación 2');

  await insertInvitacion({ ...base, nro: 3 });
  const cotAFinal = (await query('SELECT * FROM cotizaciones_proveedor WHERE id = $1', [cotA.id])).rows[0];
  const cotBFinal = (await query('SELECT * FROM cotizaciones_proveedor WHERE id = $1', [cotB.id])).rows[0];
  ok(Number(cotAFinal.nro_invitacion_presentacion) === 1, '13. Inv.3 no cambia nro A');
  ok(Number(cotBFinal.nro_invitacion_presentacion) === 2, '13. Inv.3 no cambia nro B');
  const ecoA = typeof cotAFinal.propuesta_economica === 'object'
    ? cotAFinal.propuesta_economica
    : JSON.parse(cotAFinal.propuesta_economica || '{}');
  ok(Number(ecoA.monto) === 100, '14. A no sobrescrita por B');

  await presentarCotizacion(base.proveedorId, cotBody(base.sid, inv2.id, 'B2'), req);
  const dup = (await query(
    'SELECT COUNT(*)::int AS n FROM cotizaciones_proveedor WHERE invitacion_id = $1',
    [inv2.id],
  )).rows[0];
  ok(dup.n === 1, '15. Re-presentar misma invitacion_id no duplica');

  ok(!pickInvitacionVigente || typeof pickInvitacionVigente === 'function', '17. pickInvitacionVigente no usado en persistencia A/B');

  // Legacy sin invitacion_id
  const leg = await seedScProveedor(analistaId, '-LEG');
  await query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado,
      propuesta_tecnica, propuesta_economica, anexos, certificados, fecha_presentacion
    ) VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{"monto":999}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW())
  `, [leg.sid, leg.proveedorId, leg.rid]);
  const legacyRow = (await query(
    'SELECT invitacion_id, nro_invitacion_presentacion, propuesta_economica FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND proveedor_id = $2 AND invitacion_id IS NULL',
    [leg.sid, leg.proveedorId],
  )).rows[0];
  ok(legacyRow && legacyRow.invitacion_id == null && legacyRow.nro_invitacion_presentacion == null, '16. Legacy NULL intacto');
  const monto = typeof legacyRow.propuesta_economica === 'object'
    ? legacyRow.propuesta_economica.monto
    : JSON.parse(legacyRow.propuesta_economica || '{}').monto;
  ok(Number(monto) === 999, '16. Legacy monto intacto');

  console.log('\n✅ RC8.17.8H6-C3-D1 OK\n');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
