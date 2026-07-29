/**
 * Utilidades — bandeja Cuadro Comparativo (RC8.1).
 */
import {
  resolveEstadoActualExpediente,
  labelEstadoCuadroVigente,
  BADGE_COLOR_CCP,
  badgeVisualEstadoVigente,
  renderBadgeEstadoVigenteHtml,
  esExpedienteDerivadoCcp,
} from '../../shared/estadoExpedienteVigente.js';

export { BADGE_COLOR_CCP, badgeVisualEstadoVigente, renderBadgeEstadoVigenteHtml, esExpedienteDerivadoCcp };

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
  ENVIADA_OPPM: 'ENVIADA_OPPM',
  CCP_REGISTRADO: 'CCP_REGISTRADO',
  CCP_REGISTRADA: 'CCP_REGISTRADA',
});

/**
 * Etiquetas dinámicas del workflow (mismo texto en bandejas y detalle).
 * No usar nombres de módulo («Cuadro Comparativo», «Validaciones», etc.).
 */
export const ESTADOS_CUADRO_LABEL = Object.freeze({
  [ESTADOS_CUADRO.PENDIENTE_ELABORAR]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.EN_ELABORACION]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.CUADRO_BORRADOR]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.GENERADO]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.GENERADO_PRELIMINAR]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.ADJUDICADO]: 'C.C. en elaboración',
  [ESTADOS_CUADRO.OBSERVADO]: 'C.C. en Coordinación CM - Observado',
  [ESTADOS_CUADRO.PENDIENTE_COORDINADOR]: 'C.C. en Coordinación CM',
  [ESTADOS_CUADRO.OBSERVADO_COORDINADOR]: 'C.C. en Coordinación CM - Observado',
  [ESTADOS_CUADRO.FIRMADO_COORDINADOR]: 'C.C. en Coordinación CM',
  [ESTADOS_CUADRO.PENDIENTE_DEC]: 'C.C. en DEC',
  [ESTADOS_CUADRO.OBSERVADO_DEC]: 'C.C. en DEC - Observado',
  [ESTADOS_CUADRO.APROBADO_DEC]: 'C.C. aprobado',
  [ESTADOS_CUADRO.PENDIENTE_CCP]: 'C.C. aprobado',
  [ESTADOS_CUADRO.FIRMADO]: 'C.C. aprobado',
  [ESTADOS_CUADRO.DERIVADO_CCP]: 'Derivado a CCP',
  [ESTADOS_CUADRO.ENVIADA_OPPM]: 'Solicitud enviada a OPPM',
  [ESTADOS_CUADRO.CCP_REGISTRADO]: 'CCP registrada',
  [ESTADOS_CUADRO.CCP_REGISTRADA]: 'CCP registrada',
});

/**
 * Etiqueta visible del expediente según estado_cuadro (y contexto de subsanación).
 * @param {string} code
 * @param {{ subsanado?: boolean, respuesta_observaciones?: string }} [opts]
 */
export function labelBandejaCuadroComparativo(code, opts = {}) {
  return labelCuadroEstado(code, opts);
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
  if (s === 'ENVIADA_OPPM' || s === 'ENVIADO_OPPM') return ESTADOS_CUADRO.ENVIADA_OPPM;
  if (s === 'CCP_REGISTRADO' || s === 'REGISTRADO_CCP' || s === 'CCP_REGISTRADA') {
    return ESTADOS_CUADRO.CCP_REGISTRADA;
  }
  if (ESTADOS_CUADRO_LABEL[s]) return s;
  return ESTADOS_CUADRO.PENDIENTE_ELABORAR;
}

/**
 * Traducción central de estado técnico → etiqueta visible (bandeja + detalle).
 * Si hay respuesta a observación y aún no se re-derivó → «C.C. subsanado».
 */
export function labelCuadroEstado(code, opts = {}) {
  const e = normalizeCuadroEstado(code);
  const tieneRespuesta = !!(opts.subsanado
    || String(opts.respuesta_observaciones || opts.respuesta || '').trim());
  if (tieneRespuesta
    && (e === ESTADOS_CUADRO.OBSERVADO_COORDINADOR
      || e === ESTADOS_CUADRO.OBSERVADO_DEC
      || e === ESTADOS_CUADRO.OBSERVADO)) {
    return 'C.C. subsanado';
  }
  return ESTADOS_CUADRO_LABEL[e]
    || ESTADOS_CUADRO_LABEL[ESTADOS_CUADRO.PENDIENTE_ELABORAR];
}

/** Alias semántico: misma fuente que labelCuadroEstado. */
export function labelCuadroEstadoVisible(code, opts = {}) {
  return labelCuadroEstado(code, opts);
}

/**
 * Resuelve etiqueta de estado del expediente sin depender del módulo UI.
 * OD32 — usa resolveEstadoActualExpediente (DERIVADO_CCP > observaciones históricas).
 */
export function labelEstadoExpedienteUnificado(row = {}) {
  const vigente = resolveEstadoActualExpediente(row);
  if (vigente?.derivadoCcp) return 'Derivado a CCP';
  if (vigente?.code && ESTADOS_CUADRO_LABEL[normalizeCuadroEstado(vigente.code)]) {
    return vigente.label || labelEstadoCuadroVigente(vigente.code, {
      respuesta_observaciones: row.respuesta_observaciones
        || row.datos_json?.respuesta_observaciones
        || '',
      subsanado: !!row.subsanado,
    });
  }
  if (row.estado_cuadro_label) {
    // No confiar en label histórico si el workflow ya está en CCP
    if (/derivado\s*a\s*ccp/i.test(String(row.estado_cuadro_label))) return 'Derivado a CCP';
  }
  if (row.estado_bandeja) return String(row.estado_bandeja);
  if (row.estado_recepcion) return String(row.estado_recepcion);
  return vigente?.label || 'C.C. en elaboración';
}

/** Alias OD32 — código + etiqueta vigentes para bandejas. */
export function resolveEstadoVigenteBandeja(row = {}) {
  return resolveEstadoActualExpediente(row);
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
  // OD33/OD35 — no usar gris; CCP registrado / derivado usan badge unificado
  if (e === 'CCP_REGISTRADO' || e === 'CCP_REGISTRADA') return 'success';
  if (e === 'ENVIADA_OPPM') return 'primary';
  if (e === ESTADOS_CUADRO.DERIVADO_CCP) return 'ccp-morado';
  return 'secondary';
}

/** Clase CSS completa del badge (sin prefijo bg- forzado). */
export function badgeHtmlClassCuadro(code) {
  const n = normalizeCuadroEstado(code);
  if (n === ESTADOS_CUADRO.DERIVADO_CCP || n === 'CCP_REGISTRADO' || n === 'CCP_REGISTRADA' || n === 'ENVIADA_OPPM') {
    return 'badge-estado-mod';
  }
  return `bg-${badgeClassCuadro(code)}`;
}

export function badgeStyleCuadro(code) {
  const n = normalizeCuadroEstado(code);
  if (n === 'CCP_REGISTRADO' || n === 'CCP_REGISTRADA') return 'background:#198754;color:#fff';
  if (n === 'ENVIADA_OPPM') return 'background:#0d6efd;color:#fff';
  if (n === ESTADOS_CUADRO.DERIVADO_CCP) {
    return `background:${BADGE_COLOR_CCP};color:#fff`;
  }
  return '';
}

/** Badge unificado: CCP registrado (verde) / DERIVADO_CCP (morado). */
export function renderBadgeEstadoCuadroHtml(rowOrCode, label, escFn = (s) => String(s ?? '')) {
  const code = (rowOrCode && typeof rowOrCode === 'object')
    ? (rowOrCode.estado_cuadro || rowOrCode.estado_vigente || rowOrCode.estado || '')
    : rowOrCode;
  const row = (rowOrCode && typeof rowOrCode === 'object')
    ? rowOrCode
    : { estado_cuadro: code, estado: code };
  const n = normalizeCuadroEstado(code);
  if (row.ccp_activo || row.ccp_registrado || row.codigo_ccp
    || n === 'CCP_REGISTRADO' || n === 'CCP_REGISTRADA' || n === 'ENVIADA_OPPM'
    || esExpedienteDerivadoCcp(row) || n === ESTADOS_CUADRO.DERIVADO_CCP) {
    return renderBadgeEstadoVigenteHtml(row, escFn);
  }
  const text = label != null
    ? label
    : (labelEstadoExpedienteUnificado(row) || labelCuadroEstado(code));
  return `<span class="badge ${badgeHtmlClassCuadro(code)}">${escFn(text)}</span>`;
}

/** Actualiza un nodo badge existente (modales). */
export function applyBadgeEstadoCuadroEl(el, rowOrCode, label) {
  if (!el) return;
  const code = (rowOrCode && typeof rowOrCode === 'object')
    ? (rowOrCode.estado_cuadro || rowOrCode.estado || '')
    : rowOrCode;
  const row = (rowOrCode && typeof rowOrCode === 'object')
    ? rowOrCode
    : { estado_cuadro: code, estado: code };
  const text = label != null
    ? label
    : (row.estado_cuadro_label || labelEstadoExpedienteUnificado(row) || labelCuadroEstado(code));
  const v = badgeVisualEstadoVigente(row);
  if (v.code === 'CCP_REGISTRADO' || v.code === 'CCP_REGISTRADA' || v.code === 'ENVIADA_OPPM' || v.derivadoCcp
    || esExpedienteDerivadoCcp(row) || normalizeCuadroEstado(code) === ESTADOS_CUADRO.DERIVADO_CCP) {
    el.className = 'badge badge-estado-mod';
    el.style.cssText = v.style || `background:${BADGE_COLOR_CCP};color:#fff`;
    el.textContent = v.label || 'Derivado a CCP';
    return;
  }
  el.className = `badge ${badgeHtmlClassCuadro(code)}`;
  el.style.cssText = '';
  el.textContent = text;
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
