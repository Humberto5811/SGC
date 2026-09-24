/**
 * RC8.17.8H6-C3-D1.1 — Aislamiento cotización/adjuntos/recepción (BD local).
 *
 *   node scripts/test-rc8178h6-c3d1.1-cotizacion-aislamiento.mjs
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { presentarCotizacion } from '../server/lib/portalProveedores.js';
import {
  uploadCotizacionPortalAdjunto,
  deleteCotizacionPortalAdjunto,
} from '../server/lib/portalCotizacionAdjuntos.js';
import { listarRecepcionCotizaciones } from '../server/lib/portalProveedores.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };
const B64 = Buffer.from('doc-a').toString('base64');
const B64B = Buffer.from('doc-b').toString('base64');

async function pickUsuarioId() {
  const { rows } = await query('SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
  return rows[0]?.id || 920;
}

async function seedScProveedor(analistaId, suffix = '') {
  const tag = `${ts}-D11${suffix}`;
  const codigoReq = `REQ-C3D11-${tag}`;
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test C3-D1.1', 'Area', 'CNCC', 'Esperando cotizaciones', 'INVITACIONES', '{}'::jsonb)
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

  const corr = (ts % 90000) + 2000;
  const detalle = JSON.stringify([{ requerimiento_id: rid, item_index: 0, descripcion: 'Item' }]);
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion, tipo,
      consultas_fin, cotizaciones_fin, detalle_items
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC C3-D1.1', 'Bienes',
      NOW() + INTERVAL '7 days', NOW() + INTERVAL '30 days', $3::jsonb)
    RETURNING id
  `, [`SC-C3D11-${tag}`, corr, detalle]);
  const sid = scRows[0].id;
  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const ruc = `20${String(Math.abs(tag.split('').reduce((a, c) => a + c.charCodeAt(0), ts))).slice(-9)}`;
  const { rows: pRows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov C3-D1.1', TRUE) RETURNING id
  `, [ruc]);
  return { rid, sid, proveedorId: pRows[0].id, ruc };
}

async function insertInvitacion({ sid, rid, proveedorId, nro }) {
  const { rows } = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', $4) RETURNING id, nro_invitacion, estado
  `, [sid, rid, proveedorId, nro]);
  return rows[0];
}

function cotBody(sid, invitacionId, tag) {
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

console.log('\n=== RC8.17.8H6-C3-D1.1 — Aislamiento cotización/adjuntos ===\n');

try {
  await runMigrations();
  const analistaId = await pickUsuarioId();
  const base = await seedScProveedor(analistaId);
  const inv1 = await insertInvitacion({ ...base, nro: 1 });
  const inv2 = await insertInvitacion({ ...base, nro: 2 });
  const req = portalReq(base.ruc, base.proveedorId);

  const adjA = await uploadCotizacionPortalAdjunto(base.proveedorId, base.sid, {
    invitacion_id: inv1.id,
    key: 'doc-slot-1',
    nombre_archivo: 'a.pdf',
    contenido_base64: B64,
  });
  const adjB = await uploadCotizacionPortalAdjunto(base.proveedorId, base.sid, {
    invitacion_id: inv2.id,
    key: 'doc-slot-1',
    nombre_archivo: 'b.pdf',
    contenido_base64: B64B,
  });
  ok(Number(adjA.invitacion_id) === Number(inv1.id), '8. Documento A → invitación 1');
  ok(Number(adjB.invitacion_id) === Number(inv2.id), '9. Documento B → invitación 2');
  ok(adjA.id !== adjB.id, '8–9. Adjuntos distintos');

  await presentarCotizacion(base.proveedorId, cotBody(base.sid, inv1.id, 'A'), req);
  const inv1After = (await query('SELECT estado FROM invitacion_proveedores WHERE id = $1', [inv1.id])).rows[0];
  ok(inv1After.estado === 'COTIZACION_PRESENTADA', '12. Presentar A marca invitación A');

  await presentarCotizacion(base.proveedorId, cotBody(base.sid, inv2.id, 'B'), req);
  const inv1AfterB = (await query('SELECT estado FROM invitacion_proveedores WHERE id = $1', [inv1.id])).rows[0];
  ok(inv1AfterB.estado === 'COTIZACION_PRESENTADA', '12. Presentar B no revierte invitación A');

  const adjARow = (await query('SELECT contenido_base64, cotizacion_id FROM cotizaciones_proveedor_adjuntos WHERE id = $1', [adjA.id])).rows[0];
  const cotA = (await query('SELECT id FROM cotizaciones_proveedor WHERE invitacion_id = $1', [inv1.id])).rows[0];
  ok(Number(adjARow.cotizacion_id) === Number(cotA.id), 'Adjunto A enlazado a cotización A');

  await uploadCotizacionPortalAdjunto(base.proveedorId, base.sid, {
    invitacion_id: inv2.id,
    key: 'doc-slot-1',
    nombre_archivo: 'b2.pdf',
    contenido_base64: Buffer.from('doc-b-replaced').toString('base64'),
  });
  const adjAFinal = (await query('SELECT nombre_archivo FROM cotizaciones_proveedor_adjuntos WHERE id = $1', [adjA.id])).rows[0];
  ok(adjAFinal.nombre_archivo === 'a.pdf', '10. Reemplazar B no modifica A');

  const adjBId = (await query(
    'SELECT id FROM cotizaciones_proveedor_adjuntos WHERE invitacion_id = $1 AND slot_key = $2',
    [inv2.id, 'doc-slot-1'],
  )).rows[0].id;
  await deleteCotizacionPortalAdjunto(base.proveedorId, base.sid, adjBId);
  const stillA = (await query('SELECT id FROM cotizaciones_proveedor_adjuntos WHERE id = $1', [adjA.id])).rows[0];
  ok(!!stillA, '11. Eliminar B no elimina A');

  const recep = await listarRecepcionCotizaciones({});
  const mine = recep.filter((r) => r.solicitud_id === base.sid && r.proveedor_id === base.proveedorId);
  ok(mine.length === 2, '14. Recepción devuelve A y B separadas');
  ok(mine.every((r) => r.invitacion_id != null), '14. Recepción incluye invitacion_id');
  ok(new Set(mine.map((r) => r.id)).size === 2, '14. Distintos cotizacion_id');

  await insertInvitacion({ ...base, nro: 3 });
  const cots = (await query(
    'SELECT nro_invitacion_presentacion FROM cotizaciones_proveedor WHERE solicitud_id = $1 ORDER BY id',
    [base.sid],
  )).rows;
  ok(Number(cots[0].nro_invitacion_presentacion) === 1 && Number(cots[1].nro_invitacion_presentacion) === 2, '13. Inv.3 no renumera A/B');

  const leg = await seedScProveedor(analistaId, '-LEG');
  await query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado,
      propuesta_tecnica, propuesta_economica, anexos, certificados, fecha_presentacion
    ) VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{"monto":1}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW())
  `, [leg.sid, leg.proveedorId, leg.rid]);
  await uploadCotizacionPortalAdjunto(leg.proveedorId, leg.sid, {
    key: 'legacy-slot',
    nombre_archivo: 'leg.pdf',
    contenido_base64: B64,
  });
  const legAdj = (await query(
    'SELECT invitacion_id FROM cotizaciones_proveedor_adjuntos WHERE solicitud_id = $1 AND slot_key = $2',
    [leg.sid, 'legacy-slot'],
  )).rows[0];
  ok(legAdj && legAdj.invitacion_id == null, '15. Adjunto legacy sin invitacion_id');

  console.log('\n✅ RC8.17.8H6-C3-D1.1 OK\n');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
