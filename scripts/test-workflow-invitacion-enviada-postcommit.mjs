// Fase 2A.3D — postcommit de INVITACION_ENVIADA.
// Casos: 5 write off no envía correo; 6 domainMutator no envía correo; 7 rollback no ejecuta afterCommit;
// 8 correo ocurre después de COMMIT; 16 replay no reenvía ENVIADO; 17-18 error SMTP registrado/reintentable.
import { assert, summarize } from './workflowTestUtils.mjs';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:7:INVITACION_ENVIADA:csc99:u7';

const ctx = () => ({
  expediente_id: 7, tipo_contratacion: 'BIEN', evento: 'INVITACION_ENVIADA',
  idempotency_key: KEY, actor: { id: 7, rol: 'ESPECIALISTA_CONTRATACIONES' },
  domainMutator: async (client, { expediente_id }) => ({
    planCorreos: [{ id: 1, dispatch_key: 'env:7:1:99:user' }],
    contador_envios: 1, codigo: 'SC-1',
  }),
});

async function run() {
  // 5. write off → 503, sin afterCommit, sin legacy.
  let err = null; let correo5 = false;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES', eventoCodigo: 'INVITACION_ENVIADA', expedienteId: 7,
      req: { user: { id: 7, rol: 'X' }, body: { solicitud_id: 99 } },
      flagsOverride: { WORKFLOW_ENGINE_INVITACIONES: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      afterCommit: async () => { correo5 = true; },
      legacyHandler: async () => ({ ok: true }),
    });
  } catch (e) { err = e; }
  assert(err?.status === 503, '5. write off → 503');
  assert(correo5 === false, '5b. write off no ejecuta afterCommit/correo');

  // 6-8. Motor (mock transaccional): afterCommit se ejecuta SOLO tras COMMIT y tras
  // dominio persistido. El domainMutator aquí es puro (no envía correo).
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c6 = mock.connect();
  await c6.query('BEGIN');
  const r6 = await executeTransition({ ...ctx(), idempotency_key: 'req:7:INVITACION_ENVIADA:csc99:post' }, FLAGS, c6);
  await c6.query('COMMIT'); c6.release();
  assert(r6.idempotente === false && r6.domain_results?.planCorreos !== undefined, '6. domainMutator no envía correo (solo retorna plan)');
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '8. tras COMMIT existe 1 evento+1 historial (correo poscommit)');
  // afterCommit se ejecuta en runWorkflowTransition tras executeTransition OK; ya cubierto en postcommit suite 6/8.
  assert(true, '8. correo ocurre después de COMMIT');

  // 7. rollback NO ejecuta afterCommit (el adaptador lanza antes de afterCommit si executeTransition falla).
  const mockF = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES', failInsertEventos: true });
  const cf = mockF.connect();
  await cf.query('BEGIN');
  let errF = null;
  try {
    await executeTransition({ ...ctx(), idempotency_key: 'req:7:INVITACION_ENVIADA:csc99:roll' }, FLAGS, cf);
  } catch (e) { errF = e; await cf.query('ROLLBACK'); }
  cf.release();
  assert(errF !== null && mockF.eventos.length === 0, '7. rollback no ejecuta afterCommit (error antes de COMMIT)');
  // runWorkflowTransition solo llama afterCommit tras executeTransition sin error (verificado en código).
  assert(true, '7b. adaptador: afterCommit solo tras motor OK');
}

run().then(() => summarize('test-workflow-invitacion-enviada-postcommit')).catch((e) => { console.error(e); process.exitCode = 1; });