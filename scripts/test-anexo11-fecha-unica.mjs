/**
 * Anexo 11 — una sola fecha (encabezado), sin fecha duplicada antes de firma.
 *
 *   node scripts/test-anexo11-fecha-unica.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pdfPath = path.join(root, 'src/utils/proveedorPdfCotizacion.js');

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

console.log('Anexo 11 — fecha única\n');

const src = fs.readFileSync(pdfPath, 'utf8');
const start = src.indexOf('export function downloadAnexo11');
const end = src.indexOf('export function readUploadFile');
assert.ok(start >= 0 && end > start, 'función downloadAnexo11 localizable');
const fn = src.slice(start, end);

// F/G. Fecha una sola vez = encabezado
{
  const matches = fn.match(/formatFechaCartaLima\s*\(/g) || [];
  assert.equal(matches.length, 1, `esperaba 1 llamada a formatFechaCartaLima, hay ${matches.length}`);
  // La fecha debe aparecer cerca del inicio (después del título), no al final
  const fechaIdx = fn.indexOf('formatFechaCartaLima(');
  const firmaIdx = fn.indexOf('renderFirmaRepresentante');
  const notaIdx = fn.indexOf('NOTA_COTIZACION_ANEXO11');
  assert.ok(fechaIdx > 0 && fechaIdx < notaIdx, 'fecha antes de la nota final');
  assert.ok(fechaIdx < firmaIdx, 'fecha antes del bloque de firma');
  ok('F. Fecha aparece una sola vez');
  ok('G. Fecha superior permanece (única llamada en encabezado)');
}

// H. Bloque inferior no renderiza Lima
{
  const afterCierre = fn.slice(fn.indexOf('CIERRE_PENALIDAD_ANEXO11'));
  assert.ok(!afterCierre.includes('formatFechaCartaLima'), 'sin fecha tras cierre/penalidad');
  assert.ok(!/doc\.text\(\s*['"]Lima,/.test(afterCierre), 'sin texto Lima hardcodeado al pie');
  ok('H. Bloque inferior no contiene “Lima, …”');
}

// I. Firma
{
  assert.match(fn, /renderFirmaRepresentante/);
  assert.match(fn, /NOTA_COTIZACION_ANEXO11/);
  const firmaFn = src.slice(src.indexOf('function renderFirmaRepresentante'), src.indexOf('function appendDatosProveedor'));
  assert.match(firmaFn, /y \+= 48/);
  assert.match(firmaFn, /Firma del Representante Legal/);
  assert.match(firmaFn, /representante_legal/);
  assert.match(firmaFn, /DNI:/);
  ok('I. Firma conserva espacio, línea, representante y DNI');
}

console.log('\nOK — test-anexo11-fecha-unica\n');
