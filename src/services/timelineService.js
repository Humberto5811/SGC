// Renderizado del timeline vertical (modal y futuro dashboard)
import { fmtDateTime, diasLabel, calcDiasEnEstado, esc } from '../utils/trazabilidad.js';
import { normalizeLegacyActosLabel } from '../utils/observacionDestino.js';
import { movimientosToTimelineEvents } from './historyService.js';

function accionDotClass(accion) {
  const a = String(accion || '').toUpperCase();
  if (a === 'OBSERVADO') return 'traza-event-obs';
  if (a === 'RECIBIDO_OBSERVACION') return 'traza-event-obs';
  if (a === 'SUBSANADO' || a === 'RECIBIDO_SUBSANACION' || a === 'REENVIADO') return 'traza-event-sub';
  if (a === 'APROBADO' || a === 'FINALIZADO' || a === 'RECIBIDO') return 'traza-event-ok';
  return 'traza-event-etapa';
}

function formatMovimientoLabel(m) {
  const accion = String(m?.accion || '').toUpperCase();
  const sub = String(m?.subModulo || m?.sub_modulo || '').trim();
  if (accion === 'RECIBIDO_OBSERVACION') return `Recibido observación · ${sub}`;
  if (accion === 'RECIBIDO_SUBSANACION') return `Recibido subsanación · ${sub}`;
  if (accion === 'RECIBIDO') return `Recibido · ${sub}`;
  if (accion === 'SUBSANADO' && sub) return `Subsanado · ${sub}`;
  if (accion === 'OBSERVADO' && sub) return `Observado · ${sub}`;
  if (accion === 'APROBADO' && sub) return `Aprobado · ${sub}`;
  if (accion === 'DERIVADO' && sub) return `Derivado · ${sub}`;
  if (accion && sub) return `${accion} · ${sub}`;
  return accion || sub || '—';
}

/** Timeline desde historialMovimientos (formato bitácora). */
export function movimientosTimelineHtml(movimientos, escFn = esc) {
  const list = movimientosToTimelineEvents(movimientos).slice().reverse();
  if (!list.length) {
    return '<p class="text-muted mb-0">Sin movimientos registrados.</p>';
  }
  return list.map((m, idx) => {
    const isCurrent = m.esActual || idx === 0;
    const cls = accionDotClass(m.accion);
    const accionBadgeCls = m.accion === 'OBSERVADO'
      ? 'badge bg-danger text-white'
      : 'badge bg-secondary text-white';
    const label = formatMovimientoLabel(m);
    return `
      <div class="traza-timeline-item ${isCurrent ? 'traza-timeline-current' : ''} ${cls}">
        <div class="traza-dot"></div>
        <div class="traza-content mb-2 pb-2">
          <div class="fw-bold"><span class="${accionBadgeCls} me-1">${escFn(label)}</span></div>
          <div class="small text-muted">${escFn(m.modulo)}</div>
          <div class="small mt-1"><i class="bi bi-person"></i> ${escFn(m.usuario)}</div>
          <div class="small"><i class="bi bi-clock"></i> ${escFn(fmtDateTime(m.fecha))}</div>
          ${isCurrent ? '<div class="small text-success fw-semibold">Etapa vigente</div>' : ''}
          ${m.observacion ? `<div class="small mt-2 p-2 rounded bg-light border-start border-3 border-secondary">${escFn(normalizeLegacyActosLabel(m.observacion))}</div>` : ''}
        </div>
      </div>
      ${idx < list.length - 1 ? '<div class="traza-connector">↓</div>' : ''}`;
  }).join('');
}

/** Timeline legacy desde historialEstados. */
export function timelineHtml(historial, escFn = esc) {
  if (!historial?.length) {
    return '<p class="text-muted mb-0">Sin historial de movimientos registrado.</p>';
  }
  const list = historial.slice().reverse();
  return list.map((h, idx) => {
    const label = normalizeLegacyActosLabel(h.estadoTexto || h.estado || '—');
    const isCurrent = h.esActual || idx === 0;
    const duracion = h.dias != null ? h.dias : calcDiasEnEstado(h.fechaIngreso);
    const tipo = h.tipoEvento || 'etapa';
    const tipoClass = tipo === 'observacion' ? 'traza-event-obs' : tipo === 'subsanacion' ? 'traza-event-sub' : 'traza-event-etapa';
    const accionLabel = h.accion ? String(h.accion).replace(/_/g, ' ').toUpperCase() : '';
    return `
      <div class="traza-timeline-item ${isCurrent ? 'traza-timeline-current' : ''} ${tipoClass}">
        <div class="traza-dot"></div>
        <div class="traza-content mb-2 pb-2">
          <div class="fw-bold">${escFn(label)}</div>
          ${accionLabel ? `<div class="small"><span class="badge bg-secondary">${escFn(accionLabel)}</span></div>` : ''}
          <div class="small text-muted mt-1">${escFn(h.usuario || '—')}</div>
          <div class="small">${escFn(fmtDateTime(h.fechaIngreso))}</div>
          ${isCurrent ? `<div class="small text-success">Etapa vigente · ${escFn(diasLabel(duracion))}</div>` : ''}
          ${h.observacion ? `<div class="small mt-2 p-2 rounded bg-light border-start border-3 border-secondary">${escFn(normalizeLegacyActosLabel(h.observacion))}</div>` : ''}
        </div>
      </div>
      ${idx < list.length - 1 ? '<div class="traza-connector">↓</div>' : ''}`;
  }).join('');
}

export function renderTimeline(data, escFn = esc) {
  if (data?.historialMovimientos?.length) {
    return movimientosTimelineHtml(data.historialMovimientos, escFn);
  }
  return timelineHtml(data?.historialEstados || [], escFn);
}

export function timelineModalStyles() {
  return `
    .traza-modal-scroll {
      max-height: min(75vh, 640px);
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 12px;
    }
    .traza-timeline-wrap { padding-left: 8px; }
    .traza-timeline-item { display: flex; gap: 12px; position: relative; }
    .traza-connector { text-align: center; color: #adb5bd; font-size: 14px; margin: 2px 0 2px 7px; }
    .traza-dot {
      width: 14px; height: 14px; border-radius: 50%; background: #0d6efd; border: 2px solid #fff;
      box-shadow: 0 0 0 2px #0d6efd; flex-shrink: 0; margin-top: 6px;
    }
    .traza-timeline-current .traza-dot { background: #198754; box-shadow: 0 0 0 2px #198754; }
    .traza-event-obs .traza-dot { background: #dc3545; box-shadow: 0 0 0 2px #dc3545; }
    .traza-event-sub .traza-dot { background: #0dcaf0; box-shadow: 0 0 0 2px #0dcaf0; }
    .traza-event-ok .traza-dot { background: #198754; box-shadow: 0 0 0 2px #198754; }
    .text-orange { color: #fd7e14 !important; }
  `;
}

export default { movimientosTimelineHtml, timelineHtml, renderTimeline, timelineModalStyles };
