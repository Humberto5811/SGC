// Fase 1A — integración Evaluación (transición C: EVALUACION_APROBADA; transición D: EVALUACION_OBSERVADA).
// Casos: E aprobación → DEC; F observación permanece EVALUACION; L actor del body ignorado (req.user manda); M req.user usado.
// SIN escrituras a BD real: usa simularTransicion (puro).
import { assert, summarize } from './workflowTestUtils.mjs';
import { simularTransicion } from '../server/lib/workflow/workflowSimulator.js';

const baseSim = { tipo_contratacion: 'BIEN', actor: { id: 7, rol: 'DIRECTOR_GERENTE' }, metadata: { idempotency_key: 'int:eval:1:abc12345' } };

async function run() {
  // E — aprobación de evaluación → DEC.
  const aprobar = simularTransicion({ ...baseSim, etapa_actual: 'EVALUACION', evento: 'EVALUACION_APROBADA' });
  assert(aprobar.permitido && aprobar.etapa_destino === 'DEC' && aprobar.cambia_ubicacion === true, 'E. aprobación evaluación → DEC');

  // F — observación permanece en EVALUACION (no cambia ubicación).
  const observar = simularTransicion({ ...baseSim, etapa_actual: 'EVALUACION', evento: 'EVALUACION_OBSERVADA' });
  assert(observar.permitido && observar.etapa_destino === 'EVALUACION' && observar.cambia_ubicacion === false, 'F. observación permanece EVALUACION');

  // L — actor del body ignorado: aunque actor diga HACKER, req.user manda.
  const malicioso = simularTransicion({ ...baseSim, etapa_actual: 'EVALUACION', evento: 'EVALUACION_APROBADA', actor: { id: 999, rol: 'HACKER' }, user: { id: 7, rol: 'DIRECTOR_GERENTE' } });
  assert(malicioso.permitido === true, 'L. req.user manda (actor del body ignorado)');

  // M — req.user usado: sin actor válido, sin user → rechazado.
  const sinActor = simularTransicion({ ...baseSim, actor: null, user: null });
  assert(sinActor.permitido === false, 'M. sin actor válido ni req.user → rechazado');
}

run().then(() => summarize('test-workflow-evaluacion-integracion')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });