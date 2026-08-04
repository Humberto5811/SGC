// Estructura preparatoria para panel de control de trazabilidad (dashboard futuro)
import { computeTraceSummary, getResponsableVigenteLabel, getEstadoVigenteLabel } from '../../utils/trazabilidad.js';

/** Indicadores planificados para el dashboard SGC. */
export const TRACEABILITY_DASHBOARD_WIDGETS = [
  { id: 'byEstado', title: 'Expedientes por Estado', type: 'chart' },
  { id: 'byResponsable', title: 'Expedientes por Responsable', type: 'chart' },
  { id: 'observados', title: 'Expedientes Observados', type: 'kpi' },
  { id: 'retrasados', title: 'Expedientes Retrasados', type: 'kpi' },
  { id: 'tiempoPromedio', title: 'Tiempo Promedio por Etapa', type: 'chart' },
];

export function buildDashboardSnapshot(rows = []) {
  const summary = computeTraceSummary(rows);
  const byEstado = {};
  const byResponsable = {};
  rows.forEach((r) => {
    const est = getEstadoVigenteLabel(r);
    byEstado[est] = (byEstado[est] || 0) + 1;
    const resp = getResponsableVigenteLabel(r);
    byResponsable[resp] = (byResponsable[resp] || 0) + 1;
  });
  return {
    summary,
    byEstado,
    byResponsable,
    widgets: TRACEABILITY_DASHBOARD_WIDGETS,
  };
}

export function renderDashboardPlaceholder(containerId = 'trazaDashboard') {
  return `
    <div id="${containerId}" class="alert alert-light border small mb-0">
      <strong>Panel de trazabilidad (próximamente)</strong>
      <ul class="mb-0 mt-1">
        ${TRACEABILITY_DASHBOARD_WIDGETS.map((w) => `<li>${w.title}</li>`).join('')}
      </ul>
    </div>`;
}

export default { TRACEABILITY_DASHBOARD_WIDGETS, buildDashboardSnapshot, renderDashboardPlaceholder };
