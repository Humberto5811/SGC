/**
 * RC8.17.8H6-C3-B1 — Contrato shared ítems cotizados × requisitos técnicos.
 *
 *   node scripts/test-rc8178h6-c3b1-item-requisitos-contract.mjs
 */
import assert from 'node:assert/strict';
import {
  normalizeItemKey,
  normalizeDetalleItemsSc,
  reqKeySolicitud,
  docKeySolicitud,
  requisitoItemSlotKey,
  listRequisitosConfig,
  listItemsCotizados,
  buildItemRequirementMatrix,
  hasExplicitItemsCotizadosContract,
  LIST_ITEMS_COTIZADOS_PRECEDENCE,
} from '../shared/cotizacionItemRequisitos.js';
import { reqKeySolicitud as reqKeyFe } from '../src/utils/cotizacionDocumentosPresentados.js';

const tests = [];
function ok(cond, msg) {
  tests.push({ ok: !!cond, msg });
  if (!cond) console.error('FAIL:', msg);
  else console.log('OK:', msg);
}

function buildScDetalle10(reqId = 100) {
  return Array.from({ length: 10 }, (_, i) => ({
    requerimiento_id: reqId,
    item_index: i,
    requerimiento_codigo: `REQ-${String(i + 1).padStart(3, '0')}`,
    pedido_sigamef: i === 0 ? 'PB-1001' : `PB-${2000 + i}`,
    descripcion: `Ítem SC ${i + 1}`,
    cantidad: 1,
  }));
}

console.log('\n=== RC8.17.8H6-C3-B1 — cotizacionItemRequisitos ===\n');

// Alineación req_key legacy
ok(
  reqKeySolicitud({ requisito: 'RNP vigente' }, 0) === reqKeyFe({ requisito: 'RNP vigente' }, 0),
  'reqKeySolicitud alineado con cotizacionDocumentosPresentados',
);
ok(
  docKeySolicitud({ documento: 'Anexo 09' }, 0) === 'doc-0-Anexo 09',
  'docKeySolicitud estable',
);

const detalle10 = normalizeDetalleItemsSc(buildScDetalle10());
ok(detalle10.length === 10, 'detalle normalizado: 10 filas');
ok(detalle10[0].item_key === '100-0' && detalle10[9].item_key === '100-9', 'item_key canónico');
ok(detalle10[3].sc_ordinal === 3, 'sc_ordinal = posición array');
ok(
  detalle10.map((r) => r.sc_ordinal).join(',') === '0,1,2,3,4,5,6,7,8,9',
  'orden SC preservado (sc_ordinal)',
);

// CASO 1 — explícito primeros 5
{
  const keys5 = detalle10.slice(0, 5).map((r) => r.item_key);
  const cot = {
    items_cotizados: keys5,
    propuesta_tecnica: { items: keys5.map((k) => ({ item_key: k, cotiza: true })) },
  };
  const r = listItemsCotizados(cot, detalle10);
  ok(r.items.length === 5, 'CASO 1: exactamente 5 ítems');
  ok(r.item_keys.join(',') === keys5.join(','), 'CASO 1: claves 1→5');
  ok(r.precedence === 'EXPLICIT_COTIZA_FLAGS', 'CASO 1: precedencia cotiza explícito');
  ok(r.items[0].requerimiento_codigo === 'REQ-001', 'CASO 1: conserva código REQ original');
}

// CASO 2 — ítems 6→10 (índices 5-9)
{
  const keys = detalle10.slice(5, 10).map((r) => r.item_key);
  const cot = { items_cotizados: keys };
  const r = listItemsCotizados(cot, detalle10);
  ok(r.items.length === 5, 'CASO 2: exactamente 5 ítems');
  ok(r.item_keys[0] === '100-5' && r.item_keys[4] === '100-9', 'CASO 2: ítems 6→10');
  ok(r.precedence === 'EXPLICIT_ITEMS_COTIZADOS_ARRAY', 'CASO 2: items_cotizados explícito');
}

// CASO 3 — 1,3,7,10 (1-based) → ordinales 0,2,6,9
{
  const pick = [0, 2, 6, 9].map((i) => detalle10[i].item_key);
  const cot = {
    propuesta_tecnica: {
      items: pick.map((item_key) => ({ item_key, cotiza: true })),
    },
  };
  const r = listItemsCotizados(cot, detalle10);
  ok(r.items.length === 4, 'CASO 3: cuatro ítems');
  ok(r.item_keys.join(',') === pick.join(','), 'CASO 3: orden SC 1,3,7,10');
  ok(r.items[0].sc_ordinal === 0 && r.items[1].sc_ordinal === 2, 'CASO 3: no renumera sc_ordinal');
}

// CASO 4 — los 10
{
  const allKeys = detalle10.map((r) => r.item_key);
  const cot = {
    items_cotizados: allKeys,
    propuesta_tecnica: { items: allKeys.map((k) => ({ item_key: k })) },
  };
  const r = listItemsCotizados(cot, detalle10);
  ok(r.items.length === 10, 'CASO 4: diez ítems');
}

// CASO 5 — legacy subconjunto en propuesta_tecnica.items
{
  const subset = detalle10.filter((_, i) => [1, 4, 8].includes(i));
  const cot = {
    propuesta_tecnica: {
      items: subset.map((row) => ({
        item_key: row.item_key,
        marca: 'M',
      })),
    },
  };
  const r = listItemsCotizados(cot, detalle10);
  ok(r.items.length === 3, 'CASO 5: subconjunto legacy (3)');
  ok(r.precedence === 'LEGACY_PROPUESTA_TECNICA_ITEMS_SUBSET', 'CASO 5: precedencia subset');
  ok(r.item_keys.join(',') === subset.map((x) => x.item_key).join(','), 'CASO 5: orden SC');
}

// CASO 6 — legacy sin señal → todos detalle
{
  const cot = { propuesta_tecnica: {}, propuesta_economica: {} };
  const r = listItemsCotizados(cot, detalle10);
  ok(r.items.length === 10, 'CASO 6: compatible — todos detalle_items');
  ok(r.precedence === 'LEGACY_ALL_DETALLE_ITEMS', 'CASO 6: precedencia all detalle');
  const matrix = buildItemRequirementMatrix(r.items, [{ requisito: 'RNP' }]);
  ok(!matrix[0].requisitos.some((x) => x.archivo || x.ref), 'CASO 6: matriz sin documentos inventados');
}

// CASO 7 — 3 requisitos × N ítems
{
  const sc = {
    requisitos_tecnicos: [
      { requisito: 'A', obligatorio: true },
      { requisito: 'B', obligatorio: false },
      { requisito: 'C', obligatorio: true },
    ],
  };
  const reqs = listRequisitosConfig(sc);
  ok(reqs.length === 3, 'CASO 7: tres requisitos config');
  const cot = { items_cotizados: ['100-0', '100-1'] };
  const { items } = listItemsCotizados(cot, detalle10);
  const matrix = buildItemRequirementMatrix(items, reqs);
  ok(matrix.length === 2, 'CASO 7: dos filas ítem');
  ok(matrix.every((row) => row.requisitos.length === 3), 'CASO 7: 3 requisitos por ítem');
}

// CASO 8 — 8 requisitos
{
  const sc = {
    requisitos_tecnicos: Array.from({ length: 8 }, (_, i) => ({ requisito: `RT-${i + 1}` })),
  };
  const reqs = listRequisitosConfig(sc);
  const { items } = listItemsCotizados({ items_cotizados: ['100-0'] }, detalle10);
  const matrix = buildItemRequirementMatrix(items, reqs);
  ok(reqs.length === 8, 'CASO 8: ocho requisitos listados');
  ok(matrix[0].requisitos.length === 8, 'CASO 8: matriz conserva 8 columnas/requisitos');
}

// CASO 9 — requisitos texto similar, no dedupe
{
  const sc = {
    requisitos_tecnicos: [
      { requisito: 'Garantía', obligatorio: true },
      { requisito: 'Garantía ', obligatorio: false },
      { requisito: 'garantía', obligatorio: true, custom: true },
    ],
  };
  const reqs = listRequisitosConfig(sc);
  ok(reqs.length === 3, 'CASO 9: no elimina duplicados aparentes');
  ok(reqs[0].req_key !== reqs[1].req_key || reqs[0].index !== reqs[1].index, 'CASO 9: identidad por índice');
  ok(reqs[2].req_key === reqKeySolicitud({ requisito: 'garantía' }, 2), 'CASO 9: req_key estable');
}

// CASO 10 — pedido_sigamef presente
{
  ok(detalle10[0].pedido_sigamef === 'PB-1001', 'CASO 10: pedido conservado en detalle');
  const { items } = listItemsCotizados({ items_cotizados: ['100-0'] }, detalle10);
  ok(items[0].pedido_sigamef === 'PB-1001', 'CASO 10: pedido en ítem cotizado');
}

// CASO 11 — pedido ausente
{
  const det = normalizeDetalleItemsSc([{ requerimiento_id: 50, item_index: 0, descripcion: 'X' }]);
  ok(det[0].pedido_sigamef === '', 'CASO 11: pedido ausente → vacío');
  const { items } = listItemsCotizados({}, det);
  ok(items[0].pedido_sigamef === '', 'CASO 11: no inventa pedido');
}

// CASO 12 — fallback item_key legacy
{
  ok(normalizeItemKey({ requerimiento_id: 7, item_index: 2 }) === '7-2', 'CASO 12: fallback determinista');
  ok(normalizeItemKey({ item_key: '7-2', requerimiento_id: 99, item_index: 0 }) === '7-2', 'CASO 12: respeta item_key existente');
  const det = normalizeDetalleItemsSc([{ requerimiento_id: 12, item_index: 4 }]);
  ok(det[0].item_key === '12-4', 'CASO 12: normaliza detalle legacy');
}

ok(
  requisitoItemSlotKey('100-3', reqKeySolicitud({ requisito: 'RNP' }, 0)) === '100-3|req-0-RNP',
  'slot futuro item_key|req_key',
);
ok(
  LIST_ITEMS_COTIZADOS_PRECEDENCE.length >= 5,
  'precedencia documentada exportada',
);
ok(
  hasExplicitItemsCotizadosContract({ propuesta_tecnica: { items: [{ cotiza: true }] } }),
  'hasExplicitItemsCotizadosContract detecta cotiza',
);

const failed = tests.filter((t) => !t.ok);
console.log(`\n--- ${tests.length - failed.length}/${tests.length} OK ---\n`);
if (failed.length) {
  process.exit(1);
}
