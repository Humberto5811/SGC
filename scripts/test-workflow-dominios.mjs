// Pruebas B/F/L/N/O/P/Q: dominios, prefijos, dominio ausente=null, no cruce, terminales.
import { assert, summarize } from './workflowTestUtils.mjs';
import { DOMINIOS, getEstadosPorDominio, getEstadoExpedienteDeEtapa, esEstadoTerminal } from '../shared/workflow/estadosPorDominio.js';
import { buildContratoEstados } from '../shared/workflow/workflowContract.js';
import { ETAPAS, ETAPAS_LIST } from '../shared/workflow/etapas.js';
import { resolverEtapaLegacy, detectarCruceDomino } from '../server/lib/workflow/workflowCompatibility.js';

// B. Prefijos por dominio
const prefijos = { EXPEDIENTE:'EXP_',SOLICITUD_COTIZACION:'SC_',INVITACION:'INV_',RECEPCION_COTIZACIONES:'RC_',COTIZACION:'COT_',VALIDACION:'VAL_',CUADRO_COMPARATIVO:'CUA_',CCP:'CCP_',ORDEN:'ORD_',EJECUCION:'EJ_',OBSERVACION:'OBS_' };
let prefijosOk = true;
for (const [dominio, prefijo] of Object.entries(prefijos)) {
  const estados = getEstadosPorDominio(dominio);
  if (!estados.length) prefijosOk = false;
  for (const e of estados) if (!e.codigo.startsWith(prefijo)) prefijosOk = false;
}
assert(prefijosOk, 'B.1 prefijos por dominio correctos');

// B.2 Cada estado EXP_ mapea a etapa válida
for (const e of getEstadosPorDominio(DOMINIOS.EXPEDIENTE)) {
  assert(ETAPAS_LIST.includes(e.etapa), `B.2 ${e.codigo} mapea etapa`);
}

// F. Dominio ausente = null
const contrato = buildContratoEstados({
  tipo_contratacion: 'BIEN', etapa_codigo: 'INVITACIONES', etapa_label: 'Invitaciones',
  submodulo_codigo: 'INVITACIONES', submodulo_label: 'Invitaciones',
  responsable_codigo: 'ESPECIALISTA_CONTRATACIONES', responsable_label: 'Especialista Contrataciones',
  domainStates: { expediente: { codigo: 'EXP_INVITACIONES', label: 'En Invitaciones' } },
});
assert(contrato.estados.expediente !== null, 'F.1 expediente presente');
assert(contrato.estados.cotizacion === null, 'F.2 cotizacion = null');
assert(contrato.estados.cuadro === null, 'F.3 cuadro = null');
assert(contrato.estados.validacion === null, 'F.4 validacion = null');
assert(contrato.estados.orden === null, 'F.5 orden = null');
assert(contrato.estados.ejecucion === null, 'F.6 ejecucion = null');

// N. Cotización no altera expediente
const legCoz = resolverEtapaLegacy({ estado_actual: 'VALIDACIONES', cotizacion_estado: 'COT_VALIDA' });
assert(legCoz.etapa === 'VALIDACIONES', 'N.1 cotización no cambia etapa');
const cruceCoz = detectarCruceDomino({ cotizacion_estado: 'COT_VALIDA' });
assert(cruceCoz.advertencias.length > 0, 'N.2 cruce cotización detectado sin estado_actual');

// O. Cuadro no altera expediente
const legCua = resolverEtapaLegacy({ estado_actual: 'CCP', cuadro_estado: 'CUA_APROBADO' });
assert(legCua.etapa === 'CCP', 'O.1 cuadro no cambia etapa');
const cruceCua = detectarCruceDomino({ cuadro_estado: 'CUA_DERIVADO_CCP' });
assert(cruceCua.advertencias.length > 0, 'O.2 cruce cuadro detectado sin estado_actual');

// P. Terminales
assert(esEstadoTerminal('EXP_FINALIZADO'), 'P.1 EXP_FINALIZADO terminal');
assert(esEstadoTerminal('ORD_RESUELTA'), 'P.2 ORD_RESUELTA terminal');
assert(esEstadoTerminal('ORD_ANULADA'), 'P.3 ORD_ANULADA terminal');
assert(esEstadoTerminal('OBS_CERRADA'), 'P.4 OBS_CERRADA terminal');
assert(!esEstadoTerminal('EXP_CCP'), 'P.5 EXP_CCP no terminal');

// Q. Estado expediente desde etapa
assert(getEstadoExpedienteDeEtapa(ETAPAS.REGISTRO)?.codigo === 'EXP_REGISTRO', 'Q.1 EXP_REGISTRO');
assert(getEstadoExpedienteDeEtapa(ETAPAS.FINALIZADO)?.codigo === 'EXP_FINALIZADO', 'Q.2 EXP_FINALIZADO');

summarize('test-workflow-dominios');