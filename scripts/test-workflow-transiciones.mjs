// Pruebas C/D/E/G/H: grafos, transiciones por tipo, orden notificada, derivar ejecución por tipo, internos.
import { assert, summarize } from './workflowTestUtils.mjs';
import {
  getTransition,
  getAllowedTransitions,
  isTransitionAllowed,
} from '../shared/workflow/transiciones.js';
import { TIPOS_CONTRATACION } from '../shared/workflow/tiposContratacion.js';
import { ETAPAS } from '../shared/workflow/etapas.js';

const B = TIPOS_CONTRATACION.BIEN;
const S = TIPOS_CONTRATACION.SERVICIO;
const L = TIPOS_CONTRATACION.LOCACION;
const V = TIPOS_CONTRATACION.VIATICO_PASAJE_AEREO;

// C. Grafos BIEN/SERVICIO/LOCACION válidos en la matriz
const recorridoBien = [
  ['REGISTRO', 'REQUERIMIENTO_ENVIADO_EVALUACION', 'EVALUACION'],
  ['EVALUACION', 'EVALUACION_APROBADA', 'DEC'],
  ['DEC', 'DEC_APROBADO', 'PROGRAMACION'],
  ['PROGRAMACION', 'PROGRAMACION_APROBADA', 'COORDINACION_CM'],
  ['COORDINACION_CM', 'COORDINACION_CM_APROBADA', 'INVITACIONES'],
  ['INVITACIONES', 'COTIZACION_PRESENTADA', 'RECEPCION_COTIZACIONES'],
  ['RECEPCION_COTIZACIONES', 'COTIZACIONES_DERIVADAS_VALIDACION', 'VALIDACIONES'],
  ['VALIDACIONES', 'VALIDACION_COMPLETADA', 'CUADRO_COMPARATIVO'],
  ['CUADRO_COMPARATIVO', 'CUADRO_APROBADO_DEC', 'CCP'],
  ['CCP', 'CCP_REGISTRADA', 'REGISTRO_ORDEN'],
  ['REGISTRO_ORDEN', 'ORDEN_DERIVADA_EJECUCION', 'RECEPCION_BIENES'],
  ['RECEPCION_BIENES', 'EXPEDIENTE_DERIVADO_PAGO', 'DERIVACION_PAGO'],
  ['DERIVACION_PAGO', 'EXPEDIENTE_FINALIZADO', 'FINALIZADO'],
];
let bienOk = true;
for (const [origen, evento, destino] of recorridoBien) {
  const t = getTransition({ tipoContratacion: B, etapaOrigen: origen, eventoCodigo: evento });
  if (!t || t.etapa_destino !== destino) bienOk = false;
}
assert(bienOk, 'C.1 BIEN recorrido completo válido');

const recorridoServicio = [
  ['REGISTRO', 'REQUERIMIENTO_ENVIADO_EVALUACION', 'EVALUACION'],
  ['EVALUACION', 'EVALUACION_APROBADA', 'DEC'],
  ['DEC', 'DEC_APROBADO', 'PROGRAMACION'],
  ['PROGRAMACION', 'PROGRAMACION_APROBADA', 'COORDINACION_CM'],
  ['COORDINACION_CM', 'COORDINACION_CM_APROBADA', 'INVITACIONES'],
  ['INVITACIONES', 'COTIZACION_PRESENTADA', 'RECEPCION_COTIZACIONES'],
  ['RECEPCION_COTIZACIONES', 'COTIZACIONES_DERIVADAS_VALIDACION', 'VALIDACIONES'],
  ['VALIDACIONES', 'VALIDACION_COMPLETADA', 'CUADRO_COMPARATIVO'],
  ['CUADRO_COMPARATIVO', 'CUADRO_APROBADO_DEC', 'CCP'],
  ['CCP', 'CCP_REGISTRADA', 'REGISTRO_ORDEN'],
  ['REGISTRO_ORDEN', 'ORDEN_DERIVADA_EJECUCION', 'PRESENTACION_ENTREGABLES'],
  ['PRESENTACION_ENTREGABLES', 'EXPEDIENTE_DERIVADO_PAGO', 'DERIVACION_PAGO'],
  ['DERIVACION_PAGO', 'EXPEDIENTE_FINALIZADO', 'FINALIZADO'],
];
let serviciosOk = true;
for (const [origen, evento, destino] of recorridoServicio) {
  const t = getTransition({ tipoContratacion: S, etapaOrigen: origen, eventoCodigo: evento });
  if (!t || t.etapa_destino !== destino) serviciosOk = false;
}
assert(serviciosOk, 'C.2 SERVICIO recorrido completo válido');

const recorridoLocacion = [
  ['RECEPCION_COTIZACIONES', 'LOCACION_APROBADA_RECEPCION', 'CCP'],
  ['CCP', 'CCP_REGISTRADA', 'REGISTRO_ORDEN'],
  ['REGISTRO_ORDEN', 'ORDEN_DERIVADA_EJECUCION', 'PRESENTACION_ENTREGABLES'],
  ['PRESENTACION_ENTREGABLES', 'EXPEDIENTE_DERIVADO_PAGO', 'DERIVACION_PAGO'],
  ['DERIVACION_PAGO', 'EXPEDIENTE_FINALIZADO', 'FINALIZADO'],
];
let locacionOk = true;
for (const [origen, evento, destino] of recorridoLocacion) {
  const t = getTransition({ tipoContratacion: L, etapaOrigen: origen, eventoCodigo: evento });
  if (!t || t.etapa_destino !== destino) locacionOk = false;
}
assert(locacionOk, 'C.3 LOCACION sin VALIDACIONES/CUADRO válido');
assert(!isTransitionAllowed({ tipoContratacion: L, etapaOrigen: 'RECEPCION_COTIZACIONES', eventoCodigo: 'COTIZACIONES_DERIVADAS_VALIDACION' }), 'C.4 LOCACION no permite derivar a VALIDACIONES');
assert(!isTransitionAllowed({ tipoContratacion: L, etapaOrigen: 'VALIDACIONES', eventoCodigo: 'VALIDACION_COMPLETADA' }), 'C.5 LOCACION no tiene VALIDACIONES');

// D. Viático en matriz pero desactivado
const via = getTransition({ tipoContratacion: V, etapaOrigen: 'INVITACIONES', eventoCodigo: 'VIATICO_APROBADO_INVITACIONES' });
assert(!!via && via.feature_flag === 'WORKFLOW_ENGINE_VIATICOS' && via.etapa_destino === 'CCP', 'D.1 VIATICO en matriz → CCP');
assert(!isTransitionAllowed({ tipoContratacion: V, etapaOrigen: 'INVITACIONES', eventoCodigo: 'INVITACION_ENVIADA' }), 'D.2 VIATICO no permite INVITACION_ENVIADA');

// E. REGISTRO no salta automáticamente
const crear = getTransition({ tipoContratacion: B, etapaOrigen: '', eventoCodigo: 'REQUERIMIENTO_REGISTRADO' });
assert(!!crear && crear.etapa_destino === 'REGISTRO' && crear.cambia_ubicacion === false, 'E.1 REQUERIMIENTO_REGISTRADO → REGISTRO sin derivar');

// G. ORDEN_NOTIFICADA permanece en REGISTRO_ORDEN
const notif = getTransition({ tipoContratacion: B, etapaOrigen: 'REGISTRO_ORDEN', eventoCodigo: 'ORDEN_NOTIFICADA' });
assert(!!notif && notif.etapa_destino === 'REGISTRO_ORDEN' && notif.cambia_ubicacion === false, 'G.1 ORDEN_NOTIFICADA permanece en REGISTRO_ORDEN');

// H. ORDEN_DERIVADA_EJECUCION cambia por tipo
const derivaB = getTransition({ tipoContratacion: B, etapaOrigen: 'REGISTRO_ORDEN', eventoCodigo: 'ORDEN_DERIVADA_EJECUCION' });
const derivaS = getTransition({ tipoContratacion: S, etapaOrigen: 'REGISTRO_ORDEN', eventoCodigo: 'ORDEN_DERIVADA_EJECUCION' });
const derivaL = getTransition({ tipoContratacion: L, etapaOrigen: 'REGISTRO_ORDEN', eventoCodigo: 'ORDEN_DERIVADA_EJECUCION' });
assert(derivaB?.etapa_destino === 'RECEPCION_BIENES', 'H.1 BIEN → RECEPCION_BIENES');
assert(derivaS?.etapa_destino === 'PRESENTACION_ENTREGABLES', 'H.2 SERVICIO → PRESENTACION_ENTREGABLES');
assert(derivaL?.etapa_destino === 'PRESENTACION_ENTREGABLES', 'H.3 LOCACION → PRESENTACION_ENTREGABLES');

// I. ENTREGA_RECIBIDA / ENTREGABLE_RECIBIDO no cambian ubicación
const entrega = getTransition({ tipoContratacion: B, etapaOrigen: 'RECEPCION_BIENES', eventoCodigo: 'ENTREGA_RECIBIDA' });
const entregable = getTransition({ tipoContratacion: S, etapaOrigen: 'PRESENTACION_ENTREGABLES', eventoCodigo: 'ENTREGABLE_RECIBIDO' });
assert(entrega?.etapa_destino === 'RECEPCION_BIENES' && entrega.cambia_ubicacion === false, 'I.1 ENTREGA_RECIBIDA interno');
assert(entregable?.etapa_destino === 'PRESENTACION_ENTREGABLES' && entregable.cambia_ubicacion === false, 'I.2 ENTREGABLE_RECIBIDO interno');

// Devolución: COTIZACIONES_INVALIDAS_DEVUELTAS VALIDACIONES→INVITACIONES
const invalidas = getTransition({ tipoContratacion: B, etapaOrigen: 'VALIDACIONES', eventoCodigo: 'COTIZACIONES_INVALIDAS_DEVUELTAS' });
assert(invalidas?.etapa_destino === 'INVITACIONES', 'J.1 todas inválidas: VALIDACIONES→INVITACIONES');
assert(!isTransitionAllowed({ tipoContratacion: B, etapaOrigen: 'RECEPCION_COTIZACIONES', eventoCodigo: 'COTIZACIONES_INVALIDAS_DEVUELTAS' }), 'J.2 no permitido desde RECEPCION_COTIZACIONES');

// getAllowedTransitions existen
assert(getAllowedTransitions({ tipoContratacion: B, etapaOrigen: 'REGISTRO' }).length >= 1, 'K.1 transiciones permitidas desde REGISTRO');

summarize('test-workflow-transiciones');