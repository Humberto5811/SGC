/**
 * RC8.17.8H6-C3-B2/B3 — Snapshot SC + selección explícita portal.
 *
 *   node scripts/test-rc8178h6-c3b2b3-portal-seleccion-items.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeDetalleItemsSc,
  persistDetalleItemsSnapshot,
  buildPortalPartialCotizacionPayload,
  resolveCotizaByKeyFromCotizacion,
  validatePortalCotizacionSelection,
  sumPreciosItemKeys,
  listItemsCotizados,
} from '../shared/cotizacionItemRequisitos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function ok(c, m) { tests.push({ ok: !!c, msg: m }); if (c) console.log('OK:', m); else console.error('FAIL:', m); }

function buildDetalle10() {
  return Array.from({ length: 10 }, (_, i) => ({
    requerimiento_id: 100,
    item_index: i,
    requerimiento_codigo: `REQ-${String(i + 1).padStart(3, '0')}`,
    pedido_sigamef: `PB-${3000 + i}`,
    codigo_sigamef: `SIGA-${i + 1}`,
    descripcion: `Ítem ${i + 1}`,
    cantidad: 1,
  }));
}

function cotizaMap(detalle, indices) {
  const m = {};
  detalle.forEach((it, i) => {
    m[it.item_key] = indices.includes(i);
  });
  return m;
}

function formItemsFor(detalle, indices) {
  return detalle.map((it, i) => (indices.includes(i)
    ? { item_key: it.item_key, marca: 'M', presentacion: 'P', cantidad_ofertada: 1,
      modelo: 'X', pais: 'PE', anio_fabricacion: '2024', garantia: '1', vigencia_minima: '1',
      compromiso_canje: 'No', plazo_entrega: '30d', doc_tecnica: 'doc' }
    : { item_key: it.item_key }));
}

function preciosFor(detalle, indices, unit = 10) {
  const p = {};
  detalle.forEach((it, i) => {
    p[it.item_key] = { unitario: indices.includes(i) ? unit : 0, total: indices.includes(i) ? unit : 0 };
  });
  return p;
}

console.log('\n=== RC8.17.8H6-C3-B2/B3 ===\n');

const raw10 = buildDetalle10();
const detalle10 = persistDetalleItemsSnapshot(raw10);

ok(detalle10.length === 10, '1. SC 10 ítems snapshot');
ok(detalle10.map((r) => r.sc_ordinal).join(',') === '0,1,2,3,4,5,6,7,8,9', '1. orden SC 1→10');
ok(detalle10[0].pedido_sigamef === 'PB-3000', '2. pedido_sigamef preservado');
ok(detalle10[0].item_key === '100-0' && detalle10[9].item_key === '100-9', '3. item_key estable');
ok(detalle10[0].codigo_sigamef === 'SIGA-1' && detalle10[0].pedido_sigamef !== detalle10[0].codigo_sigamef,
  '15. Pedido SIGAMEF ≠ Código SIGA');

// 4 — ítems 1–5
{
  const sel = [0, 1, 2, 3, 4];
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: detalle10,
    formItems: formItemsFor(detalle10, sel),
    cotizaByKey: cotizaMap(detalle10, sel),
    precios: preciosFor(detalle10, sel),
    tipo: 'Bienes',
  });
  ok(partial.items_cotizados.length === 5, '4. payload 5 ítems');
  ok(partial.items_cotizados.join(',') === detalle10.slice(0, 5).map((x) => x.item_key).join(','), '4. claves 1→5');
}

// 5 — 6→10
{
  const sel = [5, 6, 7, 8, 9];
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: detalle10,
    formItems: formItemsFor(detalle10, sel),
    cotizaByKey: cotizaMap(detalle10, sel),
    precios: preciosFor(detalle10, sel),
    tipo: 'Bienes',
  });
  ok(partial.items_cotizados.length === 5 && partial.items_cotizados[0] === '100-5', '5. payload 6→10');
}

// 6 — 1,3,7,10
{
  const sel = [0, 2, 6, 9];
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: detalle10,
    formItems: formItemsFor(detalle10, sel),
    cotizaByKey: cotizaMap(detalle10, sel),
    precios: preciosFor(detalle10, sel),
    tipo: 'Bienes',
  });
  ok(partial.items_cotizados.join(',') === '100-0,100-2,100-6,100-9', '6. orden SC 1,3,7,10');
}

// 7 — todos
{
  const sel = detalle10.map((_, i) => i);
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: detalle10,
    formItems: formItemsFor(detalle10, sel),
    cotizaByKey: cotizaMap(detalle10, sel),
    precios: preciosFor(detalle10, sel),
    tipo: 'Bienes',
  });
  ok(partial.items_cotizados.length === 10, '7. diez ítems');
}

// 8–10 desmarcados
{
  const sel = [0, 1];
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: detalle10,
    formItems: formItemsFor(detalle10, sel),
    cotizaByKey: cotizaMap(detalle10, sel),
    precios: preciosFor(detalle10, sel, 10),
    tipo: 'Bienes',
  });
  ok(partial.propuesta_tecnica.items.length === 2, '8. desmarcados fuera de propuesta_tecnica.items');
  ok(Object.keys(partial.precios).length === 2, '9. precios solo cotizados');
  const monto = sumPreciosItemKeys(partial.precios, partial.items_cotizados);
  ok(monto === 20, '10. total excluye desmarcados (2×10)');
}

// 11 — validación desmarcados
{
  const cotizaByKey = cotizaMap(detalle10, [0]);
  const v = validatePortalCotizacionSelection(cotizaByKey);
  ok(v.ok, '11. un ítem cotizado válido');
  const v0 = validatePortalCotizacionSelection(cotizaMap(detalle10, []));
  ok(!v0.ok, '12. cero seleccionados → error');
}

// 13 — reapertura contrato nuevo
{
  const cot = {
    estado: 'BORRADOR',
    propuesta_tecnica: {
      items: [{ item_key: '100-2', cotiza: true }, { item_key: '100-5', cotiza: true }],
      items_cotizados: ['100-2', '100-5'],
    },
    propuesta_economica: { items_cotizados: ['100-2', '100-5'], precios: {} },
  };
  const { cotizaByKey } = resolveCotizaByKeyFromCotizacion(detalle10, cot);
  ok(cotizaByKey['100-2'] === true && cotizaByKey['100-5'] === true && cotizaByKey['100-0'] === false,
    '13. reapertura restaura selección explícita');
}

// 14 — legacy B1
{
  const cot = {
    propuesta_tecnica: { items: [{ item_key: '100-1' }, { item_key: '100-3' }] },
  };
  const listed = listItemsCotizados(cot, detalle10);
  ok(listed.items.length === 2, '14. legacy subset vía B1');
  const fresh = resolveCotizaByKeyFromCotizacion(detalle10, null);
  ok(Object.values(fresh.cotizaByKey).every(Boolean), '14b. cotización nueva → todos seleccionados');
}

// 11 pedido ausente
{
  const d = normalizeDetalleItemsSc([{ requerimiento_id: 1, item_index: 0 }]);
  ok(d[0].pedido_sigamef === '', '11b. pedido ausente no inventado');
}

// 16 — atomicidad C3-A1 intacta (estático)
{
  const src = fs.readFileSync(path.join(root, 'server/lib/portalProveedores.js'), 'utf8');
  ok(/withTransaction/.test(src) && /presentarCotizacion/.test(src), '16. presentarCotizacion sigue transaccional');
  ok(!/presentarCotizacion[\s\S]{0,800}runMigrations/.test(src), '16. sin runMigrations en presentación');
}

// UI markers
{
  const steps = fs.readFileSync(path.join(root, 'src/utils/proveedorCotizacionSteps.js'), 'utf8');
  ok(/prov-cotiza-item/.test(steps) && /N\.° Pedido SIGAMEF/.test(steps), 'G. checkbox + pedido en tabla portal');
}

// REV-1 monto exacto + precio huérfano en estado UI no sale en payload
{
  const sel = [0, 1, 2];
  const preciosUi = {
    '100-0': { unitario: 10, total: 10 },
    '100-1': { unitario: 20, total: 20 },
    '100-2': { unitario: 30, total: 30 },
    '100-3': { unitario: 1000, total: 1000 },
  };
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: detalle10,
    formItems: formItemsFor(detalle10, sel),
    cotizaByKey: cotizaMap(detalle10, sel),
    precios: preciosUi,
    tipo: 'Bienes',
  });
  const monto = sumPreciosItemKeys(partial.precios, partial.items_cotizados);
  ok(monto === 60, 'REV-1 monto = 60 (10+20+30)');
  ok(!Object.prototype.hasOwnProperty.call(partial.precios, '100-3'), 'REV-1 payload precios sin 100-3');
  ok(Object.prototype.hasOwnProperty.call(preciosUi, '100-3'), 'REV-1 precio 100-3 puede quedar en estado UI');
}

// REV-2 contrato items_cotizados — B1 lee propuesta_economica
{
  const cot = {
    propuesta_tecnica: { items: [] },
    propuesta_economica: { items_cotizados: ['100-1', '100-4'] },
  };
  const listed = listItemsCotizados(cot, detalle10);
  ok(listed.precedence === 'EXPLICIT_ITEMS_COTIZADOS_ARRAY', 'REV-2 precedencia items_cotizados explícito');
  ok(listed.item_keys.join(',') === '100-1,100-4', 'REV-2 orden SC desde propuesta_economica.items_cotizados');
  const reopen = resolveCotizaByKeyFromCotizacion(detalle10, {
    estado: 'BORRADOR',
    propuesta_economica: { items_cotizados: ['100-1', '100-4'] },
  });
  ok(reopen.cotizaByKey['100-1'] && reopen.cotizaByKey['100-4'] && !reopen.cotizaByKey['100-0'],
    'REV-2 resolveCotizaByKey reconoce propuesta_economica.items_cotizados');
}

// REV-3 orden SC independiente del orden del array items_cotizados
{
  const det5 = normalizeDetalleItemsSc([
    { requerimiento_id: 200, item_index: 0, requerimiento_codigo: 'A', descripcion: 'A' },
    { requerimiento_id: 200, item_index: 1, requerimiento_codigo: 'B', descripcion: 'B' },
    { requerimiento_id: 200, item_index: 2, requerimiento_codigo: 'C', descripcion: 'C' },
    { requerimiento_id: 200, item_index: 3, requerimiento_codigo: 'D', descripcion: 'D' },
    { requerimiento_id: 200, item_index: 4, requerimiento_codigo: 'E', descripcion: 'E' },
  ]);
  const cotizaByKey = {
    '200-0': false, '200-1': true, '200-2': false, '200-3': true, '200-4': true,
  };
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: det5,
    formItems: det5.map(() => ({ marca: 'M' })),
    cotizaByKey,
    precios: { '200-1': { total: 1 }, '200-3': { total: 1 }, '200-4': { total: 1 } },
    tipo: 'Bienes',
  });
  const codes = partial.propuesta_tecnica.items.map((it) => {
    const row = det5.find((d) => d.item_key === it.item_key);
    return row?.requerimiento_codigo;
  });
  ok(codes.join(',') === 'B,D,E', 'REV-3 propuesta_tecnica.items orden SC B,D,E');
  ok(partial.items_cotizados.join(',') === '200-1,200-3,200-4', 'REV-3 items_cotizados orden SC');
}

// REV-4 snapshot preserva campos extra
{
  const raw = [{
    requerimiento_id: 9,
    item_index: 2,
    documentos: [{ nombre: 'ficha.pdf' }],
    centro: 'CNCC',
    paquete: 'PK-01',
    lugar_entrega: 'Lima',
    custom_flag: true,
  }];
  const snap = persistDetalleItemsSnapshot(raw);
  ok(snap[0].documentos?.[0]?.nombre === 'ficha.pdf', 'REV-4 preserva documentos');
  ok(snap[0].centro === 'CNCC' && snap[0].paquete === 'PK-01', 'REV-4 preserva centro/paquete');
  ok(snap[0].item_index === 2 && snap[0].item_key === '9-2', 'REV-4 no altera item_index válido');
  ok(snap[0].custom_flag === true, 'REV-4 preserva campos desconocidos');
}

// REV-6 Servicios legacy sin items_cotizados explícito — no payload vacío
{
  const ws = [{ item_key: '50-0', requerimiento_codigo: 'REQ-S', descripcion: 'Servicio', cantidad: 1 }];
  const cot = {
    estado: 'BORRADOR',
    propuesta_tecnica: { plazo_ejecucion: '30 días', forma_pago: 'TR', items: [] },
    propuesta_economica: {
      entregables: { '50-0': [{ numero: 1, precio: 500, total: 500 }] },
      monto: 500,
    },
  };
  const { cotizaByKey } = resolveCotizaByKeyFromCotizacion(ws, cot);
  ok(cotizaByKey['50-0'] === true, 'REV-6 legacy servicios mantiene ítem seleccionado');
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: ws,
    formItems: [{}],
    cotizaByKey,
    precios: {},
    entregablesEco: cot.propuesta_economica.entregables,
    tipo: 'Servicios',
    extraTecnica: { plazo_ejecucion: '30 días', forma_pago: 'TR' },
  });
  ok(partial.selectedCount === 1 && partial.propuesta_tecnica.items.length === 1,
    'REV-6 payload servicios legacy no vacío');
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n--- ${tests.length - failed.length}/${tests.length} OK ---\n`);
if (failed.length) process.exit(1);
