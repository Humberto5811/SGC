/**
 * Presentador visual central del estado vigente.
 * RC8.6B — delega HTML al estándar institucional (sin colores inline).
 */
import { SITUACIONES } from '../../shared/estadoExpedienteCatalog.js';
import { getEstadoCatalogEntry, getCategoriaCssClass } from '../ui/workflow/estadoCatalogo.js';
import { renderEstadoBadgeHtml } from '../ui/workflow/EstadoBadge.js';

function composeLabel(estadoVigente, situacion) {
  if (!estadoVigente) return '—';
  const base = estadoVigente.label || estadoVigente.codigo || '—';
  if (situacion?.codigo === SITUACIONES.OBSERVADO.codigo
    || situacion?.codigo === 'OBSERVADO') {
    if (estadoVigente.codigo === 'CUADRO_EN_COORDINACION_CM') {
      return 'C.C. en Coordinación CM - Observado';
    }
    if (estadoVigente.codigo === 'CUADRO_EN_DEC') {
      return 'C.C. en DEC - Observado';
    }
    if (!String(base).includes('Observado')) return `${base} - Observado`;
  }
  return base;
}

/**
 * @param {{ codigo?: string, label?: string, etapa?: string, prioridad?: number }|null} estadoVigente
 * @param {{ codigo?: string, label?: string }|null} situacion
 */
export function presentEstadoExpediente(estadoVigente, situacion = null) {
  const codigo = estadoVigente?.codigo || '';
  const label = composeLabel(estadoVigente, situacion);
  const entry = getEstadoCatalogEntry(codigo, label);
  const observado = situacion?.codigo === 'OBSERVADO';
  const tooltipParts = [label];
  if (estadoVigente?.etapa) tooltipParts.push(`Etapa: ${estadoVigente.etapa}`);
  if (observado && situacion?.motivo) tooltipParts.push(`Motivo: ${situacion.motivo}`);
  const catClass = getCategoriaCssClass(observado ? 'OBSERVADO' : entry.categoria);

  return {
    label,
    className: `sgc-estado-badge sgc-estado-badge--${catClass} badge-estado-mod`,
    icon: entry.icono,
    tooltip: tooltipParts.filter(Boolean).join(' · '),
    dataEstado: codigo,
    style: '',
    color: null,
    observado,
    categoria: entry.categoria,
  };
}

export function renderEstadoExpedienteHtml(estadoVigente, situacion = null, escFn = (s) => String(s ?? '')) {
  const p = presentEstadoExpediente(estadoVigente, situacion);
  return renderEstadoBadgeHtml({
    estadoCodigo: p.dataEstado,
    estadoLabel: p.label,
    categoria: p.categoria,
    icono: p.icon,
    tooltip: p.tooltip,
  }, { observed: p.observado && p.categoria !== 'OBSERVADO' });
}
