/**
 * RC8.17 Fase 1 — Resolución centralizada del menú ⋮ de bandejas.
 * Delega reglas existentes en bandejaActions.js (sin reemplazarlas).
 */
import {
  registroMenuItems,
  registroHiddenActions,
  evalMenuItems,
  evalHiddenActions,
  decMenuItems,
  decHiddenActions,
} from './bandejaActions.js';

export const BANDEJA_MODULOS = Object.freeze({
  REGISTRO: 'REGISTRO_REQUERIMIENTO',
  EVALUACION: 'EVALUACION_REQUERIMIENTO',
  DEC: 'DEC',
});

const MODULO_BY_PREFIX = Object.freeze({
  req: BANDEJA_MODULOS.REGISTRO,
  eval: BANDEJA_MODULOS.EVALUACION,
  dec: BANDEJA_MODULOS.DEC,
});

function normalizeModulo(modulo, prefix) {
  if (modulo) return modulo;
  if (prefix && MODULO_BY_PREFIX[prefix]) return MODULO_BY_PREFIX[prefix];
  return null;
}

/**
 * @param {object} opts
 * @param {string} [opts.modulo]
 * @param {string} [opts.prefix]
 * @param {object} opts.row
 * @param {Function} [opts.escFn]
 * @param {object} [opts.ctx] — contexto adicional (p.ej. actos)
 */
export function resolveBandejaAcciones(opts = {}) {
  const { row = {}, escFn = (s) => String(s ?? ''), ctx = {} } = opts;
  const modulo = normalizeModulo(opts.modulo, opts.prefix);

  switch (modulo) {
    case BANDEJA_MODULOS.REGISTRO:
      return {
        menuItems: registroMenuItems(row),
        hiddenActionsHtml: registroHiddenActions(row, escFn),
      };
    case BANDEJA_MODULOS.EVALUACION:
      return {
        menuItems: evalMenuItems(row),
        hiddenActionsHtml: evalHiddenActions(row, escFn),
      };
    case BANDEJA_MODULOS.DEC:
      return {
        menuItems: decMenuItems(row),
        hiddenActionsHtml: decHiddenActions(row),
      };
    default:
      return { menuItems: [{ act: 'detail', label: 'Ver detalle', icon: 'bi-eye' }], hiddenActionsHtml: '' };
  }
}

export default { resolveBandejaAcciones, BANDEJA_MODULOS };
