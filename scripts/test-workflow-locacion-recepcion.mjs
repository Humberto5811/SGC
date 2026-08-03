// Fase 2A.2 — LOCACION → CCP.
// Casos: 14 LOCACION deriva a CCP; 15 no pasa por VALIDACIONES; tipo real LOCACION.
import { assert, summarize } from './workflowTestUtils.mjs';
import { getTransition } from '../shared/workflow/transiciones.js';
import { normalizarTipo } from '../shared/workflow/tiposContratacion.js';

async function run() {
  // 14. LOCACION → CCP vía LOCACION_APROBADA_RECEPCION.
  const t = getTransition({ tipoContratacion: 'LOCACION', etapaOrigen: 'RECEPCION_COTIZACIONES', eventoCodigo: 'LOCACION_APROBADA_RECEPCION' });
  assert(t?.etapa_destino === 'CCP' && t.cambia_ubicacion === true, '14. LOCACION → CCP');
  // 15. LOCACION no pasa por VALIDACIONES (refuerzo).
  assert(!getTransition({ tipoContratacion: 'LOCACION', etapaOrigen: 'RECEPCION_COTIZACIONES', eventoCodigo: 'COTIZACIONES_DERIVADAS_VALIDACION' }), '15. LOCACION no pasa por VALIDACIONES');
  // 8b. tipo real locadores.
  assert(normalizarTipo('locadores') === 'LOCACION', '8b. tipo real LOCACION');
}

run().then(() => summarize('test-workflow-locacion-recepcion')).catch((e) => { console.error(e); process.exitCode = 1; });