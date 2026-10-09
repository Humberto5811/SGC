/**
 * RC8.17.8H6-C3-D10-E2 — Previsualización Anexo 8-A en borrador (sin PostgreSQL).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildCuadroComparativoReportData,
  buildProveedorLineaPreviewBorrador,
  validateCuadroParaAnexo8A,
  validateCuadroParaAnexo8APreview,
  isEstadoPreviewBorradorAnexo8A,
  isPreviewBorradorAnexo8A,
} from '../src/utils/cuadroComparativoReportData.js';
import {
  ANEXO8A_BORRADOR_WATERMARK,
  buildMatrizInstitucionalTable,
  drawAnexo8ABorradorWatermark,
  stampAnexo8ABorradorWatermarkAllPages,
} from '../src/utils/cuadroComparativoPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const modalSrc = readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
const pdfSrc = readFileSync(path.join(root, 'src/utils/cuadroComparativoPdf.js'), 'utf8');

console.log('\n=== RC8.17.8H6 D10-E2 / E2.1 Preview borrador Anexo 8-A ===\n');

assert(isEstadoPreviewBorradorAnexo8A('CUADRO_BORRADOR'), 'estado CUADRO_BORRADOR es preview borrador');
assert(isEstadoPreviewBorradorAnexo8A('EN_ELABORACION'), 'estado EN_ELABORACION es preview borrador');
assert(!isEstadoPreviewBorradorAnexo8A('ADJUDICADO'), 'ADJUDICADO no es preview borrador');

const previewFn = modalSrc.match(
  /async function buildPersistidoParaPreviewBorrador[\s\S]*?(?=\n  async function buildPersistidoParaPdf)/,
)?.[0] || '';
assert(/collectObservacionesFromDom/.test(previewFn), 'preview borrador usa matriz del DOM');
assert(!/getCuadroPdfData/.test(previewFn), 'preview borrador no llama /pdf-data');
assert(/isEstadoPreviewBorradorAnexo8A\(cuadro\)/.test(modalSrc),
  'click Previsualizar bifurca por estado borrador');

const previewClick = modalSrc.match(
  /#ccBtnPreview8a'\)\.onclick = async \(\) => \{[\s\S]*?\n  \};/,
)?.[0] || '';
assert(/buildPersistidoParaPreviewBorrador/.test(previewClick), 'handler preview usa buildPersistidoParaPreviewBorrador');
assert(!/guardarCuadroPdf/.test(previewClick), 'preview no guarda PDF');

assert(ANEXO8A_BORRADOR_WATERMARK === 'BORRADOR — NO OFICIAL', 'texto marca de agua');
assert(/stampAnexo8ABorradorWatermarkAllPages/.test(pdfSrc), 'marca de agua en todas las páginas');
assert(!/Denominación:/.test(pdfSrc.match(/function drawHeader[\s\S]*?(?=\n\/\*\*|\nexport function drawAnexo8ABorradorWatermark)/)?.[0] || ''),
  'cabecera PDF sin Denominación');
assert(!/agrupación operativa/.test(pdfSrc), 'cabecera sin agrupación operativa del cuadro');
assert(/Resultado preliminar de la evaluación/.test(pdfSrc), 'PDF borrador: título preliminar');
const reportSrc = readFileSync(path.join(root, 'src/utils/cuadroComparativoReportData.js'), 'utf8');
const drawResultadoFn = pdfSrc.match(
  /function drawResultadoYFirmas[\s\S]*?(?=\nfunction |\nexport )/,
)?.[0] || '';
assert(/Proveedor propuesto \(no adjudicado\)/.test(reportSrc), 'reportData: etiqueta proveedor propuesto');
assert(/Pendiente de adjudicación/.test(drawResultadoFn), 'drawResultado: pendiente de adjudicación');
assert(/proveedor_preliminar_linea/.test(drawResultadoFn), 'drawResultado: usa proveedor_preliminar_linea en borrador');
assert(/Proveedor ganador:/.test(drawResultadoFn), 'drawResultado: rama oficial conserva Proveedor ganador');
assert(/Invitación N\.°/.test(pdfSrc), 'cabecera PDF muestra número de invitación');

function makeDatos(nInv, nCot) {
  const proveedores = [];
  for (let i = 1; i <= nCot; i += 1) {
    proveedores.push({
      proveedor_id: 100 * nInv + i,
      ruc: `20${nInv}${String(i).padStart(8, '0')}`,
      razon_social: `PROV-INV${nInv}-COT${i}`,
      validacion_estado: 'APTO',
      cumple_tecnicamente: true,
    });
  }
  const items = [{
    item_key: `inv${nInv}-item0`,
    requerimiento_codigo: 'REQ-1',
    codigo_sigamef: 'SIG-1',
    descripcion: `Ítem invitación ${nInv}`,
    unidad_medida: 'UND',
    cantidad: 2,
    proveedor_adjudicado_id: null,
    ofertas: proveedores.map((p, idx) => ({
      proveedor_id: p.proveedor_id,
      ruc: p.ruc,
      razon_social: p.razon_social,
      cumple_tecnicamente: true,
      precio_unitario: 10 + idx,
      precio_total: (10 + idx) * 2,
    })),
  }];
  const primera_fuente = proveedores.map((p, idx) => ({
    id: `inv${nInv}-cot-${idx}`,
    nro: idx + 1,
    proveedor_id: p.proveedor_id,
    datos_proveedor: { razon_social: p.razon_social, ruc: p.ruc },
    validacion_estado: 'APTO',
    cumple_tecnicamente: true,
    precios_por_item: { [`inv${nInv}-item0`]: { precio_unitario: 10 + idx, precio_total: (10 + idx) * 2 } },
    informacion_adicional: {},
    acciones_administrativas: {},
  }));
  return {
    items,
    resumen_proveedores: proveedores,
    primera_fuente,
    segunda_fuente: [{
      id: `inv${nInv}-sf1`,
      referencia: `OC-INV-${nInv}`,
      tipo_fuente: 'ORDEN_COMPRA',
      precios_por_item: { [`inv${nInv}-item0`]: { precio_unitario: 9, precio_total: 18 } },
      informacion_adicional: {},
      acciones_administrativas: {},
    }],
    solicitud: { codigo: `SC-INV-${nInv}`, denominacion: `Solicitud ${nInv}` },
    meta: { nro_invitacion: nInv },
    adjudicacion: {},
  };
}

const borradorPersistido = {
  cuadro: { id: 1, estado: 'CUADRO_BORRADOR', nro_invitacion: 2, version: 1 },
  datos_json: makeDatos(2, 2),
  preview_modo: 'BORRADOR',
  borrador_no_oficial: true,
};

const prevVal = validateCuadroParaAnexo8APreview(borradorPersistido);
assert(prevVal.ok, 'validación preview borrador OK sin adjudicación');
const strictVal = validateCuadroParaAnexo8A(borradorPersistido);
assert(!strictVal.ok, 'validación oficial sigue rechazando borrador');

const report = buildCuadroComparativoReportData(borradorPersistido);
assert(report.meta.borrador === true, 'report.meta.borrador');
assert(report.meta.pdf_modo === 'BORRADOR', 'report.meta.pdf_modo BORRADOR');
assert(Number(report.meta.nro_invitacion) === 2, 'meta nro_invitacion en reporte');
assert(report.filas[0].adjudicado.valor_total === '—', 'sin inventar valor adjudicado total');
assert(report.resultado.titulo_seccion === 'Resultado preliminar de la evaluación', 'resultado: título preliminar');
assert(report.resultado.proveedor_preliminar_linea === 'Pendiente de adjudicación', 'sin selección: pendiente');
assert(report.resultado.valor_adjudicado === '—', 'resultado borrador sin valor oficial');
assert(!report.resultado.resumen_por_proveedor?.length, 'borrador sin resumen por proveedor oficial');

const datosParcial = makeDatos(2, 2);
datosParcial.items[0].proveedor_adjudicado_id = datosParcial.primera_fuente[0].proveedor_id;
datosParcial.adjudicacion = {
  resumen_proveedores: [{ razon_social: 'NO DEBE USARSE', ruc: '99999999999', valor_adjudicado: 9999 }],
  valor_adjudicado: 9999,
};
const reportParcial = buildCuadroComparativoReportData({
  cuadro: { id: 1, estado: 'CUADRO_BORRADOR', proveedor_ganador_id: datosParcial.primera_fuente[0].proveedor_id },
  datos_json: datosParcial,
  borrador_no_oficial: true,
});
assert(/Proveedor propuesto \(no adjudicado\): PROV-INV2-COT1/.test(reportParcial.resultado.proveedor_preliminar_linea),
  'selección parcial: proveedor propuesto desde ítem');
assert(!/NO DEBE USARSE/.test(reportParcial.resultado.proveedor_preliminar_linea || ''),
  'borrador ignora resumen_proveedores oficial en resultado');
assert(reportParcial.resultado.valor_adjudicado === '—', 'borrador ignora valor_adjudicado en adj');

assert(
  buildProveedorLineaPreviewBorrador([], []) === 'Pendiente de adjudicación',
  'helper línea proveedor: pendiente',
);

const datosOficial = makeDatos(1, 1);
datosOficial.items[0].proveedor_adjudicado_id = datosOficial.primera_fuente[0].proveedor_id;
datosOficial.adjudicacion = {
  valor_adjudicado: 100,
  criterio_seleccion: 'Menor precio',
  sustento_decision: 'Ok',
  resumen_proveedores: [{ razon_social: 'PROV-INV1-COT1', ruc: '20100000001', valor_adjudicado: 100 }],
};
const oficial = buildCuadroComparativoReportData({
  cuadro: { id: 9, estado: 'ADJUDICADO', version: 2 },
  datos_json: datosOficial,
});
assert(oficial.meta.borrador === false, 'oficial: meta.borrador false');
assert(oficial.resultado.titulo_seccion === 'Resultado de la adjudicación', 'oficial: título adjudicación');
assert(/PROV-INV1-COT1/.test(oficial.resultado.proveedor_adjudicado), 'oficial: proveedor ganador');

assert(report.fuentes.segunda[0].referencia === 'OC-INV-2', 'segunda fuente de invitación 2');

const r7 = buildCuadroComparativoReportData({
  cuadro: { id: 2, estado: 'CUADRO_BORRADOR', nro_invitacion: 7 },
  datos_json: makeDatos(7, 3),
  borrador_no_oficial: true,
});
assert(r7.fuentes.primera.length === 3, 'invitación 7: tres cotizaciones');
assert(r7.fuentes.primera[0].razon_social.includes('INV7'), 'invitación 7: proveedores propios');
assert(!JSON.stringify(r7).includes('INV2'), 'invitación 7: sin mezclar datos INV2');

const table = buildMatrizInstitucionalTable(report);
assert(table.body.length > 0, 'tabla PDF con filas en borrador incompleto');
assert(/OC-INV-2/.test(JSON.stringify(table.body)), 'tabla incluye referencia SF');

assert(isPreviewBorradorAnexo8A(borradorPersistido), 'isPreviewBorradorAnexo8A detecta flags');

{
  const pageVisits = [];
  const texts = [];
  const doc = {
    internal: {
      pageSize: { getWidth: () => 842, getHeight: () => 595 },
      getNumberOfPages: () => 5,
    },
    setPage(p) { pageVisits.push(p); },
    setFillColor() {},
    setDrawColor() {},
    setLineWidth() {},
    rect() {},
    line() {},
    setFont() {},
    setFontSize() {},
    setTextColor() {},
    text(t) { texts.push(String(t)); },
  };
  stampAnexo8ABorradorWatermarkAllPages(doc);
  assert(pageVisits.length === 5 && pageVisits.every((p, i) => p === i + 1),
    'marca multipágina: visita páginas 1..N');
  assert(texts.filter((t) => t === ANEXO8A_BORRADOR_WATERMARK).length >= 5,
    'marca multipágina: texto en cada página');
  drawAnexo8ABorradorWatermark(doc, 842, 595);
  assert(texts.some((t) => t === ANEXO8A_BORRADOR_WATERMARK), 'drawAnexo8ABorradorWatermark emite texto');
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((t) => console.error('FAIL:', t.msg));
  process.exit(1);
}
