// Fase 2A.2 — atomicidad del núcleo (rollback completo).
// Casos: 3-4 replay no duplica; 21 rollback completo ante fallo.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const ctx = (evento, key) => ({ expediente_id: 1, tipo_contratacion: 'BIEN', evento, idempotency_key: key, actor: { id: 7, rol: 'SISTEMA' } });

async function run() {
  // 3-4. Replay no duplica workflow_eventos ni historial_movimientos.
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c = mock.connect();
  await c.query('BEGIN');
  await executeTransition(ctx('COTIZACION_PRESENTADA', 'r1'), FLAGS, c);
  await c.query('COMMIT');
  c.release();
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '3-4. 1 evento + 1 movimiento tras 1ª');

  const c2 = mock.connect();
  await c2.query('BEGIN');
  const r = await executeTransition(ctx('COTIZACION_PRESENTADA', 'r1'), FLAGS, c2);
  await c2.query('COMMIT');
  c2.release();
  assert(r.idempotente === true && mock.eventos.length === 1 && mock.movimientos === 1, '3-4. replay idempotente, sin duplicar');

  // 21. Rollback completo ante fallo de domainMutator.
  const mockF = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES', failUpdatePayload: true });
  const cf = mockF.connect();
  await cf.query('BEGIN');
  let err = null;
  try {
    await executeTransition({
      ...ctx('COTIZACION_PRESENTADA', 'fail'),
      domainMutator: async () => { throw new Error('mutator fail'); },
    }, FLAGS, cf);
  } catch (e) { err = e; await cf.query('ROLLBACK'); }
  cf.release();
  assert(err !== null && mockF.eventos.length === 0 && mockF.movimientos === 0, '21. rollback completo');
}

run().then(() => summarize('test-workflow-tramo-2a-core-atomicidad')).catch((e) => { console.error(e); process.exitCode = 1; });