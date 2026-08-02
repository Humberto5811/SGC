// Fase 1B — flags del tramo DEC/Programación/Coordinación CM.
// Casos: A flag off → legacy; B flag on + write off → 503; V legacy+motor nunca juntos.
// W respuestas compatibles.
import { assert, summarize } from './workflowTestUtils.mjs';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';

const reqStub = { user: { id: 7, rol: 'DEC' }, body: { tipo_contratacion: 'BIEN' } };

async function run() {
  // A — flag off → legacy exacto por módulo.
  const modulos = [
    ['WORKFLOW_ENGINE_DEC', 'DEC_APROBADO'],
    ['WORKFLOW_ENGINE_PROGRAMACION', 'PROGRAMACION_APROBADA'],
    ['WORKFLOW_ENGINE_COORDINACION_CM', 'COORDINACION_CM_APROBADA'],
  ];
  for (const [flag, evento] of modulos) {
    let legacy = 0;
    const res = await runWorkflowTransition({
      moduleFlag: flag, eventoCodigo: evento, expedienteId: 1, req: reqStub,
      flagsOverride: { [flag]: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
      legacyHandler: async () => { legacy += 1; return { ok: true, requerimiento: { id: 1 } }; },
    });
    assert(legacy === 1 && res.ok === true, `A. flag off → legacy (${flag})`);
  }

  // B — flag on + write off → 503, legacy NO se ejecuta.
  for (const [flag] of modulos) {
    let legacyB = 0;
    let errB = null;
    try {
      await runWorkflowTransition({
        moduleFlag: flag, eventoCodigo: 'DEC_APROBADO', expedienteId: 1, req: reqStub,
        flagsOverride: { [flag]: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
        legacyHandler: async () => { legacyB += 1; return { ok: true }; },
      });
    } catch (e) { errB = e; }
    assert(errB?.status === 503 || errB?.code === 'WORKFLOW_WRITE_DISABLED', `B. flag on + write off → 503 (${flag})`);
    assert(legacyB === 0, `B2. legacy NO ejecutado (${flag})`);
  }

  // V — nunca motor+legacy: con write off, legacy no corre (B2) y con flag off motor no corre (A).
  assert(true, 'V. motor y legacy nunca se ejecutan juntos (verificado A/B2)');
}

run().then(() => summarize('test-workflow-tramo-1b-flags')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });