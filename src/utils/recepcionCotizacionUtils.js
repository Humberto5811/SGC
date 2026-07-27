/** Utilidades compartidas — bandeja Recepción de Cotizaciones. */
import {
  resolveEstadoActualExpediente,
  BADGE_COLOR_CCP,
  renderBadgeEstadoVigenteHtml,
  esExpedienteDerivadoCcp,
} from '../../shared/estadoExpedienteVigente.js';

export function puedeEnviarValidarRecepcion(c) {
  const v = String(c?.validacion_estado || '').toUpperCase();
  return c?.estado === 'COTIZACION_PRESENTADA' && (!v || v === 'PENDIENTE');
}

export function formatRequerimientosBandeja(c, esc) {
  const raw = c?.requerimientos_codigos || c?.requerimientos_texto || '';
  const codes = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  if (!codes.length) return '—';
  if (codes.length <= 2) {
    return codes.map((code) => `<div class="small">${esc(code)}</div>`).join('');
  }
  const title = codes.join(', ');
  return `<span class="small" title="${esc(title)}">${esc(codes[0])} <span class="text-muted">+ ${codes.length - 1} más</span></span>`;
}

function normValidacion(c) {
  return String(c?.validacion_estado || '').toUpperCase();
}

/** Estado agregado del expediente (solicitud) según sus cotizaciones. */
export function estadoExpedienteRecepcion(cotizaciones = [], meta = {}) {
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
      codigo_ccp: seed.codigo_ccp || '',
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
  if (!list.length) return { label: 'Cotización recibida', validacion_estado: '', badge: 'primary' };
  const norms = list.map(normValidacion);
  if (norms.some((v) => !v || v === 'PENDIENTE')) {
    return { label: 'Cotización recibida', validacion_estado: 'PENDIENTE', badge: 'primary' };
  }
  if (norms.some((v) => v === 'DERIVADA' || v === 'EN_PROCESO')) {
    return { label: 'Enviada a validación AU', validacion_estado: 'DERIVADA', badge: 'info text-dark' };
  }
  if (norms.every((v) => v === 'APTO') && norms.length) {
    return { label: 'C.C. en elaboración', validacion_estado: 'APTO', badge: 'success' };
  }
  return { label: 'Validada por área usuaria', validacion_estado: 'VALIDADA_AU', badge: 'success' };
}

/** HTML del badge de estado en bandeja Recepción (verde CCP registrado / morado derivado). */
export function renderBadgeEstadoRecepcionHtml(exp, escFn = (s) => String(s ?? '')) {
  if (exp?.ccp_registrado || exp?.ccp_activo || exp?.validacion_estado === 'CCP_REGISTRADO'
    || exp?.codigo_ccp
    || exp?.derivado_ccp || exp?.validacion_estado === 'DERIVADO_CCP'
    || exp?.validacion_estado === 'ENVIADA_OPPM'
    || esExpedienteDerivadoCcp(exp || {})) {
    return renderBadgeEstadoVigenteHtml(exp || { estado_cuadro: 'DERIVADO_CCP' }, escFn);
  }
  const cls = exp?.badge_estado || 'primary';
  const label = exp?.estado_recepcion || 'Cotización recibida';
  if (exp?.badgeStyle) {
    return `<span class="badge badge-estado-mod" style="${escFn(exp.badgeStyle)}">${escFn(label)}</span>`;
  }
  return `<span class="badge bg-${escFn(cls)}">${escFn(label)}</span>`;
}

function fechaSortKey(iso) {
  const s = String(iso || '').trim();
  if (!s) return 0;
  const t = Date.parse(s.includes('T') || s.includes(' ') ? s : `${s}T00:00:00`);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Consolida cotizaciones planas en una fila por solicitud de cotización.
 * Conserva el detalle en `cotizaciones` para el modal Ver.
 */
export function consolidarExpedientesRecepcion(cotizaciones = []) {
  const map = new Map();
  (cotizaciones || []).forEach((c) => {
    const key = String(c.solicitud_id || c.solicitud_codigo || '');
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        solicitud_id: c.solicitud_id,
        solicitud_codigo: c.solicitud_codigo,
        denominacion: c.denominacion || '',
        objeto: c.objeto || '',
        requerimientos_texto: c.requerimientos_texto || c.requerimientos_codigos || '',
        requerimientos_codigos: c.requerimientos_codigos || c.requerimientos_texto || '',
        centros_texto: c.centros_texto || c.centro || '',
        cotizaciones: [],
      });
    }
    const g = map.get(key);
    g.cotizaciones.push(c);
    if (!g.centros_texto && (c.centros_texto || c.centro)) {
      g.centros_texto = c.centros_texto || c.centro || '';
    }
    if (!g.requerimientos_texto && (c.requerimientos_texto || c.requerimientos_codigos)) {
      g.requerimientos_texto = c.requerimientos_texto || c.requerimientos_codigos || '';
      g.requerimientos_codigos = g.requerimientos_texto;
    }
  });

  return [...map.values()].map((g) => {
    const seedCot = g.cotizaciones[0] || {};
    const meta = {
      solicitud_estado: seedCot.solicitud_estado || g.solicitud_estado || '',
      estado_cuadro: seedCot.estado_cuadro || g.estado_cuadro || '',
      derivado_ccp: !!seedCot.derivado_ccp,
      codigo_ccp: seedCot.codigo_ccp || g.codigo_ccp || '',
      ccp_activo: !!seedCot.ccp_activo || !!seedCot.ccp_registrado,
      enviada_oppm: !!seedCot.enviada_oppm,
    };
    const est = estadoExpedienteRecepcion(g.cotizaciones, meta);
    const fechas = g.cotizaciones.map((c) => c.fecha_presentacion || c.created_at).filter(Boolean);
    const fechaUltima = fechas.sort((a, b) => fechaSortKey(b) - fechaSortKey(a))[0] || '';
    return {
      ...g,
      solicitud_estado: meta.solicitud_estado,
      estado_cuadro: meta.estado_cuadro,
      cantidad_cotizaciones: g.cotizaciones.length,
      estado_recepcion: est.label,
      validacion_estado: est.validacion_estado,
      badge_estado: est.badge,
      badgeStyle: est.badgeStyle || '',
      derivado_ccp: !!est.derivado_ccp,
      ccp_registrado: !!est.ccp_registrado,
      codigo_ccp: est.codigo_ccp || meta.codigo_ccp || '',
      fecha_ultima_presentacion: fechaUltima,
    };
  }).sort((a, b) => fechaSortKey(b.fecha_ultima_presentacion) - fechaSortKey(a.fecha_ultima_presentacion));
}

function esCmnNumerico(valor) {
  return /^\d{4,6}$/.test(String(valor || '').trim());
}

export function formatCentrosBandeja(c, esc) {
  const raw = c?.centros_texto || c?.centro || '';
  const parts = String(raw).split(',').map((s) => s.trim()).filter((s) => s && !esCmnNumerico(s));
  if (!parts.length) return '—';
  if (parts.length === 1) return esc(parts[0]);
  return `<span class="small" title="${esc(parts.join(', '))}">${esc(parts[0])} <span class="text-muted">+${parts.length - 1}</span></span>`;
}
