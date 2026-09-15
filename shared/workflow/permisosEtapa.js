/**
 * RC8.17.8H — Alias etapa workflow → submódulo de permisos operativos (sin duplicar catálogo).
 */
export const SUBMODULO_PERMISOS_POR_ETAPA = Object.freeze({
  COORDINACION_CM: 'ACTOS_PREPARATORIOS',
});

/** Submódulo de permisos para validar actividades; default: mismo código de etapa. */
export function submoduloPermisosParaEtapa(etapaCodigo) {
  const e = String(etapaCodigo || '').trim().toUpperCase();
  return SUBMODULO_PERMISOS_POR_ETAPA[e] || e;
}
