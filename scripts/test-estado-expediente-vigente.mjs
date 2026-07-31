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

// A. Post-DEC en Programación → badge del submódulo actual
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'Aprobado DEC',
    estado_actual: 'PROGRAMACION',
    estado_cuadro: '',
  });
  assert.equal(v.codigo, 'EN_PROGRAMACION', `A: EN_PROGRAMACION, obtuvo ${v.codigo}`);
  assert.equal(v.label, 'En programación', 'A: label');
  assertNotCcAprobado(v, 'A');
  console.log('A OK', v.codigo, v.label, 'fuente=', v.fuente);
}

// B. Código legado normalizado en Programación
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'APROBADO_DEC',
    estado_actual: 'PROGRAMACION',
  });
  assert.equal(v.codigo, 'EN_PROGRAMACION', `B: obtuvo ${v.codigo}`);
  assertNotCcAprobado(v, 'B');
  console.log('B OK', v.codigo, v.label);
}

// C. Código canónico post-DEC + etapa Programación → submódulo gana
{
  const v = resolveEstadoExpedienteVigente({
    estado_codigo: 'REQUERIMIENTO_APROBADO_DEC',
    estado_actual: 'PROGRAMACION',
  });
  assert.equal(v.codigo, 'EN_PROGRAMACION', `C: obtuvo ${v.codigo}`);
  assertNotCcAprobado(v, 'C');
  console.log('C OK', v.codigo, v.label);
}

// A2. Snapshot obsoleto en DEC no debe ganar a estado_actual PROGRAMACION
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'Aprobado DEC',
    estado_actual: 'PROGRAMACION',
    payload: { workflowSnapshot: { etapaActual: 'DEC' } },
    workflowSnapshot: { etapaActual: 'DEC' },
  }, { workflowEtapa: 'DEC' });
  assert.equal(v.codigo, 'EN_PROGRAMACION', `A2: snapshot DEC obsoleto, obtuvo ${v.codigo}`);
  assert.notEqual(v.label, 'En DEC', 'A2: no En DEC');
  console.log('A2 OK', v.codigo, v.label);
}

// A3. Negocio Aprobado DEC con BD aún en DEC → sincerar a Programación
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'Aprobado DEC',
    estado_actual: 'DEC',
  });
  assert.equal(v.codigo, 'EN_PROGRAMACION', `A3: obtuvo ${v.codigo}`);
  assert.notEqual(v.label, 'En DEC', 'A3: no En DEC');
  assertNotCcAprobado(v, 'A3');
  console.log('A3 OK', v.codigo, v.label);
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

// G. Alias ambiguo sin etapa: "Aprobado DEC" implica ya salió a Programación
{
  const v = resolveEstadoExpedienteVigente({
    estado: 'Aprobado DEC',
  });
  assert.equal(v.codigo, 'EN_PROGRAMACION', 'G: EN_PROGRAMACION (submódulo destino post-DEC)');
  assertNotCcAprobado(v, 'G');
  assert.notEqual(v.label, 'En DEC', 'G: no En DEC');
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
