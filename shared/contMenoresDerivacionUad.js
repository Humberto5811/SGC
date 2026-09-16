/**
 * RC8.17.8H5 — Derivación Cont.Menores: equipo UAD vs etapa funcional vs permisos.
 * Elegibilidad de personas = UAD + equipo + rol (COORD/OPER).
 * Permisos de actividad se validan aparte (submoduloPermisosCodigo).
 */
import { EQUIPOS_UAD } from './equiposUad.js';
import { submoduloPermisosParaEtapa } from './workflow/permisosEtapa.js';

/** Etapa funcional de workflow al derivar hacia un equipo UAD. */
export const ETAPA_FUNCIONAL_POR_EQUIPO_UAD = Object.freeze({
  [EQUIPOS_UAD.PROGRAMACION]: 'PROGRAMACION',
  [EQUIPOS_UAD.CONT_MENORES]: 'INVITACIONES',
  [EQUIPOS_UAD.PROC_SELECCION]: 'RECEPCION_COTIZACIONES',
  [EQUIPOS_UAD.EJEC_CONTRACTUAL]: 'REGISTRO_ORDEN',
  [EQUIPOS_UAD.ALMACEN]: 'RECEPCION_BIENES',
});

/** Submódulo de permisos operativos (no confundir con etapa funcional). */
export function submoduloPermisosPorEquipoUad(equipoCodigo) {
  const etapa = ETAPA_FUNCIONAL_POR_EQUIPO_UAD[String(equipoCodigo || '').toUpperCase()];
  if (!etapa) return null;
  return submoduloPermisosParaEtapa(etapa);
}

export function etapaFuncionalPorEquipoUad(equipoCodigo) {
  return ETAPA_FUNCIONAL_POR_EQUIPO_UAD[String(equipoCodigo || '').toUpperCase()] || null;
}
