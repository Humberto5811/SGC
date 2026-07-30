/**
 * RC111 — Validación de fecha de recepción vs emisión de orden.
 * Causa histórica: String(fecha_orden Date).slice(0,10) → "Thu Jul 24" y comparación lexicográfica falsa.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCalendarDate,
  toCalendarIso,
  compareCalendarDates,
  validateFechaRecepcionVsEmision,
  formatCalendarDdMmYyyy,
} from '../shared/calendarDate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function ok(msg) { console.log(`  ✓ ${msg}`); }
function assertFileContains(rel, re, msg) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.match(src, re, msg || rel);
}

console.log('\n=== RC111 — Validación fecha recepción ===\n');

{
  const a = parseCalendarDate('24/07/2026');
  const b = parseCalendarDate('2026-07-30');
  const c = parseCalendarDate('2026-07-30T00:00:00.000Z');
  assert.deepEqual(a, { y: 2026, m: 7, d: 24 });
  assert.deepEqual(b, { y: 2026, m: 7, d: 30 });
  assert.deepEqual(c, { y: 2026, m: 7, d: 30 });
  assert.equal(toCalendarIso(new Date(2026, 6, 24)), '2026-07-24');
  ok('1. parseCalendarDate admite dd/mm/yyyy, yyyy-mm-dd e ISO');
}

{
  const v1 = validateFechaRecepcionVsEmision('30/07/2026', '24/07/2026');
  assert.equal(v1.ok, true);
  const v2 = validateFechaRecepcionVsEmision('24/07/2026', '24/07/2026');
  assert.equal(v2.ok, true);
  const v3 = validateFechaRecepcionVsEmision('23/07/2026', '24/07/2026');
  assert.equal(v3.ok, false);
  assert.equal(v3.code, 'FECHA_RECEPCION_ANTERIOR_EMISION');
  ok('2. Emisión 24/07 vs 30/07 y 24/07 válidos; 23/07 rechazado');
}

{
  // Simula el bug: Date → "Thu Jul 24..." slice(0,10)
  const fechaOrden = new Date(2026, 6, 24); // local 24/07/2026
  const broken = String(fechaOrden).slice(0, 10);
  assert.notEqual(broken, '2026-07-24');
  assert.equal(String('2026-07-30') < broken, true); // comparación lexicográfica falsa
  const fixed = validateFechaRecepcionVsEmision('2026-07-30', fechaOrden);
  assert.equal(fixed.ok, true);
  ok('3. Sin desfase UTC / sin bug String(Date).slice');
}

{
  assert.equal(compareCalendarDates('2026-07-30', '2026-07-24') > 0, true);
  assert.equal(formatCalendarDdMmYyyy('2026-07-30'), '30/07/2026');
  ok('4. compareCalendarDates y formato dd/mm/yyyy');
}

assertFileContains(
  'server/lib/recepcionBienes.js',
  /validateFechaRecepcionVsEmision|FECHA_RECEPCION_ANTERIOR_EMISION/,
  'backend usa normalizador',
);
assertFileContains(
  'src/utils/recepcionBienesModal.js',
  /validateFechaRecepcionVsEmision/,
  'frontend valida con el mismo contrato',
);
{
  const src = fs.readFileSync(path.join(root, 'src/utils/recepcionBienesModal.js'), 'utf8');
  const regModal = src.slice(src.indexOf('openRegistrarRecepcionModal'));
  assert.equal(/data-bs-target="#rbTabHist"/.test(regModal), false, 'sin pestaña Historial en Registrar recepción');
  assert.match(regModal, /Guías de Remisión/);
  assert.match(regModal, /Documentos Técnicos/);
  ok('5. Pestaña Historial no aparece en Registrar recepción');
}

assertFileContains(
  'src/utils/recepcionBienesModal.js',
  /showTrazabilidadModal\(reqId\)/,
  'Ver historial abre trazabilidad',
);
ok('6. Historial institucional continúa funcionando (apertura directa)');

console.log('\nRC111 OK\n');
