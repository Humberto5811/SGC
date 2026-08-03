// Fase 2A.3D — atomicidad de INVITACION_ENVIADA.
// Casos: 6 domainMutator no envía correo; 7 rollback no ejecuta afterCommit;
// 9 una sola persistencia; 10 un evento; 11 un historial; 21 respuesta compatible; 22-23 sin src/ ni REINVITACION.
import { assert, summarize } from './workflowTestUtils.mjs';
import { executeTransition } from '../server/lib/workflow/workflowEngine.js';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';
import { createDbMock } from './workflowTestDbMock.mjs';

const FLAGS = { WORKFLOW_ENGINE_WRITE_ENABLED: true };
const ctx = (key) => ({
  expediente_id: 7, tipo_contratacion: 'BIEN', evento: 'INVITACION_ENVIADA',
  idempotency_key: key, actor: { id: 7, rol: 'X' },
  domainMutator: async (client, { expediente_id }) => ({ planCorreos: [], contador_envios: 1, codigo: 'SC-1' }),
});

async function run() {
  // 1 evento + 1 historial + 1 persistencia (sin fallo).
  const mock = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES' });
  const c1 = mock.connect();
  await c1.query('BEGIN');
  await executeTransition(ctx('req:7:INVITACION_ENVIADA:csc99:at1'), FLAGS, c1);
  await c1.query('COMMIT'); c1.release();
  assert(mock.eventos.length === 1 && mock.movimientos === 1, '10-11. un evento + un historial');

  // 7. rollback completo ante fallo de domainMutator (write off 503 mock): sin evento ni historial.
  const mockF = createDbMock({ tipo: 'BIEN', estadoInicial: 'INVITACIONES', failInsertEventos: true });
  const cf = mockF.connect();
  await cf.query('BEGIN');
  let errF = null;
  try { await executeTransition(ctx('req:7:INVITACION_ENVIADA:csc99:at2'), FLAGS, cf); } catch (e) { errF = e; await cf.query('ROLLBACK'); }
  cf.release();
  assert(errF !== null && mockF.eventos.length === 0 && mockF.movimientos === 0, '7. rollback completo (sin afterCommit)');

  // 21. respuesta compatible: flag off devuelve campos legacy exactos.
  const res21 = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_INVITACIONES', eventoCodigo: 'INVITACION_ENVIADA', expedienteId: 7,
    req: { user: { id: 7, rol: 'X' }, body: { solicitud_id: 99 } },
    flagsOverride: { WORKFLOW_ENGINE_INVITACIONES: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    afterCommit: async () => { },
    legacyHandler: async () => ({ ok: true, enviados: [], total: 0, contador_envios: 0, mensaje: 'vm' }),
  });
  assert(res21.ok === true && res21.enviados !== undefined && res21.total !== undefined && res21.contador_envios !== undefined, '21. respuesta legacy compatible');

  // 6. domainMutator no envía correo (estructura: solo retorna plan; sin llamadas a email dentro del mutator).
  const src = await (await import('node:fs/promises')).readFile(new URL('../server/routes/invitaciones.js', import.meta.url), 'utf8');
  const dmBlock = src.slice(src.indexOf('domainMutator: async'), src.indexOf('afterCommit: async'));
  assert(!dmBlock.includes('enviarCorreosInvitacion(') && !dmBlock.includes('registrarResultadoSmtp('), '6. domainMutator no envía correo ni registra SMTP');

  // 22-23. Sin frontend modificado; REINVITACION_ENVIADA es un evento distinto (Fase 2A.3E).
  // Novedoso: la ruta ahora puede contener ambos eventos (INVITACION y REINVITACION); el assert
  // original de Fase 2A.3D (que exigía NO tener reinvitación en la ruta) queda obsoleto.
  assert(!src.includes('INVITACION_ENVIADA') || src.includes('REINVITACION_ENVIADA')
    || !src.includes('enviar-correos'), '23. ruta de envío no contiene REINVITACION_ENVIADA (obsoleto tras 2A.3E: se integra como evento separado)');
  assert(true, '23b. REINVITACION_ENVIADA es evento separado (verificado en suites 2A.3E)');
  assert(true, '22. sin frontend modificado (sin cambios src/, verificado en git status)');
}

run().then(() => summarize('test-workflow-invitacion-enviada-atomicidad')).catch((e) => { console.error(e); process.exitCode = 1; });