/**
 * Utilidades — bandeja Cuadro Comparativo (RC8.1).
 */

export const ESTADOS_CUADRO = Object.freeze({
  PENDIENTE_ELABORAR: 'PENDIENTE_ELABORAR',
  EN_ELABORACION: 'EN_ELABORACION',
  GENERADO: 'GENERADO',
  FIRMADO: 'FIRMADO',
  DERIVADO_CCP: 'DERIVADO_CCP',
});

export const ESTADOS_CUADRO_LABEL = Object.freeze({
  [ESTADOS_CUADRO.PENDIENTE_ELABORAR]: 'Pendiente de elaborar',
  [ESTADOS_CUADRO.EN_ELABORACION]: 'En elaboración',
  [ESTADOS_CUADRO.GENERADO]: 'Generado',
  [ESTADOS_CUADRO.FIRMADO]: 'Firmado',
  [ESTADOS_CUADRO.DERIVADO_CCP]: 'Derivado a CCP',
});

export function normalizeCuadroEstado(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!s) return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  if (s === 'PENDIENTE' || s === 'PENDIENTE_DE_ELABORAR' || s === 'PENDIENTE_ELABORAR') {
    return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  }
  if (s === 'BORRADOR') return ESTADOS_CUADRO.EN_ELABORACION;
  if (s === 'EN_ELABORACION' || s === 'ELABORACION') return ESTADOS_CUADRO.EN_ELABORACION;
  if (s === 'GENERADO' || s === 'GENERADA') return ESTADOS_CUADRO.GENERADO;
  if (s === 'FIRMADO' || s === 'FIRMADA') return ESTADOS_CUADRO.FIRMADO;
  if (s === 'DERIVADO_CCP' || s === 'DERIVADO_A_CCP' || s === 'CCP') return ESTADOS_CUADRO.DERIVADO_CCP;
  if (ESTADOS_CUADRO_LABEL[s]) return s;
  return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
}

export function labelCuadroEstado(code) {
  return ESTADOS_CUADRO_LABEL[normalizeCuadroEstado(code)]
    || ESTADOS_CUADRO_LABEL[ESTADOS_CUADRO.PENDIENTE_ELABORAR];
}

export function badgeClassCuadro(code) {
  const e = normalizeCuadroEstado(code);
  if (e === ESTADOS_CUADRO.PENDIENTE_ELABORAR) return 'warning';
  if (e === ESTADOS_CUADRO.EN_ELABORACION) return 'info';
  if (e === ESTADOS_CUADRO.GENERADO) return 'primary';
  if (e === ESTADOS_CUADRO.FIRMADO) return 'success';
  if (e === ESTADOS_CUADRO.DERIVADO_CCP) return 'secondary';
  return 'secondary';
}

/** REQ-00016 | REQ-00016 + REQ-00017 | REQ-00016 + 2 más */
export function formatRequerimientosCuadro(row, esc) {
  const codes = [];
  if (Array.isArray(row?.requerimientos) && row.requerimientos.length) {
    row.requerimientos.forEach((r) => {
      const c = String(r?.codigo || '').trim();
      if (c && !codes.includes(c)) codes.push(c);
    });
  } else {
    String(row?.requerimientos_texto || row?.requerimientos_codigos || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((c) => { if (!codes.includes(c)) codes.push(c); });
  }
  if (!codes.length) return '—';
  if (codes.length === 1) return `<div class="small">${esc(codes[0])}</div>`;
  if (codes.length === 2) {
    return codes.map((code) => `<div class="small">${esc(code)}</div>`).join('');
  }
  const title = codes.join(', ');
  return `<span class="small" title="${esc(title)}">${esc(codes[0])} <span class="text-muted">+ ${codes.length - 1} más</span></span>`;
}

export function buildCuadroStats(rows = []) {
  const all = Array.isArray(rows) ? rows : [];
  let pendientes = 0;
  let elaboracion = 0;
  let generados = 0;
  all.forEach((r) => {
    const e = normalizeCuadroEstado(r.estado_cuadro);
    if (e === ESTADOS_CUADRO.PENDIENTE_ELABORAR) pendientes += 1;
    else if (e === ESTADOS_CUADRO.EN_ELABORACION) elaboracion += 1;
    else if (e === ESTADOS_CUADRO.GENERADO || e === ESTADOS_CUADRO.FIRMADO || e === ESTADOS_CUADRO.DERIVADO_CCP) {
      generados += 1;
    }
  });
  return {
    total: all.length,
    pendientes,
    elaboracion,
    generados,
  };
}

export function renderCuadroStatsHtml(stats, containerId = 'cuadroCompStats') {
  const s = stats || { total: 0, pendientes: 0, elaboracion: 0, generados: 0 };
  return `
    <div id="${containerId}" class="row g-2 mb-3">
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Total expedientes</div><div class="kpi-value text-dark" data-cc-kpi="total">${s.total}</div></div></div>
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Pendientes de elaborar</div><div class="kpi-value text-warning" data-cc-kpi="pendientes">${s.pendientes}</div></div></div>
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">En elaboración</div><div class="kpi-value text-info" data-cc-kpi="elaboracion">${s.elaboracion}</div></div></div>
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Generados</div><div class="kpi-value text-success" data-cc-kpi="generados">${s.generados}</div></div></div>
    </div>`;
}

export function updateCuadroStatsDom(rows, containerId = 'cuadroCompStats') {
  const root = document.getElementById(containerId);
  if (!root) return;
  const s = buildCuadroStats(rows);
  Object.entries(s).forEach(([k, v]) => {
    const el = root.querySelector(`[data-cc-kpi="${k}"]`);
    if (el) el.textContent = String(v);
  });
}

export function cuadroComparativoMenuItems(row = {}) {
  return [
    { act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' },
    { act: 'verValidaciones', label: 'Ver validaciones', icon: 'bi-file-earmark-check' },
    {
      act: 'elaborarCuadro',
      label: 'Elaborar cuadro',
      icon: 'bi-table',
      disabled: row.puede_elaborar === false,
    },
  ];
}

export function filterCuadroExpedientes(rows, filtros = {}) {
  const q = String(filtros.q || '').trim().toLowerCase();
  const tipo = String(filtros.tipo || '').trim().toLowerCase();
  const estado = String(filtros.estado || '').trim().toUpperCase();
  const area = String(filtros.area || '').trim().toLowerCase();
  const desde = filtros.desde ? String(filtros.desde).slice(0, 10) : '';
  const hasta = filtros.hasta ? String(filtros.hasta).slice(0, 10) : '';

  return (rows || []).filter((r) => {
    if (q) {
      const hay = String(r.search_text || [
        r.solicitud_codigo,
        r.requerimientos_texto,
        r.denominacion,
        r.area_usuaria,
      ].join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (tipo) {
      const t = String(r.tipo || '').toLowerCase();
      if (!t.includes(tipo) && t !== tipo) return false;
    }
    if (estado) {
      if (normalizeCuadroEstado(r.estado_cuadro) !== normalizeCuadroEstado(estado)) return false;
    }
    if (area) {
      if (!String(r.area_usuaria || '').toLowerCase().includes(area)) return false;
    }
    if (desde || hasta) {
      const f = String(r.fecha_ingreso_cuadro || '').slice(0, 10);
      if (!f) return false;
      if (desde && f < desde) return false;
      if (hasta && f > hasta) return false;
    }
    return true;
  });
}
