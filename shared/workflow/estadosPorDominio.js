/**
 * Catálogo canónico de estados por dominio del SGC.
 * Compartido BE/FE. Sin dependencias de BD.
 *
 * Reglas:
 * - Prefijos obligatorios por dominio: EXP_, SC_, INV_, RC_, COT_, VAL_,
 *   CUA_, CCP_, ORD_, EJ_, OBS_.
 * - Un dominio no disponible se representa como null en el contrato; nunca se
 *   usa el estado de un dominio como fallback de otro.
 * - No existen códigos ambiguos sin prefijo (APROBADO, APROBADO_DEC, PENDIENTE,
 *   OBSERVADO, EN_PROCESO) para decisiones nuevas.
 */

export const DOMINIOS = Object.freeze({
  EXPEDIENTE: 'EXPEDIENTE',
  SOLICITUD_COTIZACION: 'SOLICITUD_COTIZACION',
  INVITACION: 'INVITACION',
  RECEPCION_COTIZACIONES: 'RECEPCION_COTIZACIONES',
  COTIZACION: 'COTIZACION',
  VALIDACION: 'VALIDACION',
  CUADRO_COMPARATIVO: 'CUADRO_COMPARATIVO',
  CCP: 'CCP',
  ORDEN: 'ORDEN',
  EJECUCION: 'EJECUCION',
  OBSERVACION: 'OBSERVACION',
});

export const DOMINIOS_LIST = Object.freeze(Object.values(DOMINIOS));

/** Definición por dominio: lista de estados con codigo, label, previo, siguiente, terminal. */
const ESTADOS_DEF = Object.freeze({
  [DOMINIOS.EXPEDIENTE]: Object.freeze([
    ['EXP_REGISTRO', 'En Registro', null, 'EXP_EVALUACION', false],
    ['EXP_EVALUACION', 'En Evaluación', 'EXP_REGISTRO', 'EXP_DEC', false],
    ['EXP_DEC', 'En DEC', 'EXP_EVALUACION', 'EXP_PROGRAMACION', false],
    ['EXP_PROGRAMACION', 'En Programación', 'EXP_DEC', 'EXP_COORDINACION_CM', false],
    ['EXP_COORDINACION_CM', 'En Coordinación CM', 'EXP_PROGRAMACION', 'EXP_INVITACIONES', false],
    ['EXP_INVITACIONES', 'En Invitaciones', 'EXP_COORDINACION_CM', 'EXP_RECEPCION_COTIZACIONES', false],
    ['EXP_RECEPCION_COTIZACIONES', 'En Recepción de Cotizaciones', 'EXP_INVITACIONES', 'EXP_VALIDACIONES', false],
    ['EXP_VALIDACIONES', 'En Validaciones', 'EXP_RECEPCION_COTIZACIONES', 'EXP_CUADRO_COMPARATIVO', false],
    ['EXP_CUADRO_COMPARATIVO', 'En Cuadro Comparativo', 'EXP_VALIDACIONES', 'EXP_CCP', false],
    ['EXP_CCP', 'En CCP', 'EXP_CUADRO_COMPARATIVO', 'EXP_REGISTRO_ORDEN', false],
    ['EXP_REGISTRO_ORDEN', 'En Registro de Orden', 'EXP_CCP', 'EXP_RECEPCION_BIENES', false],
    ['EXP_RECEPCION_BIENES', 'En Recepción de Bienes', 'EXP_REGISTRO_ORDEN', 'EXP_DERIVACION_PAGO', false],
    ['EXP_PRESENTACION_ENTREGABLES', 'En Presentación de Entregables', 'EXP_REGISTRO_ORDEN', 'EXP_DERIVACION_PAGO', false],
    ['EXP_DERIVACION_PAGO', 'Derivado a Pago', 'EXP_RECEPCION_BIENES', 'EXP_FINALIZADO', false],
    ['EXP_FINALIZADO', 'Finalizado', 'EXP_DERIVACION_PAGO', null, true],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.EXPEDIENTE, previo, siguiente, terminal,
    etapa: etapaDeEstadoExpediente(codigo),
  }))),
  [DOMINIOS.SOLICITUD_COTIZACION]: Object.freeze([
    ['SC_BORRADOR', 'Borrador', null, 'SC_CREADA', false],
    ['SC_CREADA', 'Creada', 'SC_BORRADOR', 'SC_ABIERTA_CONSULTAS', false],
    ['SC_ABIERTA_CONSULTAS', 'En período de consultas', 'SC_CREADA', 'SC_EN_COTIZACIONES', false],
    ['SC_EN_COTIZACIONES', 'En período de cotizaciones', 'SC_ABIERTA_CONSULTAS', 'SC_CERRADA', false],
    ['SC_CERRADA', 'Cerrada', 'SC_EN_COTIZACIONES', 'SC_EN_CCP', false],
    ['SC_EN_CCP', 'Con CCP', 'SC_CERRADA', 'SC_CON_ORDEN', false],
    ['SC_CON_ORDEN', 'Con orden', 'SC_EN_CCP', null, true],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.SOLICITUD_COTIZACION, previo, siguiente, terminal,
  }))),
  [DOMINIOS.INVITACION]: Object.freeze([
    ['INV_PENDIENTE', 'Pendiente', null, 'INV_ENVIADA', false],
    ['INV_ENVIADA', 'Enviada', 'INV_PENDIENTE', 'INV_COTIZACION_PRESENTADA', false],
    ['INV_REENVIADA', 'Reenviada', 'INV_ENVIADA', 'INV_COTIZACION_PRESENTADA', false],
    ['INV_COTIZACION_PRESENTADA', 'Con cotización', 'INV_ENVIADA', null, true],
    ['INV_VENCIDA', 'Vencida sin cotización', 'INV_ENVIADA', null, true],
    ['INV_ANULADA', 'Anulada', null, null, true],
    ['INV_SUSTENTO_APROBADO', 'Sustento aprobado (viático)', 'INV_PENDIENTE', null, false],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.INVITACION, previo, siguiente, terminal,
  }))),
  [DOMINIOS.RECEPCION_COTIZACIONES]: Object.freeze([
    ['RC_EN_ESPERA', 'En espera de cotizaciones', null, 'RC_COTIZACIONES_RECIBIDAS', false],
    ['RC_COTIZACIONES_RECIBIDAS', 'Cotizaciones recibidas', 'RC_EN_ESPERA', 'RC_DERIVADA_VALIDACION', false],
    ['RC_DERIVADA_VALIDACION', 'Derivada a validación (B/S)', 'RC_COTIZACIONES_RECIBIDAS', null, true],
    ['RC_DERIVADA_CCP', 'Derivada a CCP (Locación)', 'RC_COTIZACIONES_RECIBIDAS', null, true],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.RECEPCION_COTIZACIONES, previo, siguiente, terminal,
  }))),
  [DOMINIOS.COTIZACION]: Object.freeze([
    ['COT_BORRADOR', 'Borrador', null, 'COT_PRESENTADA', false],
    ['COT_PRESENTADA', 'Presentada', 'COT_BORRADOR', 'COT_EN_VALIDACION', false],
    ['COT_EN_VALIDACION', 'En validación', 'COT_PRESENTADA', 'COT_VALIDA', false],
    ['COT_VALIDA', 'Válida', 'COT_EN_VALIDACION', 'COT_EN_CUADRO', false],
    ['COT_NO_VALIDA', 'No válida', 'COT_EN_VALIDACION', null, true],
    ['COT_EN_CUADRO', 'En cuadro', 'COT_VALIDA', 'COT_SELECCIONADA', false],
    ['COT_SELECCIONADA', 'Seleccionada', 'COT_EN_CUADRO', null, true],
    ['COT_NO_SELECCIONADA', 'No seleccionada', 'COT_EN_CUADRO', null, true],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.COTIZACION, previo, siguiente, terminal,
  }))),
  [DOMINIOS.VALIDACION]: Object.freeze([
    ['VAL_ENVIADA', 'Enviada a AU', null, 'VAL_COMPLETADA', false],
    ['VAL_OBSERVADA', 'Observada', 'VAL_ENVIADA', 'VAL_SUBSANADA', false],
    ['VAL_SUBSANADA', 'Subsanada', 'VAL_OBSERVADA', 'VAL_COMPLETADA', false],
    ['VAL_COMPLETADA', 'Completada', 'VAL_ENVIADA', null, true],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.VALIDACION, previo, siguiente, terminal,
  }))),
  [DOMINIOS.CUADRO_COMPARATIVO]: Object.freeze([
    ['CUA_BORRADOR', 'Borrador', null, 'CUA_GENERADO', false],
    ['CUA_GENERADO', 'Generado', 'CUA_BORRADOR', 'CUA_EN_COORDINACION_CM', false],
    ['CUA_EN_COORDINACION_CM', 'En Coordinación CM', 'CUA_GENERADO', 'CUA_EN_DEC', false],
    ['CUA_OBSERVADO_CM', 'Observado por CM', 'CUA_EN_COORDINACION_CM', 'CUA_EN_DEC', false],
    ['CUA_EN_DEC', 'En DEC', 'CUA_EN_COORDINACION_CM', 'CUA_APROBADO', false],
    ['CUA_OBSERVADO_DEC', 'Observado por DEC', 'CUA_EN_DEC', 'CUA_EN_COORDINACION_CM', false],
    ['CUA_APROBADO', 'Aprobado', 'CUA_EN_DEC', 'CUA_DERIVADO_CCP', false],
    ['CUA_DERIVADO_CCP', 'Derivado a CCP', 'CUA_APROBADO', null, true],
    ['CUA_ANULADO', 'Anulado', null, null, true],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.CUADRO_COMPARATIVO, previo, siguiente, terminal,
  }))),
  [DOMINIOS.CCP]: Object.freeze([
    ['CCP_ENVIADA_OPPM', 'Enviada a OPPM', null, 'CCP_REGISTRADA', false],
    ['CCP_REGISTRADA', 'CCP registrada', 'CCP_ENVIADA_OPPM', null, false],
    ['CCP_OBSERVADA', 'CCP observada', 'CCP_ENVIADA_OPPM', 'CCP_REGISTRADA', false],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.CCP, previo, siguiente, terminal,
  }))),
  [DOMINIOS.ORDEN]: Object.freeze([
    ['ORD_BORRADOR', 'Borrador', null, 'ORD_REGISTRADA', false],
    ['ORD_REGISTRADA', 'Registrada', 'ORD_BORRADOR', 'ORD_LISTA_NOTIFICACION', false],
    ['ORD_LISTA_NOTIFICACION', 'Lista para notificar', 'ORD_REGISTRADA', 'ORD_NOTIFICADA', false],
    ['ORD_NOTIFICADA', 'Notificada', 'ORD_LISTA_NOTIFICACION', 'ORD_RECEPCION_CONFIRMADA', false],
    ['ORD_RECEPCION_CONFIRMADA', 'Recepción confirmada', 'ORD_NOTIFICADA', null, false],
    ['ORD_OBSERVADA', 'Observada', 'ORD_NOTIFICADA', 'ORD_BORRADOR', false],
    ['ORD_ANULADA', 'Anulada', null, null, true],
    ['ORD_RESUELTA', 'Resuelta', 'ORD_RECEPCION_CONFIRMADA', null, true],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.ORDEN, previo, siguiente, terminal,
  }))),
  [DOMINIOS.EJECUCION]: Object.freeze([
    ['EJ_ENTREGA_RECIBIDA', 'Entrega recibida (bienes)', null, 'EJ_CONFORMIDAD_REGISTRADA', false],
    ['EJ_ENTREGABLE_RECIBIDO', 'Entregable recibido (S/L)', null, 'EJ_CONFORMIDAD_REGISTRADA', false],
    ['EJ_CONFORMIDAD_REGISTRADA', 'Conformidad registrada', 'EJ_ENTREGA_RECIBIDA', null, false],
    ['EJ_AMPLIACION_REGISTRADA', 'Ampliación registrada', null, null, false],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.EJECUCION, previo, siguiente, terminal,
  }))),
  [DOMINIOS.OBSERVACION]: Object.freeze([
    ['OBS_EMITIDA', 'Emitida', null, 'OBS_EN_ATENCION', false],
    ['OBS_EN_ATENCION', 'En atención', 'OBS_EMITIDA', 'OBS_SUBSANADA', false],
    ['OBS_SUBSANADA', 'Subsanada', 'OBS_EN_ATENCION', 'OBS_CERRADA', false],
    ['OBS_CERRADA', 'Cerrada', 'OBS_SUBSANADA', null, true],
  ].map(([codigo, label, previo, siguiente, terminal]) => Object.freeze({
    codigo, label, dominio: DOMINIOS.OBSERVACION, previo, siguiente, terminal,
  }))),
});

function etapaDeEstadoExpediente(codigo) {
  const map = {
    EXP_REGISTRO: 'REGISTRO',
    EXP_EVALUACION: 'EVALUACION',
    EXP_DEC: 'DEC',
    EXP_PROGRAMACION: 'PROGRAMACION',
    EXP_COORDINACION_CM: 'COORDINACION_CM',
    EXP_INVITACIONES: 'INVITACIONES',
    EXP_RECEPCION_COTIZACIONES: 'RECEPCION_COTIZACIONES',
    EXP_VALIDACIONES: 'VALIDACIONES',
    EXP_CUADRO_COMPARATIVO: 'CUADRO_COMPARATIVO',
    EXP_CCP: 'CCP',
    EXP_REGISTRO_ORDEN: 'REGISTRO_ORDEN',
    EXP_RECEPCION_BIENES: 'RECEPCION_BIENES',
    EXP_PRESENTACION_ENTREGABLES: 'PRESENTACION_ENTREGABLES',
    EXP_DERIVACION_PAGO: 'DERIVACION_PAGO',
    EXP_FINALIZADO: 'FINALIZADO',
  };
  return map[codigo] || null;
}

/** Índice código → estado (inmutable). */
const BY_CODE = Object.freeze(
  Object.values(ESTADOS_DEF).flat().reduce((m, e) => {
    m[e.codigo] = e;
    return m;
  }, Object.create(null)),
);

export function getEstadosPorDominio(dominio) {
  return ESTADOS_DEF[dominio] || Object.freeze([]);
}

export function getEstadoPorCodigo(codigo) {
  return BY_CODE[codigo] || null;
}

export function getCatalogoEstados() {
  return Object.values(ESTADOS_DEF).flat();
}

export function esEstadoValido(codigo) {
  return Object.prototype.hasOwnProperty.call(BY_CODE, codigo);
}

export function esEstadoTerminal(codigo) {
  return !!BY_CODE[codigo]?.terminal;
}

export function getEstadoExpedienteDeEtapa(etapaCodigo) {
  return Object.values(ESTADOS_DEF[DOMINIOS.EXPEDIENTE])
    .find((e) => e.etapa === etapaCodigo) || null;
}

export default {
  DOMINIOS,
  DOMINIOS_LIST,
  getEstadosPorDominio,
  getEstadoPorCodigo,
  getCatalogoEstados,
  esEstadoValido,
  esEstadoTerminal,
  getEstadoExpedienteDeEtapa,
};