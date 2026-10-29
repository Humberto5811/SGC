/**
 * RC8.17.8H6 D10-E3-C2.6B2 — Orden bandeja cuadro (sin BD).
 */
import { ordenarFilasBandejaCuadroComparativo } from '../server/lib/cuadroComparativo.js';

const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC8.17.8H6 D10-E3-C2.6B2 Orden bandeja cuadro ===\n');

{
  const filas = [
    {
      solicitud_codigo: 'SC-00002',
      nro_invitacion: 1,
      fecha_ingreso_cuadro: '2026-01-01T00:00:00Z',
      fecha_actualizacion: '2026-01-01T00:00:00Z',
    },
    {
      solicitud_codigo: 'SC-00001',
      nro_invitacion: 7,
      fecha_ingreso_cuadro: '2025-06-01T00:00:00Z',
      fecha_actualizacion: '2026-03-15T12:00:00Z',
    },
  ];
  const sorted = ordenarFilasBandejaCuadroComparativo(filas);
  assert(sorted[0].solicitud_codigo === 'SC-00001',
    'actividad reciente (actualizado_at) antes que ingreso APTO antiguo');
}

{
  const filas = [
    { solicitud_codigo: 'SC-A', nro_invitacion: 1, fecha_actualizacion: '2026-02-01T00:00:00Z' },
    { solicitud_codigo: 'SC-A', nro_invitacion: 2, fecha_actualizacion: '2026-02-01T00:00:00Z' },
    { solicitud_codigo: 'SC-B', nro_invitacion: 1, fecha_actualizacion: '2026-02-01T00:00:00Z' },
  ];
  const sorted = ordenarFilasBandejaCuadroComparativo(filas);
  assert(sorted[0].solicitud_codigo === 'SC-B' && sorted[0].nro_invitacion === 1,
    'desempate estable: mismo timestamp → código solicitud');
  assert(sorted[1].solicitud_codigo === 'SC-A' && sorted[1].nro_invitacion === 2,
    'desempate: misma solicitud → nro_invitacion DESC');
}

{
  const filas = [
    { solicitud_codigo: 'SC-1', nro_invitacion: 1, fecha_actualizacion: '2026-01-01T00:00:00Z' },
    { solicitud_codigo: 'SC-1', nro_invitacion: 7, fecha_actualizacion: '2026-01-01T00:00:00Z' },
  ];
  const sorted = ordenarFilasBandejaCuadroComparativo(filas);
  assert(sorted[0].nro_invitacion === 7 && sorted[1].nro_invitacion === 1,
    'aislamiento invitación: filas distintas por nro_invitacion en desempate');
}

const failed = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((t) => console.error('FAIL:', t.msg));
  process.exit(1);
}
