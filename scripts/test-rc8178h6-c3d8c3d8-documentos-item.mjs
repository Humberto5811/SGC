/**
 * RC8.17.8H6-C3-D8-C3/D — Matriz documental Validaciones por ítem.
 *
 *   node scripts/test-rc8178h6-c3d8c3d8-documentos-item.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, getClient } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  getValidacionTrabajoDetalle,
  guardarValidacionParcial,
} from '../server/lib/validacionesCotizacion.js';
import {
  buildMatrizDocumentalValidacion,
  sliceMatrizDocumentalFila,
} from '../server/lib/validacionMatrizDocumental.js';
import {
  encodeReqitemManifiestoRef,
  normalizeDetalleItemsSc,
  listRequisitosConfig,
} from '../shared/cotizacionItemRequisitos.js';
import { findMatrizDocumentalFila } from '../src/utils/validacionDocumentosMatriz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ok = (c, m) => { assert.ok(c, m); console.log(`  ✓ ${m}`); };

console.log('\n=== RC8.17.8H6-C3-D8-C3/D — documentos por ítem ===\n');
await runMigrations({ silent: true });

const ts = Date.now();
const tag = `D8C3D8-${ts}`;
const { rows: uRows } = await query('SELECT id, username FROM usuarios WHERE activo = TRUE ORDER BY id LIMIT 1');
const userId = uRows[0]?.id || 1;
const userName = uRows[0]?.username || 'admin';

let detalle5 = normalizeDetalleItemsSc([
  { requerimiento_id: null, item_index: 0, requerimiento_codigo: 'REQ-X', descripcion: 'Item 1', pedido_sigamef: 'P1' },
  { requerimiento_id: null, item_index: 1, requerimiento_codigo: 'REQ-X', descripcion: 'Item 2', pedido_sigamef: 'P2' },
  { requerimiento_id: null, item_index: 2, requerimiento_codigo: 'REQ-X', descripcion: 'Item 3', pedido_sigamef: 'P3' },
  { requerimiento_id: null, item_index: 3, requerimiento_codigo: 'REQ-X', descripcion: 'Item 4', pedido_sigamef: 'P4' },
  { requerimiento_id: null, item_index: 4, requerimiento_codigo: 'REQ-X', descripcion: 'Item 5', pedido_sigamef: 'P5' },
]);
let item1;
let item3;
let item5;
const reqsSc = listRequisitosConfig([{ requisito: 'Ficha técnica', obligatorio: true }]);
const reqFicha = reqsSc[0].req_key;

const pgClient = await getClient();
let sid = null;
let rid = null;
let cotA = null;
let cotB = null;
try {
  await pgClient.query('BEGIN');
  const insReq = await pgClient.query(`
    INSERT INTO requerimientos (tipo, codigo, denominacion, area, responsable, estado, payload, estado_actual)
    VALUES ('bienes', $1, 'Test C3D8', 'CNCC', 'CNCC', 'En tramite', '{}'::jsonb, 'RECEPCION_COTIZACIONES')
    RETURNING id
  `, [`REQ-${tag}`]);
  rid = insReq.rows[0].id;
  detalle5 = normalizeDetalleItemsSc(detalle5.map((d) => ({ ...d, requerimiento_id: rid })));
  item1 = detalle5[0].item_key;
  item3 = detalle5[2].item_key;
  item5 = detalle5[4].item_key;
  await pgClient.query(`
    INSERT INTO expediente_estado_vigente (
      requerimiento_id, etapa_codigo, etapa_label, estado_codigo, estado_label,
      responsable_tipo, responsable_usuario_id, version, actualizado_at
    ) VALUES ($1, 'RECEPCION_COTIZACIONES', 'Recepción', 'EN_TRAMITE', 'En trámite', 'PERSONA', $2, 1, NOW())
  `, [rid, userId]);

  const scDetalle = JSON.stringify(detalle5);
  const insSc = await pgClient.query(`
    INSERT INTO solicitudes_cotizacion (codigo, anio, correlativo, estado, objeto, denominacion, tipo, detalle_items,
      docs_solicitados, requisitos_tecnicos)
    VALUES ($1, 2026, $2, 'PUBLICADA', 'Obj', 'SC C3D8', 'Bienes', $3::jsonb,
      '[{"documento":"Declaración jurada","obligatorio":true}]'::jsonb,
      '[{"requisito":"Ficha técnica","obligatorio":true}]'::jsonb)
    RETURNING id
  `, [`SC-${tag}`, (ts % 70000) + 700, scDetalle]);
  sid = insSc.rows[0].id;
  await pgClient.query('INSERT INTO solicitud_requerimientos (solicitud_id, requerimiento_id) VALUES ($1, $2)', [sid, rid]);

  const insP = await pgClient.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov C3D8 A', TRUE) RETURNING id
  `, [`20${String(ts).slice(-9)}`]);
  const pid = insP.rows[0].id;
  const insP2 = await pgClient.query(`
    INSERT INTO proveedores (ruc, razon_social, activo) VALUES ($1, 'Prov C3D8 B', TRUE) RETURNING id
  `, [`20${String(ts + 1).slice(-9)}`]);
  const pidB = insP2.rows[0].id;

  const ref1 = encodeReqitemManifiestoRef(item1, reqFicha);
  const ref3 = encodeReqitemManifiestoRef(item3, reqFicha);
  const anexosA = {
    docs_solicitados: [{ adjunto_id: 9001, nombre: 'declaracion.pdf', key: 'doc-0-x' }],
    requisitos_por_item: {
      [item1]: { [reqFicha]: { adjunto_id: 9101, nombre: 'ficha-item1.pdf', requisito: 'Ficha técnica' } },
      [item3]: { [reqFicha]: { adjunto_id: 9103, nombre: 'ficha-item3.pdf', requisito: 'Ficha técnica' } },
    },
  };
  const propA = {
    items: [
      { item_key: item1, cotiza: true },
      { item_key: detalle5[1].item_key, cotiza: false },
      { item_key: item3, cotiza: true },
      { item_key: detalle5[3].item_key, cotiza: false },
      { item_key: item5, cotiza: true },
    ],
    items_cotizados: [item1, item3, item5],
  };

  const insA = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado, propuesta_tecnica, anexos,
      propuesta_economica, validacion_estado, validacion_responsable, validacion_informe
    ) VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', $4::jsonb, $5::jsonb, '{}'::jsonb, 'DERIVADA', $6,
      $7::jsonb)
    RETURNING id
  `, [sid, pid, rid, JSON.stringify(propA), JSON.stringify(anexosA), userName,
    JSON.stringify({ derivacion: { responsable_id: userId, responsable_nombre: userName, submodulo: 'VALIDACIONES' } })]);
  cotA = insA.rows[0].id;

  const anexosB = {
    requisitos_por_item: {
      [item1]: { [reqFicha]: { adjunto_id: 9201, nombre: 'ficha-B.pdf', requisito: 'Ficha técnica' } },
    },
  };
  const insB = await pgClient.query(`
    INSERT INTO cotizaciones_proveedor (
      solicitud_id, proveedor_id, requerimiento_id, estado, propuesta_tecnica, anexos,
      propuesta_economica, validacion_estado, validacion_responsable, validacion_informe
    ) VALUES ($1, $2, $3, 'COTIZACION_PRESENTADA', $4::jsonb, $5::jsonb, '{}'::jsonb, 'DERIVADA', $6,
      $7::jsonb)
    RETURNING id
  `, [sid, pidB, rid, JSON.stringify({ items_cotizados: [item1], items: [{ item_key: item1, cotiza: true }] }),
    JSON.stringify(anexosB), userName,
    JSON.stringify({ derivacion: { responsable_id: userId, responsable_nombre: userName, submodulo: 'VALIDACIONES' } })]);
  cotB = insB.rows[0].id;

  await pgClient.query('COMMIT');

  const detA = await getValidacionTrabajoDetalle(cotA, userName, userId, { esAdmin: true });
  const md = detA.matriz_documental;
  ok(md?.filas?.length === 3, 'A — subconjunto cotizado: 3 filas (ítems 1, 3 y 5)');
  ok(md.filas.every((f) => Number(f.cotizacion_id) === Number(cotA)), 'A — todas las filas ancladas a cotización A');
  ok(new Set(md.filas.map((f) => f.item_key)).size === 3, 'A — tres item_key distintos');

  const detB = await getValidacionTrabajoDetalle(cotB, userName, userId, { esAdmin: true });
  ok(detB.matriz_documental.filas.length === 1, 'B — cotización B: 1 fila');
  ok(!detA.matriz_documental.filas.some((f) => f.documentos_tecnicos?.some((d) => d.adjunto_id === 9201)),
    'B — abrir A no incluye adjunto técnico de B');

  const f1 = md.filas.find((f) => f.item_key === item1);
  const f3 = md.filas.find((f) => f.item_key === item3);
  ok(f1.documentos_tecnicos.some((d) => d.ref === ref1), 'C — item1 ref reqitem propio');
  ok(f3.documentos_tecnicos.some((d) => d.ref === ref3), 'C — item3 ref reqitem distinto');
  ok(!f1.documentos_tecnicos.some((d) => d.ref === ref3), 'C — item1 sin ref de item3');

  ok(f1.documentos_solicitados.some((d) => String(d.ref).startsWith('docs-')), 'D — docs-* en fila cotizada');
  ok(f3.documentos_solicitados.some((d) => String(d.ref).startsWith('docs-')), 'D — docs-* repetido en otra fila');

  const allRefs = JSON.stringify(md);
  ok(!allRefs.includes('req_adj_'), 'E — sin req_adj en matriz documental');

  const uiSrc = fs.readFileSync(path.join(__dirname, '../src/utils/validacionMatrizUi.js'), 'utf8');
  ok(uiSrc.includes('data-item-key'), 'F — botón Registro incluye data-item-key');

  const slice1 = sliceMatrizDocumentalFila(md, cotA, item1);
  const slice3 = findMatrizDocumentalFila(md, cotA, item3);
  ok(slice1 && slice3 && slice1.item_key === item1, 'G — slice fila item1');
  ok(!slice1.documentos_tecnicos.some((d) => d.ref === ref3), 'G — modal item1 sin técnicos item3');

  const legacyDetalle = normalizeDetalleItemsSc([{
    requerimiento_id: rid,
    item_index: 0,
    requerimiento_codigo: 'REQ-X',
    descripcion: 'Legacy item',
  }]);
  const legacyItem = legacyDetalle[0].item_key;
  const legacyCot = {
    id: 999001,
    solicitud_id: sid,
    proveedor_id: pid,
    requerimiento_id: rid,
    razon_social: 'Legacy',
    ruc: '20123456789',
    detalle_items: legacyDetalle,
    propuesta_tecnica: {},
    anexos: { requisitos: [{ adjunto_id: 1, nombre: 'legacy-req.pdf' }] },
    sc_requisitos_tecnicos: reqsSc.map((r) => ({ requisito: r.requisito, obligatorio: true })),
  };
  const mdLegacy = await buildMatrizDocumentalValidacion(legacyCot, { matriz_v2_filas: [] });
  const lf = mdLegacy.filas.find((f) => f.item_key === legacyItem) || mdLegacy.filas[0];
  ok(lf.documentos_tecnicos.length === 0 && mdLegacy.legacy_global_rtm, 'H — legacy global: sin reqitem fabricado');

  ok(detA.matriz_v2?.expediente !== true, 'I — flujo normal sin expediente:true');

  const snapB = await query('SELECT validacion_informe FROM cotizaciones_proveedor WHERE id = $1', [cotB]);
  const infBefore = snapB.rows[0]?.validacion_informe;
  await guardarValidacionParcial(cotA, { matriz_v2: detA.matriz_v2 }, userName, userId, { esAdmin: true });
  const snapAfter = await query('SELECT validacion_informe FROM cotizaciones_proveedor WHERE id = $1', [cotB]);
  ok(JSON.stringify(snapAfter.rows[0]?.validacion_informe) === JSON.stringify(infBefore), 'J — guardar A no muta informe B');

  console.log('\n✅ D8-C3/D8 OK\n');
} finally {
  try {
    if (sid) {
      await query('DELETE FROM cotizaciones_proveedor WHERE solicitud_id = $1', [sid]);
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
