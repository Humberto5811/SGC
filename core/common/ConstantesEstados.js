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

/** Estados propios de observaciones (no son estados del requerimiento). */
export const ESTADOS_OBSERVACION = Object.freeze({
  OBSERVADO: 'OBSERVADO',
  RESPONDIDO: 'RESPONDIDO',
  CERRADO: 'CERRADO',
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
