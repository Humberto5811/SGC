/** Utilidades compartidas — bandeja Validaciones (RC7.7.1). */

const ESTADOS_VALIDADO = new Set(['APTO']);
const ESTADOS_OBSERVADO = new Set(['NO_APTO', 'OBSERVADO']);
const ESTADOS_PENDIENTE = new Set(['DERIVADA', 'EN_PROCESO', 'PENDIENTE']);

export function normValEstado(estado) {
  return String(estado || '').toUpperCase();
}

export function buildValidacionesStats(rows = []) {
  let validado = 0;
  let pendiente = 0;
  let observado = 0;
  rows.forEach((r) => {
    const v = normValEstado(r.validacion_estado);
    if (ESTADOS_VALIDADO.has(v)) validado += 1;
    else if (ESTADOS_OBSERVADO.has(v)) observado += 1;
    else if (ESTADOS_PENDIENTE.has(v) || v === '') pendiente += 1;
    else pendiente += 1;
  });
  return {
    total: rows.length,
    validado,
    pendiente,
    observado,
  };
}

export function renderValidacionesStatsHtml(stats, containerId = 'validacionesStats') {
  const s = stats || { total: 0, validado: 0, pendiente: 0, observado: 0 };
  return `
    <div id="${containerId}" class="row g-2 mb-3">
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Total expedientes</div><div class="kpi-value text-dark" data-val-kpi="total">${s.total}</div></div></div>
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Validado</div><div class="kpi-value text-success" data-val-kpi="validado">${s.validado}</div></div></div>
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Pendientes de validación</div><div class="kpi-value text-warning" data-val-kpi="pendiente">${s.pendiente}</div></div></div>
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Observado / Requiere subsanación</div><div class="kpi-value text-danger" data-val-kpi="observado">${s.observado}</div></div></div>
    </div>`;
}

export function updateValidacionesStatsDom(stats, containerId = 'validacionesStats') {
  const root = document.getElementById(containerId);
  if (!root) return;
  const s = buildValidacionesStats(Array.isArray(stats) ? stats : []);
  const data = Array.isArray(stats) ? buildValidacionesStats(stats) : (stats || s);
  Object.entries(data).forEach(([k, v]) => {
    const el = root.querySelector(`[data-val-kpi="${k}"]`);
    if (el) el.textContent = String(v);
  });
}

export function isAdminUser(user) {
  const rol = String(user?.rol || '').toLowerCase();
  return rol === 'admin' || rol === 'dec';
}
