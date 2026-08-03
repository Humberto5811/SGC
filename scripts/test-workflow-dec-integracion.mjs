// Fase 1B — DEC_APROBADO (DEC → PROGRAMACION) con motor y legacy.
// Casos: A flag off legacy; B flag on + write off 503; C destino PROGRAMACION;
// D replay idempotente; E salto ilegal; P req.user; Q destino body ignorado; S rollback.
// SIN tocar BD real: mock transaccional.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { runWorkflowTransition, buildIdempotencyKey } from '../server/lib/workflow/workflowIntegration.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };

const ctxDec = (key, extra = {}) => ({
  expediente_id: 1,
  tipo_contratacion: 'BIEN',
  evento: 'DEC_APROBADO',
  idempotency_key: key,
  actor: { id: 7, rol: 'DEC' },
  responsable_destino: 'Programador',
  ...extra,
});

async function run() {
  // C — DEC_APROBADO → PROGRAMACION (motor, mock).
  const mockC = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC', payloadInicial: '{"historial_dec":[]}' });
  const cC = mockC.connect();
  await cC.query('BEGIN');
  const rC = await executeTransition(ctxDec('req:1:DEC_APROBADO:c1'), FLAGS, cC);
  await cC.query('COMMIT');
  cC.release();
  assert(rC.evento?.etapa_destino === 'PROGRAMACION', 'C1. DEC_APROBADO → PROGRAMACION');
  assert(mockC.row.estado_actual === 'PROGRAMACION', 'C2. estado_actual = PROGRAMACION');
  assert(mockC.eventos.length === 1, 'C3. un workflow_eventos');
  assert(mockC.movimientos === 1, 'C4. un historial_movimientos');

  // D — replay idempotente.
  const cD = mockC.connect();
  await cD.query('BEGIN');
  const rD = await executeTransition(ctxDec('req:1:DEC_APROBADO:c1'), FLAGS, cD);
  await cD.query('COMMIT');
  cD.release();
  assert(rD.idempotente === true, 'D1. replay idempotente');
  assert(mockC.eventos.length === 1, 'D2. sin duplicar evento');

  // E — salto ilegal (DEC no permite EVALUACION_APROBADA desde DEC).
  const mockE = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC' });
  const cE = mockE.connect();
  await cE.query('BEGIN');
  let errE = null;
  try { await executeTransition({ ...ctxDec('req:1:EVALUACION_APROBADA:e1'), evento: 'EVALUACION_APROBADA' }, FLAGS, cE); } catch (e) { errE = e; await cE.query('ROLLBACK'); }
  cE.release();
  assert(errE?.code === 'TRANSITION_NOT_FOUND', 'E1. salto ilegal bloqueado');

  // A — flag off → legacy.
  let legacyCalled = false;
  const reqStub = { user: { id: 7, rol: 'DEC' }, body: { tipo_contratacion: 'BIEN' } };
  const resA = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_DEC', eventoCodigo: 'DEC_APROBADO', expedienteId: 1, req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_DEC: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
    legacyHandler: async () => { legacyCalled = true; return { ok: true, requerimiento: { id: 1, estado: 'Aprobado DEC' } }; },
  });
  assert(legacyCalled && resA.ok === true, 'A. flag off → legacy exacto');

  // B — flag on + write off → 503.
  let errB = null;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_DEC', eventoCodigo: 'DEC_APROBADO', expedienteId: 1, req: reqStub,
      flagsOverride: { WORKFLOW_ENGINE_DEC: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      legacyHandler: async () => ({ ok: true }),
    });
  } catch (e) { errB = e; }
  assert(errB?.status === 503 || errB?.code === 'WORKFLOW_WRITE_DISABLED', 'B. flag on + write off → 503');

  // P — req.user gana sobre actor malicioso del body.
  const mockP = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC' });
  const cP = mockP.connect();
  await cP.query('BEGIN');
  const rP = await executeTransition({
    ...ctxDec('req:1:DEC_APROBADO:p1'), actor: { id: 999, rol: 'HACKER' }, user: { id: 7, rol: 'DEC' },
  }, FLAGS, cP);
  await cP.query('COMMIT');
  cP.release();
  assert(rP.evento?.evento_codigo === 'DEC_APROBADO' && rP.idempotente === false, 'P. req.user manda (actor body ignorado)');

  // Q — destino del body ignorado: motor usa la matriz (PROGRAMACION), no el campo.
  const mockQ = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC' });
  const cQ = mockQ.connect();
  await cQ.query('BEGIN');
  const rQ = await executeTransition({
    ...ctxDec('req:1:DEC_APROBADO:q1'), metadata: { etapa_destino: 'CCP' },
  }, FLAGS, cQ);
  await cQ.query('COMMIT');
  cQ.release();
  assert(rQ.evento?.etapa_destino === 'PROGRAMACION' && mockQ.row.estado_actual === 'PROGRAMACION', 'Q. destino del body ignorado');

  // S — rollback compleot si falla domainMutator (payload legacy).
  const mockS = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC', failUpdatePayload: true });
  const cS = mockS.connect();
  await cS.query('BEGIN');
  let errS = null;
  try {
    await executeTransition({
      ...ctxDec('req:1:DEC_APROBADO:s1'),
      domainMutator: async () => { throw new Error('mutator fail'); },
    }, FLAGS, cS);
  } catch (e) { errS = e; await cS.query('ROLLBACK'); }
  cS.release();
  assert(errS !== null && mockS.eventos.length === 0 && mockS.movimientos === 0, 'S. rollback completo si falla domainMutator');
}

run().then(() => summarize('test-workflow-dec-integracion')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });