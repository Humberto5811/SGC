/** Utilidades compartidas — bandeja Validaciones (RC7.7.1). */
import {
  resolveEstadoActualExpediente,
  BADGE_COLOR_CCP,
  renderBadgeEstadoVigenteHtml,
  esExpedienteDerivadoCcp,
} from '../../shared/estadoExpedienteVigente.js';

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
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Derivado a Cuadro Comp.</div><div class="kpi-value text-success" data-val-kpi="validado">${s.validado}</div></div></div>
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Pendientes de validación</div><div class="kpi-value text-warning" data-val-kpi="pendiente">${s.pendiente}</div></div></div>
      <div class="col-6 col-md-3"><div class="sgc-kpi-card"><div class="kpi-label">Derivados / Observados</div><div class="kpi-value text-danger" data-val-kpi="observado">${s.observado}</div></div></div>
    </div>`;
}

export function updateValidacionesStatsDom(stats, containerId = 'validacionesStats') {
  const root = document.getElementById(containerId);
  if (!root) return;
  const data = Array.isArray(stats) ? buildValidacionesStats(stats) : (stats || buildValidacionesStats([]));
  Object.entries(data).forEach(([k, v]) => {
    const el = root.querySelector(`[data-val-kpi="${k}"]`);
    if (el) el.textContent = String(v);
  });
}

export function isAdminUser(user) {
  const rol = String(user?.rol || '').toLowerCase();
  return rol === 'admin' || rol === 'dec';
}

function fechaSortKey(iso) {
  const s = String(iso || '').trim();
  if (!s) return 0;
  const t = Date.parse(s.includes('T') || s.includes(' ') ? s : `${s}T00:00:00`);
  return Number.isNaN(t) ? 0 : t;
}

/** Estado agregado del expediente en bandeja Validaciones. */
export function estadoExpedienteValidacion(cotizaciones = [], meta = {}) {
  const list = Array.isArray(cotizaciones) ? cotizaciones : [];
  const seed = {
    solicitud_estado: meta.solicitud_estado || list[0]?.solicitud_estado || '',
    estado_cuadro: meta.estado_cuadro || list[0]?.estado_cuadro || '',
    estado: meta.estado_cuadro || list[0]?.estado_cuadro || '',
    derivado_ccp: meta.derivado_ccp || list[0]?.derivado_ccp,
    codigo_ccp: meta.codigo_ccp || list[0]?.codigo_ccp || '',
    ccp_activo: meta.ccp_activo || list[0]?.ccp_activo || list[0]?.ccp_registrado,
    enviada_oppm: meta.enviada_oppm || list[0]?.enviada_oppm,
  };
  // OD33/OD35 — CCP_REGISTRADO > DERIVADO_CCP > fallback local
  const vigente = resolveEstadoActualExpediente(seed);
  if (vigente.code === 'CCP_REGISTRADO' || vigente.ccpRegistrado) {
    return {
      label: 'CCP registrado',
      validacion_estado: 'CCP_REGISTRADO',
      badge: 'success',
      badgeStyle: 'background:#198754;color:#fff',
      derivado_ccp: true,
      ccp_registrado: true,
    };
  }
  if (vigente.code === 'ENVIADA_OPPM') {
    return {
      label: 'Solicitud enviada a OPPM',
      validacion_estado: 'ENVIADA_OPPM',
      badge: 'primary',
      badgeStyle: 'background:#0d6efd;color:#fff',
      derivado_ccp: true,
    };
  }
  if (vigente.derivadoCcp || esExpedienteDerivadoCcp(seed)) {
    return {
      label: 'Derivado a CCP',
      validacion_estado: 'DERIVADO_CCP',
      badge: 'ccp-morado',
      badgeStyle: `background:${BADGE_COLOR_CCP};color:#fff`,
      derivado_ccp: true,
    };
  }
  if (!list.length) {
    return { label: 'Pendiente de validación', validacion_estado: 'DERIVADA', badge: 'warning' };
  }
  const norms = list.map((c) => normValEstado(c.validacion_estado));
  if (norms.some((v) => !v || ESTADOS_PENDIENTE.has(v))) {
    return { label: 'Pendiente de validación', validacion_estado: 'DERIVADA', badge: 'warning' };
  }
  if (norms.some((v) => ESTADOS_OBSERVADO.has(v))) {
    const first = list.find((c) => ESTADOS_OBSERVADO.has(normValEstado(c.validacion_estado)));
    return {
      label: first?.estado_bandeja || 'Derivados / Observados',
      validacion_estado: normValEstado(first?.validacion_estado) || 'OBSERVADO',
      badge: first?.estado_bandeja_class || 'warning',
    };
  }
  return {
    label: 'C.C. en elaboración',
    validacion_estado: 'APTO',
    badge: 'success',
  };
}

/** HTML del badge de estado en bandeja Validaciones. */
export function renderBadgeEstadoValidacionHtml(exp, escFn = (s) => String(s ?? '')) {
  if (exp?.ccp_registrado || exp?.ccp_activo || exp?.validacion_estado === 'CCP_REGISTRADO'
    || exp?.codigo_ccp
    || exp?.derivado_ccp || exp?.validacion_estado === 'DERIVADO_CCP'
    || exp?.validacion_estado === 'ENVIADA_OPPM'
    || exp?.estado_bandeja_class === 'ccp-morado'
    || esExpedienteDerivadoCcp(exp || {})) {
    return renderBadgeEstadoVigenteHtml(exp || { estado_cuadro: 'DERIVADO_CCP' }, escFn);
  }
  const cls = exp?.estado_bandeja_class || 'warning';
  const label = exp?.estado_bandeja || 'Pendiente de validación';
  if (exp?.badgeStyle) {
    return `<span class="badge badge-estado-mod" style="${escFn(exp.badgeStyle)}">${escFn(label)}</span>`;
  }
  return `<span class="badge bg-${escFn(cls)}">${escFn(label)}</span>`;
}

export function formatRequerimientosValidacion(c, esc) {
  const raw = c?.requerimientos || c?.requerimientos_texto || c?.requerimientos_codigos || '';
  const codes = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  if (!codes.length) return '—';
  if (codes.length <= 2) {
    return codes.map((code) => `<div class="small">${esc(code)}</div>`).join('');
  }
  const title = codes.join(', ');
  return `<span class="small" title="${esc(title)}">${esc(codes[0])} <span class="text-muted">+ ${codes.length - 1} más</span></span>`;
}

/** Excluye códigos CMN numéricos (p. ej. 05277) de la columna Centro. */
function esCmnNumerico(valor) {
  return /^\d{4,6}$/.test(String(valor || '').trim());
}

export function formatCentrosValidacion(c, esc) {
  const raw = c?.centros_texto || c?.centro || '';
  const parts = String(raw).split(',').map((s) => s.trim()).filter((s) => s && !esCmnNumerico(s));
  if (!parts.length) return '—';
  if (parts.length === 1) return esc(parts[0]);
  return `<span class="small" title="${esc(parts.join(', '))}">${esc(parts[0])} <span class="text-muted">+${parts.length - 1}</span></span>`;
}

/**
 * Consolida cotizaciones de validación en una fila por solicitud.
 * Conserva el detalle en `cotizaciones` para el modal Ver.
 */
export function consolidarExpedientesValidacion(cotizaciones = []) {
  const map = new Map();
  (cotizaciones || []).forEach((c) => {
    const key = String(c.solicitud_id || c.solicitud_codigo || '');
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        solicitud_id: c.solicitud_id,
        solicitud_codigo: c.solicitud_codigo,
        denominacion: c.denominacion || c.descripcion || '',
        objeto: c.objeto || '',
        requerimientos: c.requerimientos || c.requerimientos_texto || '',
        requerimientos_texto: c.requerimientos_texto || c.requerimientos || '',
        centros_texto: c.centros_texto || c.centro || '',
        cotizaciones: [],
      });
    }
    const g = map.get(key);
    g.cotizaciones.push(c);
    if (!g.requerimientos && (c.requerimientos || c.requerimientos_texto)) {
      g.requerimientos = c.requerimientos || c.requerimientos_texto || '';
      g.requerimientos_texto = g.requerimientos;
    }
  });

  return [...map.values()].map((g) => {
    const centrosUnicos = [];
    const seenCentro = new Set();
    g.cotizaciones.forEach((c) => {
      String(c.centros_texto || c.centro || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((centro) => {
          if (esCmnNumerico(centro) || centro === '—') return;
          const k = centro.toLowerCase();
          if (seenCentro.has(k)) return;
          seenCentro.add(k);
          centrosUnicos.push(centro);
        });
    });
    g.centros_texto = centrosUnicos.join(', ');
    const seedCot = g.cotizaciones[0] || {};
    const meta = {
      solicitud_estado: seedCot.solicitud_estado || g.solicitud_estado || '',
      estado_cuadro: seedCot.estado_cuadro || g.estado_cuadro || '',
      derivado_ccp: !!seedCot.derivado_ccp,
      codigo_ccp: seedCot.codigo_ccp || '',
      ccp_activo: !!seedCot.ccp_activo || !!seedCot.ccp_registrado,
      enviada_oppm: !!seedCot.enviada_oppm,
    };
    const est = estadoExpedienteValidacion(g.cotizaciones, meta);
    const fechas = g.cotizaciones.map((c) => c.fecha_presentacion || c.created_at).filter(Boolean);
    const fechaUltima = fechas.sort((a, b) => fechaSortKey(b) - fechaSortKey(a))[0] || '';
    const responsables = [...new Set(
      g.cotizaciones.map((c) => c.validacion_responsable || c.responsable_nombre || '').filter(Boolean),
    )];
    return {
      ...g,
      solicitud_estado: meta.solicitud_estado,
      estado_cuadro: meta.estado_cuadro,
      centro: g.centros_texto,
      cantidad_cotizaciones: g.cotizaciones.length,
      estado_bandeja: est.label,
      estado_bandeja_class: est.badge,
      badgeStyle: est.badgeStyle || '',
      derivado_ccp: !!est.derivado_ccp,
      ccp_registrado: !!est.ccp_registrado,
      codigo_ccp: meta.codigo_ccp || '',
      validacion_estado: est.validacion_estado,
      validacion_responsable: responsables.length === 1
        ? responsables[0]
        : (responsables.length > 1 ? 'Varios' : '—'),
      fecha_ultima_presentacion: fechaUltima,
      puede_validar: g.cotizaciones.some((c) => c.puede_validar),
      puede_ver: g.cotizaciones.some((c) => c.puede_ver || c.puede_validar),
    };
  }).sort((a, b) => fechaSortKey(b.fecha_ultima_presentacion) - fechaSortKey(a.fecha_ultima_presentacion));
}
