// Fase 1A — integración Registro (transición A: REQUERIMIENTO_REGISTRADO; transición B: REQUERIMIENTO_ENVIADO_EVALUACION).
// Casos: A creación queda REGISTRO; B envío → EVALUACION; C flag apagado → legacy; B2 flag on + write off → 503; K salto ilegal.
// SIN escrituras a BD real: usa simularTransicion (puro) + runWorkflowTransition con flagsOverride.
import { assert, summarize } from './workflowTestUtils.mjs';
import { simularTransicion } from '../server/lib/workflow/workflowSimulator.js';
import { runWorkflowTransition } from '../server/lib/workflow/workflowIntegration.js';

const baseSim = { tipo_contratacion: 'BIEN', actor: { id: 7, rol: 'USUARIO_AU' }, metadata: { idempotency_key: 'int:reg:1:abc12345' } };

async function run() {
  // A — creación queda en REGISTRO (motor puro, no deriva a EVALUACIÓN).
  const crear = simularTransicion({ ...baseSim, etapa_actual: null, evento: 'REQUERIMIENTO_REGISTRADO' });
  assert(crear.permitido && crear.etapa_destino === 'REGISTRO' && crear.cambia_ubicacion === false, 'A. creación queda en REGISTRO (no deriva automáticamente)');

  // B — envío a evaluación: REGISTRO → EVALUACION.
  const enviar = simularTransicion({ ...baseSim, etapa_actual: 'REGISTRO', evento: 'REQUERIMIENTO_ENVIADO_EVALUACION' });
  assert(enviar.permitido && enviar.etapa_destino === 'EVALUACION' && enviar.cambia_ubicacion === true, 'B. envío a evaluación → EVALUACION');

  // C — flag apagado (default) → legacy handler se ejecuta (sin tocar BD real).
  const reqStub = { user: { id: 7, rol: 'USUARIO_AU' }, body: { tipo_contratacion: 'BIEN' } };
  let legacyCalled = false;
  const res = await runWorkflowTransition({
    moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
    eventoCodigo: 'REQUERIMIENTO_REGISTRADO',
    expedienteId: 999,
    req: reqStub,
    flagsOverride: { WORKFLOW_ENGINE_REGISTRO: false, WORKFLOW_ENGINE_WRITE_ENABLED: false },
    legacyHandler: async () => { legacyCalled = true; return { ok: true, requerimiento: { id: 999 } }; },
  });
  assert(legacyCalled === true, 'C. flag apagado → legacy');
  assert(res.ok === true && res.requerimiento?.id === 999, 'C2. respuesta legacy compatible');

  // B2 — flag encendido + write apagado → 503 (motor no escribe).
  let status503 = null;
  try {
    await runWorkflowTransition({
      moduleFlag: 'WORKFLOW_ENGINE_REGISTRO',
      eventoCodigo: 'REQUERIMIENTO_REGISTRADO',
      expedienteId: 999,
      req: reqStub,
      flagsOverride: { WORKFLOW_ENGINE_REGISTRO: true, WORKFLOW_ENGINE_WRITE_ENABLED: false },
      legacyHandler: async () => ({ ok: true }),
    });
  } catch (err) {
    if (err?.status === 503 || err?.code === 'WORKFLOW_WRITE_DISABLED') status503 = err;
  }
  assert(status503 !== null, 'B2. flag on + write off → 503');

  // K — salto ilegal bloqueado (por ejemplo REGISTRO → DEC directo).
  const salto = simularTransicion({ ...baseSim, etapa_actual: 'REGISTRO', evento: 'DEC_APROBADO' });
  assert(salto.permitido === false && salto.errores.length > 0, 'K. salto ilegal bloqueado');
}

run().then(() => summarize('test-workflow-registro-integracion')).catch((e) => { process.stdout.write(`ERROR: ${e.stack}\n`); process.exitCode = 1; });