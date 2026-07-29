/**
 * Presentador visual central del estado vigente.
 * NO consulta flags, tablas ni resuelve prioridad.
 * Solo compone label / className / icon / tooltip a partir del contrato.
 */
import { SITUACIONES } from '../../shared/estadoExpedienteCatalog.js';

const COLOR_BY_CODE = Object.freeze({
  CCP_REGISTRADA: { bg: '#198754', fg: '#fff' },
  CCP_REGISTRADO: { bg: '#198754', fg: '#fff' },
  ENVIADA_OPPM: { bg: '#0d6efd', fg: '#fff' },
  DERIVADO_CCP: { bg: '#6f42c1', fg: '#fff' },
  REGISTRO_ORDENES: { bg: '#6f42c1', fg: '#fff' },
  ORDEN_REGISTRADA: { bg: '#0dcaf0', fg: '#055160' },
  ORDEN_LISTA_NOTIFICACION: { bg: '#20c997', fg: '#fff' },
  ORDEN_NOTIFICADA: { bg: '#fd7e14', fg: '#fff' },
  ORDEN_RECEPCION_CONFIRMADA: { bg: '#0d6efd', fg: '#fff' },
  EN_EJECUCION: { bg: '#212529', fg: '#fff' },
  ORDEN_RESUELTA: { bg: '#212529', fg: '#fff' },
  EXPEDIENTE_DERIVADO_PAGO: { bg: '#198754', fg: '#fff' },
  ORDEN_ANULADA: { bg: '#6c757d', fg: '#fff' },
  CUADRO_EN_COORDINACION_CM: { bg: '#495057', fg: '#fff' },
  CUADRO_EN_DEC: { bg: '#6f42c1', fg: '#fff' },
  CUADRO_COMPARATIVO_APROBADO: { bg: '#198754', fg: '#fff' },
});

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
  const colors = COLOR_BY_CODE[codigo] || { bg: '#6c757d', fg: '#fff' };
  const observado = situacion?.codigo === 'OBSERVADO';
  const tooltipParts = [label];
  if (estadoVigente?.etapa) tooltipParts.push(`Etapa: ${estadoVigente.etapa}`);
  if (observado && situacion?.motivo) tooltipParts.push(`Motivo: ${situacion.motivo}`);

  return {
    label,
    className: 'badge badge-estado-mod',
    icon: observado ? 'exclamation-triangle' : null,
    tooltip: tooltipParts.filter(Boolean).join(' · '),
    dataEstado: codigo,
    style: `background:${colors.bg};color:${colors.fg}`,
    color: colors,
    observado,
  };
}

export function renderEstadoExpedienteHtml(estadoVigente, situacion = null, escFn = (s) => String(s ?? '')) {
  const p = presentEstadoExpediente(estadoVigente, situacion);
  let html = `<span class="${p.className}" style="${p.style}" data-estado="${escFn(p.dataEstado)}" title="${escFn(p.tooltip)}">${escFn(p.label)}</span>`;
  if (p.observado) {
    html += `<span class="badge bg-danger ms-1" title="${escFn(p.tooltip)}">Observado</span>`;
  }
  return html;
}
