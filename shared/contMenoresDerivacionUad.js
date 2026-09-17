/**
 * RC8.17.8H5 / H5-09B — Equipo UAD vs etapa canónica vs destino de transición.
 * CONT_MENORES = equipo organizacional, nunca etapa ERV.
 */
import { EQUIPOS_UAD } from './equiposUad.js';
import { submoduloPermisosParaEtapa } from './workflow/permisosEtapa.js';

/** Etapa canónica asociada al equipo (permisos / operación en submódulo). */
export const ETAPA_FUNCIONAL_POR_EQUIPO_UAD = Object.freeze({
  [EQUIPOS_UAD.PROGRAMACION]: 'PROGRAMACION',
  [EQUIPOS_UAD.CONT_MENORES]: 'COORDINACION_CM',
  [EQUIPOS_UAD.PROC_SELECCION]: 'RECEPCION_COTIZACIONES',
  [EQUIPOS_UAD.EJEC_CONTRACTUAL]: 'REGISTRO_ORDEN',
  [EQUIPOS_UAD.ALMACEN]: 'RECEPCION_BIENES',
});

/**
 * Destino de transición al derivar desde modal UAD (p. ej. CM → Invitaciones).
 * No define etapa vigente intermedia; solo el submódulo destino del evento.
 */
export const ETAPA_TRANSICION_DESTINO_DERIVACION_UAD = Object.freeze({
  [EQUIPOS_UAD.CONT_MENORES]: 'INVITACIONES',
});

export function etapaFuncionalPorEquipoUad(equipoCodigo) {
  return ETAPA_FUNCIONAL_POR_EQUIPO_UAD[String(equipoCodigo || '').toUpperCase()] || null;
}

export function etapaTransicionDestinoDerivacionEquipoUad(equipoCodigo) {
  const eq = String(equipoCodigo || '').toUpperCase();
  return ETAPA_TRANSICION_DESTINO_DERIVACION_UAD[eq]
    || etapaFuncionalPorEquipoUad(eq);
}

/** Submódulo de permisos operativos (no confundir con etapa canónica). */
export function submoduloPermisosPorEquipoUad(equipoCodigo) {
  const etapa = etapaFuncionalPorEquipoUad(equipoCodigo);
  if (!etapa) return null;
  return submoduloPermisosParaEtapa(etapa);
}
