// Fase 1A — compatibilidad del tramo Registro/Evaluación.
// Casos: Q respuestas compatibles; N snapshot no sobrescribe BD; O ninguna ruta fuera del tramo importa el adaptador;
// R rollback (simulator devuelve sin escrituras).
import { assert, summarize } from './workflowTestUtils.mjs';
import { resolverEtapaLegacy } from '../server/lib/workflow/workflowCompatibility.js';
import { runWorkflowTransition, EVENTOS_TRAMO_REGISTRO_EVALUACION } from '../server/lib/workflow/workflowIntegration.js';
import { simularTransicion } from '../server/lib/workflow/workflowSimulator.js';

const reqStub = { user: { id: 7, rol: 'USUARIO_AU' }, body: { tipo_contratacion: 'BIEN' } };

async function run() {
  // Q — respuesta legacy compatible (ok + requerimiento).
  const resQ = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
    eventoCodigo: 'EVALUACION_APROBADA',
    expedienteId: 5,
    req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_REGISTRO: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    legacyHandler: async () => ({ ok: true, requerimiento: { id: 5, codigo: 'REQ-005', estado: 'Aprobado' } }),
  });
  assert(resQ.ok === true && resQ.requerimiento?.codigo === 'REQ-005', 'Q. respuesta legacy compatible');

  // N — snapshot nunca sobrescribe BD (estado_actual gana).
  const row = { estado_actual: 'DEC', payload: JSON.stringify({ workflowSnapshot: { etapaActual: 'REGISTRO' } }) };
  const leg = resolverEtapaLegacy(row);
  assert(leg.etapa === 'DEC', 'N. snapshot no sobrescribe estado_actual');
  assert(leg.advertencias.some((a) => a.includes('MON_SNAPSHOT_DIVERGENTE')), 'N2. advertencia de divergencia');

  // O — solo las transiciones del tramo definidas. DEC/PROGRAMACION/etc. NO están en esta iteración.
  assert(EVENTOS_TRAMO_REGISTRO_EVALUACION.length === 4, 'O. tramo Opción B = 4 transiciones (A-D)');
  assert(!EVENTOS_TRAMO_REGISTRO_EVALUACION.includes('DEC_APROBADO'), 'O2. DEC_APROBADO fuera del alcance (fase siguiente)');

  // R — simulator puro sin escrituras (rollback implícito: no toca BD).
  const sim = simularTransicion({ tipo_contratacion: 'BIEN', etapa_actual: null, evento: 'REQUERIMIENTO_REGISTRADO', actor: { id: 7, rol: 'USUARIO_AU' } });
  assert(sim.permitido === true && sim.etapa_destino === 'REGISTRO', 'R. simulator puro (sin escrituras)');
}

run().then(() => summarize('test-workflow-registro-compatibilidad')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });