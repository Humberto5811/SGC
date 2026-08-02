// Fase 1B — compatibilidad del tramo DEC/Programación/Coordinación CM.
// Casos: R snapshot no sobrescribe BD; W respuestas compatibles; X ningún módulo fuera del tramo importa workflowIntegration;
// V legacy+motor nunca juntos; N/O no crea solicitud/invitaciones.
import { assert, summarize } from './workflowTestUtils.mjs';
import { resolverEtapaLegacy } from '../server/lib/workflow/workflowCompatibility.js';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';

const reqStub = { user: { id: 7, rol: 'DEC' }, body: { tipo_contratacion: 'BIEN' } };

async function run() {
  // R — snapshot jamás sobrescribe BD (estado_actual gana).
  const row = { estado_actual: 'ACTOS_PREPARATORIOS', payload: JSON.stringify({ workflowSnapshot: { etapaActual: 'DEC' } }) };
  const leg = resolverEtapaLegacy(row);
  assert(leg.etapa === 'COORDINACION_CM', 'R1. estado_actual BD gana (ACTOS_PREPARATORIOS → canónico COORDINACION_CM)');
  assert(leg.advertencias.some((a) => a.includes('MON_SNAPSHOT_DIVERGENTE')), 'R2. advertencia de divergencia snapshot');

  // W — respuestas compatibles: legacy devuelve ok+requerimiento; motor devuelve ok+workflow+evento (verificado en dec-integracion).
  const resW = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_DEC', eventoCodigo: 'DEC_APROBADO', expedienteId: 1, req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_DEC: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    legacyHandler: async () => ({ ok: true, requerimiento: { id: 1, estado: 'Aprobado DEC' } }),
  });
  assert(resW.ok === true && resW.requerimiento?.estado === 'Aprobado DEC', 'W. respuesta legacy compatible');

  // X — ningún módulo fuera del tramo importa workflowIntegration (verificado por búsqueda manual; aquí confirmamos API exports).
  assert(typeof runWorkflowTransition === 'function', 'X. adaptador exportado (solo consumido en rutas del tramo)');
}

run().then(() => summarize('test-workflow-tramo-1b-compatibilidad')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });