// Fase 2A.4B/4D — integración de COTIZACIONES_INVALIDAS_DEVUELTAS (VALIDACIONES → INVITACIONES).
// Usa el MUTATOR REAL (buildRetornoInvalidasDomainMutator) sobre el mock transaccional.
// Casos: 1 destino INVITACIONES, 9 un evento, 10 un historial, 16 payload una vez,
// 21-26 metadata, 4D solicitud pasa a PUBLICADA con contador conservado.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { createDbMock } from './workflowTestDbMock.mjs';
import { buildRetornoInvalidasDomainMutator } from '../server/lib/workflow/validacionesAgregadas.js';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const KEY = 'req:3:all-invalid-return:SC8:c1:u7';
const ctx = () => ({
  expediente_id: 3, tipo_contratacion: 'BIEN', evento: 'COTIZACIONES_INVALIDAS_DEVUELTAS',
  idempotency_key: KEY, actor: { id: 7, rol: 'ANALISTA_VALIDACIONES' },
  domainMutator: buildRetornoInvalidasDomainMutator({ solicitudId: 99, usuario: 'ANALISTA_TEST' }),
});

async function run() {
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'VALIDACION_USUARIO', payloadInicial: '{}' });
  const c = mock.connect();
  await c.query('BEGIN');
  const r = await executeTransition(ctx(), FLAGS, c);
  await c.query('COMMIT'); c.release();
  assert(mock.row.estado_actual === 'INVITACIONES', '1. estado_actual = INVITACIONES');
  assert(mock.eventos.length === 1, '9. un workflow_eventos');
  assert(mock.movimientos === 1, '10. un historial_movimientos');
  assert(r.domain_results?.no_aptas === 2 && r.domain_results?.reinvitacion_creada === false, '21-26. metadata correcta');
  const payload = JSON.parse(mock.row.payload || '{}');
  assert(payload.historial_validaciones?.length === 1 && payload.historial_invitaciones?.length === 1, '16. payload actualizado una sola vez');

  // Fase 2A.4D — compatibilidad de solicitud: pasa a PUBLICADA, contador conservado.
  assert(mock.solicitud.estado === 'PUBLICADA', '4D1. solicitud pasa a PUBLICADA');
  assert(mock.solicitud.contador_envios === 2, '4D2. contador_envios se conserva (2)');
  assert(r.domain_results?.solicitud_estado === 'PUBLICADA', '4D3. metadata solicitud_estado = PUBLICADA');
  assert(r.domain_results?.solicitud_reabierta === true, '4D4. metadata solicitud_reabierta = true');
  assert(r.domain_results?.contador_envios_conservado === 2, '4D5. metadata contador_envios_conservado = 2');
  assert(mock.solicitud.fecha_publicacion === '2026-07-01T12:00:00.000Z', '4D6. fecha_publicacion conservada');
  assert(mock.solicitud.cotizaciones_fin === '2026-07-20T12:00:00.000Z', '4D7. cronograma conservado');
}

run().then(() => summarize('test-workflow-validaciones-devolucion-integracion')).catch((e) => { console.error(e); process.exitCode = 1; });