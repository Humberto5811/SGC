/**
 * Integración UI — delega 100% en EstadoVisualPresenter (RC3).
 */
import { regenerarSnapshotObservaciones } from '../../shared/observacionesMotor.js';
import { esc, enrichReqRow } from './trazabilidad.js';
import { buildEstadoVisual, renderEstadoVisualHtml } from './estadoVisualPresenter.js';

export { regenerarSnapshotObservaciones, buildEstadoVisual, renderEstadoVisualHtml };

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

/** @deprecated Usar renderEstadoVisualHtml — alias de compatibilidad. */
export function renderEstadoVisualBadge(row, moduloLabel = null, escFn = esc) {
  return renderEstadoVisualHtml(row, { moduloContext: moduloLabel }, escFn);
}

/** Regenera motor + actualiza celdas de la fila en bandeja (sin esperar reload). */
export function syncFilaBandejaObservaciones(row, opts = {}) {
  const { prefix = 'req', moduloLabel = null, escFn = esc } = opts;
  const mod = moduloLabel || resolveModuloFromPrefix(prefix);
  const enriched = enrichReqRow(row);
  const visual = buildEstadoVisual(enriched, { moduloContext: mod });
  const fresh = { ...enriched, obsMotor: visual.motor, estadoVisual: visual };
  const tr = document.querySelector(`tr[data-req-id="${fresh.id}"]`);
  if (!tr) return fresh;
  const estadoTd = tr.querySelector('.req-col-estado-cell');
  if (estadoTd) {
    estadoTd.innerHTML = renderEstadoVisualHtml(fresh, { moduloContext: mod }, escFn);
  }
  const obsChip = tr.querySelector('.chip-obs');
  const count = visual.pendientesCount ?? 0;
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

export default {
  regenerarSnapshotObservaciones,
  buildEstadoVisual,
  renderEstadoVisualHtml,
  renderEstadoVisualBadge,
  syncFilaBandejaObservaciones,
  resolveModuloFromPrefix,
};
