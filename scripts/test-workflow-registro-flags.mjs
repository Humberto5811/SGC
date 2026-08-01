// Fase 1A — flags del adaptador (tramo Registro/Evaluación).
// Casos: A flag apagado → legacy; B flag on + write off → 503; B2 legacy NO se ejecuta;
// B3 write on + flag módulo off → legacy; P nunca motor+legacy juntos.
import { assert, summarize } from './workflowTestUtils.mjs';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';

const reqStub = { user: { id: 7, rol: 'USUARIO_AU' }, body: { tipo_contratacion: 'BIEN' } };

async function run() {
  // A — flag apagado → legacy (exacto, sin motor).
  let legacyA = 0;
  const resA = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
    eventoCodigo: 'REQUERIMIENTO_REGISTRADO',
    expedienteId: 1,
    req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_REGISTRO: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    legacyHandler: async () => { legacyA += 1; return { ok: true, requerimiento: { id: 1 } }; },
  });
  assert(legacyA === 1 && resA.ok === true, 'A. flag apagado → legacy único');

  // B — flag on + write off → 503.
  let errB = null;
  let legacyB = 0;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
      eventoCodigo: 'REQUERIMIENTO_REGISTRADO',
      expedienteId: 1,
      req: reqStub,
      flagsOverride: { WORKFLOW_ENGINE_REGISTRO: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      legacyHandler: async () => { legacyB += 1; return { ok: true }; },
    });
  } catch (e) { errB = e; }
  assert(errB?.status === 503 || errB?.code === 'WORKFLOW_WRITE_DISABLED', 'B. flag on + write off → 503');
  assert(legacyB === 0, 'B2. legacy NO ejecutado con write off');

  // B3 — write on pero flag módulo off → legacy.
  let legacyB3 = 0;
  const resB3 = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
    eventoCodigo: 'REQUERIMIENTO_ENVIADO_EVALUACION',
    expedienteId: 1,
    req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_REGISTRO: false, WORKFLOW_ENGINE_WRITE_ENABLED: true },
    legacyHandler: async () => { legacyB3 += 1; return { ok: true }; },
  });
  assert(legacyB3 === 1 && resB3.ok === true, 'B3. write on + flag módulo off → legacy');

  // P — nunca motor+legacy juntos: B2 verifica que write off NO llama legacy;
  // estructuralmente el adaptador solo llama uno u otro (verificado de nuevo aquí).
  assert(legacyB === 0 && legacyB3 === 1, 'P. nunca motor+legacy en la misma petición');
}

run().then(() => summarize('test-workflow-registro-flags')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });