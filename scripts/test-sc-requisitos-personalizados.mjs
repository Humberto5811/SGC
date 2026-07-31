/**
 * Prueba estática — requisitos técnicos personalizados (SC Documentos).
 * Casos A–F (lógica de datos) sin DOM de Bootstrap.
 *
 *   node scripts/test-sc-requisitos-personalizados.mjs
 */
import assert from 'node:assert/strict';
import { normalizeReqEntry, reqNombreKey } from '../src/utils/invitacionesModals.js';

function ok(msg) { console.log(`  ✓ ${msg}`); }

console.log('\n=== SC — Requisitos técnicos personalizados ===\n');

// Normalización obligatorio NO
{
  const n = normalizeReqEntry({ requisito: 'Loc X', obligatorio: false, observacion: '' });
  assert.equal(n.obligatorio, false);
  assert.equal(normalizeReqEntry({ requisito: 'A', obligatorio: 'NO' }).obligatorio, false);
  assert.equal(normalizeReqEntry({ requisito: 'A', obligatorio: true }).obligatorio, true);
  assert.equal(normalizeReqEntry({ requisito: 'A', obligatorio: 'SI' }).obligatorio, true);
  ok('obligatorio SI/NO normalizado');
}

// Caso A/B — con y sin observación
{
  const conObs = normalizeReqEntry({
    requisito: 'Req Bienes',
    obligatorio: true,
    observacion: 'Detalle técnico',
    custom: true,
  });
  assert.equal(conObs.observacion, 'Detalle técnico');
  assert.equal(conObs.custom, true);
  const sinObs = normalizeReqEntry({ requisito: 'Req Servicios', obligatorio: true, custom: true });
  assert.equal(sinObs.observacion, '');
  ok('observación opcional persistible');
}

// Caso C — obligatorio NO se conserva
{
  const loc = normalizeReqEntry({ requisito: 'Locador custom', obligatorio: 'NO', custom: true });
  assert.equal(loc.obligatorio, false);
  const roundtrip = normalizeReqEntry(loc);
  assert.equal(roundtrip.obligatorio, false);
  ok('Locadores obligatorio=NO roundtrip');
}

// Caso D — nombre vacío
{
  assert.equal(reqNombreKey('   '), '');
  assert.equal(reqNombreKey(null), '');
  ok('nombre vacío detectado');
}

// Caso E — duplicado exacto (tras trim)
{
  const list = [
    normalizeReqEntry({ requisito: 'Alpha', custom: true }),
  ];
  const nombre = reqNombreKey('Alpha');
  assert.ok(list.some((r) => reqNombreKey(r.requisito) === nombre));
  assert.ok(list.some((r) => reqNombreKey(r.requisito) === reqNombreKey('Alpha ')));
  assert.ok(!list.some((r) => reqNombreKey(r.requisito) === reqNombreKey('Beta')));
  ok('duplicado exacto por nombre (trim)');
}

// Caso F — eliminar de colección
{
  const list = [
    normalizeReqEntry({ requisito: 'A', custom: true }),
    normalizeReqEntry({ requisito: 'B', custom: true }),
  ];
  const idx = list.findIndex((r) => r.requisito === 'A');
  list.splice(idx, 1);
  assert.equal(list.length, 1);
  assert.equal(list[0].requisito, 'B');
  ok('eliminar personalizado del estado');
}

// Estructura final esperada
{
  const shape = normalizeReqEntry({
    requisito: 'Certificación ISO',
    obligatorio: false,
    observacion: 'Adjuntar constancia',
    custom: true,
  });
  assert.deepEqual(
    {
      requisito: shape.requisito,
      obligatorio: shape.obligatorio,
      observacion: shape.observacion,
      custom: shape.custom,
      personalizado: shape.personalizado,
    },
    {
      requisito: 'Certificación ISO',
      obligatorio: false,
      observacion: 'Adjuntar constancia',
      custom: true,
      personalizado: true,
    },
  );
  ok('estructura de datos final');
}

console.log('\nSC requisitos personalizados OK\n');
