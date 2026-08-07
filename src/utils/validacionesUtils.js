/** Utilidades compartidas — bandeja Validaciones (RC7.7.1). */
import {
  resolveEstadoExpedienteVigente,
  BADGE_COLOR_CCP,
  esExpedienteDerivadoCcp,
} from '../../shared/estadoExpedienteVigente.js';
import { renderBadgeEstadoVigenteHtml } from '../ui/workflow/index.js';

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

const ESTADOS_GLOBAL_AVANZADOS = [
  'ORDEN_NOTIFICADA', 'ORDEN_REGISTRADA', 'ORDEN_LISTA_NOTIFICACION', 'REGISTRO_ORDENES',
  'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO', 'ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION',
  'CCP_REGISTRADA', 'ENVIADA_OPPM', 'DERIVADO_CCP',
  'RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA', 'BIEN_RECIBIDO_ALMACEN',
  'CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU', 'CONFORMIDAD_EN_COORDINACION_CM',
];

/** Estado agregado del expediente en bandeja Validaciones. */
export function estadoExpedienteValidacion(cotizaciones = [], meta = {}) {
  const list = Array.isArray(cotizaciones) ? cotizaciones : [];
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
      ccp_registrado: true,
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
      estadoVigente: vigente.estadoVigente,
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
  if (exp?.estadoVigente?.codigo || exp?.estado_vigente) {
    return renderBadgeEstadoVigenteHtml({
      ...exp,
      codigo_ccp: exp.codigo_ccp || '',
      ccp_activo: !!exp.ccp_activo,
      orden_estado: exp.orden_estado || '',
      enviado_proveedor_at: exp.enviado_proveedor_at || null,
      orden_id: exp.orden_id || null,
      // RC8.1B — preservar evidencia de recepción de bienes en el seed del resolvedor.
      recepcion_estado_global: exp.recepcion_estado_global || '',
      recepcion_estado_interno: exp.recepcion_estado_interno || '',
      recepcion_bienes_expediente_id: exp.recepcion_bienes_expediente_id ?? null,
    }, escFn);
  }
  if (exp?.ccp_registrado || exp?.ccp_activo || exp?.validacion_estado === 'CCP_REGISTRADO'
    || exp?.validacion_estado === 'CCP_REGISTRADA'
    || exp?.codigo_ccp
    || exp?.derivado_ccp || exp?.validacion_estado === 'DERIVADO_CCP'
    || exp?.validacion_estado === 'ENVIADA_OPPM'
    || exp?.orden_estado || exp?.enviado_proveedor_at
    || exp?.estado_bandeja_class === 'ccp-morado'
    || exp?.recepcion_estado_global
    || esExpedienteDerivadoCcp(exp || {})) {
    return renderBadgeEstadoVigenteHtml({
      ...exp,
      estado_cuadro: exp.estado_cuadro || 'DERIVADO_CCP',
      codigo_ccp: exp.codigo_ccp || '',
      ccp_activo: !!exp.ccp_activo,
      orden_estado: exp.orden_estado || '',
      enviado_proveedor_at: exp.enviado_proveedor_at || null,
      orden_id: exp.orden_id || null,
      recepcion_estado_global: exp.recepcion_estado_global || '',
      recepcion_estado_interno: exp.recepcion_estado_interno || '',
      recepcion_bienes_expediente_id: exp.recepcion_bienes_expediente_id ?? null,
    }, escFn);
  }
  const label = exp?.estado_bandeja || 'Pendiente de validación';
  void label;
  return renderBadgeEstadoVigenteHtml(exp || {}, escFn);
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
    const withOrden = g.cotizaciones.find((c) => c.enviado_proveedor_at || c.orden_estado || c.estadoVigente)
      || seedCot;
    const meta = {
      solicitud_estado: withOrden.solicitud_estado || seedCot.solicitud_estado || g.solicitud_estado || '',
      estado_cuadro: withOrden.estado_cuadro || seedCot.estado_cuadro || g.estado_cuadro || '',
      derivado_ccp: !!withOrden.derivado_ccp || !!seedCot.derivado_ccp,
      codigo_ccp: withOrden.codigo_ccp || seedCot.codigo_ccp || '',
      ccp_activo: !!withOrden.ccp_activo || !!withOrden.ccp_registrado
        || !!seedCot.ccp_activo || !!seedCot.ccp_registrado,
      enviada_oppm: !!withOrden.enviada_oppm || !!seedCot.enviada_oppm,
      orden_id: withOrden.orden_id || seedCot.orden_id || null,
      orden_estado: withOrden.orden_estado || seedCot.orden_estado || '',
      enviado_proveedor_at: withOrden.enviado_proveedor_at || seedCot.enviado_proveedor_at || null,
      recibido_proveedor_at: withOrden.recibido_proveedor_at || seedCot.recibido_proveedor_at || null,
      orden_resuelta: !!(withOrden.orden_resuelta || seedCot.orden_resuelta),
      expediente_derivado_pago: !!(withOrden.expediente_derivado_pago || seedCot.expediente_derivado_pago),
      // RC8.1B — preservar evidencia de recepción de bienes en la consolidación.
      recepcion_estado_global: withOrden.recepcion_estado_global
        || seedCot.recepcion_estado_global || '',
      recepcion_estado_interno: withOrden.recepcion_estado_interno
        || seedCot.recepcion_estado_interno || '',
      recepcion_bienes_expediente_id: withOrden.recepcion_bienes_expediente_id
        ?? seedCot.recepcion_bienes_expediente_id ?? null,
      estadoVigente: withOrden.estadoVigente || seedCot.estadoVigente || null,
    };
    const est = estadoExpedienteValidacion(g.cotizaciones, meta);
    const vigente = est.estadoVigente || meta.estadoVigente || {
      codigo: est.validacion_estado,
      label: est.label,
    };
    const fechas = g.cotizaciones.map((c) => c.fecha_presentacion || c.created_at).filter(Boolean);
    const fechaUltima = fechas.sort((a, b) => fechaSortKey(b) - fechaSortKey(a))[0] || '';
    const responsables = [...new Set(
      g.cotizaciones.map((c) => c.validacion_responsable || c.responsable_nombre || '').filter(Boolean),
    )];
    const estadoInternoVal = (() => {
      const vals = g.cotizaciones.map((c) => String(c.validacion_estado || '').toUpperCase()).filter(Boolean);
      if (!vals.length) return null;
      const first = vals[0];
      return {
        codigo: first,
        label: first,
        modulo: 'VALIDACIONES',
      };
    })();
    return {
      ...g,
      solicitud_estado: meta.solicitud_estado,
      estado_cuadro: meta.estado_cuadro,
      centro: g.centros_texto,
      cantidad_cotizaciones: g.cotizaciones.length,
      estado_bandeja: vigente.label || est.label,
      estado_bandeja_class: est.badge,
      badgeStyle: est.badgeStyle || '',
      derivado_ccp: !!est.derivado_ccp,
      ccp_registrado: !!est.ccp_registrado,
      codigo_ccp: meta.codigo_ccp || '',
      orden_id: meta.orden_id,
      orden_estado: meta.orden_estado,
      enviado_proveedor_at: meta.enviado_proveedor_at,
      orden_resuelta: meta.orden_resuelta,
      expediente_derivado_pago: meta.expediente_derivado_pago,
      // RC8.1B — propagar evidencia de recepción de bienes en la fila consolidada.
      recepcion_estado_global: meta.recepcion_estado_global,
      recepcion_estado_interno: meta.recepcion_estado_interno,
      recepcion_bienes_expediente_id: meta.recepcion_bienes_expediente_id,
      estadoVigente: vigente,
      estado_vigente: vigente.codigo,
      estado_vigente_label: vigente.label,
      estadoInterno: withOrden.estadoInterno || estadoInternoVal,
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
