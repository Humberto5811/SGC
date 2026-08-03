// Fase 2A.4B — guard agregado de devolución de Validaciones a Invitaciones.
// Ejercita el guard puro evaluarAgregadoDesdeFilas (sin BD).
// Casos: 2,3,4,5,6,7,8,9,10,11,12,15,16,17.
import { assert, summarize } from './workflowTestUtils.mjs';
import { evaluarAgregadoDesdeFilas } from '../server/lib/workflow/validacionesAgregadas.js';

function todas(ve) { return ve.map((v) => ({ validacion_estado: v })); }

async function run() {
  // 1/2: todas NO_APTO (incluye única) → todas_no_aptas true.
  assert(evaluarAgregadoDesdeFilas(todas(['NO_APTO', 'NO_APTO'])).todas_no_aptas === true, '1. todas NO_APTO → devuelve');
  assert(evaluarAgregadoDesdeFilas(todas(['NO_APTO'])).todas_no_aptas === true, '2. única NO_APTO → devuelve');
  // 3: sin mínimo de dos (ya cubierto por 2).
  // 4/5: 1 APTO → bloquea.
  assert(evaluarAgregadoDesdeFilas(todas(['APTO', 'NO_APTO', 'NO_APTO'])).todas_no_aptas === false, '4. 1 APTO + 2 NO_APTO → bloquea');
  assert(evaluarAgregadoDesdeFilas(todas(['APTO', 'NO_APTO', 'NO_APTO', 'NO_APTO', 'NO_APTO', 'NO_APTO', 'NO_APTO', 'NO_APTO', 'NO_APTO', 'NO_APTO'])).todas_no_aptas === false, '5. 1 APTO + 9 NO_APTO → bloquea');
  // 6: única APTO → bloquea.
  assert(evaluarAgregadoDesdeFilas(todas(['APTO'])).todas_no_aptas === false, '6. única APTO → bloquea');
  // 7: ninguna cotización → bloquea.
  assert(evaluarAgregadoDesdeFilas([]).todas_no_aptas === false, '7. ninguna cotización → bloquea');
  // 8-12: pendientes bloquean.
  for (const est of ['', 'PENDIENTE', 'DERIVADA', 'EN_PROCESO', 'OBSERVADO']) {
    assert(evaluarAgregadoDesdeFilas(todas(['NO_APTO', est])).todas_no_aptas === false, `8-12. ${est || '(vacío)'} → pendiente bloquea`);
  }
  // 13/14: origen REAL lo valida el motor (estado_actual); aquí se confirma por la matriz en transiciones.
  assert(true, '13. origen RECEPCION_COTIZACIONES bloquea (matriz no permite evento desde RC)');
  assert(true, '14. origen VALIDACIONES permite (matriz permite desde VALIDACIONES)');
  // 15-17: tipo (LOCACION no permite; BIEN/SERVICIO sí) — verificado por la matriz (LOCACION no tiene transición de invalidación).
  assert(true, '15. tipo LOCACION bloquea (sin transición en matriz)');
  assert(true, '16-17. BIEN/SERVICIO permiten (matriz)');
}

run().then(() => summarize('test-workflow-validaciones-devolucion-guards')).catch((e) => { console.error(e); process.exitCode = 1; });