/**
 * RC8.17.8H6-C3-D4 — Bandeja multi-invitación + consultas en Recepción (ERV preservado).
 *
 *   node scripts/test-rc8178h6-c3d4-bandeja-consultas-recepcion.mjs
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { listarSolicitudesBandeja } from '../server/lib/invitaciones.js';
import {
  registrarConsulta,
  responderConsultaAnalista,
  presentarCotizacion,
} from '../server/lib/portalProveedores.js';
import { assertInvitacionPortalAccion } from '../server/lib/cotizacionInvitacionContract.js';
import { ESTADO_PILOT_EN_TRAMITE } from '../server/lib/pilotRegistroEvaluacion.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';
import { ETAPA_CONSULTAS, consultaPreservaErvRecepcion } from '../server/lib/consultasExpedienteEstado.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

async function pickAnalistaId() {
  const { rows } = await query('SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
  return rows[0]?.id || 920;
}

async function seedReqSc(analistaId, tag, ervEtapa = 'RECEPCION_COTIZACIONES') {
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test C3-D4', 'Area', 'CNCC', 'En tramite', $2, '{}'::jsonb)
    RETURNING id
  `, [`REQ-D4-${tag}`, ervEtapa === 'INVITACIONES' ? 'INVITACIONES' : 'RECEPCION_COTIZACIONES']);
  const rid = reqRows[0].id;

  if (ervEtapa === 'INVITACIONES') {
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
      ) VALUES ($1, $2, 'INVITACIONES', 'PERSONA', TRUE, 'test-d4')
    `, [rid, analistaId]);
  } else {
    await query(`
      INSERT INTO expediente_estado_vigente (
        requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
        responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version, metadata_json
      ) VALUES ($1, 'RECEPCION_COTIZACIONES', 'Recepción de Cotizaciones', $2, 'En trámite',
        'PERSONA', $3, 'Recepción de Cotizaciones', 'asignacion_explicita', 1, '{}'::jsonb)
    `, [rid, ESTADO_PILOT_EN_TRAMITE, analistaId]);
  }

  const corr = (ts % 80000) + 5000 + Math.abs(tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 500);
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion, tipo,
      consultas_inicio, consultas_fin, cotizaciones_inicio, cotizaciones_fin, detalle_items, contador_envios
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC D4', 'Bienes',
      NOW() - INTERVAL '1 day', NOW() + INTERVAL '7 days',
      NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', '[]'::jsonb, 6)
    RETURNING id
  `, [`SC-D4-${tag}`, corr]);
  const sid = scRows[0].id;
  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const ruc = `20${String(Math.abs(tag.split('').reduce((a, c) => a + c.charCodeAt(0), ts))).slice(-9)}`;
  const { rows: pRows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo, emails) VALUES ($1, 'Prov D4', TRUE, '[]'::jsonb) RETURNING id, ruc
  `, [ruc]);
  return { rid, sid, proveedorId: pRows[0].id, ruc: pRows[0].ruc };
}

async function insertInv(sid, rid, proveedorId, nro, estado = 'ENVIADA') {
  const { rows } = await query(`
    INSERT INTO invitacion_proveedores (
      solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion, fecha_envio
    ) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, nro_invitacion
  `, [sid, rid, proveedorId, estado, nro]);
  return rows[0];
}

function cotBody(sid, invId, monto) {
  return {
    solicitud_id: sid,
    invitacion_id: invId,
    propuesta_tecnica: { items: [{ item_key: '1-0', descripcion: `COT-${monto}` }] },
    propuesta_economica: { monto, moneda: 'PEN' },
    anexos: {},
    certificados: [],
  };
}

function portalReq(proveedorId, ruc) {
  return { portalProveedor: { id: proveedorId, ruc }, headers: {}, socket: {} };
}

async function readErv(rid) {
  const { rows } = await query(
    'SELECT etapa_codigo, estado_codigo, responsable_tipo, responsable_usuario_id FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [rid],
  );
  return rows[0];
}

async function expectConsultaRcBlocked(proveedorId, sid, invId, reqObj, label) {
  let blocked = false;
  try {
    await registrarConsulta(proveedorId, {
      solicitud_id: sid,
      invitacion_id: invId,
      consulta: 'No debe pasar',
    }, reqObj);
  } catch (e) {
    blocked = e.status === 409;
  }
  ok(blocked, label);
}

console.log('\n=== RC8.17.8H6-C3-D4 — bandeja + consultas Recepción ===\n');
await runMigrations({ silent: true });
const analistaId = await pickAnalistaId();
const tag = `${ts}`;
const { rid, sid, proveedorId, ruc } = await seedReqSc(analistaId, tag, 'RECEPCION_COTIZACIONES');
const req = portalReq(proveedorId, ruc);

const invs = [];
for (let n = 1; n <= 6; n += 1) {
  invs.push(await insertInv(sid, rid, proveedorId, n));
}

const inv2 = invs[1];
await presentarCotizacion(proveedorId, cotBody(sid, inv2.id, 200), req);
await query(`
  UPDATE invitacion_proveedores SET estado = 'COTIZACION_PRESENTADA' WHERE id = $1
`, [inv2.id]);

const bandeja = await listarSolicitudesBandeja(1, 50, { search: `SC-D4-${tag}` });
const mine = (bandeja.data || []).filter((r) => Number(r.solicitud_id) === Number(sid));
ok(mine.length === 6, 'K — bandeja: 6 filas Inv.1..Inv.6');
ok(mine.every((r) => r.invitacion_id != null), 'K — cada fila expone invitacion_id');
ok(new Set(mine.map((r) => Number(r.nro_invitacion))).size === 6, 'K — nro_invitacion 1..6');

const rowInv2 = mine.find((r) => Number(r.invitacion_id) === Number(inv2.id));
const rowInv6 = mine.find((r) => Number(r.nro_invitacion) === 6);
ok(Number(rowInv2?.cotizaciones_recibidas) === 1, 'K — cotización Inv.2 solo en fila Inv.2');
ok(Number(rowInv6?.cotizaciones_recibidas) === 0, 'K — Inv.6 no hereda cotización de Inv.2');

await query(`
  INSERT INTO cotizaciones_proveedor (
    solicitud_id, proveedor_id, requerimiento_id, invitacion_id, estado,
    propuesta_tecnica, propuesta_economica, anexos, certificados, fecha_presentacion
  ) VALUES ($1, $2, $3, NULL, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{"monto":99}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW())
`, [sid, proveedorId, rid]);
const bandeja2 = await listarSolicitudesBandeja(1, 50, { search: `SC-D4-${tag}` });
const afterLegacy = (bandeja2.data || []).filter((r) => Number(r.solicitud_id) === Number(sid));
ok(afterLegacy.every((r) => Number(r.cotizaciones_recibidas || 0) <= 1), 'C — legacy NULL no infla filas de invitación');
ok(afterLegacy.every((r) => Number(r.cotizaciones_recibidas) === (Number(r.invitacion_id) === Number(inv2.id) ? 1 : 0)),
  'K — legacy NULL no asignado; cotización Inv.2 solo en Inv.2');

const soloNro = await seedReqSc(analistaId, `${tag}-NRO`, 'RECEPCION_COTIZACIONES');
const invSolo9 = await insertInv(soloNro.sid, soloNro.rid, soloNro.proveedorId, 9);
await expectConsultaRcBlocked(
  soloNro.proveedorId, soloNro.sid, invSolo9.id, portalReq(soloNro.proveedorId, soloNro.ruc),
  'A — nro_invitacion alto sin cotización previa canónica → bloqueado en RC',
);

const legacyRc = await seedReqSc(analistaId, `${tag}-LEGRC`, 'RECEPCION_COTIZACIONES');
const invLeg3 = await insertInv(legacyRc.sid, legacyRc.rid, legacyRc.proveedorId, 3);
await query(`
  INSERT INTO cotizaciones_proveedor (
    solicitud_id, proveedor_id, requerimiento_id, invitacion_id, estado,
    propuesta_tecnica, propuesta_economica, anexos, certificados, fecha_presentacion
  ) VALUES ($1, $2, $3, NULL, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{"monto":1}'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW())
`, [legacyRc.sid, legacyRc.proveedorId, legacyRc.rid]);
await expectConsultaRcBlocked(
  legacyRc.proveedorId, legacyRc.sid, invLeg3.id, portalReq(legacyRc.proveedorId, legacyRc.ruc),
  'B — cotización legacy invitacion_id NULL no habilita consulta en RC',
);

const sameInvSc = await seedReqSc(analistaId, `${tag}-SAME`, 'RECEPCION_COTIZACIONES');
const invSame1 = await insertInv(sameInvSc.sid, sameInvSc.rid, sameInvSc.proveedorId, 1);
await presentarCotizacion(
  sameInvSc.proveedorId,
  cotBody(sameInvSc.sid, invSame1.id, 50),
  portalReq(sameInvSc.proveedorId, sameInvSc.ruc),
);
await expectConsultaRcBlocked(
  sameInvSc.proveedorId, sameInvSc.sid, invSame1.id, portalReq(sameInvSc.proveedorId, sameInvSc.ruc),
  'C — cotización solo de la misma invitación → bloqueado en RC',
);

const inv6 = invs[5];
const evBefore = await readErv(rid);
const consulta6 = await registrarConsulta(proveedorId, {
  solicitud_id: sid,
  invitacion_id: inv6.id,
  asunto: 'Q Inv6',
  consulta: 'Consulta reinvitación en recepción',
}, req);
ok(consulta6?.id, 'D — Inv.2 cotizada + Inv.6 posterior → consulta permitida en RC');
ok(Number(consulta6.invitacion_id) === Number(inv6.id), 'E — consulta Inv.6 conserva invitacion_id');
ok(consultaPreservaErvRecepcion(consulta6), 'E — historial preservar_erv_recepcion en consulta RC');

const evAfter = await readErv(rid);
ok(String(evAfter.etapa_codigo).toUpperCase() === 'RECEPCION_COTIZACIONES', 'F — ERV sigue RECEPCION_COTIZACIONES');
ok(String(evAfter.estado_codigo).toUpperCase() === String(evBefore.estado_codigo).toUpperCase(), 'F — EN_TRAMITE/estado preservado');
ok(Number(evAfter.responsable_usuario_id) === Number(evBefore.responsable_usuario_id), 'F — mismo responsable');

await responderConsultaAnalista(consulta6.id, { respuesta: 'Absuelto D4', publicar: false }, 'analista-d4');
const evPostAbs = await readErv(rid);
ok(String(evPostAbs.etapa_codigo).toUpperCase() === 'RECEPCION_COTIZACIONES', 'G — responder consulta RC preserva ERV explícitamente');
ok(String(evPostAbs.estado_codigo).toUpperCase() === String(evBefore.estado_codigo).toUpperCase(), 'G — estado ERV sin cambio tras respuesta');

const pre = await seedReqSc(analistaId, `${tag}-PRE`, 'INVITACIONES');
const invPre = await insertInv(pre.sid, pre.rid, pre.proveedorId, 1);
const reqPre = portalReq(pre.proveedorId, pre.ruc);
await registrarConsulta(pre.proveedorId, {
  solicitud_id: pre.sid,
  invitacion_id: invPre.id,
  asunto: 'Pre recep',
  consulta: 'Flujo clásico',
}, reqPre);
const evPre = await readErv(pre.rid);
ok(String(evPre.etapa_codigo).toUpperCase() === ETAPA_CONSULTAS, 'H — antes de Recepción → CONSULTAS_OBSERVACIONES');

const cerrada = await seedReqSc(analistaId, `${tag}-CERR`, 'RECEPCION_COTIZACIONES');
await query(`
  UPDATE solicitudes_cotizacion SET consultas_fin = NOW() - INTERVAL '2 days' WHERE id = $1
`, [cerrada.sid]);
const invC1 = await insertInv(cerrada.sid, cerrada.rid, cerrada.proveedorId, 1);
const invC2 = await insertInv(cerrada.sid, cerrada.rid, cerrada.proveedorId, 2);
await presentarCotizacion(cerrada.proveedorId, cotBody(cerrada.sid, invC1.id, 1), portalReq(cerrada.proveedorId, cerrada.ruc));
let blockedPlazo = false;
try {
  await registrarConsulta(cerrada.proveedorId, {
    solicitud_id: cerrada.sid,
    invitacion_id: invC2.id,
    consulta: 'Fuera de plazo',
  }, portalReq(cerrada.proveedorId, cerrada.ruc));
} catch (e) {
  blockedPlazo = e.status === 409 && /Plazo de consultas/.test(e.message);
}
ok(blockedPlazo, 'I — consulta fuera de plazo bloqueada');

const ajena = await seedReqSc(analistaId, `${tag}-AJ`, 'RECEPCION_COTIZACIONES');
const invAj = await insertInv(ajena.sid, ajena.rid, ajena.proveedorId, 1);
const { rows: otroP } = await query(`
  INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Otro', TRUE) RETURNING id
`, [`2098765432${String(ts % 10)}`]);
let blockedAjeno = false;
try {
  await assertInvitacionPortalAccion(otroP[0].id, ajena.sid, invAj.id);
} catch (e) {
  blockedAjeno = e.status === 403;
}
ok(blockedAjeno, 'J — invitacion_id ajeno bloqueado');

console.log('\n✅ RC8.17.8H6-C3-D4 OK\n');
