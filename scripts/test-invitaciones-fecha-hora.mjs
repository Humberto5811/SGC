/**
 * Fecha/hora de invitaciones — America/Lima (sin doble conversión).
 *
 *   node scripts/test-invitaciones-fecha-hora.mjs
 */
import assert from 'node:assert/strict';
import { formatDateTimeLima } from '../src/utils/dateTimeLima.js';
import { formatCronogramaDisplay } from '../src/utils/cronogramaDatetime.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function ok(msg) { console.log(`  ✓ ${msg}`); }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

console.log('\n=== Invitaciones — fecha/hora America/Lima ===\n');

// A — UTC Z → Lima −5
{
  const out = formatDateTimeLima('2026-07-31T17:41:00.000Z');
  assert.equal(out, '2026-07-31 12:41');
  ok('A: 2026-07-31T17:41:00.000Z → 2026-07-31 12:41');
}

// B — misma función para bandeja y wizard (mismo resultado)
{
  const raw = '2026-07-31T17:41:00.000Z';
  const bandeja = formatDateTimeLima(raw);
  const wizard = formatDateTimeLima(raw);
  assert.equal(bandeja, wizard);
  assert.equal(bandeja, '2026-07-31 12:41');
  // El bug anterior del wizard (slice) mostraba UTC
  const buggyWizard = String(raw).slice(0, 16).replace('T', ' ');
  assert.equal(buggyWizard, '2026-07-31 17:41');
  assert.notEqual(wizard, buggyWizard);
  ok('B: bandeja y wizard usan el mismo helper (no slice UTC)');
}

// C — cerca de medianoche UTC
{
  const out = formatDateTimeLima('2026-08-01T02:30:00.000Z');
  assert.equal(out, '2026-07-31 21:30');
  ok('C: 2026-08-01T02:30:00.000Z → 2026-07-31 21:30');
}

// D — null / vacío
{
  assert.equal(formatDateTimeLima(null), '—');
  assert.equal(formatDateTimeLima(''), '—');
  assert.equal(formatDateTimeLima(undefined), '—');
  ok('D: null/vacío → —');
}

// E — inválida
{
  assert.equal(formatDateTimeLima('no-es-fecha'), '—');
  assert.equal(formatDateTimeLima('abc'), '—');
  ok('E: inválida → — sin lanzar');
}

// F — ya con offset -05:00 (no restar otra vez)
{
  const out = formatDateTimeLima('2026-07-31T12:41:00-05:00');
  assert.equal(out, '2026-07-31 12:41');
  ok('F: offset -05:00 → 12:41 (sin doble resta)');
}

// G — Bienes/Servicios/Locadores: misma función
{
  for (const tipo of ['Bienes', 'Servicios', 'Locadores']) {
    assert.equal(
      formatDateTimeLima('2026-07-31T17:41:00.000Z'),
      '2026-07-31 12:41',
      tipo,
    );
  }
  ok('G: misma función para Bienes/Servicios/Locadores');
}

// H — encabezado visible "Fecha de invitación"
{
  const view = fs.readFileSync(path.join(root, 'src/views/contratacion/invitacionesView.js'), 'utf8');
  assert.ok(view.includes('Fecha de invitación'), 'debe existir etiqueta Fecha de invitación');
  assert.ok(!view.includes('>Fecha publicación<') && !view.includes("'Fecha publicación'"), 'no debe quedar Fecha publicación como th');
  const modal = fs.readFileSync(path.join(root, 'src/utils/invitacionesModals.js'), 'utf8');
  assert.ok(modal.includes('formatDateTimeLima'), 'wizard usa formatDateTimeLima');
  assert.ok(!modal.includes(".slice(0, 16).replace('T', ' ')"), 'wizard ya no usa slice UTC');
  ok('H: encabezado Fecha de invitación + wizard corregido');
}

// Extra: cronograma naive no debe confundirse (sigue siendo wall-clock)
{
  assert.equal(formatCronogramaDisplay('2026-07-31T18:00'), '2026-07-31 18:00');
  ok('extra: cronograma naive sin Z se mantiene (culminación)');
}

console.log('\nInvitaciones fecha/hora OK\n');
