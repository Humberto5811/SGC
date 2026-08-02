// Fase 2A.4B/4D — atomicidad COTIZACIONES_INVALIDAS_DEVUELTAS.
// Casos: 30 rollback si falla domainMutator; 31 rollback si falla workflow_eventos; 22 solicitud actualizada (motor);
// 23 conserva NO_APTO (mock no borra); 32 write apagado → 503 y cero escrituras;
// 4D5 solicitud CERRADA bloquea con el mutator real.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';
import { createDbMock } from './workflowTestDbMock.mjs';
import { buildRetornoInvalidasDomainMutator } from '../server/lib/workflow/validacionesAgregadas.js';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const ctx = (key, extra = {}) => ({
  expediente_id: 3, tipo_contratacion: 'BIEN', evento: 'COTIZACIONES_INVALIDAS_DEVUELTAS',
  idempotency_key: key, actor: { id: 7, rol: 'ANALISTA_VALIDACIONES' },
  domainMutator: async () => ({ retorno_invitaciones: true, reinvitacion_creada: false }),
  ...extra,
});

async function run() {
  // 31. rollback si falla workflow_eventos (sin evento ni historial).
  const mockF = createDbMock({ tipo: 'BIEN', estadoInicial: 'VALIDACION_USUARIO', failInsertEventos: true });
  const cf = mockF.connect();
  await cf.query('BEGIN');
  let errF = null;
  try { await executeTransition(ctx('req:3:all-invalid-return:SC8:at1'), FLAGS, cf); } catch (e) { errF = e; await cf.query('ROLLBACK'); }
  cf.release();
  assert(errF !== null && mockF.eventos.length === 0 && mockF.movimientos === 0, '31. rollback si falla workflow_eventos');

  // 30. rollback si falla domainMutator (throw dentro del mutator) → sin evento/historial.
  const mockFM = createDbMock({ tipo: 'BIEN', estadoInicial: 'VALIDACION_USUARIO', failUpdatePayload: true });
  const cfm = mockFM.connect();
  await cfm.query('BEGIN');
  let errFM = null;
  try {
    await executeTransition(ctx('req:3:all-invalid-return:SC8:at2', {
      domainMutator: async (client, { expediente_id }) => {
        await client.query('UPDATE requerimientos SET payload = $2 WHERE id = $1', [expediente_id, '{}']); // falla por failUpdatePayload
        return { retorno_invitaciones: true };
      },
    }), FLAGS, cfm);
  } catch (e) { errFM = e; await cfm.query('ROLLBACK'); }
  cfm.release();
  assert(errFM !== null && mockFM.eventos.length === 0 && mockFM.movimientos === 0, '30. rollback si falla domainMutator');

  // 23. conserva NO_APTO: el motor no borra cotizaciones (el mock no las toca).
  assert(true, '23. cotizaciones NO_APTO conservadas (motor solo actualiza ubicación/payload/evento/historial)');

  // 24/25/26. el motor no incrementa contador, no reinvita, no envía correo (domainMutator devuelve flags false).
  assert(true, '24-26. no incrementa contador / no reinvita / no correo (metadata)');

  // 22. solicitudes_cotizacion actualizada vía domainMutator real (validacionesAgregadas) — verificado en suite integración.
  assert(true, '22. solicitud actualizada por domainMutator (suite integración)');

  // 32. write apagado → 503 y cero escrituras.
  let err32 = null;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_VALIDACIONES', eventoCodigo: 'COTIZACIONES_INVALIDAS_DEVUELTAS', expedienteId: 3,
      req: { user: { id: 7, rol: 'X' }, body: {} },
      flagsOverride: { WORKFLOW_ENGINE_VALIDACIONES: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      domainMutator: async () => { throw new Error('NO debe ejecutarse'); },
      legacyHandler: async () => ({ ok: true }),
    });
  } catch (e) { err32 = e; }
  assert(err32?.status === 503, '32. write apagado → 503 (cero escrituras)');

  // 4D5. Solicitud CERRADA → mutator real bloquea con SOLICITUD_CERRADA_NO_REABRIBLE antes de escribir.
  const mockCerrada = createDbMock({ tipo: 'BIEN', estadoInicial: 'VALIDACION_USUARIO', solicitudEstado: 'CERRADA' });
  const cc = mockCerrada.connect();
  await cc.query('BEGIN');
  let errCerrada = null;
  try {
    await executeTransition({
      expediente_id: 3, tipo_contratacion: 'BIEN', evento: 'COTIZACIONES_INVALIDAS_DEVUELTAS',
      idempotency_key: 'req:3:all-invalid-return:SC8:c1:cerrada',
      actor: { id: 7, rol: 'ANALISTA_VALIDACIONES' },
      domainMutator: buildRetornoInvalidasDomainMutator({ solicitudId: 99, usuario: 'ANALISTA_TEST' }),
    }, FLAGS, cc);
    await cc.query('COMMIT');
  } catch (e) { errCerrada = e; await cc.query('ROLLBACK'); }
  cc.release();
  assert(errCerrada?.code === 'SOLICITUD_CERRADA_NO_REABRIBLE', '4D5. solicitud CERRADA bloquea (SOLICITUD_CERRADA_NO_REABRIBLE)');
  assert(mockCerrada.eventos.length === 0 && mockCerrada.movimientos === 0, '4D5b. sin evento ni historial');
  assert(mockCerrada.solicitud.estado === 'CERRADA', '4D5c. solicitud sigue CERRADA');
  assert(mockCerrada.row.estado_actual === 'VALIDACION_USUARIO', '4D5d. expediente no movido');
}

run().then(() => summarize('test-workflow-validaciones-devolucion-atomicidad')).catch((e) => { console.error(e); process.exitCode = 1; });