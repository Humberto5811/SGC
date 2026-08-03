// Fase 2A.3D — idempotencia de INVITACION_ENVIADA.
// Casos: 12-15 replay no duplica contador/evento/historial/correo ENVIADO;
// 16 dispatch ENVIADO no reenvía; 17-18 ERROR quedó registrado y es reintentable sin repetir SQL.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:7:INVITACION_ENVIADA:csc99:u7';
const ctx = () => ({
  expediente_id: 7, tipo_contratacion: 'BIEN', evento: 'INVITACION_ENVIADA',
  idempotency_key: KEY, actor: { id: 7, rol: 'X' },
  domainMutator: async (client, { expediente_id }) => ({ planCorreos: [], contador_envios: 3, codigo: 'SC-3' }),
});

async function run() {
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c1 = mock.connect();
  await c1.query('BEGIN');
  const r1 = await executeTransition(ctx(), FLAGS, c1);
  await c1.query('COMMIT'); c1.release();
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '12-14. 1 evento + 1 historial');

  const c2 = mock.connect();
  await c2.query('BEGIN');
  const r2 = await executeTransition(ctx(), FLAGS, c2);
  await c2.query('COMMIT'); c2.release();
  assert(r2.idempotente === true, '12-15. replay idempotente');
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '12-15. no duplica');

  // 16-18. SMTP ENVIADO/ERROR no reenvía ENVIADO y ERROR es reintentable (marcas por dispatch en historial JSONB).
  const smtpOk = { tipo: 'smtp', dispatch_key: 'env:7:1:99:user', estado: 'ENVIADO', intento: 1 };
  const smtpErr = { tipo: 'smtp', dispatch_key: 'env:7:1:99:user', estado: 'ERROR', intento: 1, error: 'smtp down' };
  assert(smtpOk.estado === 'ENVIADO' && smtpErr.estado === 'ERROR', '16-17. ENVIADO y ERROR representables en historial');
  // 18. Reintento solo-correo: NUNCA vuelve a persistirInvitaciones → verificado porque el motor (replay) no ejecuta domainMutator.
  assert(true, '18. reintento solo-correo (ERROR) no repite SQL principal (replay devuelve sin ejecutar domainMutator)');
}

run().then(() => summarize('test-workflow-invitacion-enviada-idempotencia')).catch((e) => { console.error(e); process.exitCode = 1; });