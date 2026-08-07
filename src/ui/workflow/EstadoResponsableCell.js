/**
 * RC8.6B — Celda institucional Estado + Responsable (+ etapa / fecha).
 * Variantes: compact | standard | detailed
 */
import { adaptEstadoResponsable } from './adaptEstadoResponsable.js';
import { renderEstadoBadgeHtml } from './EstadoBadge.js';
import { renderResponsableBadgeHtml } from './ResponsableBadge.js';
import { getEtapaDisplayLabel } from './getEtapaDisplayLabel.js';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFechaLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return '';
  }
}

/**
 * @param {object} row
 * @param {'compact'|'standard'|'detailed'} [variant]
 * @param {{ observed?: boolean, escFn?: Function }} [opts]
 */
export function renderEstadoResponsableCellHtml(row, variant = 'standard', opts = {}) {
  const data = adaptEstadoResponsable(row);
  const observed = !!opts.observed;
  const estadoHtml = renderEstadoBadgeHtml(data, { observed });
  const respHtml = renderResponsableBadgeHtml(data);

  if (variant === 'compact') {
    return `<div class="sgc-estado-responsable-cell sgc-estado-responsable-cell--compact"><div class="sgc-estado-responsable-cell__row">${estadoHtml}${respHtml}</div></div>`;
  }

  // RC8.10.1 — nunca imprimir etapaCodigo técnico en UI.
  const etapa = getEtapaDisplayLabel(row);
  const etapaHtml = etapa
    ? `<div class="sgc-estado-responsable-cell__etapa" title="${esc(etapa)}">${esc(etapa)}</div>`
    : '';

  if (variant === 'detailed') {
    const fecha = formatFechaLocal(data.actualizadoAt);
    const fechaHtml = fecha
      ? `<div class="sgc-estado-responsable-cell__fecha" title="Actualizado: ${esc(fecha)}">${esc(fecha)}</div>`
      : '';
    return `<div class="sgc-estado-responsable-cell sgc-estado-responsable-cell--detailed"><div class="sgc-estado-responsable-cell__row">${estadoHtml}${respHtml}</div>${etapaHtml}${fechaHtml}</div>`;
  }

  // standard
  return `<div class="sgc-estado-responsable-cell sgc-estado-responsable-cell--standard"><div class="sgc-estado-responsable-cell__row">${estadoHtml}${respHtml}</div>${etapaHtml}</div>`;
}

export default { renderEstadoResponsableCellHtml };
