/**
 * RC8.6B / RC8.8.1 — API pública del estándar visual Estado/Responsable.
 * Sin reinferencia por evidencia en lectura.
 */
import { adaptEstadoResponsable, TIPO_RESPONSABLE_UI } from './adaptEstadoResponsable.js';
import {
  getEstadoCatalogEntry,
  getCategoriaCssClass,
  CATEGORIAS_VISUALES,
  assertUniqueLabels,
} from './estadoCatalogo.js';
import { renderEstadoBadgeHtml, renderEstadoBadgeFromRow } from './EstadoBadge.js';
import { renderResponsableBadgeHtml, renderResponsableBadgeFromRow } from './ResponsableBadge.js';
import { renderEstadoResponsableCellHtml } from './EstadoResponsableCell.js';

export {
  adaptEstadoResponsable,
  TIPO_RESPONSABLE_UI,
  getEstadoCatalogEntry,
  getCategoriaCssClass,
  CATEGORIAS_VISUALES,
  assertUniqueLabels,
  renderEstadoBadgeHtml,
  renderEstadoBadgeFromRow,
  renderResponsableBadgeHtml,
  renderResponsableBadgeFromRow,
  renderEstadoResponsableCellHtml,
};

/**
 * Badge de estado. RC8.8.1: solo contrato canónico / fallback seguro.
 * NUNCA resolveEstadoExpedienteVigente / codigo_ccp / cuadro / orden.
 */
export function renderBadgeEstadoVigenteHtml(rowOrCode, escFn = (s) => String(s ?? ''), opts = {}) {
  let row = rowOrCode;
  if (typeof rowOrCode === 'string') {
    row = { estado_responsable_vigente: { estadoCodigo: rowOrCode, estadoLabel: rowOrCode } };
  }
  const adapted = adaptEstadoResponsable(row || {});
  return renderEstadoBadgeHtml(adapted, opts);
}
