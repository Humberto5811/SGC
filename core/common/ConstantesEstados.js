/**
 * Catálogo de estados del SGC Core — Fase 2A.
 * Entidad principal: REQUERIMIENTO (workflow).
 * Estados de observación y legacy se mantienen separados.
 */

/** Estados del workflow del requerimiento (única entidad con flujo de estado). */
export const ESTADOS_REQUERIMIENTO = Object.freeze({
  BORRADOR: 'BORRADOR',
  REGISTRADO: 'REGISTRADO',
  DEC: 'DEC',
  PROGRAMACION: 'PROGRAMACIÓN',
  COORDINACION_CM: 'COORDINACIÓN CM',
  INVITACIONES: 'INVITACIONES',
  CONSULTAS: 'CONSULTAS',
  VALIDACION: 'VALIDACIÓN',
  CUADRO_COMPARATIVO: 'CUADRO COMPARATIVO',
  CCP: 'CCP',
  EJECUCION: 'EJECUCIÓN',
  FINALIZADO: 'FINALIZADO',
});

/** Alias principal — usar ESTADOS para el workflow del requerimiento. */
export const ESTADOS = ESTADOS_REQUERIMIENTO;

export const ESTADOS_LIST = Object.freeze(Object.values(ESTADOS_REQUERIMIENTO));

export const ESTADOS_TERMINALES = Object.freeze([
  ESTADOS_REQUERIMIENTO.FINALIZADO,
]);

/** Ciclo completo de una observación (no confundir con estado del requerimiento). */
export const CICLO_OBSERVACION = Object.freeze({
  EMITIDA: 'EMITIDA',
  RECIBIDA: 'RECIBIDA',
  EN_ATENCION: 'EN ATENCIÓN',
  SUBSANADA: 'SUBSANADA',
  RECIBIDA_EMISOR: 'RECIBIDA POR EL EMISOR',
  CERRADA: 'CERRADA',
});

/** Alias — usar CICLO_OBSERVACION en código nuevo. */
export const ESTADOS_OBSERVACION = CICLO_OBSERVACION;

/** Compatibilidad imports legacy fase 1. */
export const ESTADOS_OBSERVACION_LEGACY = Object.freeze({
  OBSERVADO: 'OBSERVADO',
  RESPONDIDO: 'RESPONDIDO',
  CERRADO: 'CERRADO',
});

/** Estados operativos por módulo (workflow interno, no estado global del requerimiento). */
export const ESTADOS_MODULO = Object.freeze({
  RECIBIDO: 'RECIBIDO',
  EN_PROCESO: 'EN PROCESO',
  OBSERVADO: 'OBSERVADO',
  SUBSANADO: 'SUBSANADO',
  APROBADO: 'APROBADO',
  DERIVADO: 'DERIVADO',
  RECHAZADO: 'RECHAZADO',
  DEVUELTO: 'DEVUELTO',
  ARCHIVADO: 'ARCHIVADO',
});

export const TRANSICIONES_CICLO_OBSERVACION = Object.freeze({
  [CICLO_OBSERVACION.EMITIDA]: [CICLO_OBSERVACION.RECIBIDA],
  [CICLO_OBSERVACION.RECIBIDA]: [CICLO_OBSERVACION.EN_ATENCION],
  [CICLO_OBSERVACION.EN_ATENCION]: [CICLO_OBSERVACION.SUBSANADA],
  [CICLO_OBSERVACION.SUBSANADA]: [CICLO_OBSERVACION.RECIBIDA_EMISOR],
  [CICLO_OBSERVACION.RECIBIDA_EMISOR]: [CICLO_OBSERVACION.CERRADA],
  [CICLO_OBSERVACION.CERRADA]: [],
});

/** Catálogo legacy fase 1 — conservado para compatibilidad de imports. */
export const ESTADOS_LEGACY = Object.freeze({
  PENDIENTE: 'PENDIENTE',
  EN_PROCESO: 'EN PROCESO',
  DERIVADO: 'DERIVADO',
  OBSERVADO: 'OBSERVADO',
  RESPONDIDO: 'RESPONDIDO',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
  CERRADO: 'CERRADO',
  ANULADO: 'ANULADO',
});

/** Secuencia lineal del flujo del requerimiento (historial / workflow). */
export const FLUJO_REQUERIMIENTO = Object.freeze([
  ESTADOS_REQUERIMIENTO.BORRADOR,
  ESTADOS_REQUERIMIENTO.REGISTRADO,
  ESTADOS_REQUERIMIENTO.DEC,
  ESTADOS_REQUERIMIENTO.PROGRAMACION,
  ESTADOS_REQUERIMIENTO.COORDINACION_CM,
  ESTADOS_REQUERIMIENTO.INVITACIONES,
  ESTADOS_REQUERIMIENTO.CONSULTAS,
  ESTADOS_REQUERIMIENTO.VALIDACION,
  ESTADOS_REQUERIMIENTO.CUADRO_COMPARATIVO,
  ESTADOS_REQUERIMIENTO.CCP,
  ESTADOS_REQUERIMIENTO.EJECUCION,
  ESTADOS_REQUERIMIENTO.FINALIZADO,
]);

export function esEstadoValido(estado) {
  const v = String(estado || '').trim();
  if (!v) return false;
  return ESTADOS_LIST.some((e) => e.toUpperCase() === v.toUpperCase());
}

export function normalizarEstado(estado) {
  const v = String(estado || '').trim();
  if (!v) return null;
  return ESTADOS_LIST.find((e) => e.toUpperCase() === v.toUpperCase()) || null;
}

export default ESTADOS;
