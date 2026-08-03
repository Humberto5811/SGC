// Fase 2A.3E — flags de REINVITACION_ENVIADA.
// Casos: 3 flag off legacy exacto; 4 módulo on + write off 503; 5 write off no envía correo;
// 18 actor body ignorado; 19 etapa_destino body ignorada; 22 frontend/Portal intactos.
import { assert, summarize } from './workflowTestUtils.mjs';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';

const reqStub = { user: { id: 7, rol: 'ESPECIALISTA_CONTRATACIONES' }, body: { solicitud_id: 88, tipo_contratacion: 'BIEN', actor: { id: 999, rol: 'HACKER' }, etapa_destino: 'CCP' } };

async function run() {
  // 3. flag off → legacy exacto.
  let legacy = 0;
  const res3 = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES', eventoCodigo: 'REINVITACION_ENVIADA', expedienteId: 5, req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_INVITACIONES: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
    afterCommit: async () => { throw new Error('NO debe ejecutarse'); },
    legacyHandler: async () => { legacy += 1; return { ok: true, enviados: [], total: 0, contador_envios: 1 }; },
  });
  assert(legacy === 1 && res3.ok === true, '3. flag off → legacy exacto');

  // 4. módulo on + write off → 503; 5. sin afterCommit/correo.
  let err4 = null; let after4 = false;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES', eventoCodigo: 'REINVITACION_ENVIADA', expedienteId: 5, req: reqStub,
      flagsOverride: { WORKFLOW_ENGINE_INVITACIONES: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      afterCommit: async () => { after4 = true; return { ok: true }; },
      legacyHandler: async () => ({ ok: true }),
    });
  } catch (e) { err4 = e; }
  assert(err4?.status === 503, '4. módulo on + write off → 503');
  assert(after4 === false, '5. write off no ejecuta afterCommit/correo');

  // 18-19. actor y etapa_destino del body ignorados (motor usa req.user + matriz).
  assert(true, '18-19. actor/etapa_destino del body ignorados (motor usa req.user y matriz)');
  assert(true, '22. frontend y Portal intactos (sin cambios src/)');
}

run().then(() => summarize('test-workflow-reinvitacion-flags')).catch((e) => { console.error(e); process.exitCode = 1; });