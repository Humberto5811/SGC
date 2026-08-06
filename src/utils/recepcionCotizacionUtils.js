/** Utilidades compartidas — bandeja Recepción de Cotizaciones. */
import {
  esExpedienteDerivadoCcp,
} from '../../shared/estadoExpedienteVigente.js';
import { renderBadgeEstadoVigenteHtml } from '../ui/workflow/index.js';
import {
  buildEstadoRecepcionContract,
  resolveEstadoRecepcion,
  resolveEstadoCotizacion,
  badgeClassRecepcion,
  fechaPrincipalCotizacion,
} from './estadoRecepcionCotizaciones.js';
import {
  resolveDestinoDesdeRecepcionCotizaciones,
  DESTINOS_RECEPCION,
  labelAccionDerivacionRecepcion,
} from '../../shared/workflow/destinoRecepcion.js';

export {
  buildEstadoRecepcionContract,
  resolveEstadoRecepcion,
  resolveEstadoCotizacion,
  fechaPrincipalCotizacion,
  resolveDestinoDesdeRecepcionCotizaciones,
  DESTINOS_RECEPCION,
  labelAccionDerivacionRecepcion,
};

/** Tipo del expediente (solicitud o requerimiento). */
export function tipoExpedienteRecepcion(row = {}) {
  return row.tipo || row.solicitud_tipo || row.tipo_contratacion || '';
}

export function destinoRecepcionDeFila(row = {}) {
  return resolveDestinoDesdeRecepcionCotizaciones(tipoExpedienteRecepcion(row));
}

function yaDerivadoDesdeRecepcion(c) {
  if (c?.derivado_ccp || c?.ccp_activo || c?.ccp_registrado) return true;
  const sol = String(c?.solicitud_estado || '').toUpperCase();
  if (sol === 'EN_CCP') return true;
  const etapa = String(c?.estado_actual || c?.estadoActual || '').toUpperCase();
  if (etapa === 'CCP' || etapa === 'VALIDACION_USUARIO' || etapa === 'CUADRO_COMPARATIVO') return true;
  const v = String(c?.validacion_estado || '').toUpperCase();
  if (['DERIVADA', 'EN_PROCESO', 'APTO', 'NO_APTO', 'OBSERVADO'].includes(v)) return true;
  if (c?.validacion_informe?.derivacion_ccp) return true;
  return false;
}

export function puedeEnviarValidarRecepcion(c) {
  if (destinoRecepcionDeFila(c) !== DESTINOS_RECEPCION.VALIDACIONES) return false;
  const v = String(c?.validacion_estado || '').toUpperCase();
  return c?.estado === 'COTIZACION_PRESENTADA' && (!v || v === 'PENDIENTE');
}

export function puedeDerivarACcpRecepcion(c) {
  if (destinoRecepcionDeFila(c) !== DESTINOS_RECEPCION.CCP) return false;
  if (c?.estado !== 'COTIZACION_PRESENTADA') return false;
  if (yaDerivadoDesdeRecepcion(c)) return false;
  return true;
}

export function puedeDevolverValidacionRecepcion(c) {
  if (destinoRecepcionDeFila(c) === DESTINOS_RECEPCION.CCP) return false;
  const v = String(c?.validacion_estado || '').toUpperCase();
  return c?.estado === 'COTIZACION_PRESENTADA' && ['OBSERVADO', 'NO_APTO', 'APTO'].includes(v);
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

/** Label de cotización individual (modal / detalle). */
export function labelEstadoCotizacion(c) {
  return c?.estado_cotizacion_label
    || resolveEstadoCotizacion(c || {}).label
    || 'Cotización presentada';
}

/** Label agregado de recepción (bandeja). */
export function labelEstadoRecepcionAgregado(exp) {
  return exp?.estado_recepcion_label
    || exp?.estado_recepcion
    || resolveEstadoRecepcion(exp?.cotizaciones || [], exp || {}).label
    || 'Cotizaciones recibidas';
}

/** @deprecated usar labelEstadoCotizacion — compat modal. */
export function labelEstadoRecepcion(c) {
  return labelEstadoCotizacion(c);
}

export function badgeEstadoCotizacion(c) {
  const cot = resolveEstadoCotizacion(c || {});
  return badgeClassRecepcion('', cot.codigo);
}

/** HTML del badge de estado en bandeja Recepción (dominio recepción, no expediente). */
export function renderBadgeEstadoRecepcionHtml(exp, escFn = (s) => String(s ?? '')) {
  const codigo = String(exp?.estado_recepcion_codigo || '').toUpperCase();
  const avanzados = [
    'DERIVADO_CCP', 'CCP_REGISTRADA', 'ENVIADA_OPPM',
    'ORDEN_NOTIFICADA', 'ORDEN_REGISTRADA', 'REGISTRO_ORDENES',
    'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
    'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR', 'CUADRO_COMPARATIVO_APROBADO',
    // RC8.1B — evidencia global de recepción de bienes
    'BIEN_RECIBIDO_ALMACEN', 'RECIBIDO_ALMACEN', 'RECIBIDO_POR_ALMACEN',
    'RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA',
    'CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU',
    'CONFORMIDAD_EN_COORDINACION_CM',
  ];
  if (
    avanzados.includes(codigo)
    || exp?.recepcion_estado_global
    || exp?.ccp_registrado || exp?.ccp_activo || exp?.codigo_ccp
    || exp?.derivado_ccp
    || exp?.orden_estado || exp?.enviado_proveedor_at
    || esExpedienteDerivadoCcp(exp || {})
  ) {
    return renderBadgeEstadoVigenteHtml({
      ...exp,
      estado_vigente: codigo || exp.estado_vigente,
      estado_vigente_label: exp.estado_recepcion_label || exp.estado_recepcion,
      codigo_ccp: exp.codigo_ccp || '',
      ccp_activo: !!exp.ccp_activo,
      orden_estado: exp.orden_estado || '',
      enviado_proveedor_at: exp.enviado_proveedor_at || null,
      orden_id: exp.orden_id || null,
      // RC8.1B — preservar evidencia de recepción de bienes al delegar al resolvedor.
      recepcion_estado_global: exp.recepcion_estado_global || '',
      recepcion_estado_interno: exp.recepcion_estado_interno || '',
      recepcion_bienes_expediente_id: exp.recepcion_bienes_expediente_id ?? null,
    }, escFn);
  }

  const label = labelEstadoRecepcionAgregado(exp);
  return renderBadgeEstadoVigenteHtml({
    ...exp,
    estado_responsable_vigente: exp.estado_responsable_vigente || {
      estadoCodigo: codigo || exp.estado_vigente || '',
      estadoLabel: label,
    },
  }, escFn);
}

function fechaSortKey(iso) {
  const s = String(iso || '').trim();
  if (!s) return 0;
  const t = Date.parse(s.includes('T') || s.includes(' ') || s.includes('Z') ? s : `${s}T00:00:00`);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Consolida cotizaciones planas en una fila por solicitud de cotización.
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
        tipo: c.tipo || c.solicitud_tipo || '',
        solicitud_tipo: c.solicitud_tipo || c.tipo || '',
        requerimiento_id: c.requerimiento_id || null,
        requerimientos_texto: c.requerimientos_texto || c.requerimientos_codigos || '',
        requerimientos_codigos: c.requerimientos_codigos || c.requerimientos_texto || '',
        centros_texto: c.centros_texto || c.centro || '',
        cotizaciones: [],
      });
    }
    const g = map.get(key);
    g.cotizaciones.push(c);
    if (!g.requerimiento_id && c.requerimiento_id) g.requerimiento_id = c.requerimiento_id;
    if (!g.tipo && (c.tipo || c.solicitud_tipo)) {
      g.tipo = c.tipo || c.solicitud_tipo;
      g.solicitud_tipo = g.tipo;
    }
    if (!g.estado_responsable_vigente && c.estado_responsable_vigente) {
      g.estado_responsable_vigente = c.estado_responsable_vigente;
    }
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
    const withOrden = g.cotizaciones.find((c) => c.enviado_proveedor_at || c.orden_estado)
      || seedCot;
    const meta = {
      solicitud_estado: withOrden.solicitud_estado || seedCot.solicitud_estado || '',
      estado_cuadro: withOrden.estado_cuadro || seedCot.estado_cuadro || '',
      derivado_ccp: !!withOrden.derivado_ccp || !!seedCot.derivado_ccp,
      codigo_ccp: withOrden.codigo_ccp || seedCot.codigo_ccp || '',
      ccp_activo: !!withOrden.ccp_activo || !!seedCot.ccp_activo,
      ccp_registrado: !!withOrden.ccp_registrado || !!seedCot.ccp_registrado,
      enviada_oppm: !!withOrden.enviada_oppm || !!seedCot.enviada_oppm,
      orden_id: withOrden.orden_id || seedCot.orden_id || null,
      orden_estado: withOrden.orden_estado || seedCot.orden_estado || '',
      enviado_proveedor_at: withOrden.enviado_proveedor_at || seedCot.enviado_proveedor_at || null,
      // RC8.1B — preservar evidencia de recepción de bienes en la consolidación.
      recepcion_estado_global: withOrden.recepcion_estado_global
        || seedCot.recepcion_estado_global || '',
      recepcion_estado_interno: withOrden.recepcion_estado_interno
        || seedCot.recepcion_estado_interno || '',
      recepcion_bienes_expediente_id: withOrden.recepcion_bienes_expediente_id
        ?? seedCot.recepcion_bienes_expediente_id ?? null,
      estado_actual: withOrden.estado_actual || seedCot.estado_actual || '',
      sub_modulo_actual: withOrden.sub_modulo_actual || seedCot.sub_modulo_actual || '',
      estadoVigente: withOrden.estado_recepcion_codigo && [
        'DERIVADO_CCP', 'CCP_REGISTRADA', 'ENVIADA_OPPM',
      ].includes(String(withOrden.estado_recepcion_codigo).toUpperCase())
        ? {
          codigo: withOrden.estado_recepcion_codigo,
          label: withOrden.estado_recepcion_label,
        }
        : null,
    };

    const contract = buildEstadoRecepcionContract({
      cotizaciones: g.cotizaciones,
      meta,
    });

    const fechas = g.cotizaciones.map((c) => fechaPrincipalCotizacion(c)).filter(Boolean);
    const fechaUltima = fechas.sort((a, b) => fechaSortKey(b) - fechaSortKey(a))[0] || '';

    return {
      ...g,
      solicitud_estado: meta.solicitud_estado,
      estado_cuadro: meta.estado_cuadro,
      cantidad_cotizaciones: g.cotizaciones.length,
      requerimiento_id: g.requerimiento_id || seedCot.requerimiento_id || null,
      estado_responsable_vigente: g.estado_responsable_vigente
        || withOrden.estado_responsable_vigente
        || seedCot.estado_responsable_vigente
        || null,
      estado_actual: meta.estado_actual,
      sub_modulo_actual: meta.sub_modulo_actual,
      ...contract,
      estado_recepcion: contract.estado_recepcion_label,
      badge_estado: contract.badge_estado,
      derivado_ccp: !!meta.derivado_ccp || contract.estado_recepcion_codigo === 'DERIVADO_CCP',
      ccp_registrado: !!meta.ccp_registrado || !!meta.ccp_activo,
      codigo_ccp: meta.codigo_ccp || '',
      orden_id: meta.orden_id,
      orden_estado: meta.orden_estado,
      enviado_proveedor_at: meta.enviado_proveedor_at,
      // RC8.1B — propagar evidencia de recepción de bienes en la fila consolidada.
      recepcion_estado_global: meta.recepcion_estado_global,
      recepcion_estado_interno: meta.recepcion_estado_interno,
      recepcion_bienes_expediente_id: meta.recepcion_bienes_expediente_id,
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
