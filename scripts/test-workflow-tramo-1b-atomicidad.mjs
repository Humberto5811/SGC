// Fase 1B — atomicidad del tramo DEC/Programación/Coordinación CM.
// Casos: S rollback completo si falla domainMutator; U un solo historial_movimientos;
// T un solo workflow_eventos; ubicación sin evento nunca queda (rollback).
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };

const ctx = (evento, key, extra = {}) => ({
  expediente_id: 1, tipo_contratacion: 'BIEN', evento, idempotency_key: key,
  actor: { id: 7, rol: 'DEC' }, responsable_destino: 'X', ...extra,
});

async function run() {
  // S — rollback completo si falla domainMutator (DEC).
  const mockS = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC', failUpdatePayload: true });
  const cS = mockS.connect();
  await cS.query('BEGIN');
  let errS = null;
  try {
    await executeTransition({
      ...ctx('DEC_APROBADO', 'req:1:DEC_APROBADO:s1'),
      domainMutator: async () => { throw new Error('mutator fail'); },
      failUpdatePayload: true,
    }, FLAGS, cS);
  } catch (e) { errS = e; await cS.query('ROLLBACK'); }
  cS.release();
  assert(errS !== null, 'S1. error propagado');
  assert(mockS.eventos.length === 0 && mockS.movimientos === 0, 'S2. sin workflow_eventos ni historial tras rollback');
  assert(mockS.row.estado_actual === 'DEC', 'S3. estado_actual intacto tras rollback');

  // U/T — motor completo con domainMutator OK: 1 evento, 1 movimiento, estado actualizado.
  const mockT = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC', payloadInicial: '{"historial_dec":[]}' });
  const cT = mockT.connect();
  await cT.query('BEGIN');
  const rT = await executeTransition({
    ...ctx('DEC_APROBADO', 'req:1:DEC_APROBADO:t1'),
    domainMutator: async (client, { expediente_id, row }) => {
      const p = JSON.parse(row?.payload || '{}');
      if (!Array.isArray(p.historial_dec)) p.historial_dec = [];
      p.historial_dec.push({ tipo: 'aprobacion_dec', fecha: new Date().toISOString() });
      // Mismo SQL que buildTramo1bPayloadMutator de producción (el mock lo matchea).
      await client.query('UPDATE requerimientos SET payload = $2, updated_at = NOW() WHERE id = $1', [expediente_id, JSON.stringify(p)]);
      return { ok: true };
    },
  }, FLAGS, cT);
  await cT.query('COMMIT');
  cT.release();
  assert(rT.evento?.etapa_destino === 'PROGRAMACION', 'T1. destino PROGRAMACION');
  assert(mockT.eventos.length === 1, 'T. un solo workflow_eventos');
  assert(mockT.movimientos === 1, 'U. un solo historial_movimientos');
  assert(JSON.parse(mockT.row.payload).historial_dec.length === 1, 'U2. payload compat 1 entrada');

  // Ubicación sin evento nunca queda: si el INSERT de evento falla → rollback (estado_actual intacto).
  const mockE = createDbMock({ tipo: 'BIEN', estadoInicial: 'DEC', failInsertEventos: true });
  const cE = mockE.connect();
  await cE.query('BEGIN');
  let errE = null;
  try { await executeTransition(ctx('DEC_APROBADO', 'req:1:DEC_APROBADO:failEv'), FLAGS, cE); } catch (e) { errE = e; await cE.query('ROLLBACK'); }
  cE.release();
  assert(errE !== null, 'E1. error al fallar workflow_eventos');
  assert(mockE.row.estado_actual === 'DEC' && mockE.eventos.length === 0, 'E2. sin evento → estado_actual intacto (ubicación sin evento bloqueada)');
}

run().then(() => summarize('test-workflow-tramo-1b-atomicidad')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });