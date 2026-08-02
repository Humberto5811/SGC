// Fase 2A.3D — INVITACION_ENVIADA (integrado en endpoint /enviar).
// Casos: 1 permanece INVITACIONES; 2 flag off legacy; 9 un evento; 10 un historial;
// 11 contador una vez; 12-15 replay idempotente no duplica.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:7:INVITACION_ENVIADA:csc99:u7';

const ctx = () => ({
  expediente_id: 7, tipo_contratacion: 'BIEN', evento: 'INVITACION_ENVIADA',
  idempotency_key: KEY, actor: { id: 7, rol: 'ESPECIALISTA_CONTRATACIONES' },
  domainMutator: async (client, { expediente_id }) => ({
    planCorreos: [{ id: 1, dispatch_key: 'env:7:1:99:user', ruc: '20100070970', correos: ['c@x.pe'] }],
    contador_envios: 1, codigo: 'SC-00001-2026-INS',
  }),
});

async function run() {
  // 1, 9, 10, 11 — permanece INVITACIONES, 1 evento, 1 historial, contador 1.
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c = mock.connect();
  await c.query('BEGIN');
  const r = await executeTransition(ctx(), FLAGS, c);
  await c.query('COMMIT'); c.release();
  assert(mock.row.estado_actual === 'INVITACIONES', '1. permanece INVITACIONES');
  assert(mock.eventos.length === 1, '9. un workflow_eventos');
  assert(mock.movimientos === 1, '10. un historial_movimientos');
  assert(r.domain_results?.contador_envios === 1, '11. contador_envios una vez');

  // 12-15 — replay con misma key no duplica.
  const c2 = mock.connect();
  await c2.query('BEGIN');
  const r2 = await executeTransition(ctx(), FLAGS, c2);
  await c2.query('COMMIT'); c2.release();
  assert(r2.idempotente === true, '12-15. replay idempotente');
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '12-15. sin duplicar evento/historial');

  // 2 — flag off → legacy exacto.
  let legacy = false;
  const res = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES', eventoCodigo: 'INVITACION_ENVIADA', expedienteId: 7,
    req: { user: { id: 7, rol: 'X' }, body: { solicitud_id: 99, tipo_contratacion: 'BIEN' } },
    flagsOverride: { WORKFLOW_ENGINE_INVITACIONES: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
    afterCommit: async () => { throw new Error('NO debe ejecutarse'); },
    legacyHandler: async () => { legacy = true; return { ok: true, enviados: [], total: 0, contador_envios: 0, mensaje: '' }; },
  });
  assert(legacy && res.ok === true, '2. flag off → legacy exacto');
}

run().then(() => summarize('test-workflow-invitacion-enviada-integracion')).catch((e) => { console.error(e); process.exitCode = 1; });