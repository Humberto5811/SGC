/**
 * RC8.17.8H6-C3-D8-A — Aislamiento validación por cotizacion_id (multi-invitación).
 *
 *   node scripts/test-rc8178h6-c3d8a-validacion-aislamiento.mjs
 */
import assert from 'node:assert/strict';
import { query, getClient } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  derivarValidacionCotizacion,
  getValidacionTrabajoDetalle,
  listarValidacionesExpedientes,
  listarProveedoresSolicitudValidacion,
  guardarValidacionParcial,
  enviarValidacionUsuario,
} from '../server/lib/validacionesCotizacion.js';

const ts = Date.now();
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C3-D8-A — aislamiento validación ===\n');
await runMigrations({ silent: true });

const { rows: wRows } = await query(
  `SELECT id, username FROM usuarios WHERE LOWER(username) = 'wvasquez' AND activo = TRUE LIMIT 1`,
);
const { rows: uRows } = await query('SELECT id, username FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
const userId = wRows[0]?.id || uRows[0]?.id || 1;
const userName = wRows[0]?.username || uRows[0]?.username || 'admin';

const tag = `D8A-${ts}`;
const codigoReq = `REQ-${tag}`;
const codigoSc = `SC-${tag}`;
const codigoScL = `SC-${tag}-L`;
const pgClient = await getClient();
let sid = null;
let sidL = null;
let rid = null;
try {
  await pgClient.query('BEGIN');

  const insReq = await pgClient.query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test D8-A', 'CNCC', 'CNCC', 'En tramite', '{"area":{"responsable":"CNCC"}}'::jsonb, 'RECEPCION_COTIZACIONES')
    RETURNING id
  `, [codigoReq]);
  rid = insReq.rows[0].id;

  await pgClient.query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, version, actualizado_at
    ) VALUES ($1, 'RECEPCION_COTIZACIONES', 'Recepción', 'EN_TRAMITE', 'En trámite', 'PERSONA', $2, 1, NOW())
  `, [rid, userId]);

  const detalle = JSON.stringify([
    { requerimiento_id: rid, item_index: 0, descripcion: 'Item 0' },
    { requerimiento_id: rid, item_index: 1, descripcion: 'Item 1' },
    { requerimiento_id: rid, item_index: 2, descripcion: 'Item 2' },
    { requerimiento_id: rid, item_index: 3, descripcion: 'Item 3' },
    { requerimiento_id: rid, item_index: 4, descripcion: 'Item 4' },
  ]);
  const insSc = await pgClient.query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, denominacion, tipo, detalle_items)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC D8-A', 'Bienes', $3::jsonb)
    RETURNING id
  `, [codigoSc, (ts % 80000) + 500, detalle]);
  sid = insSc.rows[0].id;
  await pgClient.query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const insP = await pgClient.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov D8-A', TRUE) RETURNING id
  `, [`20${String(ts).slice(-9)}`]);
  const pid = insP.rows[0].id;

  const insInv1 = await pgClient.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 2) RETURNING id
  `, [sid, rid, pid]);
  const inv1 = insInv1.rows[0].id;
  const insInv2 = await pgClient.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 7) RETURNING id
  `, [sid, rid, pid]);
  const inv2 = insInv2.rows[0].id;

  const insC1 = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado
    ) VALUES ($1, $2, $3, $4, 2, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{}'::jsonb, 'APTO')
    RETURNING id
  `, [sid, pid, rid, inv1]);
  const cotHist = insC1.rows[0].id;

  const insC2 = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado
    ) VALUES ($1, $2, $3, $4, 7, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{}'::jsonb, '')
    RETURNING id
  `, [sid, pid, rid, inv2]);
  const cotAct = insC2.rows[0].id;

  await pgClient.query(`
    UPDATE cotizaciones_proveedor SET propuesta_tecnica = $2::jsonb WHERE id = $1
  `, [cotHist, JSON.stringify({
    items: [{ item_key: `${cotHist}:${rid}-0`, descripcion: 'Solo item 0 inv hist' }],
    fichas: [{ ref: 'doc-inv-hist', nombre: 'Ficha Historica Inv2' }],
  })]);
  await pgClient.query(`
    UPDATE cotizaciones_proveedor SET propuesta_tecnica = $2::jsonb WHERE id = $1
  `, [cotAct, JSON.stringify({
    items: [
      { item_key: `${cotAct}:${rid}-0`, descripcion: 'Item 0 inv actual' },
      { item_key: `${cotAct}:${rid}-1`, descripcion: 'Item 1 inv actual' },
      { item_key: `${cotAct}:${rid}-2`, descripcion: 'Item 2 inv actual' },
    ],
    fichas: [{ ref: 'doc-inv-actual', nombre: 'Ficha Actual Inv7' }],
  })]);

  const insInv3 = await pgClient.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 3) RETURNING id
  `, [sid, rid, pid]);
  const inv3 = insInv3.rows[0].id;
  const insPend = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado
    ) VALUES ($1, $2, $3, $4, 3, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{}'::jsonb, '')
    RETURNING id
  `, [sid, pid, rid, inv3]);
  const cotPend = insPend.rows[0].id;

  const insP2 = await pgClient.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov B D8-A', TRUE) RETURNING id
  `, [`20${String(ts + 1).slice(-9)}`]);
  const pidB = insP2.rows[0].id;
  const insCB = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado, validacion_responsable,
      validacion_informe
    ) VALUES (
      $1, $2, $3, NULL, 1, 'COTIZACION_PRESENTADA', '{"fichas":[{"ref":"doc-b","nombre":"Doc B"}]}'::jsonb,
      '{}'::jsonb, 'DERIVADA', 'Responsable B',
      $4::jsonb
    ) RETURNING id
  `, [sid, pidB, rid, JSON.stringify({
    derivacion: { responsable_id: userId, responsable_nombre: userName, submodulo: 'VALIDACIONES' },
  })]);
  const cotB = insCB.rows[0].id;

  await pgClient.query('COMMIT');
  // derivar/getValidacion usan pool global — fixture confirmada arriba.

  await derivarValidacionCotizacion(cotAct, {
    submodulo: 'VALIDACIONES',
    submodulo_label: 'Validaciones',
    usuario_destino_id: userId,
    responsable_nombre: userName,
  }, userName);

  const { rows: stAfter } = await query(
    'SELECT id, validacion_estado FROM cotizaciones_proveedor WHERE id = ANY($1::int[])',
    [[cotHist, cotAct, cotPend]],
  );
  const mapSt = Object.fromEntries(stAfter.map((r) => [r.id, String(r.validacion_estado || '').toUpperCase()]));
  ok(mapSt[cotAct] === 'DERIVADA', 'B — Inv.7 explícita → DERIVADA');
  ok(!mapSt[cotPend] || mapSt[cotPend] === '' || mapSt[cotPend] === 'PENDIENTE', 'B — Inv. pendiente NO auto-DERIVADA');
  ok(mapSt[cotHist] === 'APTO', 'A — Inv. histórica conserva APTO');

  const det7 = await getValidacionTrabajoDetalle(cotAct, userName, userId, { esAdmin: true });
  ok(det7.proveedores_solicitud.length === 1, 'A — proveedores_solicitud solo ancla');
  ok(Number(det7.proveedores_solicitud[0].cotizacion_id) === Number(cotAct), 'A — proveedor ligado a cot. actual');
  const cotIdsMatriz = new Set((det7.matriz_v2?.filas || []).map((f) => Number(f.cotizacion_id)));
  ok(cotIdsMatriz.size <= 1 && cotIdsMatriz.has(Number(cotAct)), 'A — matriz solo cotización ancla');
  ok(!cotIdsMatriz.has(Number(cotHist)), 'D — matriz sin cotización histórica Inv.2');
  const detHist = await getValidacionTrabajoDetalle(cotHist, userName, userId, { esAdmin: true });
  const idsHistMat = new Set((detHist.matriz_v2?.filas || []).map((f) => Number(f.cotizacion_id)));
  ok(idsHistMat.has(Number(cotHist)) && !idsHistMat.has(Number(cotAct)), 'D — abrir histórico no mezcla cot. actual');
  ok((det7.matriz_v2?.filas || []).length === 3, 'E — tres ítems cotizados en ancla');

  await getValidacionTrabajoDetalle(cotAct, userName, userId, { esAdmin: true });
  const { rows: stG } = await query(
    'SELECT id, validacion_estado FROM cotizaciones_proveedor WHERE id = $1',
    [cotPend],
  );
  ok(String(stG[0]?.validacion_estado || '').toUpperCase() !== 'DERIVADA', 'G — reabrir trabajo no deriva hermanas');

  const bandeja = await listarValidacionesExpedientes('', '', { esAdmin: true });
  const idsBandeja = new Set(bandeja.filter((r) => Number(r.solicitud_id) === Number(sid)).map((r) => Number(r.id)));
  ok(idsBandeja.has(Number(cotAct)), '5 — bandeja incluye cot. derivada');
  ok(idsBandeja.has(Number(cotHist)), '5 — bandeja conserva histórico APTO');
  ok(!idsBandeja.has(Number(cotPend)), '5 — PENDIENTE no visible por hermana');

  const detB = await getValidacionTrabajoDetalle(cotB, userName, userId, { esAdmin: true });
  ok(detB.proveedores_solicitud.length === 1 && Number(detB.proveedores_solicitud[0].cotizacion_id) === Number(cotB), 'C — proveedor B aislado');

  const provModo = await listarProveedoresSolicitudValidacion(sid, userName, userId, { esAdmin: true, cotizacionId: cotAct });
  ok(provModo.length === 1, '4 — listar proveedores modo cotizacion_id');

  const snapB = async () => {
    const { rows } = await query(
      'SELECT validacion_estado, validacion_informe FROM cotizaciones_proveedor WHERE id = $1',
      [cotB],
    );
    return rows[0];
  };
  const bBeforeDef = await snapB();
  const filasA = (det7.matriz_v2?.filas || []).map((f) => ({
    ...f,
    cotizacion_id: cotAct,
    evaluacion: {
      ...(f.evaluacion || {}),
      resultado: 'VÁLIDA',
      observaciones: 'eval A',
      inserto: 'SI CUMPLE',
      certificado: 'SI CUMPLE',
    },
  }));
  const filaVenenoB = {
    cotizacion_id: cotB,
    item_key: `poison-${cotB}`,
    evaluacion: { resultado: 'NO válida', observaciones: 'veneno cross-cot' },
  };
  const matrizMixta = { tipo: det7.tipo_formato || 'BIENES', filas: [...filasA, filaVenenoB] };

  await guardarValidacionParcial(cotAct, { matriz_v2: matrizMixta }, userName, userId, { esAdmin: true });
  const bAfterGuardar = await snapB();
  ok(bAfterGuardar.validacion_estado === bBeforeDef.validacion_estado, 'H — guardar A no cambia estado B');
  ok(JSON.stringify(bAfterGuardar.validacion_informe) === JSON.stringify(bBeforeDef.validacion_informe), 'H — guardar A no muta informe B');

  const { rows: stA1 } = await query('SELECT validacion_estado FROM cotizaciones_proveedor WHERE id = $1', [cotAct]);
  ok(String(stA1[0]?.validacion_estado || '').toUpperCase() === 'EN_PROCESO', 'H — A procesa guardar parcial');

  const filasANeg = filasA.map((f) => ({
    ...f,
    evaluacion: { resultado: 'NO válida', observaciones: 'neg A aislada' },
  }));
  const matrizMixtaEnvio = { tipo: matrizMixta.tipo, filas: [...filasANeg, filaVenenoB] };
  await enviarValidacionUsuario(cotAct, {
    matriz_v2: matrizMixtaEnvio,
    pdf_firmado: { base64: 'QUFB', nombre: 'test.pdf' },
    observacion: 'Obs defensiva D8-A envío',
    responsable_destino_id: userId,
    responsable_destino_nombre: userName,
    destino_submodulo: 'INVITACIONES',
  }, userName, userId, { esAdmin: true });
  const bAfterEnvio = await snapB();
  ok(bAfterEnvio.validacion_estado === bBeforeDef.validacion_estado, 'H — enviar A no cambia estado B');
  ok(JSON.stringify(bAfterEnvio.validacion_informe) === JSON.stringify(bBeforeDef.validacion_informe), 'H — enviar A no muta informe B');
  const { rows: stA2 } = await query('SELECT validacion_estado FROM cotizaciones_proveedor WHERE id = $1', [cotAct]);
  ok(String(stA2[0]?.validacion_estado || '').toUpperCase() === 'NO_APTO', 'H — A resultado propio (NO_APTO) sin filas B en evaluación');

  const insLegacy = await pgClient.query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, denominacion, tipo, detalle_items)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Legacy', 'SC Legacy', 'Bienes', '[{"requerimiento_id":0,"item_index":0}]'::jsonb)
    RETURNING id
  `, [codigoScL, (ts % 80000) + 501]);
  sidL = insLegacy.rows[0].id;
  await pgClient.query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sidL, rid]);
  const insCotL = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado, propuesta_tecnica, propuesta_economica,
      validacion_estado, validacion_informe, validacion_responsable
    ) VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', '{"items":[]}'::jsonb, '{}'::jsonb, 'DERIVADA', $4::jsonb, $5)
    RETURNING id
  `, [sidL, pid, rid, JSON.stringify({ derivacion: { responsable_id: userId, responsable_nombre: userName } }), userName]);
  const cotL = insCotL.rows[0].id;
  const detL = await getValidacionTrabajoDetalle(cotL, userName, userId, { esAdmin: true });
  ok(detL.id === cotL, 'F — legacy única cotización funciona');

  console.log('\n✅ C3-D8-A OK\n');
} finally {
  pgClient.release();
  if (sid || sidL) {
    const sids = [sid, sidL].filter(Boolean);
    await query('DELETE FROM cotizaciones_proveedor WHERE solicitud_id = ANY($1::int[])', [sids]).catch(() => {});
    await query('DELETE FROM invitacion_proveedores WHERE solicitud_id = ANY($1::int[])', [sids]).catch(() => {});
    await query('DELETE FROM solicitud_requerimientos WHERE solicitud_id = ANY($1::int[])', [sids]).catch(() => {});
    await query('DELETE FROM solicitudes_cotizacion WHERE id = ANY($1::int[])', [sids]).catch(() => {});
  }
  if (rid) {
    await query('DELETE FROM expediente_estado_vigente WHERE requerimiento_id = $1', [rid]).catch(() => {});
    await query('DELETE FROM requerimientos WHERE id = $1', [rid]).catch(() => {});
  }
  await query(
    'DELETE FROM proveedores WHERE razon_social IN ($1, $2)',
    ['Prov D8-A', 'Prov B D8-A'],
  ).catch(() => {});

  const { rows: rqLeft } = await query(
    'SELECT COUNT(*)::int AS n FROM requerimientos WHERE codigo = $1',
    [codigoReq],
  );
  const { rows: ervLeft } = await query(
    `SELECT COUNT(*)::int AS n FROM expediente_estado_vigente e
     JOIN requerimientos r ON r.id = e.requerimiento_id
     WHERE r.codigo = $1`,
    [codigoReq],
  );
  const { rows: scLeft } = await query(
    'SELECT COUNT(*)::int AS n FROM solicitudes_cotizacion WHERE codigo = ANY($1::text[])',
    [[codigoSc, codigoScL]],
  );
  const { rows: cotLeft } = await query(
    `SELECT COUNT(*)::int AS n FROM cotizaciones_proveedor c
     JOIN solicitudes_cotizacion sc ON sc.id = c.solicitud_id
     WHERE sc.codigo = ANY($1::text[])`,
    [[codigoSc, codigoScL]],
  );
  const { rows: invLeft } = await query(
    `SELECT COUNT(*)::int AS n FROM invitacion_proveedores i
     JOIN solicitudes_cotizacion sc ON sc.id = i.solicitud_id
     WHERE sc.codigo = ANY($1::text[])`,
    [[codigoSc, codigoScL]],
  );
  const residuo = rqLeft[0].n + ervLeft[0].n + scLeft[0].n + cotLeft[0].n + invLeft[0].n;
  if (residuo > 0) {
    console.error('⚠ residuo fixture D8-A (no borrar manualmente desde auditoría):', {
      requerimientos: rqLeft[0].n,
      erv: ervLeft[0].n,
      solicitudes: scLeft[0].n,
      cotizaciones: cotLeft[0].n,
      invitaciones: invLeft[0].n,
      codigoReq,
    });
    process.exitCode = 1;
  } else {
    console.log('  ✓ cleanup fixture — 0 residuos por tag');
  }
}
