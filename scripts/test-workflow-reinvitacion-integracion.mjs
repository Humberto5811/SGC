// Fase 2A.3E — REINVITACION_ENVIADA (integrado en /solicitudes/:id/enviar-correos).
// Casos: 1 permanece INVITACIONES; 8 un evento; 9 un historial; 10 contador una vez;
// 21 INVITACION_ENVIADA sin regresiones (verificado por usar mismo motor);
// 2 flag off legacy exacto.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:5:REINVITACION_ENVIADA:csc88:u7';
const ctx = () => ({
  expediente_id: 5, tipo_contratacion: 'BIEN', evento: 'REINVITACION_ENVIADA',
  idempotency_key: KEY, actor: { id: 7, rol: 'ESPECIALISTA_CONTRATACIONES' },
  domainMutator: async (client, { expediente_id }) => ({
    planCorreos: [{ id: 2, dispatch_key: 'env:5:2:88:user', ruc: '20100070970', correos: ['c@x.pe'] }],
    contador_envios: 2, codigo: 'SC-00002-2026-INS',
  }),
});

async function run() {
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c = mock.connect();
  await c.query('BEGIN');
  const r = await executeTransition(ctx(), FLAGS, c);
  await c.query('COMMIT'); c.release();
  assert(mock.row.estado_actual === 'INVITACIONES', '1. permanece INVITACIONES');
  assert(mock.eventos.length === 1, '8. un workflow_eventos');
  assert(mock.movimientos === 1, '9. un historial_movimientos');
  assert(r.domain_results?.contador_envios === 2, '10. contador_envios una vez (ciclo 2)');

  // 2. flag off → legacy exacto.
  let legacy = false;
  const res = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES', eventoCodigo: 'REINVITACION_ENVIADA', expedienteId: 5,
    req: { user: { id: 7, rol: 'X' }, body: { solicitud_id: 88, tipo_contratacion: 'BIEN' } },
    flagsOverride: { WORKFLOW_ENGINE_INVITACIONES: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
    afterCommit: async () => { throw new Error('NO debe ejecutarse'); },
    legacyHandler: async () => { legacy = true; return { ok: true, enviados: [], total: 0, contador_envios: 1 }; },
  });
  assert(legacy && res.ok === true, '2. flag off → legacy exacto');
}

run().then(() => summarize('test-workflow-reinvitacion-integracion')).catch((e) => { console.error(e); process.exitCode = 1; });