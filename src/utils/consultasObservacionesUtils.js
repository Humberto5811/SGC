/** Utilidades — bandeja Consultas y Observaciones (consolidada por solicitud). */

function esCmnNumerico(valor) {
  return /^\d{4,6}$/.test(String(valor || '').trim());
}

export function formatCentrosConsultas(row, esc) {
  const raw = row?.centros_texto || row?.centro || '';
  const parts = String(raw).split(',').map((s) => s.trim()).filter((s) => s && !esCmnNumerico(s));
  if (!parts.length) return '—';
  if (parts.length === 1) return esc(parts[0]);
  return `<span class="small" title="${esc(parts.join(', '))}">${esc(parts[0])} <span class="text-muted">+${parts.length - 1}</span></span>`;
}

export function formatRequerimientosConsultas(row, esc) {
  const codes = [];
  String(row?.requerimientos_texto || row?.requerimiento_codigo || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((c) => { if (!codes.includes(c)) codes.push(c); });
  if (!codes.length) return '—';
  if (codes.length <= 2) {
    return codes.map((code) => `<div class="small">${esc(code)}</div>`).join('');
  }
  const title = codes.join(', ');
  return `<span class="small" title="${esc(title)}">${esc(codes[0])} <span class="text-muted">+ ${codes.length - 1} más</span></span>`;
}

function estadoAgregadoConsultas(consultas = []) {
  const list = Array.isArray(consultas) ? consultas : [];
  if (!list.length) return { label: 'Consultas', badge: 'secondary' };
  if (list.some((c) => String(c.estado || '').toUpperCase() === 'PENDIENTE')) {
    return { label: 'Consultas', badge: 'warning text-dark' };
  }
  return { label: 'Consultas', badge: 'success' };
}

function fechaSortKey(iso) {
  const s = String(iso || '').trim();
  if (!s) return 0;
  const t = Date.parse(s.includes('T') || s.includes(' ') ? s : `${s}T00:00:00`);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Consolida consultas planas en una fila por solicitud.
 * Detalle en `consultas` para el modal Ver.
 */
export function consolidarExpedientesConsultas(consultas = []) {
  const map = new Map();
  (consultas || []).forEach((c) => {
    const key = String(c.solicitud_id || c.solicitud_codigo || '');
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        solicitud_id: c.solicitud_id,
        solicitud_codigo: c.solicitud_codigo,
        denominacion: c.denominacion || '',
        objeto: c.objeto || '',
        requerimientos_texto: c.requerimientos_texto || c.requerimiento_codigo || '',
        centros_texto: c.centros_texto || c.centro || '',
        consultas: [],
      });
    }
    const g = map.get(key);
    g.consultas.push(c);
    if (c.requerimiento_codigo) {
      const codes = new Set(
        String(g.requerimientos_texto || '').split(',').map((s) => s.trim()).filter(Boolean),
      );
      codes.add(String(c.requerimiento_codigo).trim());
      g.requerimientos_texto = [...codes].join(', ');
    }
    if (!g.centros_texto && (c.centros_texto || c.centro)) {
      g.centros_texto = c.centros_texto || c.centro || '';
    }
  });

  return [...map.values()].map((g) => {
    const est = estadoAgregadoConsultas(g.consultas);
    const fechas = g.consultas.map((c) => c.created_at).filter(Boolean);
    const fechaUltima = fechas.sort((a, b) => fechaSortKey(b) - fechaSortKey(a))[0] || '';
    return {
      ...g,
      cantidad_consultas: g.consultas.length,
      estado_bandeja: est.label,
      estado_bandeja_class: est.badge,
      fecha_ultima: fechaUltima,
    };
  }).sort((a, b) => fechaSortKey(b.fecha_ultima) - fechaSortKey(a.fecha_ultima));
}
