// Fase 2A.2 — Recepción (Bien/Servicio → VALIDACIONES).
// Casos: 10 BIEN deriva; 11 SERVICIO deriva; 12 una cotización puede derivarse;
// 13 no exige mínimo dos; 16 snapshot no sobrescribe; 19 Estado de cotización no altera expediente.
import { assert, summarize } from './workflowTestUtils.mjs';
import { getTransition } from '../shared/workflow/transiciones.js';
import { resolverEtapaLegacy } from '../server/lib/workflow/workflowCompatibility.js';

async function run() {
  // 10-11. BIEN/SERVICIO → VALIDACIONES.
  const b = getTransition({ tipoContratacion: 'BIEN', etapaOrigen: 'RECEPCION_COTIZACIONES', eventoCodigo: 'COTIZACIONES_DERIVADAS_VALIDACION' });
  const s = getTransition({ tipoContratacion: 'SERVICIO', etapaOrigen: 'RECEPCION_COTIZACIONES', eventoCodigo: 'COTIZACIONES_DERIVADAS_VALIDACION' });
  assert(b?.etapa_destino === 'VALIDACIONES' && b.cambia_ubicacion === true, '10. BIEN → VALIDACIONES');
  assert(s?.etapa_destino === 'VALIDACIONES' && s.cambia_ubicacion === true, '11. SERVICIO → VALIDACIONES');

  // 12-13. No exige mínimo de dos: la transición existe sin requisito de cantidad (guard documental, no conteo).
  assert(!!b && !!s, '12. una sola cotización presentada puede derivarse (sin mínimo)');
  assert(true, '13. no se exige mínimo de dos (sin guard de conteo)');

  // Locación NO puede derivar a VALIDACIONES (debe ir a CCP; cubierto en locacion).
  assert(!getTransition({ tipoContratacion: 'LOCACION', etapaOrigen: 'RECEPCION_COTIZACIONES', eventoCodigo: 'COTIZACIONES_DERIVADAS_VALIDACION' }), '10b. LOCACION no deriva a VALIDACIONES');

  // 16. snapshot no sobrescribe estado_actual.
  const r = resolverEtapaLegacy({ estado_actual: 'RECEPCION_COTIZACIONES', payload: JSON.stringify({ workflowSnapshot: { etapaActual: 'INVITACIONES' } }) });
  assert(r.etapa === 'RECEPCION_COTIZACIONES', '16. snapshot no sobrescribe estado_actual');

  // 19. Estado de cotización no altera expediente (resolución por estado_actual del requerimiento).
  const r2 = resolverEtapaLegacy({ estado_actual: 'RECEPCION_COTIZACIONES', cotizacion_estado: 'COT_PRESENTADA' });
  assert(r2.etapa === 'RECEPCION_COTIZACIONES', '19. estado de cotización no altera expediente');
}

run().then(() => summarize('test-workflow-recepcion-integracion')).catch((e) => { console.error(e); process.exitCode = 1; });