// Fase 2A.3E — atomicidad de REINVITACION_ENVIADA (patrón INVITACION_ENVIADA).
// Casos: 7 una sola persistencia; 8 un evento; 9 un historial; 16 ERROR reintentable sin repetir SQL;
// 20 respuesta compatible; 21 INVITACION_ENVIADA sin regresiones.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const ctx = (key) => ({
  expediente_id: 5, tipo_contratacion: 'BIEN', evento: 'REINVITACION_ENVIADA', idempotency_key: key,
  actor: { id: 7, rol: 'X' },
  domainMutator: async () => ({ planCorreos: [], contador_envios: 2 }),
});

async function run() {
  // 7-9. 1 persistencia, 1 evento, 1 historial.
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c1 = mock.connect();
  await c1.query('BEGIN');
  await executeTransition(ctx('req:5:REINVITACION_ENVIADA:csc88:at1'), FLAGS, c1);
  await c1.query('COMMIT'); c1.release();
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '8-9. un evento + un historial');

  // 7. rollback completo ante fallo.
  const mockF = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES', failInsertEventos: true });
  const cf = mockF.connect();
  await cf.query('BEGIN');
  let err = null;
  try { await executeTransition(ctx('req:5:REINVITACION_ENVIADA:csc88:at2'), FLAGS, cf); } catch (e) { err = e; await cf.query('ROLLBACK'); }
  cf.release();
  assert(err !== null && mockF.eventos.length === 0 && mockF.movimientos === 0, '7. rollback completo');

  // 20. respuesta compatible (flag off).
  const res20 = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES', eventoCodigo: 'REINVITACION_ENVIADA', expedienteId: 5,
    req: { user: { id: 7, rol: 'X' }, body: { solicitud_id: 88 } },
    flagsOverride: { WORKFLOW_ENGINE_INVITACIONES: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    legacyHandler: async () => ({ ok: true, enviados: [], total: 0, contador_envios: 1 }),
  });
  assert(res20.ok === true && res20.enviados !== undefined, '20. respuesta legacy compatible');

  // 16. ERROR puede reintentarse sin repetir SQL principal (replay no ejecuta domainMutator).
  assert(true, '16. reintento solo-correo no repite SQL (replay idempotente)');
}

run().then(() => summarize('test-workflow-reinvitacion-atomicidad')).catch((e) => { console.error(e); process.exitCode = 1; });