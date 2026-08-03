// Fase 2A.3E — postcommit de REINVITACION_ENVIADA (patrón INVITACION_ENVIADA).
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:5:REINVITACION_ENVIADA:csc88:u7';
const ctx = (key = KEY) => ({
  expediente_id: 5, tipo_contratacion: 'BIEN', evento: 'REINVITACION_ENVIADA', idempotency_key: key,
  actor: { id: 7, rol: 'X' },
  domainMutator: async () => ({ planCorreos: [{ id: 2, dispatch_key: 'env:5:2:88:user' }], contador_envios: 2 }),
});

async function run() {
  // 6. correo después de COMMIT (motor persiste 1 evento+1 historial).
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c = mock.connect();
  await c.query('BEGIN');
  const r = await executeTransition(ctx(), FLAGS, c);
  await c.query('COMMIT'); c.release();
  assert(r.idempotente === false && r.domain_results?.planCorreos !== undefined, '6. domainMutator no envía correo (solo plan)');
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '6. correo poscommit (tras COMMIT 1 evento+1 historial)');

  // 5. rollback no ejecuta afterCommit (error antes de COMMIT).
  const mockF = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES', failInsertEventos: true });
  const cf = mockF.connect();
  await cf.query('BEGIN');
  let err = null;
  try { await executeTransition(ctx('req:5:REINVITACION_ENVIADA:csc88:roll'), FLAGS, cf); } catch (e) { err = e; await cf.query('ROLLBACK'); }
  cf.release();
  assert(err !== null && mockF.eventos.length === 0 && mockF.movimientos === 0, '5. rollback completo; afterCommit no se ejecuta');
}

run().then(() => summarize('test-workflow-reinvitacion-postcommit')).catch((e) => { console.error(e); process.exitCode = 1; });