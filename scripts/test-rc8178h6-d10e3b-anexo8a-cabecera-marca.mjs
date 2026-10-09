/**
 * RC8.17.8H6-C3-D10-E3-B — Cabecera Anexo 8-A y marca borrador (sin BD).
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ANEXO8A_BORRADOR_WATERMARK,
  drawAnexo8ABorradorWatermark,
  stampAnexo8ABorradorWatermarkAllPages,
} from '../src/utils/cuadroComparativoPdf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfSrc = readFileSync(path.join(__dirname, '../src/utils/cuadroComparativoPdf.js'), 'utf8');

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC8.17.8H6 D10-E3-B / E3-B1 Cabecera y marca borrador ===\n');

const drawHeaderFn = pdfSrc.match(
  /function drawHeader[\s\S]*?(?=\n\/\*\*|\nexport function drawAnexo8ABorradorWatermark)/,
)?.[0] || '';

assert(!/Denominación:/.test(drawHeaderFn), 'cabecera sin línea Denominación');
assert(/Solicitud de Cotización:/.test(drawHeaderFn), 'cabecera conserva solicitud');
assert(/Invitación N\.° \$\{nroInv\}`/.test(drawHeaderFn) || /Invitación N\.° \$\{nroInv\}/.test(drawHeaderFn),
  'invitación formato corto');
assert(!/agrupación operativa/.test(drawHeaderFn), 'sin texto agrupación operativa');
assert(/28 \+ topInset/.test(drawHeaderFn) && /16 \+ topInset/.test(drawHeaderFn),
  'cabecera institucional desplazada bajo franja borrador');

const generateFn = pdfSrc.match(
  /export function generateAnexo8APdf[\s\S]*?(?=\nexport function previewAnexo8APdf)/,
)?.[0] || '';
assert(/if \(esBorradorPreview\)\s*\{[\s\S]*stampAnexo8ABorradorWatermarkAllPages\(doc\)/.test(generateFn),
  'marca solo dentro de if esBorradorPreview');
{
  const stampCalls = generateFn.match(/stampAnexo8ABorradorWatermarkAllPages\(doc\)/g) || [];
  assert(stampCalls.length === 1, 'generate: una sola llamada a stamp');
  const sinBloqueBorrador = generateFn.replace(
    /if \(esBorradorPreview\) \{[\s\S]*?stampAnexo8ABorradorWatermarkAllPages\(doc\);[\s\S]*?\}/,
    '',
  );
  assert(!/stampAnexo8ABorradorWatermarkAllPages\(doc\)/.test(sinBloqueBorrador),
    'PDF oficial: sin stamp fuera del bloque borrador');
}

const watermarkFn = pdfSrc.match(
  /export function drawAnexo8ABorradorWatermark[\s\S]*?(?=\nexport function stampAnexo8ABorradorWatermarkAllPages)/,
)?.[0] || '';
assert(!/pageH - 38/.test(watermarkFn), 'marca no usa banda inferior sobre pie/firmas');
assert(/setTextColor\(165, 0, 0\)/.test(watermarkFn) || /setTextColor\(180, 0, 0\)/.test(watermarkFn),
  'marca con contraste alto en franja superior');
assert(!/setFontSize\(34\)/.test(watermarkFn), 'E3-B1: sin marca diagonal central 34pt');
assert(!/angle:\s*25/.test(watermarkFn), 'E3-B1: sin texto diagonal sobre matriz');
assert(/angle:\s*90/.test(watermarkFn), 'marca lateral vertical conservada');
assert(/drawHeader\(doc, report, pageW, margin, borradorTopInset\)/.test(generateFn),
  'borrador: cabecera con inset bajo franja');
assert(/ANEXO8A_BORRADOR_TOP_INSET/.test(generateFn), 'reserva superior borrador definida');

{
  const pageVisits = [];
  const texts = [];
  const doc = {
    internal: {
      pageSize: { getWidth: () => 1190, getHeight: () => 842 },
      getNumberOfPages: () => 3,
    },
    setPage(p) { pageVisits.push(p); },
    setFillColor() {},
    setDrawColor() {},
    setLineWidth() {},
    line() {},
    rect() {},
    setFont() {},
    setFontSize() {},
    setTextColor() {},
    text(t) { texts.push(String(t)); },
  };
  stampAnexo8ABorradorWatermarkAllPages(doc);
  assert(pageVisits.join(',') === '1,2,3', 'multipágina: páginas 1-3');
  const marks = texts.filter((t) => t === ANEXO8A_BORRADOR_WATERMARK);
  assert(marks.length >= 6, 'multipágina: franja + lateral en cada página (sin diagonal)');
  drawAnexo8ABorradorWatermark(doc, 1190, 842);
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((t) => console.error('FAIL:', t.msg));
  process.exit(1);
}
