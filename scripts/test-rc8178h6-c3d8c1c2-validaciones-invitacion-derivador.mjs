/**
 * RC8.17.8H6-C3-D8-C1/C2 — Invitación en bandeja + visibilidad derivador histórico.
 *
 *   node scripts/test-rc8178h6-c3d8c1c2-validaciones-invitacion-derivador.mjs
 */
import assert from 'node:assert/strict';
import { query, getClient } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  canUserValidateExpediente,
  derivarValidacionCotizacion,
  listarValidacionesExpedientes,
  usuarioParticipoDerivacionValidacion,
} from '../server/lib/validacionesCotizacion.js';
import { enrichEstadoResponsableForBandeja } from '../server/lib/enrichEstadoResponsable.js';
import {
  consolidarExpedientesValidacion,
  formatInvitacionBandejaLabel,
} from '../src/utils/validacionesUtils.js';
import {
  renderBandejaCanonicoResponsableCell,
} from '../src/utils/bandejaExpedienteColumns.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C3-D8-C1/C2 — Invitación + derivador ===\n');
await runMigrations({ silent: true });

const { rows: users } = await query(`
  SELECT id, username,
    COALESCE(NULLIF(TRIM(CONCAT(apellidos, ' ', nombres)), ''), nombre, username) AS display
  FROM usuarios WHERE activo = TRUE ORDER BY id
`);
assert.ok(users.length >= 3, 'Se requieren ≥3 usuarios activos');
const userB = users.find((u) => /wvasquez/i.test(u.username)) || users[0];
const userA = users.find((u) => u.id !== userB.id) || users[1];
const userC = users.find((u) => u.id !== userB.id && u.id !== userA.id) || users[2];

const tag = `D8C1C2-${ts}`;
const codigoReq = `REQ-${tag}`;
const codigoSc = `SC-${tag}`;
const pgClient = await getClient();
let sid = null;
let rid = null;
let cotHist = null;
let cotAct = null;
let cotLegacy = null;

try {
  await pgClient.query('BEGIN');

  const insReq = await pgClient.query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test D8-C1C2', 'CNCC', 'CNCC', 'En tramite', '{"area":{"responsable":"CNCC"}}'::jsonb, 'RECEPCION_COTIZACIONES')
    RETURNING id
  `, [codigoReq]);
  rid = insReq.rows[0].id;

  await pgClient.query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, version, actualizado_at
    ) VALUES ($1, 'RECEPCION_COTIZACIONES', 'Recepción', 'EN_TRAMITE', 'En trámite', 'PERSONA', $2, 1, NOW())
  `, [rid, userA.id]);

  const detalle = JSON.stringify([{ requerimiento_id: rid, item_index: 0, descripcion: 'Item' }]);
  const insSc = await pgClient.query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, denominacion, tipo, detalle_items)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC C1C2', 'Bienes', $3::jsonb)
    RETURNING id
  `, [codigoSc, (ts % 80000) + 600, detalle]);
  sid = insSc.rows[0].id;
  await pgClient.query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const insP = await pgClient.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov C1C2', TRUE) RETURNING id
  `, [`20${String(ts).slice(-9)}`]);
  const pid = insP.rows[0].id;

  const insInv2 = await pgClient.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 2) RETURNING id
  `, [sid, rid, pid]);
  const inv2 = insInv2.rows[0].id;
  const insInv7 = await pgClient.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 7) RETURNING id
  `, [sid, rid, pid]);
  const inv7 = insInv7.rows[0].id;

  const insC1 = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado
    ) VALUES ($1, $2, $3, $4, 2, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{}'::jsonb, 'APTO')
    RETURNING id
  `, [sid, pid, rid, inv2]);
  cotHist = insC1.rows[0].id;

  const insC2 = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado
    ) VALUES ($1, $2, $3, $4, 7, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{}'::jsonb, '')
    RETURNING id
  `, [sid, pid, rid, inv7]);
  cotAct = insC2.rows[0].id;

  const insLegacy = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado, validacion_responsable,
      validacion_informe
    ) VALUES (
      $1, $2, $3, NULL, NULL, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{}'::jsonb, 'DERIVADA',
      $4, $5::jsonb
    ) RETURNING id
  `, [sid, pid, rid, userB.display || userB.username, JSON.stringify({
    derivacion: { responsable_id: userB.id, responsable_nombre: userB.display, submodulo: 'VALIDACIONES' },
  })]);
  cotLegacy = insLegacy.rows[0].id;

  await pgClient.query('COMMIT');

  await derivarValidacionCotizacion(cotAct, {
    submodulo: 'VALIDACIONES',
    submodulo_label: 'Validaciones',
    usuario_destino_id: userB.id,
    responsable_nombre: userB.display || userB.username,
  }, userA.display || userA.username, { operadorUserId: userA.id });

  const flatAdmin = await listarValidacionesExpedientes('', '', { esAdmin: true });
  const scRows = flatAdmin.filter((r) => Number(r.solicitud_id) === Number(sid));
  ok(scRows.length >= 3, 'A — misma SC: varias filas en listado (no una sola fusionada)');

  const row7 = scRows.find((r) => Number(r.id) === Number(cotAct));
  const row2 = scRows.find((r) => Number(r.id) === Number(cotHist));
  ok(!!row7 && Number(row7.invitacion_id) === Number(inv7), 'B — Inv.7 conserva invitacion_id');
  ok(Number(row7.nro_invitacion) === 7, 'B — nro_invitacion persistido = 7');
  ok(formatInvitacionBandejaLabel(row7) === 'Inv. 7', 'B — etiqueta Inv. 7');

  const cons = consolidarExpedientesValidacion(scRows);
  ok(cons.length === scRows.length, 'B — consolidar no fusiona por solicitud_id');
  const exp7 = cons.find((e) => Number(e.cotizacion_id) === Number(cotAct));
  const exp2 = cons.find((e) => Number(e.cotizacion_id) === Number(cotHist));
  ok(exp7?.invitacion_label === 'Inv. 7' && exp7.cantidad_cotizaciones === 1, 'B — fila Inv.7 independiente');
  ok(exp2?.invitacion_label === 'Inv. 2', 'C — Inv.2 fila separada');
  ok(exp7.cotizacion_id !== exp2.cotizacion_id, 'C — identidades distintas');

  const permB = canUserValidateExpediente(row7, userB.username, userB.id, { usuarioNombre: userB.username });
  ok(permB.puedeVer && permB.puedeValidar, 'D — usuario B responsable: ver y validar');

  const permA = canUserValidateExpediente(row7, userA.username, userA.id, { usuarioNombre: userA.username });
  ok(permA.puedeVer && !permA.puedeValidar, 'E — derivador A: ver sí, validar no');
  ok(usuarioParticipoDerivacionValidacion(row7, userA.username, userA.id), 'E — participación derivación A');

  const permC = canUserValidateExpediente(row7, userC.username, userC.id, { usuarioNombre: userC.username });
  ok(!permC.puedeVer && !permC.puedeValidar, 'F — usuario C sin participación: sin acceso');

  const bandejaA = await listarValidacionesExpedientes(userA.username, userA.id, { soloAsignadas: true });
  ok(bandejaA.some((r) => Number(r.id) === Number(cotAct)), 'E — derivador ve fila Inv.7 en bandeja');
  const bandejaC = await listarValidacionesExpedientes(userC.username, userC.id, { soloAsignadas: true });
  ok(!bandejaC.some((r) => Number(r.id) === Number(cotAct)), 'F — tercero no ve Inv.7');

  await enrichEstadoResponsableForBandeja([row7]);
  const [expErv] = consolidarExpedientesValidacion([row7]);
  const respHtml = renderBandejaCanonicoResponsableCell(expErv);
  ok(
    new RegExp(userB.username, 'i').test(respHtml)
      || /sgc-responsable-badge/i.test(respHtml),
    'G — ERV/responsable bandeja apunta al responsable actual (B)',
  );

  const rowLegacy = scRows.find((r) => Number(r.id) === Number(cotLegacy));
  ok(rowLegacy && formatInvitacionBandejaLabel(rowLegacy) === '—', 'H — legacy sin invitacion_id: no inventa Inv.N');

  console.log('\n✅ D8-C1/C2 fixture OK\n');
} finally {
  try {
    if (sid) {
      await query('DELETE FROM cotizaciones_proveedor WHERE solicitud_id = $1', [sid]);
      await query('DELETE FROM invitacion_proveedores WHERE solicitud_id = $1', [sid]);
      await query('DELETE FROM solicitud_requerimientos WHERE solicitud_id = $1', [sid]);
      await query('DELETE FROM solicitudes_cotizacion WHERE id = $1', [sid]);
    }
    if (rid) {
      await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]);
      await query('DELETE FROM requerimientos WHERE id = $1', [rid]);
    }
  } catch (e) {
    console.warn('Cleanup:', e.message);
  }
  pgClient.release();
}

console.log('Ejecutar regresiones D8-A, D8-B, D7 y rc77a por separado en CI local.\n');
