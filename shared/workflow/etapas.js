/**
 * Catálogo canónico de etapas de ubicación del expediente SGC.
 * Compartido BE/FE. Sin dependencias de BD.
 *
 * Reglas:
 * - Cada etapa es la ubicación vigente del expediente (requerimientos.estado_actual).
 * - CONSULTAS_OBSERVACIONES NO es etapa del expediente: es fase interna del
 *   dominio SOLICITUD_COTIZACION (ver estadosPorDominio.js / SC_ABIERTA_CONSULTAS).
 * - RECEPCION_BIENES solo BIEN; PRESENTACION_ENTREGABLES SERVICIO/LOCACION.
 * - DERIVACION_PAGO no es terminal; FINALIZADO es la única terminal.
 */

export const ETAPAS = Object.freeze({
  REGISTRO: 'REGISTRO',
  EVALUACION: 'EVALUACION',
  DEC: 'DEC',
  PROGRAMACION: 'PROGRAMACION',
  COORDINACION_CM: 'COORDINACION_CM',
  INVITACIONES: 'INVITACIONES',
  RECEPCION_COTIZACIONES: 'RECEPCION_COTIZACIONES',
  VALIDACIONES: 'VALIDACIONES',
  CUADRO_COMPARATIVO: 'CUADRO_COMPARATIVO',
  CCP: 'CCP',
  REGISTRO_ORDEN: 'REGISTRO_ORDEN',
  RECEPCION_BIENES: 'RECEPCION_BIENES',
  PRESENTACION_ENTREGABLES: 'PRESENTACION_ENTREGABLES',
  REVISION_COORDINADOR_CM: 'REVISION_COORDINADOR_CM',
  REVISION_ANALISTA_CM: 'REVISION_ANALISTA_CM',
  PREPARACION_EXPEDIENTE_PAGO: 'PREPARACION_EXPEDIENTE_PAGO',
  DERIVACION_PAGO: 'DERIVACION_PAGO',
  FINALIZADO: 'FINALIZADO',
});

export const ETAPAS_LIST = Object.freeze(Object.values(ETAPAS));

const TODOS = Object.freeze(['BIEN', 'SERVICIO', 'LOCACION', 'VIATICO_PASAJE_AEREO']);

/** Meta por etapa: label, submódulo, responsable y tipos permitidos. */
const ETAPA_META_DEF = Object.freeze({
  REGISTRO: Object.freeze({
    codigo: 'REGISTRO', label: 'Registro',
    submoduloCodigo: 'REGISTRO_REQUERIMIENTO', submoduloLabel: 'Registro de Requerimiento',
    responsableCodigo: 'USUARIO_AU', responsableLabel: 'Usuario AU',
    tipos: TODOS, terminal: false,
  }),
  EVALUACION: Object.freeze({
    codigo: 'EVALUACION', label: 'Evaluación',
    submoduloCodigo: 'EVALUACION_REQUERIMIENTO', submoduloLabel: 'Evaluación de Requerimiento',
    responsableCodigo: 'DIRECTOR_GERENTE', responsableLabel: 'Director / Gerente',
    tipos: TODOS, terminal: false,
  }),
  DEC: Object.freeze({
    codigo: 'DEC', label: 'DEC',
    submoduloCodigo: 'DEC', submoduloLabel: 'DEC',
    responsableCodigo: 'DEC', responsableLabel: 'DEC',
    tipos: TODOS, terminal: false,
  }),
  PROGRAMACION: Object.freeze({
    codigo: 'PROGRAMACION', label: 'Programación',
    submoduloCodigo: 'PROGRAMACION', submoduloLabel: 'Programación',
    responsableCodigo: 'PROGRAMADOR', responsableLabel: 'Programador',
    tipos: TODOS, terminal: false,
  }),
  COORDINACION_CM: Object.freeze({
    codigo: 'COORDINACION_CM', label: 'Coordinación CM',
    submoduloCodigo: 'COORDINACION_CM', submoduloLabel: 'Coordinación CM',
    responsableCodigo: 'COORDINADOR_CM', responsableLabel: 'Coordinador de Contratos Menores',
    tipos: TODOS, terminal: false,
  }),
  INVITACIONES: Object.freeze({
    codigo: 'INVITACIONES', label: 'Invitaciones',
    submoduloCodigo: 'INVITACIONES', submoduloLabel: 'Invitaciones',
    responsableCodigo: 'ESPECIALISTA_CONTRATACIONES', responsableLabel: 'Especialista Contrataciones',
    tipos: TODOS, terminal: false,
  }),
  RECEPCION_COTIZACIONES: Object.freeze({
    codigo: 'RECEPCION_COTIZACIONES', label: 'Recepción de Cotizaciones',
    submoduloCodigo: 'RECEPCION_COTIZACIONES', submoduloLabel: 'Cotizaciones',
    responsableCodigo: 'ESPECIALISTA_CONTRATACIONES', responsableLabel: 'Especialista Contrataciones',
    tipos: Object.freeze(['BIEN', 'SERVICIO', 'LOCACION']), terminal: false,
  }),
  VALIDACIONES: Object.freeze({
    codigo: 'VALIDACIONES', label: 'Validaciones',
    submoduloCodigo: 'VALIDACIONES', submoduloLabel: 'Validación Usuario',
    responsableCodigo: 'AREA_USUARIA', responsableLabel: 'Área Usuaria',
    tipos: Object.freeze(['BIEN', 'SERVICIO']), terminal: false,
  }),
  CUADRO_COMPARATIVO: Object.freeze({
    codigo: 'CUADRO_COMPARATIVO', label: 'Cuadro Comparativo',
    submoduloCodigo: 'CUADRO_COMPARATIVO', submoduloLabel: 'Cuadro Comparativo',
    responsableCodigo: 'ESPECIALISTA_CONTRATACIONES', responsableLabel: 'Especialista Contrataciones',
    tipos: Object.freeze(['BIEN', 'SERVICIO']), terminal: false,
  }),
  CCP: Object.freeze({
    codigo: 'CCP', label: 'CCP',
    submoduloCodigo: 'CCP', submoduloLabel: 'CCP',
    responsableCodigo: 'COMITE_CCP', responsableLabel: 'Comité de Compras Públicas',
    tipos: TODOS, terminal: false,
  }),
  REGISTRO_ORDEN: Object.freeze({
    codigo: 'REGISTRO_ORDEN', label: 'Registro de Orden',
    submoduloCodigo: 'REGISTRO_ORDEN', submoduloLabel: 'Registro de Órdenes',
    responsableCodigo: 'ESPECIALISTA_CONTRATACIONES', responsableLabel: 'Especialista Contrataciones',
    tipos: TODOS, terminal: false,
  }),
  RECEPCION_BIENES: Object.freeze({
    codigo: 'RECEPCION_BIENES', label: 'Recepción de Bienes',
    submoduloCodigo: 'RECEPCION_BIENES', submoduloLabel: 'Almacén',
    responsableCodigo: 'ALMACEN', responsableLabel: 'Almacén',
    tipos: Object.freeze(['BIEN']), terminal: false,
  }),
  PRESENTACION_ENTREGABLES: Object.freeze({
    codigo: 'PRESENTACION_ENTREGABLES', label: 'Presentación de Entregables',
    submoduloCodigo: 'PRESENTACION_ENTREGABLES', submoduloLabel: 'Entregables',
    responsableCodigo: 'AREA_USUARIA', responsableLabel: 'Área Usuaria',
    tipos: Object.freeze(['SERVICIO', 'LOCACION']), terminal: false,
  }),
  REVISION_COORDINADOR_CM: Object.freeze({
    codigo: 'REVISION_COORDINADOR_CM', label: 'Revisión Coordinador CM',
    submoduloCodigo: 'PRESENTACION_ENTREGABLES', submoduloLabel: 'Presentación de Entregables',
    responsableCodigo: 'COORDINADOR_CM', responsableLabel: 'Coordinación CM',
    tipos: Object.freeze(['SERVICIO', 'LOCACION']), terminal: false,
  }),
  REVISION_ANALISTA_CM: Object.freeze({
    codigo: 'REVISION_ANALISTA_CM', label: 'Revisión Analista CM',
    submoduloCodigo: 'PRESENTACION_ENTREGABLES', submoduloLabel: 'Presentación de Entregables',
    responsableCodigo: 'ANALISTA_CONTRATACIONES', responsableLabel: 'Analista de Contrataciones',
    tipos: Object.freeze(['SERVICIO', 'LOCACION']), terminal: false,
  }),
  PREPARACION_EXPEDIENTE_PAGO: Object.freeze({
    codigo: 'PREPARACION_EXPEDIENTE_PAGO', label: 'Preparación de expediente para Pago',
    submoduloCodigo: 'TESORERIA', submoduloLabel: 'Pagos',
    responsableCodigo: 'ANALISTA_CONTRATACIONES', responsableLabel: 'Analista de Contrataciones',
    tipos: Object.freeze(['SERVICIO', 'LOCACION']), terminal: false,
  }),
  DERIVACION_PAGO: Object.freeze({
    codigo: 'DERIVACION_PAGO', label: 'Derivación a Pago',
    submoduloCodigo: 'DERIVACION_PAGO', submoduloLabel: 'Pago',
    responsableCodigo: 'ANALISTA_PAGO', responsableLabel: 'Analista de Pago',
    tipos: Object.freeze(['BIEN', 'SERVICIO', 'LOCACION']), terminal: false,
  }),
  FINALIZADO: Object.freeze({
    codigo: 'FINALIZADO', label: 'Finalizado',
    submoduloCodigo: 'FINALIZADO', submoduloLabel: 'Finalizado',
    responsableCodigo: 'SISTEMA', responsableLabel: '—',
    tipos: Object.freeze(['BIEN', 'SERVICIO', 'LOCACION']), terminal: true,
  }),
});

const BY_CODE = Object.freeze(Object.fromEntries(ETAPAS_LIST.map((c) => [c, ETAPA_META_DEF[c]])));

export function esEtapaValida(codigo) {
  return Object.prototype.hasOwnProperty.call(BY_CODE, codigo);
}

export function getEtapaMeta(codigo) {
  return esEtapaValida(codigo) ? ETAPA_META_DEF[codigo] : null;
}

export function getLabelEtapa(codigo) {
  return getEtapaMeta(codigo)?.label || '';
}

export function getSubmoduloCodigo(codigo) {
  return getEtapaMeta(codigo)?.submoduloCodigo || '';
}

export function getSubmoduloLabel(codigo) {
  return getEtapaMeta(codigo)?.submoduloLabel || '';
}

export function getResponsableCodigo(codigo) {
  return getEtapaMeta(codigo)?.responsableCodigo || '';
}

export function getResponsableLabel(codigo) {
  return getEtapaMeta(codigo)?.responsableLabel || '';
}

export function esEtapaTerminal(codigo) {
  return getEtapaMeta(codigo)?.terminal === true;
}

export function esEtapaPermitidaParaTipo(etapaCodigo, tipoContratacion) {
  const meta = getEtapaMeta(etapaCodigo);
  return !!(meta && meta.tipos.includes(tipoContratacion));
}

export default {
  ETAPAS,
  ETAPAS_LIST,
  ETAPA_META_DEF,
  esEtapaValida,
  getEtapaMeta,
  getLabelEtapa,
  getSubmoduloCodigo,
  getSubmoduloLabel,
  getResponsableCodigo,
  getResponsableLabel,
  esEtapaTerminal,
  esEtapaPermitidaParaTipo,
};