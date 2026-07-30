/**
 * Validación de transiciones críticas de estado global.
 * No bloquea históricos incompatibles sin estrategia de compatibilidad.
 */
import {
  normalizeEstadoCode,
  getPrioridad,
  isTerminalEstado,
  getEstadoDef,
} from './estadoExpedienteCatalog.js';

const TRANSICIONES_PERMITIDAS = Object.freeze({
  REQUERIMIENTO_REGISTRADO: ['REQUERIMIENTO_EN_EVALUACION', 'REQUERIMIENTO_APROBADO'],
  REQUERIMIENTO_EN_EVALUACION: ['REQUERIMIENTO_APROBADO', 'REQUERIMIENTO_EN_DEC'],
  REQUERIMIENTO_APROBADO: ['REQUERIMIENTO_EN_DEC', 'EN_PROGRAMACION'],
  REQUERIMIENTO_EN_DEC: ['REQUERIMIENTO_APROBADO_DEC', 'EN_PROGRAMACION'],
  REQUERIMIENTO_APROBADO_DEC: ['EN_PROGRAMACION'],
  EN_PROGRAMACION: ['PROGRAMACION_APROBADA', 'EN_COORDINACION_CM', 'INVITACION_EN_ELABORACION'],
  PROGRAMACION_APROBADA: ['EN_COORDINACION_CM', 'INVITACION_EN_ELABORACION', 'INVITACION_ENVIADA'],
  EN_COORDINACION_CM: ['COORDINACION_CM_APROBADA', 'INVITACION_EN_ELABORACION'],
  COORDINACION_CM_APROBADA: ['INVITACION_EN_ELABORACION', 'INVITACION_ENVIADA'],
  INVITACION_EN_ELABORACION: ['INVITACION_ENVIADA'],
  INVITACION_ENVIADA: ['COTIZACIONES_RECIBIDAS', 'VALIDACION_ENVIADA', 'CUADRO_BORRADOR', 'PENDIENTE_ELABORAR'],
  COTIZACIONES_RECIBIDAS: ['VALIDACION_ENVIADA', 'VALIDADO_POR_AU', 'PENDIENTE_ELABORAR'],
  VALIDACION_ENVIADA: ['VALIDADO_POR_AU', 'VALIDACION_REVISADA_POR_AU'],
  VALIDADO_POR_AU: ['CUADRO_BORRADOR', 'PENDIENTE_ELABORAR', 'CUADRO_COMPARATIVO_GENERADO'],
  CUADRO_BORRADOR: ['CUADRO_COMPARATIVO_GENERADO', 'CUADRO_EN_COORDINACION_CM'],
  CUADRO_COMPARATIVO_GENERADO: ['CUADRO_EN_COORDINACION_CM'],
  CUADRO_EN_COORDINACION_CM: ['CUADRO_EN_DEC', 'CUADRO_BORRADOR'],
  CUADRO_EN_DEC: ['CUADRO_COMPARATIVO_APROBADO', 'CUADRO_EN_COORDINACION_CM', 'CUADRO_BORRADOR'],
  CUADRO_COMPARATIVO_APROBADO: ['DERIVADO_CCP', 'CCP_REGISTRADA'],
  DERIVADO_CCP: ['ENVIADA_OPPM', 'CCP_REGISTRADA'],
  ENVIADA_OPPM: ['CCP_REGISTRADA'],
  CCP_REGISTRADA: ['REGISTRO_ORDENES', 'ORDEN_REGISTRADA'],
  REGISTRO_ORDENES: ['ORDEN_REGISTRADA', 'ORDEN_LISTA_NOTIFICACION'],
  ORDEN_REGISTRADA: ['ORDEN_LISTA_NOTIFICACION', 'ORDEN_NOTIFICADA', 'ORDEN_RESUELTA'],
  ORDEN_LISTA_NOTIFICACION: ['ORDEN_NOTIFICADA', 'ORDEN_RESUELTA'],
  ORDEN_NOTIFICADA: [
    'ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION', 'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
    'RECEPCION_BIENES_PENDIENTE', 'BIEN_RECIBIDO_ALMACEN',
  ],
  ORDEN_RECEPCION_CONFIRMADA: ['EN_EJECUCION', 'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO', 'RECEPCION_BIENES_PENDIENTE'],
  EN_EJECUCION: ['EXPEDIENTE_DERIVADO_PAGO', 'ORDEN_RESUELTA', 'RECEPCION_BIENES_PENDIENTE', 'BIEN_RECIBIDO_ALMACEN'],
  RECEPCION_BIENES_PENDIENTE: [
    'BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA', 'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
  ],
  RECEPCION_BIENES_OBSERVADA: [
    'BIEN_RECIBIDO_ALMACEN', 'CONFORMIDAD_PENDIENTE_AU', 'RECEPCION_BIENES_OBSERVADA', 'ORDEN_RESUELTA',
  ],
  BIEN_RECIBIDO_ALMACEN: [
    'CONFORMIDAD_PENDIENTE_AU', 'BIEN_RECIBIDO_ALMACEN', 'RECEPCION_BIENES_OBSERVADA', 'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
  ],
  CONFORMIDAD_PENDIENTE_AU: [
    'CONFORMIDAD_RECIBIDA_AU', 'BIEN_RECIBIDO_ALMACEN', 'ORDEN_RESUELTA',
  ],
  CONFORMIDAD_RECIBIDA_AU: [
    'CONFORMIDAD_EN_COORDINACION_CM', 'CONFORMIDAD_PENDIENTE_AU', 'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
  ],
  CONFORMIDAD_EN_COORDINACION_CM: [
    'EXPEDIENTE_DERIVADO_PAGO', 'CONFORMIDAD_RECIBIDA_AU', 'CONFORMIDAD_PENDIENTE_AU', 'ORDEN_RESUELTA',
  ],
  EXPEDIENTE_DERIVADO_PAGO: ['ORDEN_RESUELTA'],
});

/**
 * @returns {{ ok: boolean, reason?: string, estadoActual: string, estadoDestino: string, idempotent?: boolean }}
 */
export function validateEstadoTransition({
  estadoActual,
  estadoDestino,
  accion = '',
  actor = '',
  contexto = {},
  allowHistorical = true,
} = {}) {
  const from = normalizeEstadoCode(estadoActual);
  const to = normalizeEstadoCode(estadoDestino);

  if (!to) {
    return { ok: false, reason: 'estado_destino_vacio', estadoActual: from, estadoDestino: to };
  }

  // Idempotencia: misma transición
  if (from && from === to) {
    return {
      ok: true, idempotent: true, reason: 'mismo_estado', estadoActual: from, estadoDestino: to,
    };
  }

  // Terminal: no retroceder ni avanzar salvo ORDEN_RESUELTA ya es terminal
  if (from && isTerminalEstado(from) && to !== from) {
    return {
      ok: false,
      reason: 'estado_terminal',
      estadoActual: from,
      estadoDestino: to,
      actor,
      accion,
    };
  }

  // ORDEN_RESUELTA requiere evidencia mínima
  if (to === 'ORDEN_RESUELTA') {
    const ctx = contexto || {};
    const tieneOrden = !!(ctx.orden_id || ctx.ordenId);
    const tieneMotivo = !!(String(ctx.motivo || '').trim());
    const tieneDoc = !!(ctx.documento || ctx.documento_resolucion || ctx.documentoId);
    const tieneFecha = !!(ctx.fecha || ctx.fecha_resolucion || ctx.resuelta_at);
    const tieneUsuario = !!(actor || ctx.usuario || ctx.responsable);
    if (!(tieneOrden && tieneMotivo && tieneDoc && tieneFecha && tieneUsuario)) {
      if (!allowHistorical || !ctx.skipValidation) {
        return {
          ok: false,
          reason: 'orden_resuelta_requiere_orden_motivo_documento_fecha_usuario',
          estadoActual: from,
          estadoDestino: to,
        };
      }
    }
  }

  // No retroceder prioridad (salvo observación / corrección documentada)
  if (from && getPrioridad(to) < getPrioridad(from)) {
    const accionNorm = String(accion || '').toUpperCase();
    const permiteRetroceso = ['OBSERVAR', 'OBSERVADO', 'DEVOLVER', 'CORREGIR', 'ANULAR']
      .some((a) => accionNorm.includes(a));
    if (!permiteRetroceso) {
      if (allowHistorical && contexto?.legacy) {
        return {
          ok: true,
          reason: 'compat_historico_retroceso',
          estadoActual: from,
          estadoDestino: to,
          warning: true,
        };
      }
      return {
        ok: false,
        reason: 'retroceso_no_permitido',
        estadoActual: from,
        estadoDestino: to,
        prioridadActual: getPrioridad(from),
        prioridadDestino: getPrioridad(to),
      };
    }
  }

  // Matriz de transiciones conocidas
  if (from && TRANSICIONES_PERMITIDAS[from]) {
    const allowed = TRANSICIONES_PERMITIDAS[from];
    if (allowed.includes(to)) {
      return { ok: true, estadoActual: from, estadoDestino: to, actor, accion };
    }
    // Permitir salto hacia adelante dentro de misma familia si prioridad mayor
    // (expedientes que saltan etapas por carga histórica)
    if (getPrioridad(to) > getPrioridad(from) && getEstadoDef(to)) {
      if (allowHistorical) {
        return {
          ok: true,
          reason: 'avance_permitido_compat',
          estadoActual: from,
          estadoDestino: to,
          warning: true,
        };
      }
      return {
        ok: false,
        reason: 'transicion_no_listada',
        estadoActual: from,
        estadoDestino: to,
      };
    }
  }

  // Sin estado actual: permitir si destino es conocido
  if (!from && getEstadoDef(to)) {
    return { ok: true, estadoActual: from, estadoDestino: to, reason: 'sin_estado_previo' };
  }

  if (allowHistorical) {
    return {
      ok: true,
      reason: 'compat_historico',
      estadoActual: from,
      estadoDestino: to,
      warning: true,
    };
  }

  return {
    ok: false,
    reason: 'transicion_rechazada',
    estadoActual: from,
    estadoDestino: to,
  };
}

export { TRANSICIONES_PERMITIDAS };
