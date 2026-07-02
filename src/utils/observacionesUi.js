/**
 * Integración UI del Motor de Observaciones — estado visual y sincronización.
 */
import { obtenerEstadoVisual, regenerarSnapshotObservaciones } from '../../shared/observacionesMotor.js';
import { esc, enrichReqRow } from './trazabilidad.js';

export { obtenerEstadoVisual, regenerarSnapshotObservaciones };

const ESTADO_BADGE_STYLES = {
  REGISTRADO: { bg: '#0d6efd', label: 'En Registro' },
  EVALUACION: { bg: '#ffc107', fg: '#212529', label: 'En Evaluación' },
  DEC: { bg: '#6f42c1', label: 'En DEC' },
  PROGRAMACION: { bg: '#0dcaf0', fg: '#055160', label: 'En Programación' },
  ACTOS_PREPARATORIOS: { bg: '#fd7e14', label: 'En Coordinación CM' },
  INVITACIONES: { bg: '#0a4275', label: 'En Invitaciones' },
  FINALIZADO: { bg: '#198754', label: 'Finalizado' },
};

/** HTML del badge de estado — única función autorizada para bandejas. */
export function renderEstadoVisualBadge(row, moduloLabel = null, escFn = esc) {
  const enriched = enrichReqRow(row);
  const visual = obtenerEstadoVisual(enriched, moduloLabel);
  const code = String(visual.etapaWorkflow || enriched.estado_actual || 'REGISTRADO').toUpperCase();
  const st = ESTADO_BADGE_STYLES[code] || ESTADO_BADGE_STYLES.REGISTRADO;
  const label = visual.estadoWorkflowTexto || st.label || code;
  const fg = st.fg || '#fff';
  const workflowBadge = `<span class="badge badge-estado-mod" style="background:${st.bg};color:${fg};">${escFn(label)}</span>`;
  if (visual.badgeObservado) {
    return `${workflowBadge}<span class="badge bg-danger ms-1" title="Observación pendiente en este módulo">Observado</span>`;
  }
  return workflowBadge;
}

/** Regenera motor + visual y actualiza celdas de la fila en bandeja. */
export function syncFilaBandejaObservaciones(row, opts = {}) {
  const { prefix = 'req', moduloLabel = null, escFn = esc } = opts;
  const mod = moduloLabel || resolveModuloFromPrefix(prefix);
  const fresh = regenerarSnapshotObservaciones(enrichReqRow(row), mod);
  const tr = document.querySelector(`tr[data-req-id="${fresh.id}"]`);
  if (!tr) return fresh;
  const estadoTd = tr.querySelector('.req-col-estado-cell');
  if (estadoTd) {
    estadoTd.innerHTML = renderEstadoVisualBadge(fresh, mod, escFn);
  }
  const obsChip = tr.querySelector('.chip-obs');
  const count = fresh.obsVisual?.pendientesCount ?? 0;
  if (count > 0) {
    if (obsChip) {
      obsChip.innerHTML = `<i class="bi bi-exclamation-circle-fill"></i> ${count}`;
      obsChip.title = `${count} observación(es) pendiente(s)`;
      obsChip.classList.remove('d-none');
    }
  } else if (obsChip) {
    obsChip.classList.add('d-none');
  }
  return fresh;
}

const MODULO_POR_PREFIX = Object.freeze({
  req: 'Registro de Requerimiento',
  eval: 'Evaluación de Requerimiento',
  dec: 'DEC',
  prog: 'Programación',
  actos: 'Coordinación CM',
  inv: 'Invitaciones',
});

export function resolveModuloFromPrefix(prefix) {
  return MODULO_POR_PREFIX[prefix] || null;
}

export default {
  obtenerEstadoVisual,
  regenerarSnapshotObservaciones,
  renderEstadoVisualBadge,
  syncFilaBandejaObservaciones,
  resolveModuloFromPrefix,
};
