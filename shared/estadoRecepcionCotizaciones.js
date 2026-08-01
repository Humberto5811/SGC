/**
 * Dominio Recepción de Cotizaciones — estados separados del expediente global.
 * Fuente única FE/BE. No mezclar con resolveEstadoExpedienteVigente para badges de bandeja.
 */

/** Estado de cada cotización (proveedor). */
export const ESTADOS_COTIZACION = Object.freeze({
  BORRADOR: { codigo: 'BORRADOR', label: 'Borrador' },
  COTIZACION_PRESENTADA: { codigo: 'COTIZACION_PRESENTADA', label: 'Cotización presentada' },
  ENVIADA_A_VALIDAR: { codigo: 'ENVIADA_A_VALIDAR', label: 'Enviada a validar' },
  VALIDADA: { codigo: 'VALIDADA', label: 'Validada' },
  NO_VALIDA: { codigo: 'NO_VALIDA', label: 'No válida' },
  OBSERVADA: { codigo: 'OBSERVADA', label: 'Observada' },
  SUBSANADA: { codigo: 'SUBSANADA', label: 'Subsanada' },
});

/** Estado agregado de la solicitud en Recepción. */
export const ESTADOS_RECEPCION = Object.freeze({
  SIN_COTIZACIONES: { codigo: 'SIN_COTIZACIONES', label: 'Sin cotizaciones' },
  EN_COTIZACION: { codigo: 'EN_COTIZACION', label: 'En cotización' },
  COTIZACIONES_RECIBIDAS: { codigo: 'COTIZACIONES_RECIBIDAS', label: 'Cotizaciones recibidas' },
  ENVIADAS_A_VALIDAR: { codigo: 'ENVIADAS_A_VALIDAR', label: 'Enviadas a validar' },
  VALIDADAS_POR_USUARIO: { codigo: 'VALIDADAS_POR_USUARIO', label: 'Validadas por usuario' },
  DEVUELTA_A_INVITACIONES: { codigo: 'DEVUELTA_A_INVITACIONES', label: 'Devuelta a invitaciones' },
  LISTA_PARA_CUADRO_COMPARATIVO: { codigo: 'LISTA_PARA_CUADRO_COMPARATIVO', label: 'Lista para cuadro comparativo' },
});

const AVANZADOS_GLOBAL = new Set([
  'ORDEN_NOTIFICADA', 'ORDEN_REGISTRADA', 'ORDEN_LISTA_NOTIFICACION', 'REGISTRO_ORDENES',
  'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO', 'ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION',
  'CCP_REGISTRADA', 'ENVIADA_OPPM', 'DERIVADO_CCP',
  'RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA', 'BIEN_RECIBIDO_ALMACEN',
  'CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU', 'CONFORMIDAD_EN_COORDINACION_CM',
  'CUADRO_COMPARATIVO_APROBADO', 'PENDIENTE_ELABORAR', 'CUADRO_BORRADOR',
  'CUADRO_COMPARATIVO_GENERADO', 'CUADRO_EN_COORDINACION_CM', 'CUADRO_EN_DEC',
]);

function normVal(c) {
  return String(c?.validacion_estado || '').toUpperCase();
}

function normCotEstado(c) {
  return String(c?.estado || '').toUpperCase();
}

/**
 * Estado de una cotización individual.
 * @param {object} row cotizaciones_proveedor (+ validacion_estado)
 */
export function resolveEstadoCotizacion(row = {}) {
  const estado = normCotEstado(row);
  const val = normVal(row);

  if (val === 'DERIVADA' || val === 'EN_PROCESO') {
    return { ...ESTADOS_COTIZACION.ENVIADA_A_VALIDAR };
  }
  if (val === 'OBSERVADO') return { ...ESTADOS_COTIZACION.OBSERVADA };
  if (val === 'NO_APTO') return { ...ESTADOS_COTIZACION.NO_VALIDA };
  if (val === 'APTO') return { ...ESTADOS_COTIZACION.VALIDADA };
  if (estado === 'BORRADOR') return { ...ESTADOS_COTIZACION.BORRADOR };
  if (estado === 'COTIZACION_PRESENTADA' || estado === 'PRESENTADA' || !val || val === 'PENDIENTE') {
    return { ...ESTADOS_COTIZACION.COTIZACION_PRESENTADA };
  }
  return { ...ESTADOS_COTIZACION.COTIZACION_PRESENTADA };
}

/**
 * Estado agregado de recepción a partir de cotizaciones reales (+ flags globales opcionales).
 * @param {object[]} cotizaciones
 * @param {object} [meta] flags CCP/orden/solicitud
 */
export function resolveEstadoRecepcion(cotizaciones = [], meta = {}) {
  const list = Array.isArray(cotizaciones) ? cotizaciones : [];
  const fromBe = meta.estadoVigente || meta.estado_vigente_codigo
    ? {
      codigo: meta.estadoVigente?.codigo || meta.estado_vigente_codigo,
      label: meta.estadoVigente?.label || meta.estado_vigente_label,
    }
    : null;

  if (fromBe?.codigo && AVANZADOS_GLOBAL.has(String(fromBe.codigo).toUpperCase())) {
    return {
      codigo: String(fromBe.codigo).toUpperCase(),
      label: fromBe.label || fromBe.codigo,
      avanzado: true,
    };
  }

  const solicitudEstado = String(meta.solicitud_estado || '').toUpperCase();
  const estadoCuadro = String(meta.estado_cuadro || '').toUpperCase();
  if (
    meta.derivado_ccp
    || solicitudEstado === 'EN_CCP'
    || estadoCuadro === 'DERIVADO_CCP'
    || estadoCuadro === 'DERIVADO_A_CCP'
  ) {
    return { codigo: 'DERIVADO_CCP', label: 'Derivado a CCP', avanzado: true };
  }
  if (meta.ccp_activo || meta.ccp_registrado || meta.codigo_ccp) {
    return { codigo: 'CCP_REGISTRADA', label: 'CCP registrada', avanzado: true };
  }
  if (meta.enviada_oppm) {
    return { codigo: 'ENVIADA_OPPM', label: 'Solicitud enviada a OPPM', avanzado: true };
  }

  const presentadas = list.filter((c) => {
    const e = normCotEstado(c);
    return e === 'COTIZACION_PRESENTADA' || e === 'PRESENTADA' || !!c.fecha_presentacion;
  });

  if (!presentadas.length) {
    if (meta.plazo_abierto === false) {
      return { ...ESTADOS_RECEPCION.SIN_COTIZACIONES };
    }
    return { ...ESTADOS_RECEPCION.EN_COTIZACION };
  }

  const norms = presentadas.map(normVal);
  const allApto = norms.length && norms.every((v) => v === 'APTO');
  const allNoApto = norms.length && norms.every((v) => v === 'NO_APTO' || v === 'OBSERVADO');
  const anyDerivada = norms.some((v) => v === 'DERIVADA' || v === 'EN_PROCESO');
  const anyValidada = norms.some((v) => ['APTO', 'NO_APTO', 'OBSERVADO'].includes(v));
  const anyPendiente = norms.some((v) => !v || v === 'PENDIENTE');

  if (allApto) return { ...ESTADOS_RECEPCION.LISTA_PARA_CUADRO_COMPARATIVO };
  if (allNoApto && !anyPendiente && !anyDerivada) {
    return { ...ESTADOS_RECEPCION.DEVUELTA_A_INVITACIONES };
  }
  if (anyDerivada) return { ...ESTADOS_RECEPCION.ENVIADAS_A_VALIDAR };
  if (anyValidada && !anyPendiente) return { ...ESTADOS_RECEPCION.VALIDADAS_POR_USUARIO };
  return { ...ESTADOS_RECEPCION.COTIZACIONES_RECIBIDAS };
}

/**
 * Etapa/código de expediente desde fila de requerimiento o meta.
 */
export function resolveEstadoExpedienteRecepcion(meta = {}) {
  const etapa = String(meta.estado_actual || meta.estadoActual || meta.etapa || '').toUpperCase();
  const codigo = String(meta.estado_codigo || meta.estado_expediente_codigo || '').toUpperCase();
  if (codigo && AVANZADOS_GLOBAL.has(codigo)) {
    return { codigo, label: meta.estado_expediente_label || codigo };
  }
  if (etapa === 'RECEPCION_COTIZACIONES' || codigo === 'COTIZACIONES_RECIBIDAS') {
    return { codigo: 'COTIZACIONES_RECIBIDAS', label: 'Cotizaciones recibidas' };
  }
  if (etapa === 'VALIDACION_USUARIO') {
    return { codigo: 'VALIDACION_ENVIADA', label: 'Validación enviada' };
  }
  if (etapa === 'INVITACIONES') {
    return { codigo: 'INVITACION_ENVIADA', label: 'Invitación enviada' };
  }
  if (etapa === 'REGISTRADO' || codigo === 'REQUERIMIENTO_REGISTRADO') {
    return { codigo: 'REQUERIMIENTO_REGISTRADO', label: 'Requerimiento registrado' };
  }
  if (etapa) {
    return { codigo: etapa, label: meta.sub_modulo_actual || etapa };
  }
  return { codigo: '', label: '' };
}

/**
 * Contrato API explícito para Recepción (bandeja / modal / detalle).
 * @param {object} opts
 * @param {object} [opts.cotizacion] fila cotización
 * @param {object[]} [opts.cotizaciones] grupo
 * @param {object} [opts.meta]
 */
export function buildEstadoRecepcionContract(opts = {}) {
  const cotizacion = opts.cotizacion || null;
  const cotizaciones = Array.isArray(opts.cotizaciones)
    ? opts.cotizaciones
    : (cotizacion ? [cotizacion] : []);
  const meta = opts.meta || {};

  const cot = cotizacion
    ? resolveEstadoCotizacion(cotizacion)
    : { codigo: '', label: '' };
  const recepcion = resolveEstadoRecepcion(cotizaciones, meta);
  const expediente = resolveEstadoExpedienteRecepcion(meta);

  return {
    estado_expediente_codigo: expediente.codigo || '',
    estado_expediente_label: expediente.label || '',
    estado_recepcion_codigo: recepcion.codigo || '',
    estado_recepcion_label: recepcion.label || '',
    estado_cotizacion_codigo: cot.codigo || '',
    estado_cotizacion_label: cot.label || '',
    // Compat bandeja histórica
    estado_recepcion: recepcion.label || '',
    validacion_estado: cotizacion ? normVal(cotizacion) : (recepcion.codigo || ''),
    badge_estado: badgeClassRecepcion(recepcion.codigo, cot.codigo),
    avanzado: !!recepcion.avanzado,
  };
}

export function badgeClassRecepcion(recepcionCodigo, cotizacionCodigo) {
  const r = String(recepcionCodigo || '').toUpperCase();
  const c = String(cotizacionCodigo || '').toUpperCase();
  if (r === 'CCP_REGISTRADA' || r === 'LISTA_PARA_CUADRO_COMPARATIVO') return 'success';
  if (r === 'DERIVADO_CCP' || r === 'ENVIADA_OPPM') return 'ccp-morado';
  if (r === 'ENVIADAS_A_VALIDAR' || c === 'ENVIADA_A_VALIDAR') return 'info text-dark';
  if (r === 'VALIDADAS_POR_USUARIO' || c === 'VALIDADA') return 'success';
  if (c === 'OBSERVADA' || c === 'NO_VALIDA') return 'warning';
  if (r === 'COTIZACIONES_RECIBIDAS' || c === 'COTIZACION_PRESENTADA') return 'primary';
  if (r === 'EN_COTIZACION') return 'secondary';
  return 'primary';
}

export function fechaPrincipalCotizacion(row = {}) {
  return row.fecha_presentacion || row.fecha_envio || row.fecha_recepcion || row.created_at || null;
}
