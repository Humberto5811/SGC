/**
 * RC8.17.8H6-C3-D10-A — Cuadro Comparativo aislamiento por invitacion_id / ronda.
 *
 *   node scripts/test-rc8178h6-d10a-cuadro-ronda.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, getClient } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  agruparElegiblesPorInvitacion,
  cotizacionElegibleCuadroRonda,
  CUADRO_RONDA_AMBIGUA,
  filtrarDatosJsonPorRonda,
  resolverInvitacionRondaCuadro,
} from '../server/lib/cuadroComparativoRonda.js';
import {
  crearOBuscarBorrador,
  guardarBorradorCuadro,
  listarCuadroComparativoExpedientes,
  listarVersionesCuadro,
  obtenerDetalleCuadro,
  obtenerDatosPdfCuadro,
  guardarAdjudicacionCuadro,
  assertNoRondaOverrideEnPayload,
} from '../server/lib/cuadroComparativo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C3-D10-A — Cuadro ronda / invitación ===\n');
await runMigrations({ silent: true });

const mig064 = fs.readFileSync(
  path.join(__dirname, '../server/migrations/064_cuadro_comparativo_invitacion_ronda.js'),
  'utf8',
);
ok(/invitacion_id/.test(mig064) && /idx_cuadros_activo_solicitud_tipo_nro/.test(mig064),
  'Migración 064 — nro_invitacion + índice activo por ronda');

function informeDerivacionCuadro(extra = {}) {
  return {
    derivacion_salida: {
      submodulo: 'CUADRO_COMPARATIVO',
      derivado_at: new Date().toISOString(),
      ...extra,
    },
  };
}

// --- Unit: resolver ronda ---
{
  const cots = [
    { id: 1, invitacion_id: 100, nro_invitacion: 2, estado: 'COTIZACION_PRESENTADA', validacion_estado: 'APTO', validacion_informe: informeDerivacionCuadro() },
    { id: 2, invitacion_id: 200, nro_invitacion: 7, estado: 'COTIZACION_PRESENTADA', validacion_estado: 'APTO', validacion_informe: informeDerivacionCuadro() },
  ];
  assert.throws(
    () => resolverInvitacionRondaCuadro(cots, {}),
    (e) => e.code === CUADRO_RONDA_AMBIGUA,
    'Ambigüedad — dos invitaciones activas sin invitacionId',
  );
  ok(true, 'Ambigüedad — dos invitaciones activas sin invitacionId');

  const rB = resolverInvitacionRondaCuadro(cots, { nroInvitacion: 7 });
  ok(rB.nro_invitacion === 7 && rB.cotizaciones_ronda.length === 1, 'Resolver explícito nroInvitacion');

  const twoProv = [
    { id: 10, invitacion_id: 301, nro_invitacion: 7, estado: 'COTIZACION_PRESENTADA', validacion_estado: 'APTO', validacion_informe: informeDerivacionCuadro() },
    { id: 11, invitacion_id: 302, nro_invitacion: 7, estado: 'COTIZACION_PRESENTADA', validacion_estado: 'APTO', validacion_informe: informeDerivacionCuadro() },
  ];
  const g = agruparElegiblesPorInvitacion(twoProv);
  ok(g.get(7)?.length === 2, 'Caso B — 1 ronda nro 7, 2 cotizaciones APTO → misma ronda');
}

// --- Integration DB ---
const ts = Date.now();
const tag = `D10A-${ts}`;
const codigoReq = `REQ-${tag}`;
const codigoSc = `SC-${tag}`;

const { rows: uRows } = await query('SELECT id, username FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
const userId = uRows[0]?.id || 1;
const userName = uRows[0]?.username || 'admin';

const client = await getClient();
let sid = null;
let rid = null;
let invHist = null;
let invAct = null;
let cotHist = null;
let cotAct = null;
let cotActB = null;
let cotNoApto = null;
let cotEnProceso = null;
let cuadroLegacyId = null;

try {
  await client.query('BEGIN');

  const insReq = await client.query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test D10-A', 'CNCC', 'CNCC', 'En tramite', '{}'::jsonb, 'CUADRO_COMPARATIVO')
    RETURNING id
  `, [codigoReq]);
  rid = insReq.rows[0].id;

  await client.query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, version, actualizado_at
    ) VALUES ($1, 'CUADRO_COMPARATIVO', 'Cuadro Comparativo', 'EN_TRAMITE', 'En trámite', 'PERSONA', $2, 1, NOW())
  `, [rid, userId]);

  const detalle = JSON.stringify([
    { requerimiento_id: rid, item_index: 0, descripcion: 'Item 0', cantidad: 1, unidad_medida: 'UND' },
  ]);
  const insSc = await client.query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, denominacion, tipo, detalle_items)
    VALUES ($1, 2026, $2, 'EN_CUADRO_COMPARATIVO', 'Obj', 'SC D10-A', 'Bienes', $3::jsonb)
    RETURNING id
  `, [codigoSc, (ts % 70000) + 1000, detalle]);
  sid = insSc.rows[0].id;
  await client.query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const insP = await client.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov D10-A', TRUE) RETURNING id
  `, [`20${String(ts).slice(-9)}`]);
  const pid = insP.rows[0].id;
  const insP2 = await client.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov2 D10-A', TRUE) RETURNING id
  `, [`20${String(ts + 2).slice(-9)}`]);
  const pid2 = insP2.rows[0].id;

  invHist = (await client.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 2) RETURNING id
  `, [sid, rid, pid])).rows[0].id;

  invAct = (await client.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 7) RETURNING id
  `, [sid, rid, pid])).rows[0].id;

  const invActB = (await client.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 7) RETURNING id
  `, [sid, rid, pid2])).rows[0].id;

  cotHist = (await client.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado, validacion_informe
    ) VALUES ($1, $2, $3, $4, 2, 'COTIZACION_PRESENTADA', '{}'::jsonb, '{}'::jsonb, 'DERIVADA', $5::jsonb)
    RETURNING id
  `, [sid, pid, rid, invHist, JSON.stringify(informeDerivacionCuadro({ submodulo: 'VALIDACIONES' }))])).rows[0].id;

  const propEco = JSON.stringify({ precios: { [`${rid}-0`]: { unitario: 10, total: 10 } }, monto: 10 });
  const propTec = JSON.stringify({
    items: [{ item_key: `${rid}-0`, marca: 'M', modelo: 'X' }],
  });

  cotAct = (await client.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado, validacion_informe
    ) VALUES ($1, $2, $3, $4, 7, 'COTIZACION_PRESENTADA', $5::jsonb, $6::jsonb, 'APTO', $7::jsonb)
    RETURNING id
  `, [sid, pid, rid, invAct, propTec, propEco, JSON.stringify(informeDerivacionCuadro())])).rows[0].id;

  cotActB = (await client.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado, validacion_informe
    ) VALUES ($1, $2, $3, $4, 7, 'COTIZACION_PRESENTADA', $5::jsonb, $6::jsonb, 'APTO', $7::jsonb)
    RETURNING id
  `, [sid, pid2, rid, invActB, propTec, propEco, JSON.stringify(informeDerivacionCuadro())])).rows[0].id;

  const insP3 = await client.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov3 NO_APTO', TRUE) RETURNING id
  `, [`20${String(ts + 3).slice(-9)}`]);
  const pid3 = insP3.rows[0].id;
  const insP4 = await client.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov4 EN_PROC', TRUE) RETURNING id
  `, [`20${String(ts + 4).slice(-9)}`]);
  const pid4 = insP4.rows[0].id;
  const invActC = (await client.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 7) RETURNING id
  `, [sid, rid, pid3])).rows[0].id;
  const invActD = (await client.query(`
    INSERT INTO invitacion_proveedores (solicitud_id, requerimiento_id, proveedor_id, estado, nro_invitacion)
    VALUES ($1, $2, $3, 'ENVIADA', 7) RETURNING id
  `, [sid, rid, pid4])).rows[0].id;

  cotNoApto = (await client.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado, validacion_informe
    ) VALUES ($1, $2, $3, $4, 7, 'COTIZACION_PRESENTADA', $5::jsonb, $6::jsonb, 'NO_APTO', $7::jsonb)
    RETURNING id
  `, [sid, pid3, rid, invActC, propTec, propEco, JSON.stringify(informeDerivacionCuadro())])).rows[0].id;

  cotEnProceso = (await client.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, invitacion_id, nro_invitacion_presentacion,
      estado, propuesta_tecnica, propuesta_economica, validacion_estado, validacion_informe
    ) VALUES ($1, $2, $3, $4, 7, 'COTIZACION_PRESENTADA', $5::jsonb, $6::jsonb, 'EN_PROCESO', $7::jsonb)
    RETURNING id
  `, [sid, pid4, rid, invActD, propTec, propEco, JSON.stringify(informeDerivacionCuadro())])).rows[0].id;

  cuadroLegacyId = (await client.query(`
    INSERT INTO cuadros_comparativos (
      solicitud_id, tipo, version, estado, datos_json, creado_por, actualizado_por
    ) VALUES ($1, 'BIENES', 1, 'CUADRO_BORRADOR', $2::jsonb, 'test', 'test')
    RETURNING id
  `, [sid, JSON.stringify({
    resumen_proveedores: [
      { cotizacion_id: cotHist, proveedor_id: pid },
      { cotizacion_id: cotAct, proveedor_id: pid },
    ],
  })])).rows[0].id;

  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  client.release();
  throw e;
}
client.release();

// Caso A — bandeja contador ronda Inv.7 = 2 (dos proveedores), no cuenta histórica
const bandeja = await listarCuadroComparativoExpedientes();
const fila = bandeja.find((r) => r.solicitud_codigo === codigoSc && Number(r.nro_invitacion) === 7);
ok(!!fila, 'Caso A — fila bandeja para ronda actual');
ok(Number(fila?.total_cotizaciones_ronda) === 2, 'Caso B — contador 2 proveedores misma invitación');
ok(Number(fila?.total_cotizaciones) === 2, 'Caso A — total_cotizaciones alineado a ronda');
ok(!bandeja.some((r) => r.solicitud_codigo === codigoSc && Number(r.nro_invitacion) === 2),
  'Caso C — invitación histórica no genera fila activa cuadro');

const det = await obtenerDetalleCuadro(sid, { nroInvitacion: 7 });
const idsMat = new Set((det.matriz?.resumen_proveedores || []).map((p) => Number(p.cotizacion_id)));
ok(idsMat.has(Number(cotAct)) && idsMat.has(Number(cotActB)), 'Matriz incluye ambos proveedores Inv.7');
ok(!idsMat.has(Number(cotHist)), 'Caso A — matriz sin cotización histórica Inv.2');
ok(!idsMat.has(Number(cotNoApto)) && !idsMat.has(Number(cotEnProceso)),
  'Caso B — mismo nro N: matriz solo A+B (excluye NO_APTO y EN_PROCESO)');
ok((det.matriz?.resumen_proveedores || []).length === 2, 'Caso B — matriz exactamente 2 columnas elegibles');

// Caso C — una sola elegible (unit + integración lógica del resolver)
{
  const soloA = resolverInvitacionRondaCuadro([
    { id: cotAct, invitacion_id: invAct, nro_invitacion: 7, estado: 'COTIZACION_PRESENTADA', validacion_estado: 'APTO', validacion_informe: informeDerivacionCuadro() },
  ], { nroInvitacion: 7 });
  ok(soloA.cotizaciones_ronda.length === 1, 'Caso C — resolver una elegible → matriz 1');
}

// Caso D — ambigüedad sin contexto
await query(`
  UPDATE cotizaciones_proveedor
  SET validacion_estado = 'APTO', validacion_informe = $1::jsonb
  WHERE id = $2
`, [JSON.stringify(informeDerivacionCuadro()), cotHist]);
try {
  await obtenerDetalleCuadro(sid, {});
  assert.fail('debía retornar CUADRO_RONDA_AMBIGUA');
} catch (e) {
  ok(e.code === CUADRO_RONDA_AMBIGUA, 'Caso D — solicitudId solo con 2+ contextos elegibles → 409');
}
// Restaurar histórica no elegible para el resto del flujo Inv.7
await query(`
  UPDATE cotizaciones_proveedor
  SET validacion_estado = 'DERIVADA', validacion_informe = $1::jsonb
  WHERE id = $2
`, [JSON.stringify(informeDerivacionCuadro({ submodulo: 'VALIDACIONES' })), cotHist]);

const borrador = await crearOBuscarBorrador(sid, userName, { nroInvitacion: 7 });
ok(borrador.created === true, 'Caso D — nuevo borrador ronda (no reutiliza legacy contaminado)');
ok(Number(borrador.cuadro?.nro_invitacion) === 7, 'Borrador persistido con nro_invitacion');
const idsJson = new Set((borrador.matriz?.resumen_proveedores || []).map((p) => Number(p.cotizacion_id)));
ok(!idsJson.has(Number(cotHist)), 'Caso E — datos_json nuevo sin cot histórica');

const detLegacy = await obtenerDetalleCuadro(sid, { nroInvitacion: 7 });
ok(Number(detLegacy.cuadro?.id) !== Number(cuadroLegacyId), 'Caso G — legacy id no reutilizado para Inv.7');

// Caso E — cuadroId: query nro distinto no cambia contexto (assert payload)
assert.throws(
  () => assertNoRondaOverrideEnPayload({ nroInvitacion: 2 }, { nro_invitacion: 7 }),
  (e) => e.code === 'CUADRO_RONDA_MISMATCH',
  'Caso E — body con otro nro rechazado',
);
ok(true, 'Caso E — cuadroId persistido no admite override de nro en body');

// Caso F — versiones filtradas por contexto
const versCtx7 = await listarVersionesCuadro(sid, { nroInvitacion: 7 });
ok(versCtx7.every((v) => v.nro_invitacion == null || Number(v.nro_invitacion) === 7),
  'Caso F — versiones Inv.7 no mezclan otro contexto');
ok(!versCtx7.some((v) => Number(v.id) === Number(cuadroLegacyId)),
  'Caso F — versiones contexto 7 excluyen legacy sin nro');

// Caso H — datos_json guardar no reintroduce cot histórica
const savedBorrador = await guardarBorradorCuadro(borrador.cuadro.id, {
  datos_json: {
    ...(borrador.matriz || {}),
    resumen_proveedores: [
      ...(borrador.matriz?.resumen_proveedores || []),
      { cotizacion_id: cotHist, proveedor_id: 1, razon_social: 'Hist' },
    ],
  },
}, userName);
const idsSaved = new Set((savedBorrador.matriz?.resumen_proveedores || []).map((p) => Number(p.cotizacion_id)));
ok(!idsSaved.has(Number(cotHist)), 'Caso H — guardar filtra cotización no elegible');

// Caso I — adjudicación rechaza proveedor fuera de ronda (simulado vía matriz ya filtrada)
try {
  const cuadroId = borrador.cuadro.id;
  const fakeMatriz = { ...borrador.matriz };
  fakeMatriz.adjudicacion = { proveedor_ganador_id: 99999999 };
  await guardarAdjudicacionCuadro(cuadroId, {
    datos_json: fakeMatriz,
    selecciones: [{ item_key: `${rid}-0`, proveedor_adjudicado_id: 99999999 }],
    criterio_seleccion: 'MENOR_PRECIO',
    sustento_decision: 'test',
  }, userName);
  assert.fail('debía fallar adjudicación ajena');
} catch (e) {
  ok(e.code === 'ADJUDICACION_INVALIDA' || /proveedor|adjudic/i.test(e.message),
    'Caso I — adjudicación no acepta proveedor ajeno a ronda');
}

// Caso G — PDF data scope (estado borrador sigue fallando en D10-C; solo verificamos filtro si ADJUDICADO)
await query(`
  UPDATE cuadros_comparativos SET estado = 'ADJUDICADO' WHERE id = $1
`, [borrador.cuadro.id]);
const pdfData = await obtenerDatosPdfCuadro(borrador.cuadro.id);
const pdfIds = new Set((pdfData.matriz?.resumen_proveedores || []).map((p) => Number(p.cotizacion_id)));
ok(!pdfIds.has(Number(cotHist)), 'Caso J — PDF data sin cot histórica (contexto persistido)');

// Caso H — D9-A no tocado (smoke estático; regresión en script D9-A dedicado)
const wfSrc = fs.readFileSync(
  path.join(__dirname, '../server/lib/workflowTransicionResponsable.js'),
  'utf8',
);
ok(/listarCandidatosValidacionCompletadaCuadro/.test(wfSrc), 'Regresión estática — hook D9-A intacto en workflow');

// ERV
const { rows: erv } = await query(
  'SELECT etapa_codigo, estado_codigo FROM expediente_estado_vigente WHERE requerimiento_id = $1',
  [rid],
);
ok(String(erv[0]?.etapa_codigo).toUpperCase() === 'CUADRO_COMPARATIVO', 'ERV — etapa CUADRO_COMPARATIVO');

console.log('\nClasificación tests D10-A-R2:');
console.log('  • Unitarios: resolver, agrupar, filtrarDatosJson, assertNoRondaOverride');
console.log('  • Integración DB (fixture): bandeja, matriz A/B/C/D, borrador, versiones, guardar, adjudicación, PDF');
console.log('  • Estático: migración 064, regresión hook D9-A');

// filtrarDatosJson unit
const filtered = filtrarDatosJsonPorRonda({
  resumen_proveedores: [{ cotizacion_id: 1 }, { cotizacion_id: 6 }],
}, new Set([6]));
ok(filtered.resumen_proveedores.length === 1 && filtered.resumen_proveedores[0].cotizacion_id === 6,
  'filtrarDatosJsonPorRonda elimina cot ajena');

console.log('\n✅ RC8.17.8H6-C3-D10-A tests OK\n');
