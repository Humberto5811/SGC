/**
 * RC8.17.8H6-C3-B6/B7 — Recepción matriz ítems × RTM.
 *
 *   node scripts/test-rc8178h6-c3b6b7-recepcion-matriz-items.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeDetalleItemsSc,
  reqKeySolicitud,
  encodeReqitemManifiestoRef,
} from '../shared/cotizacionItemRequisitos.js';
import {
  buildRecepcionMatrizContract,
  filterDocumentosRecepcionTab,
  formatPedidoSigamefRecepcion,
  prepareCotizacionForListItemsRecepcion,
} from '../shared/recepcionCotizacionMatriz.js';
import { listItemsCotizados } from '../shared/cotizacionItemRequisitos.js';
import { buildManifiestoCotizacion } from '../server/lib/portalDocumentos.js';
import {
  normalizeFilasPropuesta,
  buildFilasEconomicas,
  getRtmColumnasRecepcion,
  getCeldaRtmRecepcion,
  renderPropuestaTecnicaRecepcion,
  renderPropuestaEconomicaRecepcion,
  RC_PROPUESTA_TABLE_WRAP,
  RC_PROPUESTA_TABLE_CLASS,
} from '../src/utils/recepcionPropuestaRows.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function ok(c, m) { tests.push({ ok: !!c, msg: m }); if (c) console.log('OK:', m); else console.error('FAIL:', m); }

function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function fmtMonto(n) { return String(n ?? '—'); }

function buildDetalle10() {
  return normalizeDetalleItemsSc(Array.from({ length: 10 }, (_, i) => ({
    requerimiento_id: 50,
    item_index: i,
    requerimiento_codigo: `REQ-${String(i + 1).padStart(2, '0')}`,
    pedido_sigamef: i === 2 ? '' : `PB-${5000 + i}`,
    codigo_sigamef: `SIGA-${i + 1}`,
    descripcion: `Ítem ${i + 1}`,
    cantidad: 1,
  })));
}

/** Simula fila DB + parseo como getCotizacionRecepcionDetalle. */
function shapeLikeRecepcionDetalleInput(cotPartial) {
  const propEco = cotPartial.propuesta_economica && typeof cotPartial.propuesta_economica === 'object'
    ? cotPartial.propuesta_economica
    : JSON.parse(cotPartial.propuesta_economica || '{}');
  return {
    id: cotPartial.id ?? 1,
    ...cotPartial,
    detalle_items: Array.isArray(cotPartial.detalle_items)
      ? cotPartial.detalle_items
      : JSON.parse(cotPartial.detalle_items || '[]'),
    propuesta_tecnica: typeof cotPartial.propuesta_tecnica === 'object'
      ? cotPartial.propuesta_tecnica
      : JSON.parse(cotPartial.propuesta_tecnica || '{}'),
    propuesta_economica: propEco,
    anexos: cotPartial.anexos || {},
  };
}

function cotWithSelection(detalle, indices, extra = {}) {
  const keys = indices.map((i) => detalle[i].item_key);
  const propItems = detalle.map((d, i) => ({
    item_key: d.item_key,
    cotiza: indices.includes(i),
    requerimiento_codigo: d.requerimiento_codigo,
    descripcion: d.descripcion,
    marca: 'M',
    modelo: 'X',
    cantidad: 1,
  }));
  return {
    tipo: 'Bienes',
    detalle_items: detalle,
    items_cotizados: keys,
    propuesta_tecnica: { items: propItems.filter((_, i) => indices.includes(i)), items_cotizados: keys },
    propuesta_economica: { precios: Object.fromEntries(keys.map((k) => [k, { unitario: 10, total: 10 }])), items_cotizados: keys },
    anexos: extra.anexos || {},
    requisitos_tecnicos_sc: extra.reqsSc || [],
    ...extra,
  };
}

console.log('\n=== RC8.17.8H6-C3-B6/B7 — Recepción matriz ===\n');

const detalle10 = buildDetalle10();

// 1 — ítems 1–5
{
  const cot = cotWithSelection(detalle10, [0, 1, 2, 3, 4]);
  const m = buildRecepcionMatrizContract(cot);
  ok(m.items_cotizados.length === 5, '1. SC 10, cotiza 1–5 → 5 ítems recepción');
  ok(m.items.map((r) => r.requerimiento_codigo).join(',') === 'REQ-01,REQ-02,REQ-03,REQ-04,REQ-05',
    '1. orden SC 1→5');
}

// 2 — 6–10
{
  const cot = cotWithSelection(detalle10, [5, 6, 7, 8, 9]);
  const m = buildRecepcionMatrizContract(cot);
  ok(m.items_cotizados.length === 5 && m.items[0].requerimiento_codigo === 'REQ-06', '2. cotiza 6–10');
}

// 3 — 1,3,7,10 (0-based 0,2,6,9)
{
  const cot = cotWithSelection(detalle10, [0, 2, 6, 9]);
  const m = buildRecepcionMatrizContract(cot);
  ok(m.items.length === 4 && m.items.map((r) => r.requerimiento_codigo).join(',') === 'REQ-01,REQ-03,REQ-07,REQ-10',
    '3. parcial 1,3,7,10 orden SC');
}

// 4 — todos
{
  const cot = cotWithSelection(detalle10, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  ok(buildRecepcionMatrizContract(cot).items.length === 10, '4. todos → 10');
}

// 5–6 Pedido SIGAMEF
{
  const cot = cotWithSelection(detalle10, [0, 1]);
  const filas = normalizeFilasPropuesta({ ...cot, recepcion_matriz: buildRecepcionMatrizContract(cot) });
  const html = renderPropuestaTecnicaRecepcion({ ...cot, id: 1, recepcion_matriz: buildRecepcionMatrizContract(cot) }, esc);
  ok(filas[0].pedido_sigamef === 'PB-5000', '5. Pedido SIGAMEF en fila');
  ok(html.indexOf('N.° Pedido SIGAMEF') < html.indexOf('Descripción'), '5. columna Pedido después de Requerimiento');
  ok(filas[1].pedido_sigamef === 'PB-5001', '5b. segundo pedido');
  const sinPedido = detalle10[2];
  ok(formatPedidoSigamefRecepcion(sinPedido) === '—', '6. pedido faltante → —');
  ok(formatPedidoSigamefRecepcion({ ...sinPedido, codigo_sigamef: 'SIGA-3' }) === '—', '6. no usa codigo_sigamef');
}

// 7–10 columnas RTM
const reqs3 = [
  { requisito: 'Ficha técnica', obligatorio: true },
  { requisito: 'Certificado de análisis', obligatorio: true },
  { requisito: 'BPM', obligatorio: false },
];
const reqs8 = Array.from({ length: 8 }, (_, i) => ({ requisito: `RTM-${i + 1}`, obligatorio: i % 2 === 0 }));

{
  const cot0 = cotWithSelection(detalle10, [0], { reqsSc: [] });
  ok(getRtmColumnasRecepcion({ ...cot0, recepcion_matriz: buildRecepcionMatrizContract(cot0, { requisitos_tecnicos_sc: [] }) }).length === 0,
    '7. 0 RTM → 0 columnas');
}
{
  const cot = cotWithSelection(detalle10, [0, 1], { reqsSc: reqs3 });
  const cols = getRtmColumnasRecepcion({ ...cot, recepcion_matriz: buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs3 }) });
  ok(cols.length === 3, '8. 3 RTM → 3 columnas');
}
{
  const cot = cotWithSelection(detalle10, [0], { reqsSc: reqs8 });
  ok(getRtmColumnasRecepcion({ ...cot, recepcion_matriz: buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs8 }) }).length === 8,
    '9. 8 RTM → 8 columnas');
}
{
  const cot = cotWithSelection(detalle10, [0], { reqsSc: reqs3 });
  const cols = getRtmColumnasRecepcion({ ...cot, recepcion_matriz: buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs3 }) });
  ok(cols.map((c) => c.requisito).join('|') === 'Ficha técnica|Certificado de análisis|BPM', '10. orden RTM = SC');
}

// 11–13 celdas RTM
{
  const itemA = detalle10[0].item_key;
  const itemC = detalle10[2].item_key;
  const req1 = reqKeySolicitud({ requisito: 'Ficha técnica' }, 0);
  const req2 = reqKeySolicitud({ requisito: 'Certificado de análisis' }, 1);
  const anexos = {
    requisitos_por_item: {
      [itemA]: {
        [req1]: { adjunto_id: 101, nombre: 'a-ficha.pdf' },
        [req2]: { adjunto_id: 102, nombre: 'a-cert.pdf' },
      },
      [itemC]: { [req1]: { adjunto_id: 301, nombre: 'c-ficha.pdf' } },
    },
  };
  const cot = cotWithSelection(detalle10, [0, 2], { anexos, reqsSc: reqs3 });
  const mat = buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs3 });
  const cotFull = { ...cot, id: 99, recepcion_matriz: mat };
  const cellA1 = getCeldaRtmRecepcion(cotFull, itemA, req1);
  const cellA2 = getCeldaRtmRecepcion(cotFull, itemA, req2);
  const cellC1 = getCeldaRtmRecepcion(cotFull, itemC, req1);
  ok(cellA1.presentado && cellA1.ref === encodeReqitemManifiestoRef(itemA, req1), '11. A+req1 presentado ref reqitem');
  const html = renderPropuestaTecnicaRecepcion(cotFull, esc);
  ok(html.includes('rc-doc-ver') && html.includes(encodeReqitemManifiestoRef(itemA, req1)), '11. HTML Ver/Descargar');
  ok(!cellA2.presentado || cellA2.ref, '12. A+req2 presentado si adjunto');
  ok(cellC1.adjunto_id === 301 && cellC1.adjunto_id !== cellA1.adjunto_id, '13. C+req1 ≠ A');
}

// 14 ítem no cotizado
{
  const itemB = detalle10[1].item_key;
  const anexos = {
    requisitos_por_item: {
      [itemB]: { [reqKeySolicitud({ requisito: 'Ficha técnica' }, 0)]: { adjunto_id: 999 } },
    },
  };
  const cot = cotWithSelection(detalle10, [0], { anexos, reqsSc: reqs3 });
  const m = buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs3 });
  ok(!m.items.some((r) => r.item_key === itemB), '14. ítem B no cotizado no aparece');
}

// 15–16 Documentos tab
{
  const itemA = detalle10[0].item_key;
  const req1 = reqKeySolicitud({ requisito: 'Ficha técnica' }, 0);
  const cot = {
    ...cotWithSelection(detalle10, [0], {
      anexos: {
        requisitos_por_item: { [itemA]: { [req1]: { adjunto_id: 1, nombre: 'f.pdf' } } },
        docs_solicitados: [{ adjunto_id: 2, nombre: 'sol.pdf' }],
      },
      reqsSc: reqs3,
    }),
    detalle_items: detalle10,
  };
  const mat = buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs3 });
  const manif = buildManifiestoCotizacion(cot);
  const docs = filterDocumentosRecepcionTab(manif, mat);
  ok(docs.some((d) => d.ref === 'docs-0'), '16. docs generales permanecen');
  ok(!docs.some((d) => d.rtm_por_item), '15. contrato nuevo sin RTM itemizado duplicado en Documentos');
  ok(docs.some((d) => d.grupo === 'Documentos solicitados'), '16b. grupo documentos solicitados');
}

// 17–18 legacy
{
  const legacy = {
    tipo: 'Bienes',
    detalle_items: detalle10,
    propuesta_tecnica: { items: detalle10.map((d) => ({ item_key: d.item_key })) },
    anexos: { requisitos: [{ adjunto_id: 9, nombre: 'leg.pdf' }] },
    requisitos_tecnicos_sc: reqs3,
  };
  const mat = buildRecepcionMatrizContract(legacy, { requisitos_tecnicos_sc: reqs3 });
  ok(mat.legacy_global_rtm && !mat.contrato_rtm_por_item, '17. legacy global RTM');
  ok(getRtmColumnasRecepcion({ ...legacy, recepcion_matriz: mat }).length === 0, '18. legacy sin columnas item×RTM');
  const manif = buildManifiestoCotizacion(legacy);
  const docs = filterDocumentosRecepcionTab(manif, mat);
  ok(docs.some((d) => d.ref === 'req-0' && d.legacy_global), '17b. bloque global req-0 en Documentos');
}

// 19–21 económica
{
  const cot = cotWithSelection(detalle10, [0, 2, 6, 9]);
  const mat = buildRecepcionMatrizContract(cot);
  const cotFull = { ...cot, recepcion_matriz: mat };
  const eco = buildFilasEconomicas(cotFull);
  ok(eco.length === 4, '19. económica solo cotizados');
  const htmlEco = renderPropuestaEconomicaRecepcion(cotFull, esc, fmtMonto);
  ok(htmlEco.includes('N.° Pedido SIGAMEF'), '20. económica Pedido SIGAMEF');
  const filasT = normalizeFilasPropuesta(cotFull);
  ok(filasT.map((f) => f.requerimiento_codigo).join(',') === eco.map((e) => e.requerimiento_codigo).join(','),
    '21. orden técnica = económica');
}

// 22 HTML scroll
{
  const cot = cotWithSelection(detalle10, [0], { reqsSc: reqs8 });
  const html = renderPropuestaTecnicaRecepcion({ ...cot, id: 1, recepcion_matriz: buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs8 }) }, esc);
  ok(html.includes(RC_PROPUESTA_TABLE_WRAP) && html.includes(RC_PROPUESTA_TABLE_CLASS) && html.includes('overflow-x:auto') && html.includes('min-width'),
    '22. contenedor horizontal + min-width tabla');
}

// REV-A — listItemsCotizados con forma real API (JSON string como BD)
{
  const det = buildDetalle10();
  const raw = shapeLikeRecepcionDetalleInput({
    detalle_items: JSON.stringify(det),
    propuesta_tecnica: JSON.stringify({
      items: [0, 2, 6, 9].map((i) => ({ item_key: det[i].item_key, cotiza: true })),
      items_cotizados: [0, 2, 6, 9].map((i) => det[i].item_key),
    }),
    propuesta_economica: JSON.stringify({
      items_cotizados: [0, 2, 6, 9].map((i) => det[i].item_key),
      precios: {},
    }),
    anexos: {},
  });
  const mat = buildRecepcionMatrizContract(raw, { requisitos_tecnicos_sc: reqs3 });
  ok(mat.items.length === 4 && mat.list_items_precedence === 'EXPLICIT_COTIZA_FLAGS'
    || mat.list_items_precedence === 'EXPLICIT_ITEMS_COTIZADOS_ARRAY',
    'REV-A listItems vía forma recepción detalle (parcial 1,3,7,10)');
  ok(!mat.items.some((r) => r.item_key === det[1].item_key), 'REV-A ítem 2 no cotizado ausente');
}

// REV-B — alineación B,D,E + precios desordenados en objeto
{
  const det5 = normalizeDetalleItemsSc(['A', 'B', 'C', 'D', 'E'].map((letter, i) => ({
    requerimiento_id: 1,
    item_index: i,
    requerimiento_codigo: letter,
    pedido_sigamef: letter === 'A' ? '100' : letter === 'B' ? '200' : letter === 'C' ? '' : `P-${letter}`,
    codigo_sigamef: letter === 'C' ? '999' : `SIGA-${letter}`,
    descripcion: `Desc ${letter}`,
    cantidad: 1,
  })));
  const sel = [1, 3, 4];
  const keys = sel.map((i) => det5[i].item_key);
  const cot = shapeLikeRecepcionDetalleInput(cotWithSelection(det5, sel, {
    propuesta_economica: {
      items_cotizados: keys,
      precios: {
        [det5[4].item_key]: { unitario: 900, total: 900 },
        [det5[1].item_key]: { unitario: 200, total: 200 },
        [det5[3].item_key]: { unitario: 400, total: 400 },
      },
    },
  }));
  const full = { ...cot, recepcion_matriz: buildRecepcionMatrizContract(cot) };
  const t = normalizeFilasPropuesta(full);
  const e = buildFilasEconomicas(full);
  ok(t.map((r) => r.requerimiento_codigo).join(',') === 'B,D,E', 'REV-B técnica B,D,E orden SC');
  ok(e.map((r) => r.requerimiento_codigo).join(',') === 'B,D,E', 'REV-B económica B,D,E');
  ok(t[0].pedido_sigamef === '200' && t[1].pedido_sigamef === 'P-D', 'REV-B pedidos B,D');
  const rowB = e.find((r) => r.requerimiento_codigo === 'B');
  const rowD = e.find((r) => r.requerimiento_codigo === 'D');
  ok(rowB?.precio_total === 200 && rowD?.precio_total === 400, 'REV-B precio por item_key (D≠B)');
}

// REV-D — Pedido A/B/C explícito
{
  const det5 = normalizeDetalleItemsSc(['A', 'B', 'C'].map((letter, i) => ({
    requerimiento_id: 1,
    item_index: i,
    requerimiento_codigo: letter,
    pedido_sigamef: letter === 'A' ? '100' : letter === 'B' ? '200' : '',
    codigo_sigamef: letter === 'C' ? '999' : '',
    descripcion: letter,
  })));
  const cot = shapeLikeRecepcionDetalleInput(cotWithSelection(det5, [0, 1, 2]));
  const rows = buildRecepcionMatrizContract(cot).items;
  ok(rows.find((r) => r.requerimiento_codigo === 'A')?.pedido_sigamef === '100', 'REV-D A→100');
  ok(rows.find((r) => r.requerimiento_codigo === 'B')?.pedido_sigamef === '200', 'REV-D B→200');
  ok(rows.find((r) => r.requerimiento_codigo === 'C')?.pedido_sigamef === '—', 'REV-D C→—');
}

// REV-E — R_FAKE no crea columna
{
  const itemA = detalle10[0].item_key;
  const rFake = 'req-9-RTM_FAKE';
  const sc = [{ requisito: 'R1' }, { requisito: 'R2' }];
  const cot = shapeLikeRecepcionDetalleInput(cotWithSelection(detalle10, [0], {
    anexos: { requisitos_por_item: { [itemA]: { [rFake]: { adjunto_id: 1, nombre: 'fake.pdf' } } } },
    reqsSc: sc,
  }));
  const cols = buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: sc }).requisitos_tecnicos_config;
  ok(cols.length === 2 && cols.every((c) => c.requisito === 'R1' || c.requisito === 'R2'),
    'REV-E columnas solo SC R1,R2 (ignora R_FAKE en anexos)');
}

// REV-F — Documentos mixtos sin perder generales/anexo/cert
{
  const itemA = detalle10[0].item_key;
  const itemC = detalle10[2].item_key;
  const r1 = reqKeySolicitud({ requisito: 'R1' }, 0);
  const cot = shapeLikeRecepcionDetalleInput(cotWithSelection(detalle10, [0, 2], {
    anexos: {
      docs_solicitados: [{ adjunto_id: 1, nombre: 'sol.pdf' }],
      requisitos_por_item: {
        [itemA]: { [r1]: { adjunto_id: 2, nombre: 'a.pdf' } },
        [itemC]: { [r1]: { adjunto_id: 3, nombre: 'c.pdf' } },
      },
      anexo05a_firmado: { adjunto_id: 4, nombre: 'tec.pdf' },
    },
    reqsSc: [{ requisito: 'R1' }],
    certificados: [{ adjunto_id: 5, nombre: 'cert.pdf' }],
  }));
  cot.certificados = [{ adjunto_id: 5, nombre: 'cert.pdf' }];
  const mat = buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: [{ requisito: 'R1' }] });
  const manif = buildManifiestoCotizacion(cot);
  const docs = filterDocumentosRecepcionTab(manif, mat);
  ok(docs.some((d) => d.ref === 'docs-0'), 'REV-F docs-0 conservado');
  ok(docs.some((d) => d.ref === 'anexo05a'), 'REV-F anexo conservado');
  ok(docs.some((d) => d.ref === 'cert-0'), 'REV-F certificado conservado');
  ok(!docs.some((d) => d.rtm_por_item), 'REV-F sin reqitem en pestaña Documentos');
}

// REV-G — nuevo contrato sin uploads → 3 columnas No presentado
{
  const cot = shapeLikeRecepcionDetalleInput(cotWithSelection(detalle10, [0], {
    anexos: {},
    reqsSc: reqs3,
  }));
  const mat = buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs3 });
  ok(mat.contrato_rtm_por_item && !mat.legacy_global_rtm, 'REV-G contrato itemizado sin uploads');
  ok(mat.requisitos_tecnicos_config.length === 3, 'REV-G 3 columnas RTM');
  ok(Object.values(mat.requisitos_por_item[detalle10[0].item_key] || {}).every((c) => !c.presentado),
    'REV-G todas No presentado');
  const html = renderPropuestaTecnicaRecepcion({ ...cot, recepcion_matriz: mat }, esc);
  ok((html.match(/No presentado/g) || []).length >= 3, 'REV-G HTML No presentado');
}

// REV-H — items_cotizados explícito vacío → 0 filas (no “todos”)
{
  const det = buildDetalle10();
  const prepared = prepareCotizacionForListItemsRecepcion({
    propuesta_tecnica: { items: [], items_cotizados: [] },
    propuesta_economica: { items_cotizados: [], precios: {} },
    items_cotizados: [],
  });
  const { items, item_keys } = listItemsCotizados(prepared, det);
  ok(items.length === 0 && item_keys.length === 0, 'REV-H selección explícita vacía → 0 ítems');
}

// REV-I — XSS en encabezado RTM
{
  const xss = '<img src=x onerror=alert(1)>';
  const scX = [{ requisito: xss, obligatorio: true }];
  const cot = shapeLikeRecepcionDetalleInput(cotWithSelection(detalle10, [0], { reqsSc: scX }));
  const html = renderPropuestaTecnicaRecepcion({
    ...cot,
    recepcion_matriz: buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: scX }),
  }, esc);
  ok(!html.includes('<img src=x') && html.includes('&lt;img'), 'REV-I requisito escapado (sin tag HTML activo)');
  ok(!html.includes('<th class="small text-wrap" style="min-width:110px;"><img'), 'REV-I encabezado RTM no interpreta HTML');
}

// REV-J — Ver/Descargar solo con ref presentado
{
  const itemA = detalle10[0].item_key;
  const r1 = reqKeySolicitud({ requisito: 'R1' }, 0);
  const cot = shapeLikeRecepcionDetalleInput(cotWithSelection(detalle10, [0], {
    anexos: { requisitos_por_item: { [itemA]: { [r1]: { adjunto_id: 1 } } } },
    reqsSc: [{ requisito: 'R1' }, { requisito: 'R2' }],
  }));
  const full = { ...cot, id: 5, recepcion_matriz: buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: [{ requisito: 'R1' }, { requisito: 'R2' }] }) };
  const html = renderPropuestaTecnicaRecepcion(full, esc);
  const ref = encodeReqitemManifiestoRef(itemA, r1);
  ok(html.includes(`data-ref="${ref}"`), 'REV-J ref B6 en botón');
  ok((html.match(/rc-doc-ver/g) || []).length === 1, 'REV-J un Ver (R2 no presentado)');
}

// 12 explícito No presentado
{
  const itemA = detalle10[0].item_key;
  const req2 = reqKeySolicitud({ requisito: 'Certificado de análisis' }, 1);
  const cot = cotWithSelection(detalle10, [0], {
    anexos: { requisitos_por_item: { [itemA]: {} } },
    reqsSc: reqs3,
  });
  const cotFull = { ...cot, recepcion_matriz: buildRecepcionMatrizContract(cot, { requisitos_tecnicos_sc: reqs3 }) };
  const html = renderPropuestaTecnicaRecepcion(cotFull, esc);
  ok(!getCeldaRtmRecepcion(cotFull, itemA, req2).presentado, '12. req2 faltante');
  ok(html.includes('No presentado'), '12b. texto No presentado en HTML');
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n--- ${tests.length - failed.length}/${tests.length} OK ---\n`);
if (failed.length) {
  failed.forEach((f) => console.error('  ', f.msg));
  process.exit(1);
}
console.log('✅ RC8.17.8H6-C3-B6/B7 OK\n');
