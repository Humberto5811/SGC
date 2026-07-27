/**
 * OD34 / RC89 — PDF dinámico vs firmado persistido; TOTAL GENERAL; UI cerrada.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calcTotalGeneralAdjudicado,
  buildMatrizInstitucionalTable,
  assertBlobForObjectUrl,
  downloadBlobPersistido,
} from '../src/utils/cuadroComparativoPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC89 / OD34 PDF final + versionado ===\n');

function reportConFilas(valores) {
  return {
    resultado: {},
    filas: valores.map((v, i) => ({
      item: i + 1,
      adjudicado: { valor_total: v, proveedor_label: `P${i + 1}` },
    })),
    fuentes: { primera: [{ razon_social: 'A' }], segunda: [] },
    info_adicional: [],
    acciones_administrativas: [],
  };
}

// 1) Un ítem — TOTAL GENERAL + sin emptyAdj en tabla
const r1 = reportConFilas(['S/ 1,250.00']);
const t1 = calcTotalGeneralAdjudicado(r1);
assert(Math.abs(t1.total - 1250) < 0.001, '1 ítem: total 1250');
assert(t1.label.includes('1,250.00') || t1.label.includes('1250.00'), '1 ítem: label moneda');
assert(/S\/|US\$/.test(t1.label), '1 ítem: símbolo moneda');
const tab1 = buildMatrizInstitucionalTable(r1);
const bodyStr1 = JSON.stringify(tab1.body);
assert(/TOTAL GENERAL/.test(bodyStr1), '1 ítem: fila TOTAL GENERAL');
assert(!/emptyAdj|cc-adj-empty/.test(bodyStr1), '1 ítem: sin emptyAdj');

// 2) Múltiples ítems
const rN = reportConFilas(['100.50', '200.25', 'S/ 50.00']);
const tN = calcTotalGeneralAdjudicado(rN);
assert(Math.abs(tN.total - 350.75) < 0.001, 'N ítems: suma 350.75');
const tabN = buildMatrizInstitucionalTable(rN);
assert(/TOTAL GENERAL/.test(JSON.stringify(tabN.body)), 'N ítems: TOTAL GENERAL');

// Matriz HTML sin cuadrícula vacía
const matrizSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoMatriz.js'), 'utf8');
assert(!/cc-adj-empty/.test(matrizSrc), 'matriz UI sin cc-adj-empty');
assert(!/emptyAdj\s*=/.test(matrizSrc), 'matriz UI sin emptyAdj');

// 3) Firmado persistido no usa generador
const modal = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoModal.js'), 'utf8');
assert(/downloadBlobPersistido/.test(modal), 'usa downloadBlobPersistido');
assert(/assertBlobForObjectUrl/.test(modal), 'guard blob firmado');
assert(/Nunca regenera|nunca regenera|No usar.*generador|sin descarga dinámica/i.test(modal)
  || /esEstadoSinDescargaDinamica/.test(modal), 'separa descarga dinámica');
assert(/fetchCuadroPdfFirmado/.test(modal), 'descarga firmado vía endpoint persistido');

const ccp = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoCcp.js'), 'utf8');
assert(!/ccBtnCcpDescargarFinal/.test(ccp), 'CCP sin Descargar Cuadro Final dinámico');
assert(/e === 'DERIVADO_CCP'\) return ''/.test(ccp) || /DERIVADO_CCP.*return ''/.test(ccp),
  'panel técnico oculto en DERIVADO_CCP');

// 4) DERIVADO_CCP UI
assert(/setHide\('#ccBtnRecargar',\s*true\)/.test(modal), 'oculta Recargar');
assert(/setHide\('#ccBtnDescargar8a'/.test(modal), 'oculta descarga dinámica');
assert(/ccBtnVerFirmado/.test(modal) && /ccBtnDlFirmado/.test(modal), 'conserva Ver/Descargar firmado');

// 5) BE no sobrescribe firmado
const be = fs.readFileSync(path.join(root, 'server/lib/cuadroComparativo.js'), 'utf8');
assert(/PDF_FIRMADO_INMUTABLE|PDF firmado persistido/.test(be), 'BE bloquea regenerar firmado');
assert(/nextVersion/.test(be) && /version = \$6/.test(be), 'nueva versión al regenerar no firmado');
assert(/pdf_versiones/.test(be), 'conserva historial pdf_versiones');

// 6) createObjectURL seguro
let threw = false;
try {
  assertBlobForObjectUrl(null, 'X');
} catch (_) { threw = true; }
assert(threw, 'assertBlob rechaza null');
threw = false;
try {
  assertBlobForObjectUrl(new Blob([]), 'X');
} catch (_) { threw = true; }
assert(threw, 'assertBlob rechaza blob vacío');
const okBlob = assertBlobForObjectUrl(new Blob(['%PDF'], { type: 'application/pdf' }), 'ok');
assert(okBlob instanceof Blob && okBlob.size > 0, 'assertBlob acepta PDF');

const pdfSrc = fs.readFileSync(path.join(root, 'src/utils/cuadroComparativoPdf.js'), 'utf8');
assert(/revokeObjectURL/.test(pdfSrc), 'libera ObjectURL');
assert(/createObjectURL/.test(pdfSrc), 'createObjectURL solo tras assert');

const failed = tests.filter((t) => !t.ok);
console.log(failed.length ? `\n${failed.length} fallos` : '\nPASS RC89 / OD34');
process.exit(failed.length ? 1 : 0);
