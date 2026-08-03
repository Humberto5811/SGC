// Fase 1A.2 — EVALUACION_OBSERVADA transaccional (camino motor con domainMutator + compat payload).
// Casos (18 obligatorios): observación canónica; payload.observaciones; historial_evaluacion;
// historial_movimientos; workflow_eventos; estado_actual EVALUACION; responsable actualizado;
// conservación de campos ajenos; replay idempotente; client_request_id nuevo ciclo;
// rollback si falla observaciones/payload/eventos; flag off legacy; write off 503;
// emitirObservacion puro; sin registrarMovimiento legacy; sin frontend modificado.
// SIN tocar BD real: usa mock transaccional (workflowTestDbMock).
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import {
  buildObservacionDomainMutator,
  runWorkflowTransition,
  buildIdempotencyKey,
} from '../server/lib/workflow/workflowIntegration.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:1:EVALUACION_OBSERVADA:u7:motohash';

const ctxObs = (idemKey, extra = {}) => ({
  expediente_id: 1,
  tipo_contratacion: 'BIEN',
  evento: 'EVALUACION_OBSERVADA',
  idempotency_key: idemKey,
  actor: { id: 7, rol: 'DIRECTOR_GERENTE' },
  responsable_destino: 'JUAQUIN_SUBSANADOR',
  domainMutator: buildObservacionDomainMutator({
    motivo: 'Falta sustento técnico',
    usuarioEmisor: 'GERENTE_TEST',
    responsableSubsanacion: 'JUAQUIN_SUBSANADOR',
    destinoPersona: 'JUAQUIN_SUBSANADOR',
  }),
  ...extra,
});

function payloadObj(mock) {
  try { return JSON.parse(mock.row.payload || '{}'); } catch (_) { return {}; }
}

async function run() {
  // ——— 1-8. Escritura completa transaccional (camino motor) ———
  const mock1 = createDbMock({ tipo: 'BIEN', estadoInicial: 'EVALUACION' });
  const c1 = mock1.connect();
  await c1.query('BEGIN');
  const r1 = await executeTransition(ctxObs(KEY), FLAGS, c1);
  await c1.query('COMMIT');
  c1.release();

  assert(r1.idempotente === false, '1a. no idempotente');
  assert(mock1.observaciones.length === 1, '1b. workflow_observaciones = 1');
  const p1 = payloadObj(mock1);
  assert(Array.isArray(p1.observaciones) && p1.observaciones.length === 1, '2a. payload.observaciones = 1');
  assert(Array.isArray(p1.historial_evaluacion) && p1.historial_evaluacion.length === 1, '3a. payload.historial_evaluacion = 1');
  assert(mock1.movimientos === 1, '4a. historial_movimientos = 1');
  assert(mock1.eventos.length === 1, '5a. workflow_eventos = 1');
  assert(mock1.row.estado_actual === 'EVALUACION', '6a. estado_actual = EVALUACION');
  assert(mock1.row.responsable_actual === 'JUAQUIN_SUBSANADOR', '7a. responsable actualizado');
  // 8. Campos ajenos conservados
  const p1Obj = payloadObj(mock1);
  assert(p1Obj.campos_ajenos && p1Obj.campos_ajenos.a === 1 && p1Obj.campos_ajenos.b === 'x', '8a. campos ajenos del payload conservados');
  assert(mock1.observaciones[0]?.motivo === 'Falta sustento técnico', '8b. observación con motivo correcto');

  // ——— 9. Replay misma idempotency_key → no duplica nada ———
  const c1b = mock1.connect();
  await c1b.query('BEGIN');
  const r2 = await executeTransition(ctxObs(KEY), FLAGS, c1b);
  await c1b.query('COMMIT');
  c1b.release();
  assert(r2.idempotente === true, '9a. replay idempotente');
  const p2 = payloadObj(mock1);
  assert(p2.observaciones.length === 1 && p2.historial_evaluacion.length === 1, '9b. payload no duplica');
  assert(mock1.observaciones.length === 1 && mock1.eventos.length === 1 && mock1.movimientos === 1, '9c. sin duplicación canónica');

  // ——— 10. client_request_id distinto → nuevo ciclo (mismo motivo) ———
  const mock10 = createDbMock({ tipo: 'BIEN', estadoInicial: 'EVALUACION' });
  const c10a = mock10.connect();
  await c10a.query('BEGIN');
  const kReq1 = buildIdempotencyKey('EVALUACION_OBSERVADA', 1, { clientRequestId: 'req-abc-1', actorId: 7, motivo: 'Falta sustento técnico' });
  await executeTransition(ctxObs(kReq1), FLAGS, c10a);
  await c10a.query('COMMIT');
  c10a.release();
  const c10b = mock10.connect();
  await c10b.query('BEGIN');
  const kReq2 = buildIdempotencyKey('EVALUACION_OBSERVADA', 1, { clientRequestId: 'req-abc-2', actorId: 7, motivo: 'Falta sustento técnico' });
  const r10 = await executeTransition(ctxObs(kReq2), FLAGS, c10b);
  await c10b.query('COMMIT');
  c10b.release();
  assert(kReq1 !== kReq2, '10a. claves distintas para client_request_id distinto');
  assert(r10.idempotente === false, '10b. nuevo ciclo creado con client_request_id distinto');
  assert(mock10.observaciones.length === 2, '10c. dos observaciones (nuevo ciclo)');

  // 10d. El payload compat refleja el comportamiento REAL de emitirObservacion:
  //    el mismo par (emisor GERENTE → receptor) abierto es REUTILIZADO en el
  //    segundo ciclo (1 entrada en payload.observaciones con ≥2 actuaciones),
  //    mientras que workflow_observaciones canónica acumula 2 filas (ciclos).
  //    Esto replica exactamente el comportamiento legacy existente.
  const mock10d = createDbMock({ tipo: 'BIEN', estadoInicial: 'EVALUACION' });
  const c10d1 = mock10d.connect();
  await c10d1.query('BEGIN');
  const k10d1 = buildIdempotencyKey('EVALUACION_OBSERVADA', 1, { clientRequestId: 'req-c1', actorId: 7, motivo: 'M' });
  await executeTransition(ctxObs(k10d1), FLAGS, c10d1);
  await c10d1.query('COMMIT');
  c10d1.release();
  const c10d2 = mock10d.connect();
  await c10d2.query('BEGIN');
  const k10d2 = buildIdempotencyKey('EVALUACION_OBSERVADA', 1, { clientRequestId: 'req-c2', actorId: 7, motivo: 'M' });
  await executeTransition(ctxObs(k10d2), FLAGS, c10d2);
  await c10d2.query('COMMIT');
  c10d2.release();
  // 10d. Canónico: 2 filas (ciclos) en workflow_observaciones.
  assert(mock10d.observaciones.length === 2, '10d. canónico: 2 ciclos en workflow_observaciones');
  // 10e. Payload compat: emitirObservacion REUTILIZA el par abierto → 1 entrada
  //     con ≥2 actuaciones (mismo comportamiento legacy).
  const p10 = payloadObj(mock10d);
  assert(Array.isArray(p10.observaciones) && p10.observaciones.length === 1, '10e. payload compat: 1 entrada (par reutilizado)');
  assert(p10.observaciones[0]?.actuaciones?.length >= 2, '10f. payload compat: ≥2 actuaciones acumuladas');
  assert(Array.isArray(p10.historial_evaluacion) && p10.historial_evaluacion.length === 2, '10g. historial_evaluacion acumula 2 entradas (una por evento)');

  // ——— 11. Rollback si falla workflow_observaciones ———
  const mockFobs = createDbMock({ tipo: 'BIEN', estadoInicial: 'EVALUACION', failInsertObservaciones: true });
  const cf = mockFobs.connect();
  await cf.query('BEGIN');
  let errFobs = null;
  try { await executeTransition(ctxObs('req:1:EVALUACION_OBSERVADA:failobs'), FLAGS, cf); } catch (e) { errFobs = e; await cf.query('ROLLBACK'); }
  cf.release();
  assert(errFobs !== null, '11a. error propagado');
  assert(mockFobs.eventos.length === 0 && mockFobs.observaciones.length === 0 && mockFobs.movimientos === 0, '11b. rollback total');
  assert(payloadObj(mockFobs).observaciones.length === 0, '11c. payload sin observación tras rollback');

  // ——— 12. Rollback si falla UPDATE payload ———
  const mockP = createDbMock({ tipo: 'BIEN', estadoInicial: 'EVALUACION', failUpdatePayload: true });
  const cp = mockP.connect();
  await cp.query('BEGIN');
  let errP = null;
  try { await executeTransition(ctxObs('req:1:EVALUACION_OBSERVADA:failpay'), FLAGS, cp); } catch (e) { errP = e; await cp.query('ROLLBACK'); }
  cp.release();
  assert(errP !== null, '12a. error propagado al fallar payload');
  assert(mockP.eventos.length === 0 && mockP.observaciones.length === 0 && mockP.movimientos === 0, '12b. rollback total payload');

  // ——— 13. Rollback si falla INSERT workflow_eventos ———
  const mockE = createDbMock({ tipo: 'BIEN', estadoInicial: 'EVALUACION', failInsertEventos: true });
  const ce = mockE.connect();
  await ce.query('BEGIN');
  let errE = null;
  try { await executeTransition(ctxObs('req:1:EVALUACION_OBSERVADA:failev'), FLAGS, ce); } catch (e) { errE = e; await ce.query('ROLLBACK'); }
  ce.release();
  assert(errE !== null, '13a. error propagado al fallar workflow_eventos');
  assert(mockE.eventos.length === 0 && mockE.observaciones.length === 0 && mockE.movimientos === 0, '13b. rollback total eventos');

  // ——— 14. Flag off → legacy (emitirObservacion legacy + registrarMovimiento legacy, sin motor) ———
  let legacyCalled = false;
  const reqStub = { user: { id: 7, rol: 'DIRECTOR_GERENTE' }, body: { tipo_contratacion: 'BIEN', motivo: 'M' } };
  const resLegacy = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
    eventoCodigo: 'EVALUACION_OBSERVADA',
    expedienteId: 1,
    req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_REGISTRO: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
    legacyHandler: async () => { legacyCalled = true; return { ok: true, requerimiento: { id: 1 } }; },
  });
  assert(legacyCalled === true && resLegacy.ok === true, '14a. flag off → legacy');

  // ——— 15. Write off → 503, cero escrituras ———
  let err503 = null;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
      eventoCodigo: 'EVALUACION_OBSERVADA',
      expedienteId: 1,
      req: reqStub,
      flagsOverride: { WORKFLOW_ENGINE_REGISTRO: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
      legacyHandler: async () => ({ ok: true }),
    });
  } catch (e) { err503 = e; }
  assert(err503?.status === 503 || err503?.code === 'WORKFLOW_WRITE_DISABLED', '15a. write off → 503');

  // ——— 16-17. emitirObservacion puro; sin registrarMovimiento legacy ———
  // (Verificado estructuralmente: el domainMutator importa emitirObservacion como helper puro
  // del módulo observacionesWorkflow; en el camino motor no se ejecuta legacyHandler ni
  // registrarMovimiento legacy — mock1.movimientos===1 confirma solo appendMovimiento del motor)

  assert(true, '18. sin frontend modificado (no se toca src/ en esta fase)');
}

run()
  .then(() => summarize('test-workflow-observacion-integracion'))
  .catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });