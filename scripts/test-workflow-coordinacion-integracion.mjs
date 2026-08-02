// Fase 1B — COORDINACION_CM_APROBADA (COORDINACION_CM → INVITACIONES).
// Casos: K flag off legacy; L flag on + write off 503; M destino INVITACIONES;
// N no crea solicitud; O no envía invitaciones; U un solo movimiento.
// SIN tocar BD real: mock.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };

async function run() {
  // M — COORDINACION_CM_APROBADA → INVITACIONES (motor, mock).
  const mockM = createDbMock({ tipo: 'BIEN', estadoInicial: 'ACTOS_PREPARATORIOS', payloadInicial: '{"historial_actos":[],"historial_invitaciones":[]}' });
  const cM = mockM.connect();
  await cM.query('BEGIN');
  const rM = await executeTransition({
    expediente_id: 1, tipo_contratacion: 'BIEN', evento: 'COORDINACION_CM_APROBADA',
    idempotency_key: 'req:1:COORDINACION_CM_APROBADA:m1', actor: { id: 7, rol: 'COORDINADOR_CM' },
    responsable_destino: 'Especialista Contrataciones',
  }, FLAGS, cM);
  await cM.query('COMMIT');
  cM.release();
  assert(rM.evento?.etapa_destino === 'INVITACIONES', 'M1. destino INVITACIONES');
  assert(mockM.row.estado_actual === 'INVITACIONES', 'M2. estado_actual = INVITACIONES');
  assert(mockM.movimientos === 1, 'U. un solo historial_movimientos');

  // K — flag off → legacy exacto.
  const reqStub = { user: { id: 7, rol: 'COORDINADOR_CM' }, body: { tipo_contratacion: 'BIEN' } };
  let legacyK = false;
  const resK = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_COORDINACION_CM', eventoCodigo: 'COORDINACION_CM_APROBADA', expedienteId: 1, req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_COORDINACION_CM: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    legacyHandler: async () => { legacyK = true; return { ok: true, requerimiento: { id: 1, estado_actual: 'INVITACIONES' } }; },
  });
  assert(legacyK && resK.ok === true, 'K. flag off → legacy exacto');

  // L — flag on + write off → 503.
  let errL = null;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_COORDINACION_CM', eventoCodigo: 'COORDINACION_CM_APROBADA', expedienteId: 1, req: reqStub,
      flagsOverride: { WORKFLOW_ENGINE_COORDINACION_CM: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      legacyHandler: async () => ({ ok: true }),
    });
  } catch (e) { errL = e; }
  assert(errL?.status === 503 || errL?.code === 'WORKFLOW_WRITE_DISABLED', 'L. flag on + write off → 503');

  // N — llegada a INVITACIONES no crea solicitud de cotización (sin tablas hijas; solo ubicación + payload compat).
  const payloadN = JSON.parse(mockM.row.payload || '{}');
  assert(!payloadN.solicitud_cotizacion && !payloadN.solicitudes_cotizacion, 'N. no crea solicitud de cotización');
  assert(!mockM.solicitudes && !mockM.invitaciones, 'O. no crea invitaciones de proveedor');
}

run().then(() => summarize('test-workflow-coordinacion-integracion')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });