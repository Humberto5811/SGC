/**
 * RC8.6B — API pública del estándar visual Estado/Responsable.
 */
import { resolveEstadoExpedienteVigente } from '../../../shared/estadoExpedienteVigente.js';
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
 * Reemplazo FE de renderBadgeEstadoVigenteHtml (shared) para vistas migradas.
 */
export function renderBadgeEstadoVigenteHtml(rowOrCode, escFn = (s) => String(s ?? ''), opts = {}) {
  let row = rowOrCode;
  if (typeof rowOrCode === 'string') {
    row = { estado: rowOrCode, estado_responsable_vigente: { estadoCodigo: rowOrCode } };
  }
  const vigente = resolveEstadoExpedienteVigente(row || {}, opts);
  const code = vigente?.codigo || vigente?.estadoVigente?.codigo || '';
  const label = vigente?.label || vigente?.estadoVigente?.label || '';
  const adapted = adaptEstadoResponsable({
    ...row,
    estado_responsable_vigente: row?.estado_responsable_vigente || {
      estadoCodigo: code,
      estadoLabel: label,
      etapaCodigo: vigente?.etapa || '',
      etapaLabel: '',
    },
  });
  if (code) {
    adapted.estadoCodigo = code;
    adapted.estadoLabel = label || adapted.estadoLabel;
  }
  const observed = vigente?.situacion?.codigo === 'OBSERVADO';
  return renderEstadoBadgeHtml(adapted, { observed });
}
