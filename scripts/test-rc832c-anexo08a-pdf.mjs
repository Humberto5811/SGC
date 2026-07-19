/**
 * RC8.3.2-C — Rediseño PDF Anexo N.° 08-A (estructura institucional).
 * Prueba report data con 1 / 2 / 4 cotizaciones + Segunda Fuente.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ANEXO_8A,
  buildCuadroComparativoReportData,
  validateCuadroParaAnexo8A,
} from '../src/utils/cuadroComparativoReportData.js';
import { buildMatrizInstitucionalTable } from '../src/utils/cuadroComparativoPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

const pdfSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoPdf.js'), 'utf8');
const reportSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoReportData.js'), 'utf8');
const modalSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoModal.js'), 'utf8');

console.log('\n=== RC8.3.2-C PDF Anexo 08-A ===\n');

function makePersistido(nProv, opts = {}) {
  const conSf = opts.conSf !== false;
  const proveedores = [];
  for (let i = 1; i <= nProv; i += 1) {
    proveedores.push({
      proveedor_id: i,
      ruc: `20${String(i).padStart(9, '0')}`,
      razon_social: `PROVEEDOR ${i} SAC`,
      validacion_estado: 'APTO',
      cumple_tecnicamente: true,
    });
  }
  const items = [{
    item_key: 'r1-0',
    requerimiento_id: 10,
    requerimiento_codigo: 'REQ-00016',
    codigo_sigamef: 'COD-1',
    descripcion: 'Bien de prueba',
    unidad_medida: 'UND',
    cantidad: 10,
    proveedor_adjudicado_id: 1,
    valor_adjudicado_unitario: 10,
    valor_adjudicado_item: 100,
    adjudicado_razon_social: 'PROVEEDOR 1 SAC',
    ofertas: proveedores.map((p, idx) => ({
      proveedor_id: p.proveedor_id,
      ruc: p.ruc,
      razon_social: p.razon_social,
      cumple_tecnicamente: true,
      precio_unitario: 10 + idx,
      precio_total: (10 + idx) * 10,
      marca: idx === 0 ? 'MarcaA' : '',
      modelo: '',
      garantia: '12 meses',
      plazo_entrega: '15 días',
      incompleto: false,
    })),
  }];
  const primera_fuente = proveedores.map((p, idx) => ({
    id: `cot-${p.proveedor_id}`,
    nro: idx + 1,
    label: `Cotización N.° ${idx + 1}`,
    proveedor_id: p.proveedor_id,
    datos_proveedor: { razon_social: p.razon_social, ruc: p.ruc },
    validacion_estado: 'APTO',
    cumple_tecnicamente: true,
    precios_por_item: {
      'r1-0': { precio_unitario: 10 + idx, precio_total: (10 + idx) * 10 },
    },
    informacion_adicional: {},
    acciones_administrativas: {
      fecha_solicitud: '2026-06-01',
      reiteraciones: 0,
      fecha_recepcion: '2026-06-10',
    },
  }));
  const segunda_fuente = conSf ? [{
    id_fuente: 'sf-1',
    tipo_fuente: 'ORDEN_COMPRA_ANTERIOR',
    tipo_fuente_label: 'Orden de compra anterior',
    denominacion: 'OC histórica',
    referencia: 'OC-262-2024',
    requerimiento_id: 10,
    requerimiento_codigo: 'REQ-00016',
    item_keys: ['r1-0'],
    precios_por_item: {
      'r1-0': {
        precio_unitario: 9,
        factor_ajuste: 1.1,
        precio_actualizado: 9.9,
        precio_total_actualizado: 99,
      },
    },
    informacion_adicional: {
      marca: 'NO APLICA',
      modelo: 'NO APLICA',
      procedencia: 'NO APLICA',
      anio_fabricacion: 'NO APLICA',
      garantia: 'NO APLICA',
      plazo_entrega: 'NO APLICA',
      forma_pago: 'NO APLICA',
      moneda: 'PEN',
    },
    acciones_administrativas: {},
  }] : [];

  return {
    cuadro: {
      id: 99,
      estado: 'ADJUDICADO',
      version: 1,
      criterio_seleccion: 'MENOR_PRECIO_VALIDO',
      sustento_decision: 'Menor precio válido',
      valor_adjudicado: 100,
      proveedor_ganador_id: 1,
      modalidad_adjudicacion: 'POR_ITEM',
      usuario_adjudicacion: 'analista',
    },
    datos_json: {
      version_schema: 2,
      solicitud: { codigo: `SC-PDF-${nProv}`, denominacion: 'Prueba PDF 08-A', tipo: 'B' },
      requerimientos: [{ codigo: 'REQ-00016', area_usuaria: 'Logística', cmn: 'CMN-1' }],
      items,
      resumen_proveedores: proveedores,
      primera_fuente,
      segunda_fuente,
      adjudicacion: {
        valor_adjudicado: 100,
        criterio_seleccion: 'MENOR_PRECIO_VALIDO',
        criterio_label: 'Menor precio válido',
        metodologia_texto: 'Menor precio técnicamente válido',
        sustento_decision: 'Menor precio válido',
        modalidad: 'POR_ITEM',
        proveedor_ganador_id: 1,
        resumen_proveedores: [{
          proveedor_id: 1,
          razon_social: 'PROVEEDOR 1 SAC',
          ruc: proveedores[0].ruc,
          items: 1,
          valor_adjudicado: 100,
        }],
        fecha_adjudicacion: '2026-07-18T12:00:00Z',
        usuario_adjudicacion: 'analista',
      },
      meta: { puede_pdf_oficial: true, pdf_modo: 'OFICIAL' },
    },
    entidad: { nombre: 'Instituto Nacional de Salud', siglas: 'INS', ruc: '20100000000' },
  };
}

function runScenario(n, label) {
  const p = makePersistido(n, { conSf: true });
  const val = validateCuadroParaAnexo8A(p);
  assert(val.ok, `${label}: validación OK`);
  const r = buildCuadroComparativoReportData(p);
  assert(r.fuentes.primera.length === n, `${label}: ${n} cotizaciones`);
  assert(r.fuentes.segunda.length === 1, `${label}: 1 segunda fuente`);
  assert(r.filas[0].cotizaciones.length === n, `${label}: precios por cotización`);
  assert(r.filas[0].segundas[0].referencia === 'OC-262-2024', `${label}: N.° Orden SF`);
  assert(r.filas[0].adjudicado.valor_unitario !== '—', `${label}: Valor Unitario`);
  assert(r.filas[0].adjudicado.valor_total !== '—', `${label}: Valor Total`);
  assert(/PROVEEDOR 1/.test(r.filas[0].adjudicado.proveedor_label), `${label}: Proveedor ganador (razón social)`);
  assert(r.resultado.metodologia && r.resultado.metodologia !== '—', `${label}: Metodología`);
  assert(r.resultado.numeros_orden.includes('OC-262-2024'), `${label}: números_orden`);
  assert(r.info_adicional.length >= 6, `${label}: filas info adicional`);
  assert(r.acciones_administrativas.length >= 5, `${label}: filas acciones admin`);
  const table = buildMatrizInstitucionalTable(r);
  assert(table.head.length === 2, `${label}: cabecera 2 niveles`);
  assert(table.body.length > r.filas.length, `${label}: body incluye continuación`);
  const headFlat = JSON.stringify(table.head);
  assert(/Cotización 1/.test(headFlat), `${label}: cabecera Cotización 1`);
  assert(/Segunda fuente/.test(headFlat), `${label}: cabecera Segunda fuente`);
  assert(/VALOR ADJUDICADO/.test(headFlat), `${label}: cabecera VALOR ADJUDICADO`);
  assert(/Información adicional/.test(JSON.stringify(table.body)), `${label}: info bajo fuentes`);
  assert(/Acciones administrativas/.test(JSON.stringify(table.body)), `${label}: AA bajo fuentes`);
  // Valor adjudicado aislado: celdas vacías en filas de continuación
  const infoRow = table.body.find((row) => Array.isArray(row) && row[0]?.content === 'Marca');
  if (infoRow) {
    const last3 = infoRow.slice(-3);
    assert(last3.every((c) => c.content === ''), `${label}: sin datos bajo Valor adjudicado (info)`);
  }
  return r;
}

assert(ANEXO_8A.titulo.includes('08-A'), 'título ANEXO N.° 08-A');
assert(/buildMatrizInstitucionalTable/.test(pdfSrc), 'PDF exporta buildMatrizInstitucionalTable');
assert(/Información adicional/.test(pdfSrc) && /Acciones administrativas/.test(pdfSrc), 'PDF continuación vertical');
assert(/emptyAdj|VALOR ADJUDICADO/.test(pdfSrc), 'PDF aísla Valor adjudicado');
assert(/Elaborado por|Revisado por|Aprobado por/.test(pdfSrc), 'firmas oficiales');
{
  const bloque = pdfSrc.match(/const resLines = \[[\s\S]*?\];/)?.[0] || '';
  assert(/Sustento:/.test(bloque), 'resultado PDF incluye Sustento');
  assert(!/Segunda fuente:/.test(bloque), 'resultado PDF sin Segunda fuente bajo sustento');
  assert(!/Número de Orden/.test(bloque), 'resultado PDF sin N.° orden bajo sustento');
  assert(!/Modalidad:/.test(bloque), 'resultado PDF sin Modalidad bajo sustento');
  assert(!/Resumen por proveedor/.test(pdfSrc.slice(pdfSrc.indexOf('function drawResultadoYFirmas'), pdfSrc.indexOf('export function generateAnexo8APdf'))),
    'resultado PDF sin resumen por proveedor');
}
assert(/generateAnexo8APdf/.test(modalSrc) && !/Generación oficial bloqueada/.test(modalSrc), 'Generar 8A habilitado');
assert(/INFO_ADICIONAL_ROWS|ACCIONES_ADMIN_ROWS/.test(reportSrc), 'report data con filas institucionales');

runScenario(1, '1 cot + SF');
runScenario(2, '2 cot + SF');
runScenario(4, '4 cot + SF');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC8.3.2-C: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  console.error('FALLIDOS:', failed.map((f) => f.msg).join('; '));
  process.exit(1);
}
console.log('RC8.3.2-C: PASS\n');
