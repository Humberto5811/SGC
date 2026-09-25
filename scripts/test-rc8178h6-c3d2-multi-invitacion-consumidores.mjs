/**
 * RC8.17.8H6-C3-D2 — Multi-invitación: bandejas, portal, consumidores.
 *
 *   node scripts/test-rc8178h6-c3d2-multi-invitacion-consumidores.mjs
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  listMisInvitaciones,
  listMisCotizaciones,
  presentarCotizacion,
  listarRecepcionCotizaciones,
} from '../server/lib/portalProveedores.js';
import { getCotizacionWorkspace } from '../server/lib/portalDocumentos.js';
import { listarSolicitudesBandeja } from '../server/lib/invitaciones.js';
import {
  resolveCotizacionPresentadaExpediente,
  resolveCotizacionUnicaPorSolicitudProveedor,
} from '../server/lib/cotizacionInvitacionContract.js';
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

async function seedSc(analistaId, suffix = '') {
  const tag = `${ts}${suffix}`;
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test C3-D2', 'Area', 'CNCC', 'Esperando cotizaciones', 'INVITACIONES', '{}'::jsonb)
    RETURNING id
  `, [`REQ-D2-${tag}`]);
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

  const corr = (ts % 90000) + 3000;
  const detalle = JSON.stringify([{ requerimiento_id: rid, item_index: 0, descripcion: 'Item D2' }]);
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion, tipo,
      consultas_fin, cotizaciones_fin, detalle_items, contador_envios
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC D2', 'Bienes',
      NOW() + INTERVAL '7 days', NOW() + INTERVAL '30 days', $3::jsonb, 5)
    RETURNING id
  `, [`SC-D2-${tag}`, corr + (suffix ? suffix.charCodeAt(0) : 0), detalle]);
  const sid = scRows[0].id;
  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const ruc = `20${String(Math.abs(tag.split('').reduce((a, c) => a + c.charCodeAt(0), ts))).slice(-9)}`;
  const { rows: pRows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov D2', TRUE) RETURNING id
  `, [ruc]);
  return { rid, sid, proveedorId: pRows[0].id, ruc };
}

async function insertInv(sid, rid, proveedorId, nro, estado = 'ENVIADA') {
  const { rows } = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, $4, $5) RETURNING id, nro_invitacion, estado
  `, [sid, rid, proveedorId, estado, nro]);
  return rows[0];
}

function cotBody(sid, invId, tag) {
  return {
    solicitud_id: sid,
    invitacion_id: invId,
    propuesta_tecnica: { items: [{ item_key: '1-0', descripcion: tag }] },
    propuesta_economica: { monto: tag === 'A' ? 100 : 200, moneda: 'PEN' },
    anexos: {},
    certificados: [],
  };
}

function portalReq(ruc, proveedorId) {
  return { portalProveedor: { id: proveedorId, ruc }, headers: {}, socket: {} };
}

console.log('\n=== RC8.17.8H6-C3-D2 — Multi-invitación ===\n');

try {
  await runMigrations();
  const analistaId = await pickUsuarioId();
  const base = await seedSc(analistaId);
  const inv1 = await insertInv(base.sid, base.rid, base.proveedorId, 1);
  const inv2 = await insertInv(base.sid, base.rid, base.proveedorId, 2);
  const req = portalReq(base.ruc, base.proveedorId);

  await presentarCotizacion(base.proveedorId, cotBody(base.sid, inv1.id, 'A'), req);

  const misInv = await listMisInvitaciones(base.proveedorId);
  const mineInv = misInv.filter((r) => r.solicitud_id === base.sid);
  ok(mineInv.length === 2, '6. Mis Invitaciones: Inv.1 e Inv.2 separadas');
  const inv1Row = mineInv.find((r) => Number(r.invitacion_id) === Number(inv1.id));
  const inv2Row = mineInv.find((r) => Number(r.invitacion_id) === Number(inv2.id));
  ok(inv1Row?.estado === 'COTIZACION_PRESENTADA', '7. Inv.1 cotización presentada');
  ok(inv2Row?.estado === 'ENVIADA', '8. Inv.2 disponible para cotizar');

  const ws2 = await getCotizacionWorkspace(base.proveedorId, base.sid, { invitacionId: inv2.id });
  ok(!ws2.cotizacion_existente?.id, '9. Workspace Inv.2 no carga cotización A');
  ok(Number(ws2.invitacion_vigente?.id) === Number(inv2.id), '9b. Workspace usa invitacion_id exacto');

  await presentarCotizacion(base.proveedorId, cotBody(base.sid, inv2.id, 'B'), req);

  const misCot = await listMisCotizaciones(base.proveedorId);
  const mineCot = misCot.filter((r) => r.solicitud_id === base.sid);
  ok(mineCot.length === 2, '11. Mis Cotizaciones: A y B');
  ok(Number(mineCot.find((c) => Number(c.invitacion_id) === Number(inv1.id))?.nro_invitacion) === 1, '12. A → nro 1');
  ok(Number(mineCot.find((c) => Number(c.invitacion_id) === Number(inv2.id))?.nro_invitacion) === 2, '13. B → nro 2');

  await insertInv(base.sid, base.rid, base.proveedorId, 3);
  const after3 = (await query(
    'SELECT nro_invitacion_presentacion FROM cotizaciones_proveedor WHERE solicitud_id = $1 ORDER BY id',
    [base.sid],
  )).rows;
  ok(Number(after3[0].nro_invitacion_presentacion) === 1 && Number(after3[1].nro_invitacion_presentacion) === 2, '14. Inv.3 no renumera');

  const bandeja = await listarSolicitudesBandeja(1, 50, { search: `SC-D2-${ts}` });
  const mine = (bandeja.data || []).filter((r) => Number(r.solicitud_id || r.id) === Number(base.sid));
  ok(mine.length === 3, '15. Bandeja solicitudes: 3 filas (una por invitación)');
  ok(mine.every((r) => r.invitacion_id != null), '15b. Cada fila tiene invitacion_id');
  ok(mine.every((r) => Number(r.cotizaciones_recibidas || 0) <= 1), '16. Cotización contada por invitacion_id');

  const recep = await listarRecepcionCotizaciones({});
  const recepMine = recep.filter((r) => r.solicitud_id === base.sid && r.proveedor_id === base.proveedorId);
  ok(recepMine.length === 2, '17. Recepción A y B separadas');

  let threw = false;
  try {
    await resolveCotizacionUnicaPorSolicitudProveedor(base.sid, base.proveedorId, { context: 'test D2' });
  } catch (e) {
    threw = e.code === 'COTIZACION_AMBIGUA';
  }
  ok(threw, '18. Sin cotizacion_id explícito → COTIZACION_AMBIGUA');

  let threwLoc = false;
  try {
    await resolveCotizacionPresentadaExpediente(base.sid, { context: 'test D2 loc' });
  } catch (e) {
    threwLoc = e.code === 'COTIZACION_AMBIGUA';
  }
  ok(threwLoc, '18b. resolveCotizacionPresentadaExpediente no elige arbitrariamente');

  const invGhost = await insertInv(base.sid, base.rid, base.proveedorId, 88);
  await query('DELETE FROM invitacion_proveedores WHERE id = $1', [invGhost.id]);
  const afterDel = await listMisInvitaciones(base.proveedorId);
  ok(!afterDel.some((r) => Number(r.invitacion_id) === Number(invGhost.id)), '19. Invitación eliminada no listada');

  const leg = await seedSc(analistaId, '-LEG');
  await query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado,
      propuesta_tecnica, propuesta_economica, anexos, certificados, fecha_presentacion
    ) VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{"monto":1}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW())
  `, [leg.sid, leg.proveedorId, leg.rid]);
  const legCots = await listMisCotizaciones(leg.proveedorId);
  const legRow = legCots.find((c) => c.solicitud_id === leg.sid);
  ok(legRow?.es_legacy && legRow.nro_invitacion == null, '20. Legacy sin nro inventado');

  console.log('\n✅ RC8.17.8H6-C3-D2 OK\n');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
