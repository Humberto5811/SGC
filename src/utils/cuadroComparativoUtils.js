/**
 * Utilidades — bandeja Cuadro Comparativo (RC8.1).
 */

export const ESTADOS_CUADRO = Object.freeze({
  PENDIENTE_ELABORAR: 'PENDIENTE_ELABORAR',
  EN_ELABORACION: 'EN_ELABORACION',
  CUADRO_BORRADOR: 'CUADRO_BORRADOR',
  GENERADO: 'GENERADO',
  GENERADO_PRELIMINAR: 'GENERADO_PRELIMINAR',
  ADJUDICADO: 'ADJUDICADO',
  OBSERVADO: 'OBSERVADO',
  PENDIENTE_COORDINADOR: 'PENDIENTE_COORDINADOR',
  OBSERVADO_COORDINADOR: 'OBSERVADO_COORDINADOR',
  FIRMADO_COORDINADOR: 'FIRMADO_COORDINADOR',
  PENDIENTE_DEC: 'PENDIENTE_DEC',
  OBSERVADO_DEC: 'OBSERVADO_DEC',
  APROBADO_DEC: 'APROBADO_DEC',
  PENDIENTE_CCP: 'PENDIENTE_CCP',
  FIRMADO: 'FIRMADO',
  DERIVADO_CCP: 'DERIVADO_CCP',
});

/**
 * Etiquetas internas de etapa (detalle / flujo).
 * La bandeja principal usa labelBandejaCuadroComparativo → «Cuadro Comparativo».
 */
export const ESTADOS_CUADRO_LABEL = Object.freeze({
  [ESTADOS_CUADRO.PENDIENTE_ELABORAR]: 'Cuadro Comparativo en trámite',
  [ESTADOS_CUADRO.EN_ELABORACION]: 'Cuadro Comparativo en trámite',
  [ESTADOS_CUADRO.CUADRO_BORRADOR]: 'Cuadro Comparativo en trámite',
  [ESTADOS_CUADRO.GENERADO]: 'Cuadro Comparativo en trámite',
  [ESTADOS_CUADRO.GENERADO_PRELIMINAR]: 'Cuadro Comparativo en trámite',
  [ESTADOS_CUADRO.ADJUDICADO]: 'Cuadro Comparativo en trámite',
  [ESTADOS_CUADRO.OBSERVADO]: 'Cuadro Comparativo observado',
  [ESTADOS_CUADRO.PENDIENTE_COORDINADOR]: 'Cuadro Comparativo en revisión',
  [ESTADOS_CUADRO.OBSERVADO_COORDINADOR]: 'Cuadro Comparativo observado',
  [ESTADOS_CUADRO.FIRMADO_COORDINADOR]: 'Cuadro Comparativo en revisión',
  [ESTADOS_CUADRO.PENDIENTE_DEC]: 'Cuadro Comparativo para aprobación',
  [ESTADOS_CUADRO.OBSERVADO_DEC]: 'Cuadro Comparativo observado',
  [ESTADOS_CUADRO.APROBADO_DEC]: 'Cuadro Comparativo aprobado',
  [ESTADOS_CUADRO.PENDIENTE_CCP]: 'Cuadro Comparativo aprobado',
  [ESTADOS_CUADRO.FIRMADO]: 'Cuadro Comparativo aprobado',
  [ESTADOS_CUADRO.DERIVADO_CCP]: 'Cuadro Comparativo derivado a CCP',
});

/** Etiqueta homogénea de bandeja principal. */
export function labelBandejaCuadroComparativo() {
  return 'Cuadro Comparativo';
}

export function normalizeCuadroEstado(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!s) return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  if (s === 'PENDIENTE' || s === 'PENDIENTE_DE_ELABORAR' || s === 'PENDIENTE_ELABORAR') {
    return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
  }
  if (s === 'BORRADOR' || s === 'EN_ELABORACION' || s === 'ELABORACION' || s === 'CUADRO_BORRADOR') {
    return ESTADOS_CUADRO.CUADRO_BORRADOR;
  }
  if (s === 'GENERADO' || s === 'GENERADA') return ESTADOS_CUADRO.GENERADO;
  if (s === 'GENERADO_PRELIMINAR') return ESTADOS_CUADRO.GENERADO_PRELIMINAR;
  if (s === 'ADJUDICADO') return ESTADOS_CUADRO.ADJUDICADO;
  if (s === 'OBSERVADO') return ESTADOS_CUADRO.OBSERVADO;
  if (s === 'PENDIENTE_COORDINADOR') return ESTADOS_CUADRO.PENDIENTE_COORDINADOR;
  if (s === 'OBSERVADO_COORDINADOR') return ESTADOS_CUADRO.OBSERVADO_COORDINADOR;
  if (s === 'FIRMADO_COORDINADOR') return ESTADOS_CUADRO.FIRMADO_COORDINADOR;
  if (s === 'PENDIENTE_DEC') return ESTADOS_CUADRO.PENDIENTE_DEC;
  if (s === 'OBSERVADO_DEC') return ESTADOS_CUADRO.OBSERVADO_DEC;
  if (s === 'APROBADO_DEC') return ESTADOS_CUADRO.APROBADO_DEC;
  if (s === 'PENDIENTE_CCP') return ESTADOS_CUADRO.PENDIENTE_CCP;
  if (s === 'FIRMADO' || s === 'FIRMADA') return ESTADOS_CUADRO.FIRMADO;
  if (s === 'DERIVADO_CCP' || s === 'DERIVADO_A_CCP' || s === 'CCP') return ESTADOS_CUADRO.DERIVADO_CCP;
  if (ESTADOS_CUADRO_LABEL[s]) return s;
  return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
}

/** Traducción central de estado técnico → etiqueta visible de bandeja. */
export function labelCuadroEstado(code) {
  return ESTADOS_CUADRO_LABEL[normalizeCuadroEstado(code)]
    || ESTADOS_CUADRO_LABEL[ESTADOS_CUADRO.PENDIENTE_ELABORAR];
}

/** Alias semántico: misma fuente que labelCuadroEstado. */
export function labelCuadroEstadoVisible(code) {
  return labelCuadroEstado(code);
}

function esCmnEnBandeja(valor) {
  return /^\d{4,6}$/.test(String(valor || '').trim());
}

export function formatCentroCuadro(row, esc) {
  const raw = row?.centros_texto || row?.centro
    || (Array.isArray(row?.requerimientos)
      ? row.requerimientos.map((r) => r?.centro).filter(Boolean).join(', ')
      : '');
  const parts = String(raw).split(',')
    .map((s) => s.trim())
    .filter((s) => s && !esCmnEnBandeja(s));
  if (!parts.length) return '—';
  if (parts.length === 1) return esc(parts[0]);
  return `<span class="small" title="${esc(parts.join(', '))}">${esc(parts[0])} <span class="text-muted">+${parts.length - 1}</span></span>`;
}

export function formatCantidadCotizacionesCuadro(row, esc) {
  const n = row?.total_cotizaciones != null
    ? Number(row.total_cotizaciones)
    : (Number(row?.total_proveedores) || 0);
  if (!Number.isFinite(n) || n < 0) return '—';
  return `${esc(String(n))} cotizaci${n === 1 ? 'ón' : 'ones'}`;
}

export function badgeClassCuadro(code) {
  const e = normalizeCuadroEstado(code);
  if (e === ESTADOS_CUADRO.PENDIENTE_ELABORAR) return 'warning';
  if (e === ESTADOS_CUADRO.EN_ELABORACION || e === ESTADOS_CUADRO.CUADRO_BORRADOR) return 'info';
  if (e === ESTADOS_CUADRO.GENERADO || e === ESTADOS_CUADRO.GENERADO_PRELIMINAR) return 'primary';
  if (e === ESTADOS_CUADRO.ADJUDICADO) return 'success';
  if (e === ESTADOS_CUADRO.OBSERVADO
    || e === ESTADOS_CUADRO.OBSERVADO_COORDINADOR
    || e === ESTADOS_CUADRO.OBSERVADO_DEC) return 'warning';
  if (e === ESTADOS_CUADRO.PENDIENTE_COORDINADOR
    || e === ESTADOS_CUADRO.PENDIENTE_DEC
    || e === ESTADOS_CUADRO.PENDIENTE_CCP) return 'info';
  if (e === ESTADOS_CUADRO.FIRMADO_COORDINADOR
    || e === ESTADOS_CUADRO.APROBADO_DEC
    || e === ESTADOS_CUADRO.FIRMADO) return 'success';
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
    else if (e === ESTADOS_CUADRO.GENERADO || e === ESTADOS_CUADRO.GENERADO_PRELIMINAR
      || e === ESTADOS_CUADRO.ADJUDICADO || e === ESTADOS_CUADRO.FIRMADO
      || e === ESTADOS_CUADRO.PENDIENTE_COORDINADOR || e === ESTADOS_CUADRO.APROBADO_DEC
      || e === ESTADOS_CUADRO.PENDIENTE_CCP || e === ESTADOS_CUADRO.DERIVADO_CCP) {
      generados += 1;
    } else if (e === ESTADOS_CUADRO.CUADRO_BORRADOR) {
      elaboracion += 1;
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

/** Estados en revisión externa: Analista no edita (Ver / Descargar / Trazabilidad). */
export function isCuadroEnRevisionExterna(estado) {
  const e = normalizeCuadroEstado(estado);
  return [
    ESTADOS_CUADRO.PENDIENTE_COORDINADOR,
    ESTADOS_CUADRO.FIRMADO_COORDINADOR,
    ESTADOS_CUADRO.PENDIENTE_DEC,
  ].includes(e);
}

export function cuadroComparativoMenuItems(row = {}, opts = {}) {
  const e = normalizeCuadroEstado(row.estado_cuadro);
  const rol = String(opts.rol || row.rol_revision || '').toUpperCase();

  // RC8.4B — Coordinador CM: abrir expediente completo (no solo el cuadro)
  if (rol === 'COORDINADOR_CM') {
    return [
      { act: 'abrirExpedienteCoord', label: 'Abrir expediente', icon: 'bi-folder2-open' },
      { act: 'descargarCuadro', label: 'Descargar Cuadro', icon: 'bi-download', disabled: !row.cuadro_id && !row.tiene_pdf },
      { act: 'trazabilidadCuadro', label: 'Trazabilidad', icon: 'bi-clock-history' },
    ];
  }

  // RC8.4C — DEC: mismo expediente operativo
  if (rol === 'DEC') {
    return [
      { act: 'abrirExpedienteDec', label: 'Abrir expediente', icon: 'bi-folder2-open' },
      { act: 'descargarCuadro', label: 'Descargar Cuadro', icon: 'bi-download', disabled: !row.cuadro_id && !row.tiene_pdf },
      { act: 'trazabilidadCuadro', label: 'Trazabilidad', icon: 'bi-clock-history' },
    ];
  }

  // RC8.5-B1 — Administrador: abre según etapa (supervisión); no menú Analista en revisión
  if (rol === 'ADMINISTRADOR') {
    if (isCuadroEnRevisionExterna(e) || e === ESTADOS_CUADRO.PENDIENTE_DEC || e === ESTADOS_CUADRO.FIRMADO_COORDINADOR) {
      return [
        { act: 'abrirExpedienteAdmin', label: 'Abrir expediente', icon: 'bi-folder2-open' },
        { act: 'descargarCuadro', label: 'Descargar Cuadro', icon: 'bi-download', disabled: !row.cuadro_id && !row.tiene_pdf },
        { act: 'trazabilidadCuadro', label: 'Trazabilidad', icon: 'bi-clock-history' },
      ];
    }
    return [
      { act: 'abrirExpedienteAdmin', label: 'Abrir expediente', icon: 'bi-folder2-open' },
      { act: 'elaborarCuadro', label: 'Ver cuadro', icon: 'bi-eye' },
      { act: 'trazabilidadCuadro', label: 'Trazabilidad', icon: 'bi-clock-history' },
    ];
  }

  const enRevision = row.en_revision_externa === true || isCuadroEnRevisionExterna(e);
  const verSolo = enRevision
    || e === ESTADOS_CUADRO.DERIVADO_CCP
    || e === ESTADOS_CUADRO.FIRMADO
    || row.solo_lectura === true;

  // RC8.4A — Analista en revisión: solo Ver / Descargar / Trazabilidad
  if (enRevision) {
    return [
      { act: 'verCuadro', label: 'Ver', icon: 'bi-eye' },
      { act: 'descargarCuadro', label: 'Descargar', icon: 'bi-download' },
      { act: 'trazabilidadCuadro', label: 'Trazabilidad', icon: 'bi-clock-history' },
    ];
  }

  const label = row.accion_cuadro_label
    || (verSolo ? 'Ver cuadro' : 'Elaborar cuadro');
  return [
    { act: 'verExpediente', label: 'Ver expediente', icon: 'bi-folder2-open' },
    { act: 'verValidaciones', label: 'Ver validaciones', icon: 'bi-file-earmark-check' },
    {
      act: 'elaborarCuadro',
      label,
      icon: verSolo ? 'bi-eye' : 'bi-table',
      disabled: e === ESTADOS_CUADRO.ANULADO || row.puede_elaborar === false,
    },
    { act: 'trazabilidadCuadro', label: 'Trazabilidad', icon: 'bi-clock-history' },
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
