/**
 * RC8.17.8H6-C3-D6 — Mis Cotizaciones: navegación multi-invitación.
 *
 *   node scripts/test-rc8178h6-c3d6-mis-cotizaciones-multi-invitacion.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  listMisCotizaciones,
  presentarCotizacion,
  guardarBorradorCotizacion,
} from '../server/lib/portalProveedores.js';
import { getCotizacionWorkspace } from '../server/lib/portalDocumentos.js';
import {
  ESTADO_ESPERANDO_COTIZACIONES,
  UNIDAD_RESPONSABLE_PROVEEDORES,
} from '../shared/invitacionesExpedienteCanon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

const ts = Date.now();

async function pickUsuarioId() {
  const { rows } = await query('SELECT id FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
  return rows[0]?.id || 920;
}

async function seedSc(analistaId) {
  const tag = `${ts}`;
  const { rows: reqRows } = await query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, estado_actual, payload)
    VALUES ('bienes', $1, 'Test C3-D6', 'Area', 'CNCC', 'Esperando cotizaciones', 'INVITACIONES', '{}'::jsonb)
    RETURNING id
  `, [`REQ-D6-${tag}`]);
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

  const corr = (ts % 90000) + 6000;
  const detalle = JSON.stringify([{ requerimiento_id: rid, item_index: 0, descripcion: 'Item D6' }]);
  const { rows: scRows } = await query(`
    INSERT INTO solicitudes_cotizacion (
      codigo, anio, correlativo, estado, objeto, denominacion, tipo,
      consultas_fin, cotizaciones_fin, detalle_items, contador_envios
    ) VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC D6', 'Bienes',
      NOW() + INTERVAL '7 days', NOW() + INTERVAL '30 days', $3::jsonb, 5)
    RETURNING id
  `, [`SC-D6-${tag}`, corr, detalle]);
  const sid = scRows[0].id;
  await query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const ruc = `20${String(Math.abs(tag.split('').reduce((a, c) => a + c.charCodeAt(0), ts))).slice(-9)}`;
  const { rows: pRows } = await query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov D6', TRUE) RETURNING id
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

function cotBody(sid, invId, tag, monto = 100) {
  return {
    solicitud_id: sid,
    invitacion_id: invId,
    propuesta_tecnica: { items: [{ item_key: '1-0', descripcion: tag }] },
    propuesta_economica: { monto, moneda: 'PEN' },
    anexos: {},
    certificados: [],
  };
}

function portalReq(ruc, proveedorId) {
  return { portalProveedor: { id: proveedorId, ruc }, headers: {}, socket: {} };
}

/** Réplica mínima de resolveTargetFromNavigation (C3-D6). */
function resolveTargetFromNavigation(rows, { solicitudId, invitacionId }) {
  const sid = solicitudId;
  if (!sid) return { solicitudId: null, invitacionId: null };
  const explicitInv = invitacionId ? parseInt(String(invitacionId), 10) : null;
  const matchRows = rows.filter((r) => String(r.solicitud_id) === String(sid));
  if (explicitInv && Number.isFinite(explicitInv) && explicitInv > 0) {
    return { solicitudId: String(sid), invitacionId: explicitInv };
  }
  if (matchRows.length === 1) {
    return {
      solicitudId: String(sid),
      invitacionId: matchRows[0].invitacion_id ? Number(matchRows[0].invitacion_id) : null,
    };
  }
  return { solicitudId: String(sid), invitacionId: null };
}

console.log('\n=== RC8.17.8H6-C3-D6 — Mis Cotizaciones multi-invitación ===\n');

try {
  await runMigrations();
  const analistaId = await pickUsuarioId();
  const base = await seedSc(analistaId);
  const inv2 = await insertInv(base.sid, base.rid, base.proveedorId, 2);
  const inv7 = await insertInv(base.sid, base.rid, base.proveedorId, 7);
  const req = portalReq(base.ruc, base.proveedorId);

  await presentarCotizacion(base.proveedorId, cotBody(base.sid, inv2.id, 'Inv2-hist', 200), req);

  const list = await listMisCotizaciones(base.proveedorId);
  const mine = list.filter((r) => r.solicitud_id === base.sid);
  ok(mine.length === 2, 'D. listMisCotizaciones: Inv.2 e Inv.7 independientes');
  const row2 = mine.find((r) => Number(r.invitacion_id) === Number(inv2.id));
  const row7 = mine.find((r) => Number(r.invitacion_id) === Number(inv7.id));
  ok(row2 && row7, 'D. Ambas invitaciones en listado');
  ok(row2.cotizacion_id != null, 'Inv.2 tiene cotizacion_id');
  ok(row7.cotizacion_id == null, 'Inv.7 sin cotización (cotizacion_id null)');
  ok(Number(row2.nro_invitacion) === 2 && Number(row7.nro_invitacion) === 7, 'D. nro_invitacion correctos');
  const keys = mine.map((r) => (r.invitacion_id != null ? `inv:${r.invitacion_id}` : `legacy:${r.cotizacion_id}`));
  ok(new Set(keys).size === keys.length, 'D. Claves de fila únicas (no solo solicitud_id)');

  const nav = resolveTargetFromNavigation(mine, { solicitudId: base.sid, invitacionId: inv7.id });
  ok(Number(nav.invitacionId) === Number(inv7.id), 'A. Navegación explícita Inv.7 no reemplazada por Inv.2');

  const ws7 = await getCotizacionWorkspace(base.proveedorId, base.sid, { invitacionId: inv7.id });
  ok(!ws7.cotizacion_existente?.id, 'B. Workspace Inv.7 cotizacion_existente null');
  ok(Number(ws7.invitacion_vigente?.id) === Number(inv7.id), 'B. invitacion_vigente Inv.7');
  ok(Number(ws7.invitacion_vigente?.nro_invitacion) === 7, 'B. nro_invitacion 7');

  const ws2 = await getCotizacionWorkspace(base.proveedorId, base.sid, { invitacionId: inv2.id });
  ok(Number(ws2.cotizacion_existente?.id) === Number(row2.cotizacion_id), 'C. Inv.2 abre cotización histórica');
  ok(String(ws2.cotizacion_existente?.estado || '').toUpperCase() === 'COTIZACION_PRESENTADA', 'C. Inv.2 presentada (readonly FE)');

  await guardarBorradorCotizacion(base.proveedorId, cotBody(base.sid, inv7.id, 'borrador-7', 777), req);
  const { rows: cots } = await query(
    'SELECT id, invitacion_id, propuesta_economica FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND proveedor_id = $2 ORDER BY id',
    [base.sid, base.proveedorId],
  );
  ok(cots.length === 2, 'F. Borrador Inv.7 crea fila nueva (2 cotizaciones total)');
  const cot7 = cots.find((c) => Number(c.invitacion_id) === Number(inv7.id));
  const cot2 = cots.find((c) => Number(c.invitacion_id) === Number(inv2.id));
  ok(cot7 && cot2, 'F. Una cotización por invitacion_id');
  ok(Number(cot7.propuesta_economica?.monto) === 777, 'F. Borrador ligado a Inv.7');
  ok(Number(cot2.propuesta_economica?.monto) === 200, 'F. Cotización Inv.2 intacta');

  const cotSrc = fs.readFileSync(path.join(root, 'src/views/proveedor/misCotizacionesView.js'), 'utf8');
  assert.match(cotSrc, /parseExplicitInvitacionId/);
  assert.match(cotSrc, /getCotizacionWorkspace\(sid, invId/);
  ok(true, 'E. FE: openWizard pasa invitacion_id a getCotizacionWorkspace');

  console.log('\nC3-D6 OK\n');
} catch (e) {
  console.error(e);
  process.exit(1);
}
