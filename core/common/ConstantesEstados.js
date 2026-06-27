/**
 * Catálogo único de estados del SGC Core.
 * Usar siempre estas constantes — no textos literales dispersos.
 */

export const ESTADOS = Object.freeze({
  BORRADOR: 'BORRADOR',
  PENDIENTE: 'PENDIENTE',
  EN_PROCESO: 'EN PROCESO',
  DERIVADO: 'DERIVADO',
  OBSERVADO: 'OBSERVADO',
  RESPONDIDO: 'RESPONDIDO',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
  FINALIZADO: 'FINALIZADO',
  CERRADO: 'CERRADO',
  ANULADO: 'ANULADO',
});

export const ESTADOS_LIST = Object.freeze(Object.values(ESTADOS));

export const ESTADOS_TERMINALES = Object.freeze([
  ESTADOS.FINALIZADO,
  ESTADOS.CERRADO,
  ESTADOS.ANULADO,
  ESTADOS.RECHAZADO,
]);

export function esEstadoValido(estado) {
  return ESTADOS_LIST.includes(String(estado || '').toUpperCase());
}

export function normalizarEstado(estado) {
  const v = String(estado || '').trim().toUpperCase();
  return esEstadoValido(v) ? v : null;
}

export default ESTADOS;
