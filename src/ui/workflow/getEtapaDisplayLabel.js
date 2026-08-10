/**
 * RC8.10.1 — Única fuente del subtítulo de etapa bajo Responsable.
 * Prioriza estado_responsable_vigente.etapaLabel; nunca imprime códigos técnicos.
 */
import { adaptEstadoResponsable } from './adaptEstadoResponsable.js';
import { getLabelEtapa, esEtapaValida } from '../../../shared/workflow/etapas.js';

const ETAPA_NO_DISPONIBLE = 'Etapa no disponible';

/** Códigos técnicos / snake_case ALL_CAPS — no mostrar en UI. */
export function esCodigoTecnicoEtapa(value) {
  const t = String(value == null ? '' : value).trim();
  if (!t) return false;
  // Si es un código de etapa válido en el catálogo canónico (CCP, DEC, INVITACIONES, etc.)
  // NO es un código técnico aunque parezca ALL_CAPS de 3+ caracteres.
  if (esEtapaValida(t)) return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(t) && (t.includes('_') || t.length >= 3)) return true;
  return false;
}

function resolveLabelFromCodigo(codigo) {
  const c = String(codigo || '').trim().toUpperCase();
  if (!c) return '';
  const fromCat = String(getLabelEtapa(c) || '').trim();
  if (fromCat && !esCodigoTecnicoEtapa(fromCat)) return fromCat;
  return '';
}

/**
 * @param {object} row — fila de bandeja (con o sin estado_responsable_vigente)
 * @returns {string} etiqueta humana de etapa
 */
export function getEtapaDisplayLabel(row) {
  const adapted = adaptEstadoResponsable(row || {});
  const codigo = String(adapted.etapaCodigo || '').trim().toUpperCase();
  let label = String(adapted.etapaLabel || '').trim();

  if (label && esCodigoTecnicoEtapa(label)) {
    label = '';
  }

  if (label) return label;

  const fromCodigo = resolveLabelFromCodigo(codigo);
  if (fromCodigo) return fromCodigo;

  return ETAPA_NO_DISPONIBLE;
}

export default { getEtapaDisplayLabel, esCodigoTecnicoEtapa };
