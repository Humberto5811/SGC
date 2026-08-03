/**
 * Catálogo canónico de tipos de contratación del SGC.
 * Compartido BE/FE. Sin dependencias de BD.
 *
 * Versión inicial del workflow: 1.0.0 (ver workflowContract.js).
 *
 * Reglas:
 * - VIATICO_PASAJE_AEREO está definido en catálogo y matriz, pero NO está
 *   habilitado productivamente (flag conceptual WORKFLOW_ENGINE_VIATICOS=off).
 */

export const TIPOS_CONTRATACION = Object.freeze({
  BIEN: 'BIEN',
  SERVICIO: 'SERVICIO',
  LOCACION: 'LOCACION',
  VIATICO_PASAJE_AEREO: 'VIATICO_PASAJE_AEREO',
});

/** Códigos canónicos únicos. */
export const TIPOS_LIST = Object.freeze(Object.values(TIPOS_CONTRATACION));

/** Meta por tipo: label, alias históricos (solo lectura) y flag de habilitación. */
const TIPO_META_DEF = Object.freeze({
  [TIPOS_CONTRATACION.BIEN]: Object.freeze({
    codigo: TIPOS_CONTRATACION.BIEN,
    label: 'Bien',
    aliasesLegacy: Object.freeze(['bienes', 'BIENES', 'B']),
    habilitado: true,
  }),
  [TIPOS_CONTRATACION.SERVICIO]: Object.freeze({
    codigo: TIPOS_CONTRATACION.SERVICIO,
    label: 'Servicio',
    aliasesLegacy: Object.freeze(['servicios', 'SERVICIOS', 'S']),
    habilitado: true,
  }),
  [TIPOS_CONTRATACION.LOCACION]: Object.freeze({
    codigo: TIPOS_CONTRATACION.LOCACION,
    label: 'Locación',
    aliasesLegacy: Object.freeze(['locacion', 'LOCACIONES', 'locadores', 'LOCADORES', 'L']),
    habilitado: true,
  }),
  [TIPOS_CONTRATACION.VIATICO_PASAJE_AEREO]: Object.freeze({
    codigo: TIPOS_CONTRATACION.VIATICO_PASAJE_AEREO,
    label: 'Viático / Pasaje Aéreo',
    aliasesLegacy: Object.freeze(['viatico', 'VIATICOS', 'PASAJE_AEREO', 'PASAJES_AEREOS', 'V']),
    // Definido en catálogo y matriz, pero NO habilitado productivamente.
    habilitado: false,
    flag: 'WORKFLOW_ENGINE_VIATICOS',
  }),
});

const BY_CODE = Object.freeze(Object.fromEntries(
  TIPOS_LIST.map((c) => [c, TIPO_META_DEF[c]]),
));

const ALIAS_MAP = (() => {
  const m = Object.create(null);
  const norm = (v) => String(v || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  for (const tipo of TIPOS_LIST) {
    const meta = TIPO_META_DEF[tipo];
    m[norm(tipo)] = tipo;
    for (const a of meta.aliasesLegacy) m[norm(a)] = tipo;
  }
  return Object.freeze(m);
})();

/** True si el código es un tipo de contratación canónico. */
export function esTipoValido(codigo) {
  return Object.prototype.hasOwnProperty.call(BY_CODE, codigo);
}

/** Normaliza un valor histórico a código canónico (solo lectura legacy). */
export function normalizarTipo(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!s) return '';
  if (ALIAS_MAP[s]) return ALIAS_MAP[s];
  return esTipoValido(s) ? s : '';
}

/** Meta inmmutable por tipo. */
export function getTipoMeta(codigo) {
  const c = normalizarTipo(codigo);
  return c ? TIPO_META_DEF[c] : null;
}

export function getLabelTipo(codigo) {
  return getTipoMeta(codigo)?.label || '';
}

/** True si el tipo está habilitado productivamente. Viático → false. */
export function esTipoHabilitado(codigo) {
  return getTipoMeta(codigo)?.habilitado === true;
}

export default {
  TIPOS_CONTRATACION,
  TIPOS_LIST,
  TIPO_META_DEF,
  esTipoValido,
  normalizarTipo,
  getTipoMeta,
  getLabelTipo,
  esTipoHabilitado,
};