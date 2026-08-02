// Fase 2A.4B — idempotencia de COTIZACIONES_INVALIDAS_DEVUELTAS.
// Casos: 27 replay no duplica evento; 28 no duplica historial; 29 no duplica payload.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:3:all-invalid-return:SC8:c1:u7';
const ctx = () => ({
  expediente_id: 3, tipo_contratacion: 'BIEN', evento: 'COTIZACIONES_INVALIDAS_DEVUELTAS',
  idempotency_key: KEY, actor: { id: 7, rol: 'ANALISTA_VALIDACIONES' },
  domainMutator: async (client, { expediente_id, row }) => {
    // El mutator real (validacionesAgregadas) actualiza payload; aquí lo replicamos para que
    // una segura lectura NO duplique al replay (el motor no ejecuta domainMutator en replay).
    const payload = { ...(JSON.parse(row?.payload || '{}')) };
    payload.historial_validaciones = payload.historial_validaciones || [];
    payload.historial_invitaciones = payload.historial_invitaciones || [];
    payload.historial_validaciones.push({ tipo: 'todas_no_aptas', fecha: new Date().toISOString() });
    payload.historial_invitaciones.push({ tipo: 'retorno_desde_validaciones', fecha: new Date().toISOString() });
    await client.query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [expediente_id, JSON.stringify(payload)]);
    return { retorno_invitaciones: true, reinvitacion_creada: false };
  },
});

async function run() {
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'VALIDACION_USUARIO', payloadInicial: '{}' });
  const c1 = mock.connect();
  await c1.query('BEGIN');
  const r1 = await executeTransition(ctx(), FLAGS, c1);
  await c1.query('COMMIT'); c1.release();
  assert(r1.idempotente === false && mock.eventos.length === 1 && mock.movimientos === 1, '27-28. creación 1 evento+1 historial');

  // Replay con misma key → idempotente; domainMutator NO se ejecuta → payload no duplica.
  const c2 = mock.connect();
  await c2.query('BEGIN');
  const r2 = await executeTransition(ctx(), FLAGS, c2);
  await c2.query('COMMIT'); c2.release();
  assert(r2.idempotente === true, '27b. replay idempotente');
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '28b. sin duplicar evento/historial');
  const payload = JSON.parse(mock.row.payload || '{}');
  assert(payload.historial_validaciones?.length === 1 && payload.historial_invitaciones?.length === 1, '29. payload no duplica');
}

run().then(() => summarize('test-workflow-validaciones-devolucion-idempotencia')).catch((e) => { console.error(e); process.exitCode = 1; });