// Prueba A: códigos únicos, prefijos por dominio, grafos, viáticos, consultas no etapa.
import { assert, summarize } from './workflowTestUtils.mjs';
import {
  TIPOS_CONTRATACION,
  TIPOS_LIST,
  esTipoValido,
  esTipoHabilitado,
} from '../shared/workflow/tiposContratacion.js';
import { ETAPAS, ETAPAS_LIST, esEtapaValida, esEtapaTerminal } from '../shared/workflow/etapas.js';
import {
  DOMINIOS,
  getCatalogoEstados,
  getEstadoPorCodigo,
  getEstadosPorDominio,
} from '../shared/workflow/estadosPorDominio.js';
import { EVENTOS, esEventoValido } from '../shared/workflow/eventos.js';

// A. Códigos únicos en estados por dominio
const estados = getCatalogoEstados();
const codes = estados.map((e) => e.codigo);
assert(new Set(codes).size === codes.length, 'A.1 códigos de estado únicos');

// B. Prefijos por dominio
const prefijos = {
  [DOMINIOS.EXPEDIENTE]: 'EXP_',
  [DOMINIOS.SOLICITUD_COTIZACION]: 'SC_',
  [DOMINIOS.INVITACION]: 'INV_',
  [DOMINIOS.RECEPCION_COTIZACIONES]: 'RC_',
  [DOMINIOS.COTIZACION]: 'COT_',
  [DOMINIOS.VALIDACION]: 'VAL_',
  [DOMINIOS.CUADRO_COMPARATIVO]: 'CUA_',
  [DOMINIOS.CCP]: 'CCP_',
  [DOMINIOS.ORDEN]: 'ORD_',
  [DOMINIOS.EJECUCION]: 'EJ_',
  [DOMINIOS.OBSERVACION]: 'OBS_',
};
let prefijosOk = true;
for (const [dominio, prefijo] of Object.entries(prefijos)) {
  for (const e of getEstadosPorDominio(dominio)) {
    if (!e.codigo.startsWith(prefijo)) prefijosOk = false;
  }
}
assert(prefijosOk, 'B.1 prefijos de dominio correctos');

// C. Grafos: BIEN tiene 15 etapas; SERVICIO 15; LOCACION 13 (sin VALIDACIONES/CUADRO)
const grafoBien = ['REGISTRO','EVALUACION','DEC','PROGRAMACION','COORDINACION_CM','INVITACIONES','RECEPCION_COTIZACIONES','VALIDACIONES','CUADRO_COMPARATIVO','CCP','REGISTRO_ORDEN','RECEPCION_BIENES','DERIVACION_PAGO','FINALIZADO'];
const grafoServicio = ['REGISTRO','EVALUACION','DEC','PROGRAMACION','COORDINACION_CM','INVITACIONES','RECEPCION_COTIZACIONES','VALIDACIONES','CUADRO_COMPARATIVO','CCP','REGISTRO_ORDEN','PRESENTACION_ENTREGABLES','DERIVACION_PAGO','FINALIZADO'];
const grafoLocacion = ['REGISTRO','EVALUACION','DEC','PROGRAMACION','COORDINACION_CM','INVITACIONES','RECEPCION_COTIZACIONES','CCP','REGISTRO_ORDEN','PRESENTACION_ENTREGABLES','DERIVACION_PAGO','FINALIZADO'];
const grafoViatico = ['REGISTRO','EVALUACION','DEC','PROGRAMACION','COORDINACION_CM','INVITACIONES','CCP','REGISTRO_ORDEN'];
assert(grafoBien.every((e) => esEtapaValida(e)), 'C.1 grafo BIEN solo etapas válidas');
assert(grafoServicio.every((e) => esEtapaValida(e)), 'C.2 grafo SERVICIO solo etapas válidas');
assert(grafoLocacion.every((e) => esEtapaValida(e)), 'C.3 grafo LOCACION solo etapas válidas');
assert(grafoViatico.every((e) => esEtapaValida(e)), 'C.4 grafo VIATICO solo etapas válidas');
assert(!grafoLocacion.includes('VALIDACIONES') && !grafoLocacion.includes('CUADRO_COMPARATIVO'), 'C.5 LOCACION sin VALIDACIONES/CUADRO');
assert(!grafoViatico.includes('RECEPCION_COTIZACIONES'), 'C.6 VIATICO sin RECEPCION_COTIZACIONES');

// D. Viático definido pero desactivado
assert(esTipoValido(TIPOS_CONTRATACION.VIATICO_PASAJE_AEREO), 'D.1 VIATICO definido en catálogo');
assert(!esTipoHabilitado(TIPOS_CONTRATACION.VIATICO_PASAJE_AEREO), 'D.2 VIATICO no habilitado productivamente');

// E. CONSULTAS_OBSERVACIONES no es etapa
assert(ETAPAS.CONSULTAS_OBSERVACIONES === undefined, 'E.1 CONSULTAS_OBSERVACIONES no es etapa');
assert(getEstadoPorCodigo('SC_ABIERTA_CONSULTAS')?.dominio === DOMINIOS.SOLICITUD_COTIZACION, 'E.2 consultas = fase interna SC');

// F. Estados sin códigos ambiguos sin prefijo
const ambiguos = ['APROBADO', 'APROBADO_DEC', 'PENDIENTE', 'OBSERVADO', 'EN_PROCESO'];
const noAmbiguos = ambiguos.every((a) => !getEstadoPorCodigo(a));
assert(noAmbiguos, 'F.1 sin códigos ambiguos sin prefijo');

// G. Solo FINALIZADO terminal
const terminales = ETAPAS_LIST.filter((e) => esEtapaTerminal(e));
assert(terminales.length === 1 && terminales[0] === ETAPAS.FINALIZADO, 'G.1 solo FINALIZADO terminal');

// H. Tipos únicos
assert(new Set(TIPOS_LIST).size === TIPOS_LIST.length, 'H.1 tipos únicos');

// I. Eventos únicos
const eventos = Object.values(EVENTOS);
assert(new Set(eventos).size === eventos.length, 'I.1 eventos únicos');

summarize('test-workflow-catalogos');