// Pruebas M/N/O: snapshot no sobrescribe BD, no cruce cotización/cuadro, alias solo lectura.
import { assert, summarize } from './workflowTestUtils.mjs';
import { resolverEtapaLegacy, extraerSnapshot, detectarCruceDomino } from '../server/lib/workflow/workflowCompatibility.js';
import { resolverTipoLegacy } from '../server/lib/workflow/workflowCompatibility.js';

// M. Snapshot jamás sobrescribe BD
const rowSnap = {
  estado_actual: 'PROGRAMACION',
  payload: JSON.stringify({ workflowSnapshot: { etapaActual: 'DEC', revisionEstado: 'FIRMADO' } }),
};
const legSnap = resolverEtapaLegacy(rowSnap);
assert(legSnap.etapa === 'PROGRAMACION', 'M.1 estado_actual gana sobre snapshot');
assert(legSnap.advertencias.some((a) => a.includes('MON_SNAPSHOT_DIVERGENTE')), 'M.2 advertencia de divergencia snapshot');
const snap = extraerSnapshot(rowSnap);
assert(snap?.etapaActual === 'DEC', 'M.3 snapshot extraído sin mutar');

// N. Estado de cotización no altera expediente
const coz = resolverEtapaLegacy({ estado_actual: 'VALIDACIONES', cotizacion_estado: 'COT_VALIDA' });
assert(coz.etapa === 'VALIDACIONES', 'N.1 cotización no cambia etapa');
const cruceCoz = detectarCruceDomino({ cotizacion_estado: 'COT_PRESENTADA', validacion_estado: 'APTO' });
assert(cruceCoz.advertencias.length > 0, 'N.2 cruce cotización detectado sin estado_actual');

// O. Estado de cuadro no altera expediente
const cua = resolverEtapaLegacy({ estado_actual: 'CCP', cuadro_estado: 'FIRMADO' });
assert(cua.etapa === 'CCP', 'O.1 cuadro no cambia etapa');
const cruceCua = detectarCruceDomino({ cuadro_estado: 'DERIVADO_CCP' });
assert(cruceCua.advertencias.length > 0, 'O.2 cruce cuadro detectado sin estado_actual');

// Alias legado de tipo solo lectura
assert(resolverTipoLegacy({ tipo: 'bienes' }) === 'BIEN', 'P.1 tipo alias bienes → BIEN');
assert(resolverTipoLegacy({ tipo: 'SERVICIOS' }) === 'SERVICIO', 'P.2 tipo alias SERVICIOS → SERVICIO');
assert(resolverTipoLegacy({ tipo: 'VIATICO' }) === 'VIATICO_PASAJE_AEREO', 'P.3 tipo alias VIATICO');

// Fallback negocio solo lectura con advertencia
const legFallback = resolverEtapaLegacy({ estado: 'En Cotizaciones' });
assert(legFallback.etapa === 'RECEPCION_COTIZACIONES', 'Q.1 fallback negocio → RECEPCION_COTIZACIONES');
assert(legFallback.advertencias.some((a) => a.includes('MON_FALLBACK_NEGOCIO')), 'Q.2 advertencia de fallback');

summarize('test-workflow-compatibilidad');