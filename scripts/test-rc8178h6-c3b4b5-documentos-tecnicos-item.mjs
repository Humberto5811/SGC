/**
 * RC8.17.8H6-C3-B4/B5 — Documentos técnicos por ítem (item_key × req_key).
 *
 *   node scripts/test-rc8178h6-c3b4b5-documentos-tecnicos-item.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeDetalleItemsSc,
  listRequisitosConfig,
  listItemsCotizados,
  buildItemRequirementMatrix,
  requisitoItemSlotKey,
  encodeReqitemManifiestoRef,
  decodeReqitemManifiestoRef,
  parseRequisitoItemSlotKey,
  lookupRequisitoPorItemAdjunto,
  buildRequisitosPorItemPayloadFromFlat,
  validateRequisitosObligatoriosPorItemMatrix,
  filterRequisitosPorItemForCotizados,
  shouldUseRequisitosPorItemPortal,
  isPortalCotizacionAdjuntoPresentado,
  buildPortalPartialCotizacionPayload,
} from '../shared/cotizacionItemRequisitos.js';
import {
  buildManifiestoCotizacion,
  findCotizacionAnexoEntryByRef,
} from '../server/lib/portalDocumentos.js';
import { buildPortalCotizacionPayload } from '../src/utils/portalCotizacionPayload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function ok(c, m) { tests.push({ ok: !!c, msg: m }); if (c) console.log('OK:', m); else console.error('FAIL:', m); }

console.log('\n=== RC8.17.8H6-C3-B4/B5 — RTM por ítem ===\n');

const detalle = normalizeDetalleItemsSc([
  { requerimiento_id: 10, item_index: 0, requerimiento_codigo: 'REQ-A', descripcion: 'Item A', pedido_sigamef: 'PB-A' },
  { requerimiento_id: 10, item_index: 1, requerimiento_codigo: 'REQ-B', descripcion: 'Item B', pedido_sigamef: 'PB-B' },
  { requerimiento_id: 10, item_index: 2, requerimiento_codigo: 'REQ-C', descripcion: 'Item C', pedido_sigamef: 'PB-C' },
]);
const itemA = detalle[0].item_key;
const itemB = detalle[1].item_key;
const itemC = detalle[2].item_key;

const reqsSc = [
  { requisito: 'Ficha técnica', obligatorio: true },
  { requisito: 'Certificado de análisis', obligatorio: true },
  { requisito: 'BPM', obligatorio: false },
];
const reqsCfg = listRequisitosConfig(reqsSc);
const reqFicha = reqsCfg[0].req_key;
const reqCert = reqsCfg[1].req_key;
const reqBpm = reqsCfg[2].req_key;

const cotizacionAC = {
  items_cotizados: [itemA, itemC],
  propuesta_tecnica: {
    items: [
      { item_key: itemA, cotiza: true },
      { item_key: itemB, cotiza: false },
      { item_key: itemC, cotiza: true },
    ],
    items_cotizados: [itemA, itemC],
  },
};

const { items: cotized } = listItemsCotizados(cotizacionAC, detalle);
const matrix = buildItemRequirementMatrix(cotized, reqsCfg);

// 1 — matriz 6 slots
ok(matrix.length === 2 && matrix[0].requisitos.length === 3 && matrix[1].requisitos.length === 3,
  '1. 3 RTM × 2 ítems cotizados = 6 slots (no 9)');

// 2 — slots únicos
{
  const slots = new Set();
  matrix.forEach((row) => row.requisitos.forEach((r) => {
    slots.add(requisitoItemSlotKey(row.item_key, r.req_key));
  }));
  ok(slots.size === 6, '2. cada slot item_key+req_key único');
}

// 3 — adjuntos distintos A vs C misma ficha
{
  const slotAF = requisitoItemSlotKey(itemA, reqFicha);
  const slotCF = requisitoItemSlotKey(itemC, reqFicha);
  ok(slotAF !== slotCF, '3. slot A/Ficha ≠ C/Ficha');
  const flat = {
    [slotAF]: { adjunto_id: 101, key: slotAF, nombre: 'ficha-a.pdf', item_key: itemA, req_key: reqFicha },
    [slotCF]: { adjunto_id: 202, key: slotCF, nombre: 'ficha-c.pdf', item_key: itemC, req_key: reqFicha },
  };
  const nested = buildRequisitosPorItemPayloadFromFlat(flat, { [itemA]: true, [itemC]: true });
  ok(nested[itemA][reqFicha].adjunto_id === 101 && nested[itemC][reqFicha].adjunto_id === 202,
    '3. adjuntos A/Ficha y C/Ficha no se cruzan');
}

// 4 — obligatorio faltante A
{
  const slotAF = requisitoItemSlotKey(itemA, reqFicha);
  const flat = { [slotAF]: { adjunto_id: 1, key: slotAF } };
  const errs = validateRequisitosObligatoriosPorItemMatrix(matrix, (ik, rk) => {
    const s = requisitoItemSlotKey(ik, rk);
    return flat[s];
  });
  ok(errs.some((e) => /Certificado/.test(e)), '4. obligatorio faltante en A → error');
}

// 5 — obligatorio B no cotizado → no error (portal valida solo matriz cotizada)
{
  ok(!matrix.some((row) => row.item_key === itemB), '5. ítem B fuera de matriz cotizada');
  const errs = validateRequisitosObligatoriosPorItemMatrix(matrix, () => null);
  ok(errs.length === 4 && !errs.some((e) => /REQ-B|10-1/.test(e)),
    '5. obligatorio faltante B no cotizado → sin error (solo A+C exigen)');
}

// 6 — opcional faltante permitido
{
  const flat = {};
  matrix.forEach((row) => row.requisitos.forEach((r) => {
    if (r.obligatorio) {
      const s = requisitoItemSlotKey(row.item_key, r.req_key);
      flat[s] = { adjunto_id: 9, key: s };
    }
  }));
  const errs = validateRequisitosObligatoriosPorItemMatrix(matrix, (ik, rk) => flat[requisitoItemSlotKey(ik, rk)]);
  ok(!errs.length && !flat[requisitoItemSlotKey(itemA, reqBpm)], '6. opcional BPM faltante permitido');
}

// 7 — payload solo A+C
{
  const flat = {};
  [itemA, itemC].forEach((ik) => reqsCfg.forEach((r) => {
    const s = requisitoItemSlotKey(ik, r.req_key);
    flat[s] = { adjunto_id: 1, key: s, item_key: ik, req_key: r.req_key };
  }));
  const nested = buildRequisitosPorItemPayloadFromFlat(flat, { [itemA]: true, [itemC]: true, [itemB]: false });
  ok(Object.keys(nested).sort().join(',') === [itemA, itemC].sort().join(','), '7. requisitos_por_item solo A+C');
  ok(!nested[itemB], '7. B ausente del payload');
}

// 8 — desmarcar C
{
  const nested = buildRequisitosPorItemPayloadFromFlat({
    [requisitoItemSlotKey(itemA, reqFicha)]: { adjunto_id: 1, key: 'x' },
    [requisitoItemSlotKey(itemC, reqFicha)]: { adjunto_id: 2, key: 'y' },
  }, { [itemA]: true, [itemC]: false });
  ok(nested[itemA] && !nested[itemC], '8. desmarcar C → C fuera del payload documental');
}

// 9 — remarcar C recupera slot exacto
{
  const slotCF = requisitoItemSlotKey(itemC, reqFicha);
  const slotCA = requisitoItemSlotKey(itemA, reqFicha);
  const flat = {
    [slotCF]: { adjunto_id: 777, key: slotCF },
    [slotCA]: { adjunto_id: 111, key: slotCA },
  };
  const nested = buildRequisitosPorItemPayloadFromFlat(flat, { [itemA]: true, [itemC]: true });
  ok(nested[itemC][reqFicha].adjunto_id === 777 && nested[itemA][reqFicha].adjunto_id === 111,
    '9. remarcar C solo recupera upload slot C+req_key');
}

// 10 — legacy global no asignado a ítems
{
  const legacyCot = {
    anexos: { requisitos: [{ key: 'req-0-x', adjunto_id: 55, nombre: 'global.pdf' }] },
    propuesta_tecnica: { items: detalle.map((d) => ({ item_key: d.item_key })) },
  };
  ok(!shouldUseRequisitosPorItemPortal(legacyCot), '10. legacy anexos.requisitos[] → modo global portal');
  ok(!lookupRequisitoPorItemAdjunto(legacyCot.anexos, itemA, reqFicha), '10. legacy no en requisitos_por_item');
}

// 11 — manifiesto nuevo item_key + req_key
{
  const anexos = {
    requisitos_por_item: {
      [itemA]: { [reqFicha]: { adjunto_id: 1, nombre: 'a.pdf', requisito: 'Ficha técnica', obligatorio: true } },
    },
  };
  const cot = { ...cotizacionAC, anexos, detalle_items: detalle, sc_requisitos_tecnicos: reqsSc };
  const manif = buildManifiestoCotizacion(cot);
  const row = manif.find((d) => d.rtm_por_item && d.item_key === itemA && d.req_key === reqFicha);
  ok(row && row.grupo === 'Requisitos técnicos' && row.ref.startsWith('reqitem--'), '11. manifiesto expone item_key+req_key');
}

// 12 — manifiesto legacy req-N
{
  const cot = {
    anexos: { requisitos: [{ adjunto_id: 9, nombre: 'leg.pdf' }] },
    propuesta_tecnica: {},
  };
  const manif = buildManifiestoCotizacion(cot);
  const leg = manif.find((d) => d.ref === 'req-0');
  ok(leg && leg.legacy_global === true, '12. manifiesto legacy sigue req-0');
}

// 13–14 — resolver por ref inequívoco
{
  const anexos = {
    requisitos_por_item: {
      [itemA]: { [reqFicha]: { adjunto_id: 11, nombre: 'a.pdf' } },
      [itemC]: { [reqFicha]: { adjunto_id: 22, nombre: 'c.pdf' } },
    },
  };
  const refA = encodeReqitemManifiestoRef(itemA, reqFicha);
  const refC = encodeReqitemManifiestoRef(itemC, reqFicha);
  const eA = findCotizacionAnexoEntryByRef(anexos, {}, refA);
  const eC = findCotizacionAnexoEntryByRef(anexos, {}, refC);
  ok(eA?.adjunto_id === 11 && eC?.adjunto_id === 22, '13. ref A+req1 obtiene archivo A');
  const wrong = findCotizacionAnexoEntryByRef(anexos, {}, refC);
  ok(wrong?.adjunto_id !== 11, '14. ref C no devuelve archivo de A');
}

// 15 — 8 requisitos × ítems cotizados
{
  const many = Array.from({ length: 8 }, (_, i) => ({ requisito: `R${i + 1}`, obligatorio: i % 2 === 0 }));
  const cfg8 = listRequisitosConfig(many);
  const m8 = buildItemRequirementMatrix(cotized, cfg8);
  ok(m8.every((row) => row.requisitos.length === 8), '15. 8 requisitos por cada ítem cotizado');
}

// 16 — orden items SC y requisitos config
{
  ok(matrix[0].item_key === itemA && matrix[1].item_key === itemC, '16. ítems orden SC (A antes C)');
  ok(
    matrix[0].requisitos.map((r) => r.req_key).join('|') === reqsCfg.map((r) => r.req_key).join('|'),
    '16. requisitos orden configuración',
  );
}

// 17 — documentos generales payload sin cambio estructural
{
  const payload = buildPortalCotizacionPayload({
    anexos: {
      docs_solicitados: [{ key: 'doc-0-x', adjunto_id: 1, nombre: 'sol.pdf' }],
      requisitos_por_item: { [itemA]: { [reqFicha]: { adjunto_id: 2, key: 'k', item_key: itemA, req_key: reqFicha } } },
    },
  });
  ok(payload.anexos.docs_solicitados.length === 1 && payload.anexos.requisitos_por_item[itemA],
    '17. docs generales + requisitos_por_item en payload saneado');
}

// 18 — atomicidad C3-A1
{
  const src = fs.readFileSync(path.join(root, 'server/lib/portalProveedores.js'), 'utf8');
  ok(/withTransaction/.test(src) && /presentarCotizacion/.test(src), '18. presentarCotizacion transaccional intacto');
  ok(!/presentarCotizacion[\s\S]{0,1200}runMigrations/.test(src), '18. sin runMigrations en presentación');
}

// slot_key estable
{
  const sk = requisitoItemSlotKey(itemA, reqFicha);
  ok(sk === `${itemA}|${reqFicha}` && parseRequisitoItemSlotKey(sk)?.req_key === reqFicha,
    'slot_key = requisitoItemSlotKey(item_key, req_key)');
  const ref = encodeReqitemManifiestoRef(itemA, reqFicha);
  ok(decodeReqitemManifiestoRef(ref)?.item_key === itemA, 'ref manifiesto decodifica item_key');
}

// REV-1 — obligatorio: key sin adjunto NO presentado
{
  const slotAF = requisitoItemSlotKey(itemA, reqFicha);
  const keyOnly = { key: slotAF, item_key: itemA, req_key: reqFicha, slot_key: slotAF };
  ok(!isPortalCotizacionAdjuntoPresentado(keyOnly), 'REV-1a key/slot sin adjunto no es presentado');
  const errsKey = validateRequisitosObligatoriosPorItemMatrix(
    matrix.slice(0, 1),
    () => keyOnly,
  );
  ok(errsKey.length > 0, 'REV-1b obligatorio solo key → falla validación');
  const real = { adjunto_id: 42, key: slotAF, item_key: itemA, req_key: reqFicha };
  ok(isPortalCotizacionAdjuntoPresentado(real), 'REV-1c adjunto_id válido → presentado');
  const flatOk = {};
  matrix.slice(0, 1).forEach((row) => row.requisitos.forEach((r) => {
    if (r.obligatorio) {
      const s = requisitoItemSlotKey(row.item_key, r.req_key);
      flatOk[s] = { adjunto_id: 1, item_key: row.item_key, req_key: r.req_key, key: s };
    }
  }));
  ok(validateRequisitosObligatoriosPorItemMatrix(matrix.slice(0, 1), (ik, rk) => flatOk[requisitoItemSlotKey(ik, rk)]).length === 0,
    'REV-1d obligatorios con adjunto_id pasan');
}

// REV-2 — desmarcar C tras subir A+C
{
  const flat = {};
  [itemA, itemC].forEach((ik) => {
    reqsCfg.forEach((r, idx) => {
      if (!r.obligatorio) return;
      const s = requisitoItemSlotKey(ik, r.req_key);
      flat[s] = {
        adjunto_id: ik === itemA ? 100 + idx : 200 + idx,
        item_key: ik,
        req_key: r.req_key,
        key: s,
      };
    });
  });
  const cotizaSoloA = { [itemA]: true, [itemC]: false };
  const rpiFinal = buildRequisitosPorItemPayloadFromFlat(flat, cotizaSoloA);
  ok(rpiFinal[itemA] && !rpiFinal[itemC], 'REV-2a requisitos_por_item final solo A');
  const partial = buildPortalPartialCotizacionPayload({
    workspaceItems: detalle,
    formItems: detalle.map((it) => ({ item_key: it.item_key, marca: 'M' })),
    cotizaByKey: cotizaSoloA,
    precios: Object.fromEntries(detalle.map((it) => [it.item_key, { total: cotizaSoloA[it.item_key] ? 10 : 0 }])),
    entregablesEco: {},
    tipo: 'Bienes',
  });
  ok(partial.items_cotizados.includes(itemA) && !partial.items_cotizados.includes(itemC),
    'REV-2b items_cotizados solo A');
  ok(!partial.propuesta_tecnica.items.some((it) => it.item_key === itemC),
    'REV-2c propuesta_tecnica.items solo ítems cotizados (sin C)');
  const cotPresented = {
    items_cotizados: partial.items_cotizados,
    propuesta_tecnica: partial.propuesta_tecnica,
    anexos: { requisitos_por_item: rpiFinal },
    detalle_items: detalle,
    sc_requisitos_tecnicos: reqsSc,
  };
  const manif = buildManifiestoCotizacion(cotPresented);
  ok(!manif.some((d) => d.item_key === itemC && d.rtm_por_item), 'REV-2d manifiesto sin RTM de C');
  const refC = encodeReqitemManifiestoRef(itemC, reqFicha);
  ok(!findCotizacionAnexoEntryByRef(cotPresented.anexos, cotPresented, refC),
    'REV-2e resolver lookup no encuentra RTM C en anexos presentados');
  const cotStaleRpi = {
    ...cotPresented,
    anexos: {
      requisitos_por_item: {
        ...rpiFinal,
        [itemC]: { [reqFicha]: { adjunto_id: 999, nombre: 'huérfano.pdf', key: requisitoItemSlotKey(itemC, reqFicha) } },
      },
    },
  };
  const manifStale = buildManifiestoCotizacion(cotStaleRpi);
  ok(!manifStale.some((d) => d.item_key === itemC && d.rtm_por_item),
    'REV-2f stale rpi C no expuesto si C no está cotizado');
  ok(!findCotizacionAnexoEntryByRef({ requisitos_por_item: rpiFinal }, cotPresented, refC),
    'REV-2g adjunto físico huérfano (slot C) no referenciado → no resoluble');
}

// REV-3 — round-trip reqitem (caracteres especiales)
{
  const roundTrips = [
    ['10-0', 'req-0-Ficha técnica'],
    ['10--0', 'req-0-guion-doble'],
    ['10-0', 'req-1-Certificado de análisis'],
    ['10-0', 'req-2-slash%2Ftest'],
    ['10-0', 'req-3-100%25'],
    ['10%200', 'req-4-espacio codificado'],
  ];
  roundTrips.forEach(([ik, rk]) => {
    const ref = encodeReqitemManifiestoRef(ik, rk);
    const dec = decodeReqitemManifiestoRef(ref);
    ok(dec && dec.item_key === ik && dec.req_key === rk, `REV-3 round-trip ref (${ik})`);
    const anexos = { requisitos_por_item: { [ik]: { [rk]: { adjunto_id: 7, key: requisitoItemSlotKey(ik, rk) } } } };
    const got = lookupRequisitoPorItemAdjunto(anexos, dec.item_key, dec.req_key);
    ok(got?.adjunto_id === 7, `REV-3 lookup anexos tras ref (${ik})`);
  });
}

// REV-4 — slot opaco: req_key con | vía metadata
{
  const weirdReq = 'req-0-part|extra';
  const opaqueSlot = `${itemA}|${weirdReq}`;
  const meta = { item_key: itemA, req_key: weirdReq, adjunto_id: 5, key: opaqueSlot };
  const nested = buildRequisitosPorItemPayloadFromFlat({ [opaqueSlot]: meta }, { [itemA]: true });
  ok(nested[itemA]?.[weirdReq]?.adjunto_id === 5,
    'REV-4 identidad RTM desde item_key/req_key en metadata (no split ambiguo)');
}

// REV-5 — saneo requisitos_por_item (inyección)
{
  const payload = buildPortalCotizacionPayload({
    anexos: {
      requisitos_por_item: {
        [itemA]: {
          [reqFicha]: {
            adjunto_id: 1,
            item_key: itemC,
            req_key: reqFicha,
            ruta: '/etc/passwd',
            url: 'https://evil.example/x',
            cotizacion_id: 99999,
          },
        },
      },
    },
  });
  const entry = payload.anexos.requisitos_por_item?.[itemA]?.[reqFicha];
  ok(entry && entry.item_key === itemA && entry.req_key === reqFicha,
    'REV-5a fuerza item_key/req_key del nodo padre');
  ok(!entry?.ruta && !entry?.url && !entry?.cotizacion_id,
    'REV-5b descarta rutas/URL/cotizacion_id inyectados');
  const mismatch = buildPortalCotizacionPayload({
    anexos: {
      requisitos_por_item: {
        [itemA]: {
          [reqFicha]: { adjunto_id: 2, item_key: itemC, req_key: reqFicha },
        },
      },
    },
  });
  ok(mismatch.anexos.requisitos_por_item?.[itemA]?.[reqFicha]?.item_key === itemA,
    'REV-5c meta item_key distinto del padre → corregido al nodo padre');
  ok(!buildPortalCotizacionPayload({
    anexos: {
      requisitos_por_item: {
        [itemA]: { [reqFicha]: { adjunto_id: 3, req_key: 'req-evil' } },
      },
    },
  }).anexos.requisitos_por_item?.[itemA]?.[reqFicha],
    'REV-5e req_key distinto del nodo padre → descartado');
  ok(!buildPortalCotizacionPayload({
    anexos: { requisitos_por_item: { [itemA]: { [reqFicha]: { key: 'solo-key' } } } },
  }).anexos.requisitos_por_item,
    'REV-5d solo key sin adjunto_id → omitido del payload');
}

// REV-6 — legacy req-N vs reqitem (sin cruce)
{
  const legacy = {
    anexos: { requisitos: [{ adjunto_id: 3, nombre: 'g.pdf', key: 'req-0-x' }] },
    propuesta_tecnica: { items: detalle.map((d) => ({ item_key: d.item_key })) },
  };
  ok(findCotizacionAnexoEntryByRef(legacy.anexos, legacy, 'req-0')?.adjunto_id === 3,
    'REV-6a legacy req-0 resuelve');
  ok(!findCotizacionAnexoEntryByRef(legacy.anexos, legacy, encodeReqitemManifiestoRef(itemA, reqFicha)),
    'REV-6b legacy no resuelve reqitem');
  const modern = {
    anexos: { requisitos_por_item: { [itemA]: { [reqFicha]: { adjunto_id: 4 } } } },
    items_cotizados: [itemA],
    propuesta_tecnica: { items: [{ item_key: itemA, cotiza: true }], items_cotizados: [itemA] },
    detalle_items: detalle,
    sc_requisitos_tecnicos: reqsSc,
  };
  ok(findCotizacionAnexoEntryByRef(modern.anexos, modern, encodeReqitemManifiestoRef(itemA, reqFicha))?.adjunto_id === 4,
    'REV-6c moderno reqitem resuelve');
  ok(!findCotizacionAnexoEntryByRef(modern.anexos, modern, 'req-0'),
    'REV-6d moderno no cae a req-0');
}

// REV-7 — documentos generales docs-N intactos
{
  const cotDocs = {
    anexos: { docs_solicitados: [{ adjunto_id: 88, nombre: 'sol.pdf', key: 'doc-0-x' }] },
    propuesta_tecnica: {},
  };
  const manif = buildManifiestoCotizacion(cotDocs);
  const docRow = manif.find((d) => d.ref === 'docs-0');
  ok(docRow && docRow.grupo === 'Documentos solicitados' && docRow.adjunto_id === 88,
    'REV-7 docs-N sin cambios');
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n--- ${tests.length - failed.length}/${tests.length} OK ---\n`);
if (failed.length) {
  failed.forEach((f) => console.error('  ', f.msg));
  process.exit(1);
}
console.log('✅ RC8.17.8H6-C3-B4/B5 OK\n');
