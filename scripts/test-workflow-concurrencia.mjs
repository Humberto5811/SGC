// Prueba Q: concurrencia controlada con SELECT FOR UPDATE (mock transaccional).
// Dos ejecuciones concurrentes con la MISMA idempotency_key → UN solo evento.
//
// El mock emula el aislamiento READ COMMITTED + bloqueo de fila de PostgreSQL:
// - B se bloquea en SELECT FOR UPDATE hasta que A hace COMMIT;
// - tras el COMMIT de A, B lee la fila y el workflow_eventos ya confirmados;
// - B devuelve idempotente=true sin insertar un segundo evento.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS_WRITE = { WORKFLOW_ENGINE_WRITE_ENABLED: true };

async function run() {
  // 1. Dos transacciones concurrentes, misma key → 1 evento.
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'REGISTRO' });
  const clientA = mock.connect();
  const clientB = mock.connect();
  await clientA.query('BEGIN');
  await clientB.query('BEGIN');

  const key = 'test:conc:1:abc12345';
  const ctx = {
    expediente_id: 1,
    evento: 'REQUERIMIENTO_ENVIADO_EVALUACION',
    idempotency_key: key,
    actor_rol: 'USUARIO_AU',
    permiso: 'evaluacion:enviar',
  };

  // A inicia y adquiere el lock en su SELECT FOR UPDATE; aún NO commitea.
  const pA = executeTransition(ctx, FLAGS_WRITE, clientA);
  // Deja que la cadena de microtareas de A llegue al FOR UPDATE (FIFO) antes de crear B.
  await Promise.resolve();
  // B inicia y se bloquea en su SELECT FOR UPDATE esperando el lock de A.
  const pB = executeTransition(ctx, FLAGS_WRITE, clientB);

  const r1 = await pA; // A termina su fn (registró el evento en su buffer local, sin commit).
  await clientA.query('COMMIT'); // Publica fila + evento y libera el lock.
  const r2 = await pB; // B se desbloquea, lee el evento ya confirmado → idempotente.
  await clientB.query('COMMIT'); // B no registró nada; commit de higiene.
  clientA.release();
  clientB.release();

  assert(r1.evento?.evento_codigo === 'REQUERIMIENTO_ENVIADO_EVALUACION', '1. A crea el evento');
  assert(r2.idempotente === true, '2. B devuelve idempotente (misma key)');
  assert(mock.eventos.length === 1, '3. un solo workflow_eventos registrado pese a 2 concurrentes');

  // 2. Transición sucesiva válida: la etapa avanza correctamente.
  const mock2 = createDbMock({ tipo: 'BIEN', estadoInicial: 'EVALUACION' });
  const c2 = mock2.connect();
  await c2.query('BEGIN');
  const r3 = await executeTransition(
    { expediente_id: 1, evento: 'EVALUACION_APROBADA', idempotency_key: 'test:conc:2:abc12345', actor_rol: 'DIRECTOR_GERENTE', permiso: 'evaluacion:aprobar' },
    FLAGS_WRITE,
    c2,
  );
  await c2.query('COMMIT');
  c2.release();
  assert(r3.evento?.etapa_destino === 'DEC', '4. EVALUACION aprobada → DEC');
  assert(mock2.row.estado_actual === 'DEC', '5. estado_actual = DEC tras COMMIT');

  // 3. Transición no válida desde la etapa: bloqueada.
  const mock3 = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC' });
  const c3 = mock3.connect();
  await c3.query('BEGIN');
  let fallo = false;
  try {
    await executeTransition(
      { expediente_id: 1, evento: 'EVALUACION_APROBADA', idempotency_key: 'test:conc:3:otrakey', actor_rol: 'DIRECTOR_GERENTE', permiso: 'evaluacion:aprobar' },
      FLAGS_WRITE,
      c3,
    );
    await c3.query('COMMIT');
  } catch (err) {
    await c3.query('ROLLBACK');
    if (err?.code === 'TRANSITION_NOT_FOUND') fallo = true;
  }
  c3.release();
  assert(fallo === true, '6. transición no válida desde etapa DEC bloqueada');
}

run().then(() => {
  summarize('test-workflow-concurrencia');
}).catch((err) => {
  process.stdout.write(`ERROR: ${err.stack || err}\n`);
  process.exitCode = 1;
});