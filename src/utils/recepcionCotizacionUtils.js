/** Utilidades compartidas — bandeja Recepción de Cotizaciones. */
import {
  resolveEstadoExpedienteVigente,
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

const ESTADOS_GLOBAL_AVANZADOS = [
  'ORDEN_NOTIFICADA', 'ORDEN_REGISTRADA', 'ORDEN_LISTA_NOTIFICACION', 'REGISTRO_ORDENES',
  'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO', 'ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION',
  'CCP_REGISTRADA', 'ENVIADA_OPPM', 'DERIVADO_CCP',
  'RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA', 'BIEN_RECIBIDO_ALMACEN',
  'CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU', 'CONFORMIDAD_EN_COORDINACION_CM',
];

/** Estado agregado del expediente (solicitud) según sus cotizaciones. */
export function estadoExpedienteRecepcion(cotizaciones = [], meta = {}) {
  const list = Array.isArray(cotizaciones) ? cotizaciones : [];
  // Si el backend ya resolvió estadoVigente avanzado, respetarlo
  const fromBe = meta.estadoVigente || list.find((c) => c?.estadoVigente?.codigo)?.estadoVigente;
  if (fromBe?.codigo && ESTADOS_GLOBAL_AVANZADOS.includes(fromBe.codigo)) {
    return {
      label: fromBe.label,
      validacion_estado: fromBe.codigo,
      badge: fromBe.codigo === 'CCP_REGISTRADA' ? 'success' : 'ccp-morado',
      badgeStyle: fromBe.codigo === 'CCP_REGISTRADA'
        ? 'background:#198754;color:#fff'
        : `background:${BADGE_COLOR_CCP};color:#fff`,
      derivado_ccp: true,
      ccp_registrado: ['CCP_REGISTRADA', 'ORDEN_NOTIFICADA', 'ORDEN_REGISTRADA', 'REGISTRO_ORDENES',
        'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
        'RECEPCION_BIENES_PENDIENTE', 'BIEN_RECIBIDO_ALMACEN',
        'CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU',
        'CONFORMIDAD_EN_COORDINACION_CM'].includes(fromBe.codigo),
      codigo_ccp: meta.codigo_ccp || list[0]?.codigo_ccp || '',
      estadoVigente: fromBe,
    };
  }
  const seed = {
    solicitud_estado: meta.solicitud_estado || list[0]?.solicitud_estado || '',
    estado_cuadro: meta.estado_cuadro || list[0]?.estado_cuadro || '',
    estado: meta.estado_cuadro || list[0]?.estado_cuadro || '',
    derivado_ccp: meta.derivado_ccp || list[0]?.derivado_ccp,
    codigo_ccp: meta.codigo_ccp || list[0]?.codigo_ccp || '',
    ccp_activo: meta.ccp_activo || list[0]?.ccp_activo || false,
    enviada_oppm: meta.enviada_oppm || list[0]?.enviada_oppm,
    orden_estado: meta.orden_estado || list[0]?.orden_estado || '',
    enviado_proveedor_at: meta.enviado_proveedor_at || list[0]?.enviado_proveedor_at || null,
    orden_id: meta.orden_id || list[0]?.orden_id || null,
    orden_resuelta: meta.orden_resuelta || list[0]?.orden_resuelta,
    expediente_derivado_pago: meta.expediente_derivado_pago || list[0]?.expediente_derivado_pago,
    recepcion_estado_global: meta.recepcion_estado_global || list[0]?.recepcion_estado_global || '',
    recepcion_bienes_expediente_id: meta.recepcion_bienes_expediente_id
      || list[0]?.recepcion_bienes_expediente_id || null,
  };
  const vigente = resolveEstadoExpedienteVigente(seed);
  if (vigente.codigo && (
    vigente.ccpRegistrado || vigente.derivadoCcp
    || ESTADOS_GLOBAL_AVANZADOS.includes(vigente.codigo)
  )) {
    return {
      label: vigente.label,
      validacion_estado: vigente.codigo,
      badge: vigente.codigo === 'CCP_REGISTRADA' ? 'success' : 'ccp-morado',
      badgeStyle: vigente.codigo === 'CCP_REGISTRADA'
        ? 'background:#198754;color:#fff'
        : (vigente.codigo === 'ENVIADA_OPPM'
          ? 'background:#0d6efd;color:#fff'
          : `background:${BADGE_COLOR_CCP};color:#fff`),
      derivado_ccp: !!vigente.derivadoCcp,
      ccp_registrado: !!vigente.ccpRegistrado,
      codigo_ccp: seed.codigo_ccp || '',
      estadoVigente: vigente.estadoVigente,
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

/** HTML del badge de estado en bandeja Recepción. */
export function renderBadgeEstadoRecepcionHtml(exp, escFn = (s) => String(s ?? '')) {
  if (exp?.estadoVigente?.codigo || exp?.estado_vigente) {
    return renderBadgeEstadoVigenteHtml({
      ...exp,
      codigo_ccp: exp.codigo_ccp || '',
      ccp_activo: !!exp.ccp_activo,
      orden_estado: exp.orden_estado || '',
      enviado_proveedor_at: exp.enviado_proveedor_at || null,
      orden_id: exp.orden_id || null,
    }, escFn);
  }
  if (exp?.ccp_registrado || exp?.ccp_activo
    || exp?.validacion_estado === 'CCP_REGISTRADO' || exp?.validacion_estado === 'CCP_REGISTRADA'
    || exp?.codigo_ccp
    || exp?.derivado_ccp || exp?.validacion_estado === 'DERIVADO_CCP'
    || exp?.validacion_estado === 'ENVIADA_OPPM'
    || exp?.orden_estado || exp?.enviado_proveedor_at
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
    // Preferir cotización con evidencia de orden más avanzada
    const withOrden = g.cotizaciones.find((c) => c.enviado_proveedor_at || c.orden_estado || c.estadoVigente)
      || seedCot;
    const meta = {
      solicitud_estado: withOrden.solicitud_estado || seedCot.solicitud_estado || g.solicitud_estado || '',
      estado_cuadro: withOrden.estado_cuadro || seedCot.estado_cuadro || g.estado_cuadro || '',
      derivado_ccp: !!withOrden.derivado_ccp || !!seedCot.derivado_ccp,
      codigo_ccp: withOrden.codigo_ccp || seedCot.codigo_ccp || g.codigo_ccp || '',
      ccp_activo: !!withOrden.ccp_activo || !!withOrden.ccp_registrado
        || !!seedCot.ccp_activo || !!seedCot.ccp_registrado,
      enviada_oppm: !!withOrden.enviada_oppm || !!seedCot.enviada_oppm,
      orden_id: withOrden.orden_id || seedCot.orden_id || null,
      orden_estado: withOrden.orden_estado || seedCot.orden_estado || '',
      enviado_proveedor_at: withOrden.enviado_proveedor_at || seedCot.enviado_proveedor_at || null,
      recibido_proveedor_at: withOrden.recibido_proveedor_at || seedCot.recibido_proveedor_at || null,
      orden_resuelta: !!(withOrden.orden_resuelta || seedCot.orden_resuelta),
      expediente_derivado_pago: !!(withOrden.expediente_derivado_pago || seedCot.expediente_derivado_pago),
      estadoVigente: withOrden.estadoVigente || seedCot.estadoVigente || null,
    };
    const est = estadoExpedienteRecepcion(g.cotizaciones, meta);
    const vigente = est.estadoVigente || meta.estadoVigente || {
      codigo: est.validacion_estado,
      label: est.label,
    };
    const fechas = g.cotizaciones.map((c) => c.fecha_presentacion || c.created_at).filter(Boolean);
    const fechaUltima = fechas.sort((a, b) => fechaSortKey(b) - fechaSortKey(a))[0] || '';
    return {
      ...g,
      solicitud_estado: meta.solicitud_estado,
      estado_cuadro: meta.estado_cuadro,
      cantidad_cotizaciones: g.cotizaciones.length,
      estado_recepcion: vigente.label || est.label,
      validacion_estado: vigente.codigo || est.validacion_estado,
      badge_estado: est.badge,
      badgeStyle: est.badgeStyle || '',
      derivado_ccp: !!est.derivado_ccp,
      ccp_registrado: !!est.ccp_registrado,
      codigo_ccp: est.codigo_ccp || meta.codigo_ccp || '',
      orden_id: meta.orden_id,
      orden_estado: meta.orden_estado,
      enviado_proveedor_at: meta.enviado_proveedor_at,
      orden_resuelta: meta.orden_resuelta,
      expediente_derivado_pago: meta.expediente_derivado_pago,
      estadoVigente: vigente,
      estado_vigente: vigente.codigo,
      estado_vigente_label: vigente.label,
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
