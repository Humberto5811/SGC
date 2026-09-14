/**
 * RC8.17.8B — Equipos funcionales de la Unidad de Adquisiciones (UAD).
 * Código interno estable; labels para UI (sin siglas CM/PS/EC).
 */

export const EQUIPOS_UAD = Object.freeze({
  PROGRAMACION: 'PROGRAMACION',
  CONT_MENORES: 'CONT_MENORES',
  PROC_SELECCION: 'PROC_SELECCION',
  EJEC_CONTRACTUAL: 'EJEC_CONTRACTUAL',
  ALMACEN: 'ALMACEN',
});

/** @type {Readonly<Record<string, string>>} */
export const EQUIPOS_UAD_LABELS = Object.freeze({
  [EQUIPOS_UAD.PROGRAMACION]: 'Programación',
  [EQUIPOS_UAD.CONT_MENORES]: 'Cont.Menores',
  [EQUIPOS_UAD.PROC_SELECCION]: 'Proc.Selección',
  [EQUIPOS_UAD.EJEC_CONTRACTUAL]: 'Ejec.Contractual',
  [EQUIPOS_UAD.ALMACEN]: 'Almacén',
});

export const EQUIPOS_UAD_LIST = Object.freeze(Object.values(EQUIPOS_UAD));

const ALLOWED = new Set(EQUIPOS_UAD_LIST);

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeEquipoUadCodigo(value) {
  if (value == null) return null;
  const v = String(value).trim().toUpperCase();
  if (!v) return null;
  return ALLOWED.has(v) ? v : null;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isEquipoUadCodigoValido(value) {
  if (value == null || String(value).trim() === '') return true;
  return normalizeEquipoUadCodigo(value) != null;
}

/**
 * @param {string|null|undefined} codigo
 * @returns {string}
 */
export function labelEquipoUad(codigo) {
  const c = normalizeEquipoUadCodigo(codigo);
  if (!c) return '';
  return EQUIPOS_UAD_LABELS[c] || c;
}

/**
 * Catálogo para selects (código + label funcional).
 * @returns {{ codigo: string, label: string }[]}
 */
export function listEquiposUadCatalogo() {
  return EQUIPOS_UAD_LIST.map((codigo) => ({
    codigo,
    label: EQUIPOS_UAD_LABELS[codigo],
  }));
}
