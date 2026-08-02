// Fase 2A.2 — flags del núcleo (RECEPCION/INVITACIONES/VALIDACIONES). flag off→legacy; on+write off→503.
import { assert, summarize } from './workflowTestUtils.mjs';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';

const reqStub = { user: { id: 7, rol: 'ESPECIALISTA_CONTRATACIONES' }, body: { tipo_contratacion: 'BIEN' } };

async function run() {
  // 19. flag off → legacy exacto.
  let legacy = 0;
  const res = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_RECEPCION', eventoCodigo: 'COTIZACION_PRESENTADA', expedienteId: 1, req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_RECEPCION: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
    legacyHandler: async () => { legacy += 1; return { ok: true }; },
  });
  assert(legacy === 1 && res.ok === true, '19. flag off → legacy');

  // 20. módulo on + write off → 503, legacy NO ejecutado.
  let legacy503 = 0;
  let err = null;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_RECEPCION', eventoCodigo: 'COTIZACION_PRESENTADA', expedienteId: 1, req: reqStub,
      flagsOverride: { WORKFLOW_ENGINE_RECEPCION: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      legacyHandler: async () => { legacy503 += 1; return { ok: true }; },
    });
  } catch (e) { err = e; }
  assert(err?.status === 503 || err?.code === 'WORKFLOW_WRITE_DISABLED', '20. on + write off → 503');
  assert(legacy503 === 0, '20b. legacy NO ejecutado');
}

run().then(() => summarize('test-workflow-tramo-2a-core-flags')).catch((e) => { console.error(e); process.exitCode = 1; });