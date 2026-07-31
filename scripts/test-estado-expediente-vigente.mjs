/**
 * Resolvedor global — desambiguación Aprobado DEC vs C.C. aprobado.
 */
import assert from 'assert';
import {
  resolveEstadoExpedienteVigente,
  normalizeEstadoCode,
  normalizeEstadoCuadroCode,
  getLabelEstado,
} from '../shared/estadoExpedienteVigente.js';

function assertNotCcAprobado(v, caso) {
  assert.notEqual(v.codigo, 'CUADRO_COMPARATIVO_APROBADO', `${caso}: no CUADRO_COMPARATIVO_APROBADO`);
  assert.notEqual(v.label, 'C.C. aprobado', `${caso}: no label C.C. aprobado`);
}

console.log('=== test-estado-expediente-vigente (Aprobado DEC ≠ C.C. aprobado) ===\n');

// Alias global
assert.equal(
  normalizeEstadoCode('Aprobado DEC'),
  'REQUERIMIENTO_APROBADO_DEC',
  'alias global Aprobado DEC → REQUERIMIENTO_APROBADO_DEC',
);
assert.equal(
  normalizeEstadoCode('APROBADO_DEC'),
  'REQUERIMIENTO_APROBADO_DEC',
  'alias global APROBADO_DEC → REQUERIMIENTO_APROBADO_DEC',
);
assert.notEqual(
  normalizeEstadoCode('APROBADO_DEC'),
  'CUADRO_COMPARATIVO_APROBADO',
  'APROBADO_DEC no mapea a cuadro vía alias global',
);

// Dominio cuadro (estado_cuadro / DB)
assert.equal(
  normalizeEstadoCuadroCode('APROBADO_DEC'),
  'CUADRO_COMPARATIVO_APROBADO',
  'contexto cuadro: APROBADO_DEC → CUADRO_COMPARATIVO_APROBADO',
);
assert.equal(
  normalizeEstadoCuadroCode('C.C. aprobado'),
  'CUADRO_COMPARATIVO_APROBADO',
  'contexto cuadro: label C.C. aprobado',
);

// A. Post-DEC en Programación
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'Aprobado DEC',
    estado_actual: 'PROGRAMACION',
    estado_cuadro: '',
  });
  assert.ok(
    v.codigo === 'REQUERIMIENTO_APROBADO_DEC' || v.codigo === 'EN_PROGRAMACION',
    `A: codigo seguro, obtuvo ${v.codigo}`,
  );
  assertNotCcAprobado(v, 'A');
  console.log('A OK', v.codigo, v.label, 'fuente=', v.fuente);
}

// B. Código legado normalizado
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'APROBADO_DEC',
    estado_actual: 'PROGRAMACION',
  });
  assert.ok(
    v.codigo === 'REQUERIMIENTO_APROBADO_DEC' || v.codigo === 'EN_PROGRAMACION',
    `B: codigo seguro, obtuvo ${v.codigo}`,
  );
  assertNotCcAprobado(v, 'B');
  console.log('B OK', v.codigo, v.label);
}

// C. Código canónico post-DEC
{
  const v = resolveEstadoExpedienteVigente({
    estado_codigo: 'REQUERIMIENTO_APROBADO_DEC',
    estado_actual: 'PROGRAMACION',
  });
  assert.ok(
    v.codigo === 'REQUERIMIENTO_APROBADO_DEC' || v.codigo === 'EN_PROGRAMACION',
    `C: codigo seguro, obtuvo ${v.codigo}`,
  );
  assertNotCcAprobado(v, 'C');
  console.log('C OK', v.codigo, v.label);
}

// D. Programación explícita
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'En Programación',
    estado_actual: 'PROGRAMACION',
  });
  assert.equal(v.codigo, 'EN_PROGRAMACION', 'D: EN_PROGRAMACION');
  assert.equal(v.label, 'En programación', 'D: label');
  console.log('D OK', v.codigo, v.label);
}

// E. Cuadro realmente aprobado
{
  const v = resolveEstadoExpedienteVigente({
    estado_actual: 'CUADRO_COMPARATIVO',
    estado_cuadro: 'CUADRO_COMPARATIVO_APROBADO',
  });
  assert.equal(v.codigo, 'CUADRO_COMPARATIVO_APROBADO', 'E: codigo');
  assert.equal(v.label, 'C.C. aprobado', 'E: label');
  console.log('E OK', v.codigo, v.label);
}

// F. Cuadro aprobado + etapa CCP
// Prioridad vigente: rama workflow CCP (antes del bloque cuadro) → DERIVADO_CCP
// cuando no hay ccp_activo / codigo_ccp. Documentado.
{
  const v = resolveEstadoExpedienteVigente({
    estado_actual: 'CCP',
    estado_cuadro: 'CUADRO_COMPARATIVO_APROBADO',
  });
  assert.equal(v.codigo, 'DERIVADO_CCP', 'F: etapa CCP gana → DERIVADO_CCP (prioridad funcional)');
  assert.equal(getLabelEstado(v.codigo), 'Derivado a CCP', 'F: label CCP');
  console.log('F OK', v.codigo, v.label, '(doc: CCP etapa > estado_cuadro C.C. aprobado)');
}

// G. Alias ambiguo sin etapa
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'Aprobado DEC',
  });
  assert.equal(v.codigo, 'REQUERIMIENTO_APROBADO_DEC', 'G: REQUERIMIENTO_APROBADO_DEC');
  assertNotCcAprobado(v, 'G');
  console.log('G OK', v.codigo, v.label);
}

// H. No afectar Invitaciones
{
  const v = resolveEstadoExpedienteVigente({
    estado_actual: 'INVITACIONES',
    estado: 'Invitación en elaboración',
  });
  assert.equal(v.codigo, 'INVITACION_EN_ELABORACION', 'H: codigo');
  assert.equal(v.label, 'Invitación en elaboración', 'H: label');
  console.log('H OK', v.codigo, v.label);
}

// I. Label de cuadro en estado_cuadro
{
  const v = resolveEstadoExpedienteVigente({
    estado_cuadro: 'C.C. aprobado',
  });
  assert.equal(v.codigo, 'CUADRO_COMPARATIVO_APROBADO', 'I: codigo');
  assert.equal(v.label, 'C.C. aprobado', 'I: label');
  console.log('I OK', v.codigo, v.label);
}

// Extra: legado estado_cuadro APROBADO_DEC (DB cuadros)
{
  const v = resolveEstadoExpedienteVigente({
    estado_actual: 'CUADRO_COMPARATIVO',
    estado_cuadro: 'APROBADO_DEC',
  });
  assert.equal(v.codigo, 'CUADRO_COMPARATIVO_APROBADO', 'legado cuadro DB');
  console.log('Extra OK legado estado_cuadro=APROBADO_DEC →', v.codigo);
}

console.log('\nOK test-estado-expediente-vigente');
