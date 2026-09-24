/**
 * RC8.17.8H6-C3-A1 — Atomicidad presentarCotizacion + ERV post éxito.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import { presentarCotizacion } from '../server/lib/portalProveedores.js';
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

async function seedFixture({ analistaId, withOperativoMeta, suffix }) {
  const codigoReq = `REQ-C3A1-${ts}-${suffix}`;
  const insReq = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test C3-A1 atomicidad', 'Area', 'CNCC', 'Esperando cotizaciones', 'INVITACIONES', '{}'::jsonb)
    RETURNING id
  `, [codigoReq]);
  const rid = insReq.rows[0].id;

  const metaJson = withOperativoMeta && analistaId
    ? JSON.stringify({ responsable_operativo_id: Number(analistaId) })
    : '{}';

  await query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente, version, metadata_json
    ) VALUES ($1, 'INVITACIONES', 'Invitaciones', $2, 'Esperando cotizaciones',
      'UNIDAD', NULL, $3, 'unidad_etapa', 1, $4::jsonb)
  `, [rid, ESTADO_ESPERANDO_COTIZACIONES, UNIDAD_RESPONSABLE_PROVEEDORES, metaJson]);

  const insSc = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion, tipo,
      consultas_fin, cotizaciones_fin
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Objeto test', 'SC C3-A1', 'Bienes',
      NOW() + INTERVAL '7 days', NOW() + INTERVAL '30 days')
    RETURNING id
  `, [`SC-C3A1-${ts}-${suffix}`, (ts + suffix.length) % 100000]);
  const sid = insSc.rows[0].id;

  await query(`
    INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)
  `, [sid, rid]);

  const ruc = `20${String(ts + suffix.charCodeAt(0)).slice(-9)}`;
  const insProv = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Proveedor C3-A1 Test', TRUE)
    RETURNING id
  `, [ruc]);
  const proveedorId = insProv.rows[0].id;

  const insInv = await query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado)
    VALUES ($1, $2, $3, 'ENVIADA')
    RETURNING id
  `, [sid, rid, proveedorId]);
  const invId = insInv.rows[0].id;

  return { rid, sid, proveedorId, invId, ruc };
}

function portalReq(ruc) {
  return { portalProveedor: { id: null, ruc }, headers: {}, socket: {} };
}

function cotBody(sid, invitacionId) {
  return {
    solicitud_id: sid,
    invitacion_id: invitacionId,
    propuesta_tecnica: { items: [{ item_key: '1-0', descripcion: 'Item test' }] },
    propuesta_economica: { monto: 100, moneda: 'PEN' },
    anexos: {},
    certificados: [],
  };
}

async function countTraza(sid) {
  const { rows } = await query(`
    SELECT COUNT(*)::int AS n FROM trazabilidad_portal
    WHERE solicitud_id = $1 AND evento = 'COTIZACION_PRESENTADA'
  `, [sid]);
  return rows[0]?.n || 0;
}

console.log('\n=== RC8.17.8H6-C3-A1 — Presentación atomicidad ===\n');

try {
  await runMigrations();
  const analistaId = await pickUsuarioId();

  // Caso A — analista resoluble → commit completo
  const fxA = await seedFixture({ analistaId, withOperativoMeta: true, suffix: 'A' });
  const reqA = portalReq(fxA.ruc);
  reqA.portalProveedor.id = fxA.proveedorId;
  await presentarCotizacion(fxA.proveedorId, cotBody(fxA.sid, fxA.invId), reqA);

  const cotA = (await query(
    'SELECT estado FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND proveedor_id = $2',
    [fxA.sid, fxA.proveedorId],
  )).rows[0];
  ok(String(cotA?.estado).toUpperCase() === 'COTIZACION_PRESENTADA', 'A — cotización presentada');

  const invA = (await query('SELECT estado FROM invitacion_proveedores WHERE id = $1', [fxA.invId])).rows[0];
  ok(String(invA?.estado).toUpperCase() === 'COTIZACION_PRESENTADA', 'A — invitación presentada');

  const evA = (await query(
    'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [fxA.rid],
  )).rows[0];
  ok(String(evA?.etapa_codigo).toUpperCase() === 'RECEPCION_COTIZACIONES', 'A — ERV etapa recepción');
  ok(String(evA?.estado_codigo).toUpperCase() === 'EN_TRAMITE', 'A — ERV EN_TRAMITE');
  ok(String(evA?.responsable_tipo).toUpperCase() === 'PERSONA', 'A — ERV PERSONA');
  ok(Number(evA?.responsable_usuario_id) === Number(analistaId), 'A — ERV analista resuelto');

  ok(await countTraza(fxA.sid) >= 1, 'A — traza portal registrada');

  // Caso B — sin analista → 409 y rollback
  const fxB = await seedFixture({ analistaId: null, withOperativoMeta: false, suffix: 'B' });
  const reqB = portalReq(fxB.ruc);
  reqB.portalProveedor.id = fxB.proveedorId;
  let errB = null;
  try {
    await presentarCotizacion(fxB.proveedorId, cotBody(fxB.sid, fxB.invId), reqB);
  } catch (e) {
    errB = e;
  }
  ok(errB?.code === 'COTIZACION_SIN_ANALISTA', 'B — COTIZACION_SIN_ANALISTA');
  ok(Number(errB?.status) === 409, 'B — HTTP 409');

  const cotB = (await query(
    'SELECT estado FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND proveedor_id = $2',
    [fxB.sid, fxB.proveedorId],
  )).rows[0];
  ok(!cotB || String(cotB.estado || '').toUpperCase() !== 'COTIZACION_PRESENTADA',
    'B — sin cotización presentada tras rollback');

  const invB = (await query('SELECT estado FROM invitacion_proveedores WHERE id = $1', [fxB.invId])).rows[0];
  ok(String(invB?.estado).toUpperCase() === 'ENVIADA', 'B — invitación no avanzada');

  const evB = (await query(
    'SELECT etapa_codigo, estado_codigo FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [fxB.rid],
  )).rows[0];
  ok(String(evB?.etapa_codigo).toUpperCase() === 'INVITACIONES', 'B — ERV sigue en Invitaciones');
  ok(String(evB?.estado_codigo).toUpperCase() === ESTADO_ESPERANDO_COTIZACIONES,
    'B — ERV sin avance parcial a recepción');

  ok(await countTraza(fxB.sid) === 0, 'B — sin traza de presentación parcial');

  console.log('\n✅ RC8.17.8H6-C3-A1 atomicidad OK\n');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
