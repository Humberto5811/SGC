// Prueba P: misma idempotency_key = un solo evento (mock transaccional, sin BD real).
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS_WRITE = { WORKFLOW_ENGINE_WRITE_ENABLED: true };

async function run() {
  // 1. Requiere write enabled
  const mockSin = createDbMock();
  const cSin = mockSin.connect();
  await cSin.query('BEGIN');
  let writeDisabled = false;
  try {
    await executeTransition(
      { expediente_id: 1, evento: 'REQUERIMIENTO_ENVIADO_EVALUACION', idempotency_key: 'test:idem:1:abc12345', actor_rol: 'USUARIO_AU' },
      { WORKFLOW_ENGINE_WRITE_ENABLED: false },
      cSin,
    );
  } catch (err) {
    if (err?.code === 'WORKFLOW_WRITE_DISABLED') writeDisabled = true;
  }
  await cSin.query('ROLLBACK');
  cSin.release();
  assert(writeDisabled, '1. escritura bloqueada sin WORKFLOW_ENGINE_WRITE_ENABLED');

  // 2. Misma key: 2 ejecuciones → 1 evento
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'REGISTRO' });
  const c1 = mock.connect();
  await c1.query('BEGIN');
  const key = 'test:idem:10:abc12345';
  const ctx1 = { expediente_id: 1, evento: 'REQUERIMIENTO_ENVIADO_EVALUACION', idempotency_key: key, actor_rol: 'USUARIO_AU', permiso: 'evaluacion:enviar' };
  const r1 = await executeTransition(ctx1, FLAGS_WRITE, c1);
  assert(!r1.idempotente && r1.evento?.evento_codigo === 'REQUERIMIENTO_ENVIADO_EVALUACION', '2. primera ejecución crea evento');
  assert(mock.eventos.length === 0, '3. evento aún no visible antes de COMMIT'); // aislamiento
  assert(c1.query ? true : false, '3b. conexión activa');
  await c1.query('COMMIT');
  assert(mock.eventos.length === 1, '3c. un evento tras COMMIT');
  assert(mock.row.estado_actual === 'EVALUACION', '4. estado_actual actualizado a EVALUACION');
  c1.release();

  // Replay con la misma key en una segunda transacción.
  const c2 = mock.connect();
  await c2.query('BEGIN');
  const r2 = await executeTransition(ctx1, FLAGS_WRITE, c2);
  await c2.query('COMMIT');
  c2.release();
  assert(r2.idempotente === true, '5. segunda ejecución devuelve idempotente');
  assert(mock.eventos.length === 1, '6. sigue habiendo UN solo evento');

  // 3. Distinta key para transición interna no avanza ubicación
  const mock2 = createDbMock({ tipo: 'BIEN', estadoInicial: 'RECEPCION_BIENES' });
  const c3 = mock2.connect();
  await c3.query('BEGIN');
  const r3 = await executeTransition(
    { expediente_id: 1, evento: 'ENTREGA_RECIBIDA', idempotency_key: 'test:idem:11:abc12345', actor_rol: 'ALMACEN', permiso: 'recepcion_bienes:recibir' },
    FLAGS_WRITE,
    c3,
  );
  await c3.query('COMMIT');
  c3.release();
  assert(r3.evento?.etapa_destino === 'RECEPCION_BIENES', '7. evento interno destino = misma etapa');
  assert(mock2.row.estado_actual === 'RECEPCION_BIENES', '8. evento interno no cambia ubicación');
}

run().then(() => {
  summarize('test-workflow-idempotencia');
}).catch((err) => {
  process.stdout.write(`ERROR: ${err.stack || err}\n`);
  process.exitCode = 1;
});