/**
 * RC8.16C — Importación controlada Compras Históricas SIGAMEF.
 */
import assert from 'node:assert/strict';
import { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  buildItemFingerprint,
  buildOrdenKey,
  confirmarComprasHistoricasImport,
  normalizeMoney,
  normalizeTipoOrigen,
  previewComprasHistoricasImport,
  transformImportRow,
  validateImportRow,
} from '../server/lib/comprasHistoricasImport.js';

let tests = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); tests += 1; };
const nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ANIO = 2099;
const ARCHIVO = `test-compras-${nonce}.xlsx`;

const filaBase = (overrides = {}) => ({
  TIPO: 'B',
  'AÑO': ANIO,
  nro_orden: `OC-${nonce}`,
  fecha_orden: '15/03/2024',
  MES: 'MAR',
  nombre_prov: `Proveedor ${nonce}`,
  ITEM: 'ITEM-001',
  nombre_item: 'Item prueba',
  abreviatura: 'UND',
  centro_costo: 'CC-01',
  nombre_depend: 'Dependencia A',
  cant_depend: '10',
  prec_unit_moneda: '1.234,56',
  valor_soles: '12.345,60',
  ...overrides,
});

console.log('\n=== RC8.16C — Import Compras Históricas ===\n');

ok(normalizeTipoOrigen('Bienes') === 'B', 'normaliza TIPO Bienes → B');
ok(normalizeTipoOrigen('Servicios') === 'S', 'normaliza TIPO Servicios → S');
ok(normalizeTipoOrigen('BLOQUE') === null, 'rechaza TIPO ambiguo que empieza por B');
ok(normalizeTipoOrigen('SUPERVISION') === null, 'rechaza TIPO ambiguo que empieza por S');
ok(normalizeMoney('1.234,56') === 1234.56, 'normaliza miles/coma europea');
ok(normalizeMoney('12,345.60') === 12345.6, 'normaliza miles/coma US');

const rowNorm = transformImportRow(filaBase(), ANIO, 1);
ok(rowNorm.tipo_origen === 'B', 'transforma fila SIGAMEF');
ok(rowNorm.fecha_orden === '2024-03-15', 'normaliza fecha texto');
ok(validateImportRow(transformImportRow(filaBase({ TIPO: 'BLOQUE' }), ANIO, 1)).length > 0,
  'validación rechaza TIPO inválido BLOQUE');

const fp1 = buildItemFingerprint({
  ...rowNorm,
  ordenKey: buildOrdenKey(ANIO, 'B', `OC-${nonce}`),
});
const fp2 = buildItemFingerprint({
  ...rowNorm,
  ordenKey: buildOrdenKey(ANIO, 'B', `OC-${nonce}`),
});
ok(fp1 === fp2, 'fingerprint determinístico');

let ordenIds = [];
let importId = null;

try {
  await runMigrations();

  const rows = [
    filaBase(),
    filaBase({ ITEM: 'ITEM-002', nombre_item: 'Item 2', valor_soles: '500,00', cant_depend: '5', prec_unit_moneda: '100' }),
  ];

  const preview = await previewComprasHistoricasImport({ anio: ANIO, archivo: ARCHIVO, rows });
  ok(preview.filas_leidas === 2, 'preview lee filas');
  ok(preview.ordenes_detectadas === 1, 'preview detecta 1 orden');
  ok(preview.items_detectados === 2, 'preview detecta 2 ítems');
  ok(preview.ordenes_nuevas === 1, 'preview orden nueva');
  ok(preview.items_nuevos === 2, 'preview 2 ítems nuevos');
  ok(preview.duplicados === 0, 'preview sin duplicados');
  ok(preview.preview_token, 'preview genera token');

  const confirm = await confirmarComprasHistoricasImport({
    anio: ANIO,
    archivo: ARCHIVO,
    rows,
    preview_token: preview.preview_token,
    usuario: 'test-rc816c',
  });
  ok(confirm.items_nuevos === 2, 'confirm inserta 2 ítems');
  ok(confirm.ordenes_nuevas === 1, 'confirm crea 1 orden');
  importId = confirm.importacion_id;

  const { rows: ordenRows } = await query(
    `SELECT * FROM compras_historicas_ordenes WHERE anio = $1 AND numero_orden = $2`,
    [ANIO, `OC-${nonce}`],
  );
  ok(ordenRows.length === 1, 'persiste cabecera única');
  ordenIds.push(ordenRows[0].id);
  ok(Number(ordenRows[0].monto_total) === 12845.6, 'monto_total = suma valor_soles');

  const previewDup = await previewComprasHistoricasImport({ anio: ANIO, archivo: ARCHIVO, rows });
  ok(previewDup.items_nuevos === 0, 'reimport preview: 0 ítems nuevos');
  ok(previewDup.duplicados === 2, 'reimport preview: 2 duplicados');

  const previewExtra = await previewComprasHistoricasImport({
    anio: ANIO,
    archivo: ARCHIVO,
    rows: [...rows, filaBase({ ITEM: 'ITEM-003', nombre_item: 'Item 3', valor_soles: '100,00' })],
  });
  ok(previewExtra.items_nuevos === 1, 'reimport parcial: 1 ítem nuevo');
  ok(previewExtra.duplicados === 2, 'reimport parcial: 2 duplicados previos');

  const confirmExtra = await confirmarComprasHistoricasImport({
    anio: ANIO,
    archivo: ARCHIVO,
    rows: [...rows, filaBase({ ITEM: 'ITEM-003', nombre_item: 'Item 3', valor_soles: '100,00' })],
    preview_token: previewExtra.preview_token,
    usuario: 'test-rc816c',
  });
  ok(confirmExtra.items_nuevos === 1, 'confirm parcial inserta 1 ítem');

  const { rows: ordenAfter } = await query(
    `SELECT monto_total FROM compras_historicas_ordenes WHERE id = $1`,
    [ordenIds[0]],
  );
  ok(Number(ordenAfter[0].monto_total) === 12945.6, 'monto_total recalculado sin inflar duplicados');

  const previewBadYear = await previewComprasHistoricasImport({
    anio: ANIO,
    archivo: ARCHIVO,
    rows: [filaBase({ 'AÑO': ANIO - 1 })],
  });
  ok(previewBadYear.errores >= 1, 'valida año declarado vs fila');

  const filaIdentica = () => filaBase({
    nro_orden: `OC-MULT-${nonce}`,
    ITEM: 'FP-MULT',
    nombre_item: 'Item multiplicidad',
    valor_soles: '100,00',
    cant_depend: '1',
    prec_unit_moneda: '100',
  });
  const tresIguales = [filaIdentica(), filaIdentica(), filaIdentica()];

  const previewMult = await previewComprasHistoricasImport({
    anio: ANIO,
    archivo: ARCHIVO,
    rows: tresIguales,
  });
  ok(previewMult.items_nuevos === 3, '3 filas idénticas en BD vacía => 3 ítems nuevos');
  ok(previewMult.duplicados === 0, '3 filas idénticas en BD vacía => 0 duplicados');

  const confirmMult = await confirmarComprasHistoricasImport({
    anio: ANIO,
    archivo: ARCHIVO,
    rows: tresIguales,
    preview_token: previewMult.preview_token,
    usuario: 'test-rc816c',
  });
  ok(confirmMult.items_nuevos === 3, 'confirm inserta 3 filas idénticas legítimas');

  const { rows: ordenMultRows } = await query(
    `SELECT id FROM compras_historicas_ordenes WHERE anio = $1 AND numero_orden = $2`,
    [ANIO, `OC-MULT-${nonce}`],
  );
  ordenIds.push(ordenMultRows[0].id);

  const previewReMult = await previewComprasHistoricasImport({
    anio: ANIO,
    archivo: ARCHIVO,
    rows: tresIguales,
  });
  ok(previewReMult.items_nuevos === 0, 'reimport 3 idénticas => 0 ítems nuevos');
  ok(previewReMult.duplicados === 3, 'reimport 3 idénticas => 3 duplicados');

  const previewCuatro = await previewComprasHistoricasImport({
    anio: ANIO,
    archivo: ARCHIVO,
    rows: [...tresIguales, filaIdentica()],
  });
  ok(previewCuatro.items_nuevos === 1, 'BD 3 + archivo 4 => 1 ítem nuevo');
  ok(previewCuatro.duplicados === 3, 'BD 3 + archivo 4 => 3 duplicados');

  console.log(`\n✅ RC8.16C — ${tests}/${tests} OK\n`);
} finally {
  if (ordenIds.length) {
    await query('DELETE FROM compras_historicas_ordenes WHERE id = ANY($1::int[])', [ordenIds]);
  }
  if (importId) {
    await query('DELETE FROM compras_historicas_importaciones WHERE id >= $1 AND anio = $2', [importId, ANIO]);
  }
}
