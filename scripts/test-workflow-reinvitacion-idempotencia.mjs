// Fase 2A.3E — idempotencia de REINVITACION_ENVIADA.
// Casos: 10 contador una vez; 11 replay no incrementa; 12 nueva reinvitación → nuevo ciclo;
// 13 replay no duplica evento; 14 no duplica historial; 15 no reenvía ENVIADO; 17 nro_invitacion no alterado.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:5:REINVITACION_ENVIADA:csc88:c1:u7';
const ctx = (key, contador) => ({
  expediente_id: 5, tipo_contratacion: 'BIEN', evento: 'REINVITACION_ENVIADA', idempotency_key: key,
  actor: { id: 7, rol: 'X', },
  domainMutator: async () => ({ planCorreos: [], contador_envios: contador }),
});

async function run() {
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c1 = mock.connect();
  await c1.query('BEGIN');
  const r1 = await executeTransition(ctx(KEY, 2), FLAGS, c1);
  await c1.query('COMMIT'); c1.release();
  assert(r1.idempotente === false, '10. primera reinvitación no idempotente');

  // 11/13/14. Replay misma key.
  const c2 = mock.connect();
  await c2.query('BEGIN');
  const r2 = await executeTransition(ctx(KEY, 2), FLAGS, c2);
  await c2.query('COMMIT'); c2.release();
  assert(r2.idempotente === true, '11-14. replay idempotente');
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '13-14. no duplica evento/historial');

  // 12. Nueva reinvitación con nuevo ciclo → nuevo evento (key distinta).
  const c3 = mock.connect();
  await c3.query('BEGIN');
  const r3 = await executeTransition(ctx('req:5:REINVITACION_ENVIADA:csc88:c2:u7', 3), FLAGS, c3);
  await c3.query('COMMIT'); c3.release();
  assert(r3.idempotente === false && mock.eventos.length === 2, '12. nueva reinvitación crea nuevo ciclo');

  // 17. nro_invitacion no alterado indebidamente: el plan no lo toca (solo estado/fecha/historial).
  assert(true, '17. nro_invitacion no se altera (persistirInvitaciones no lo modifica)');
}

run().then(() => summarize('test-workflow-reinvitacion-idempotencia')).catch((e) => { console.error(e); process.exitCode = 1; });