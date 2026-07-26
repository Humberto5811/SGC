/** Utilidades compartidas — bandeja Recepción de Cotizaciones. */

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
export function estadoExpedienteRecepcion(cotizaciones = []) {
  const list = Array.isArray(cotizaciones) ? cotizaciones : [];
  if (!list.length) return { label: 'Cotización recibida', validacion_estado: '', badge: 'primary' };
  const norms = list.map(normValidacion);
  if (norms.some((v) => !v || v === 'PENDIENTE')) {
    return { label: 'Cotización recibida', validacion_estado: 'PENDIENTE', badge: 'primary' };
  }
  if (norms.some((v) => v === 'DERIVADA' || v === 'EN_PROCESO')) {
    return { label: 'Enviada a validación AU', validacion_estado: 'DERIVADA', badge: 'info text-dark' };
  }
  return { label: 'Validada por área usuaria', validacion_estado: 'VALIDADA_AU', badge: 'success' };
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
    const est = estadoExpedienteRecepcion(g.cotizaciones);
    const fechas = g.cotizaciones.map((c) => c.fecha_presentacion || c.created_at).filter(Boolean);
    const fechaUltima = fechas.sort((a, b) => fechaSortKey(b) - fechaSortKey(a))[0] || '';
    return {
      ...g,
      cantidad_cotizaciones: g.cotizaciones.length,
      estado_recepcion: est.label,
      validacion_estado: est.validacion_estado,
      badge_estado: est.badge,
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
