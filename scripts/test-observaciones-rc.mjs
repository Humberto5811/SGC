/**
 * Validación RC — Motor de Observaciones (flujo completo simulado).
 * Ejecutar: node scripts/test-observaciones-rc.mjs
 */
import {
  formatEtiquetaJerarquica,
  getListaObservaciones,
  obtenerEstadoVisual,
  puedeSubsanar,
  calcularRondaRaiz,
  requiereBadgeModulo,
} from '../shared/observacionesMotor.js';
import {
  emitirObservacion,
  registrarSubsanacionObservacion,
} from '../server/lib/observacionesWorkflow.js';

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

function row(payload, estado_actual = 'REGISTRADO', sub = 'Registro de Requerimiento') {
  return { id: 46, codigo: 'REQ-046', payload: JSON.stringify(payload), estado_actual, sub_modulo_actual: sub };
}

console.log('\n=== TEST 1: Numeración padre-hijo ===');
const payload1 = { observaciones: [] };
emitirObservacion(payload1, { origen_submodulo: 'Evaluación de Requerimiento', destino_submodulo: 'Registro de Requerimiento', motivo: 'Obs 1', gerente: 'Eval' });
emitirObservacion(payload1, { origen_submodulo: 'DEC', destino_submodulo: 'Evaluación de Requerimiento', motivo: 'Obs 2', gerente: 'DEC' });
const obs2 = payload1.observaciones.find((o) => o.motivo === 'Obs 2');
emitirObservacion(payload1, { origen_submodulo: 'Evaluación de Requerimiento', destino_submodulo: 'Registro de Requerimiento', motivo: 'Obs 2.1', gerente: 'Eval', observacion_padre_id: obs2.id });
emitirObservacion(payload1, { origen_submodulo: 'Programación', destino_submodulo: 'Coordinación CM', motivo: 'Obs 3', gerente: 'Prog' });
emitirObservacion(payload1, { origen_submodulo: 'Coordinación CM', destino_submodulo: 'Invitaciones', motivo: 'Obs 3.1', gerente: 'CM', observacion_padre_id: payload1.observaciones.find((o) => o.motivo === 'Obs 3').id });

const hilos = getListaObservaciones(payload1);
const labels = hilos.map((o) => formatEtiquetaJerarquica(o, hilos));
assert(labels.includes('1'), 'Raíz 1');
assert(labels.includes('2'), 'Raíz 2');
assert(labels.includes('2.1'), 'Hijo 2.1');
assert(labels.includes('3'), 'Raíz 3 (no 4)');
assert(labels.includes('3.1'), 'Hijo 3.1');
assert(!labels.includes('4'), 'No debe existir numeración 4 tras hijo 2.1');

console.log('\n=== TEST 2: Estado visual por módulo ===');
const rEval = row(payload1, 'EVALUACION', 'Evaluación de Requerimiento');
const vReg = obtenerEstadoVisual(rEval, 'Registro de Requerimiento');
const vEval = obtenerEstadoVisual(rEval, 'Evaluación de Requerimiento');
const vDec = obtenerEstadoVisual(rEval, 'DEC');
assert(!/observ/i.test(vEval.estadoWorkflowTexto), 'Eval workflow no contiene Observado');
assert(vReg.badgeObservado === true, 'Registro badge por obs dirigida');
assert(vDec.badgeObservado === false, 'DEC sin badge al emitir hacia Eval');

console.log('\n=== TEST 3: Subsanar solo por motor ===');
assert(puedeSubsanar('Registro de Requerimiento', rEval) === true, 'Registro puede subsanar');
assert(puedeSubsanar('DEC', rEval) === false, 'DEC no subsana sin ser receptor');

console.log('\n=== TEST 4: Badge desaparece al subsanar (receptor) ===');
const payload2 = { observaciones: [] };
emitirObservacion(payload2, { origen_submodulo: 'DEC', destino_submodulo: 'Registro de Requerimiento', motivo: 'DEC→Reg', gerente: 'DEC' });
const obsDec = payload2.observaciones[0];
registrarSubsanacionObservacion(payload2, { observacion_id: obsDec.id, respuesta: 'Subsanado registro', origen_submodulo: 'Registro de Requerimiento', usuario: 'Reg' });
const rDec = row(payload2, 'DEC', 'DEC');
assert(requiereBadgeModulo(rDec, 'Registro de Requerimiento') === false, 'Registro sin badge tras subsanar');
assert(requiereBadgeModulo(rDec, 'DEC') === true, 'DEC badge hasta cerrar (emisor revisa)');

console.log('\n=== TEST 5: calcularRondaRaiz independiente ===');
const p3 = { observaciones: [{ id: 'a' }, { id: 'b', observacion_padre_id: 'a' }] };
assert(calcularRondaRaiz(p3.observaciones) === 2, 'Siguiente raíz es 2 cuando ya existe 1 raíz');

console.log('\n✅ Todos los tests RC pasaron.\n');
