/**
 * Resolvedor único del estado global vigente del expediente SGC.
 * Usa shared/estadoExpedienteCatalog.js como fuente de prioridad/labels/aliases.
 *
 * API pública principal: resolveEstadoExpedienteVigente(evidence)
 * Compat: resolveEstadoActualExpediente(row, opts) — campos históricos.
 */
import {
  normalizeEstadoCode,
  normalizeEstadoCuadroCode,
  getEstadoDef,
  getPrioridad,
  getLabelEstado,
  isTerminalEstado,
  SITUACIONES,
  SCOPE,
  getPrioridadLista,
} from './estadoExpedienteCatalog.js';

export {
  normalizeEstadoCode,
  normalizeEstadoCuadroCode,
  getEstadoDef,
  getPrioridad,
  getLabelEstado,
  isTerminalEstado,
  SITUACIONES,
  SCOPE,
  getPrioridadLista,
} from './estadoExpedienteCatalog.js';

/** @deprecated usar getPrioridadLista / catálogo — conservado por compat. */
export const PRIORIDAD_ESTADO_CUADRO = Object.freeze(getPrioridadLista());

export const ESTADOS_ORDEN_LABEL = Object.freeze({
  REGISTRO_ORDENES: 'Registro de órdenes',
  ORDEN_REGISTRADA: 'Orden registrada',
  ORDEN_LISTA_NOTIFICACION: 'Orden lista para notificación',
  ORDEN_NOTIFICADA: 'Orden notificada',
  ORDEN_RECEPCION_CONFIRMADA: 'Recepción de orden confirmada',
  EN_EJECUCION: 'En ejecución',
  ORDEN_ANULADA: 'Orden anulada',
  ORDEN_RESUELTA: 'Orden resuelta',
  EXPEDIENTE_DERIVADO_PAGO: 'Expediente derivado a pago',
  PENDIENTE_CCP_FIRMADO: 'Registro de órdenes',
  CCP_FIRMADO_RECIBIDO: 'Registro de órdenes',
  PENDIENTE_REGISTRO_ORDEN: 'Registro de órdenes',
  ORDEN_BORRADOR: 'Orden registrada',
  CRONOGRAMA_DEFINIDO: 'Orden registrada',
  ORDEN_FIRMADA: 'Orden lista para notificación',
  ORDEN_ENVIADA: 'Orden notificada',
  ORDEN_ENVIADA_PENDIENTE_CONFIRMACION: 'Orden notificada',
  ORDEN_EN_EJECUCION: 'En ejecución',
  ORDEN_OBSERVADA: 'Orden observada',
  DERIVADO_EJECUCION: 'En ejecución',
});

export function normalizeEstadoOrden(raw) {
  return normalizeEstadoCode(raw);
}

export const ESTADOS_CUADRO_VIGENTE_LABEL = Object.freeze({
  PENDIENTE_ELABORAR: 'C.C. en elaboración',
  BORRADOR: 'C.C. en elaboración',
  EN_ELABORACION: 'C.C. en elaboración',
  CUADRO_BORRADOR: 'C.C. en elaboración',
  GENERADO: 'C.C. en elaboración',
  GENERADO_PRELIMINAR: 'C.C. en elaboración',
  ADJUDICADO: 'C.C. en elaboración',
  OBSERVADO: 'C.C. en Coordinación CM - Observado',
  OBSERVADO_COORDINADOR: 'C.C. en Coordinación CM - Observado',
  PENDIENTE_COORDINADOR: 'C.C. en Coordinación CM',
  FIRMADO_COORDINADOR: 'C.C. en Coordinación CM',
  OBSERVADO_DEC: 'C.C. en DEC - Observado',
  PENDIENTE_DEC: 'C.C. en DEC',
  // APROBADO_DEC como código de revisión de cuadro (contexto estado_cuadro)
  APROBADO_DEC: 'C.C. aprobado',
  PENDIENTE_CCP: 'C.C. aprobado',
  FIRMADO: 'C.C. aprobado',
  CUADRO_EN_COORDINACION_CM: 'C.C. en Coordinación CM',
  CUADRO_EN_DEC: 'C.C. en DEC',
  CUADRO_COMPARATIVO_APROBADO: 'C.C. aprobado',
  REQUERIMIENTO_APROBADO_DEC: 'Aprobado por DEC',

  CUADRO_COMPARATIVO_GENERADO: 'C.C. generado',
  DERIVADO_CCP: 'Derivado a CCP',
  ENVIADA_OPPM: 'Solicitud enviada a OPPM',
  CCP_REGISTRADO: 'CCP registrada',
  CCP_REGISTRADA: 'CCP registrada',
  REGISTRO_ORDENES: 'Registro de órdenes',
  ORDEN_REGISTRADA: 'Orden registrada',
  ORDEN_LISTA_NOTIFICACION: 'Orden lista para notificación',
  ORDEN_NOTIFICADA: 'Orden notificada',
  ORDEN_RECEPCION_CONFIRMADA: 'Recepción de orden confirmada',
  EN_EJECUCION: 'En ejecución',
  ORDEN_ANULADA: 'Orden anulada',
  ORDEN_RESUELTA: 'Orden resuelta',
  EXPEDIENTE_DERIVADO_PAGO: 'Expediente derivado a pago',
  ANULADO: 'Anulado',
});

export function normalizeEstadoCuadroVigente(raw) {
  return normalizeEstadoCuadroCode(raw);
}

export function prioridadEstadoCuadro(code) {
  return getPrioridad(normalizeEstadoCuadroCode(code) || code);
}

export function labelEstadoCuadroVigente(code, opts = {}) {
  const raw = String(code || '').trim().toUpperCase().replace(/\s+/g, '_');
  // Etiquetas históricas de observación (para trazabilidad / historial)
  if (raw === 'OBSERVADO_COORDINADOR' || raw === 'OBSERVADO') {
    return 'C.C. en Coordinación CM - Observado';
  }
  if (raw === 'OBSERVADO_DEC') return 'C.C. en DEC - Observado';
  // Dominio cuadro: APROBADO_DEC (DB) → C.C. aprobado; no el alias post-DEC de requerimiento
  const e = normalizeEstadoCuadroCode(code) || normalizeEstadoCode(code);
  const tieneRespuesta = !!(opts.subsanado
    || String(opts.respuesta_observaciones || opts.respuesta || '').trim());
  if (tieneRespuesta && (e === 'CUADRO_EN_COORDINACION_CM' || e === 'CUADRO_EN_DEC')) {
    if (opts.situacionObservada) return 'C.C. subsanado';
  }
  const def = getEstadoDef(e);
  if (def) return def.label;
  return ESTADOS_CUADRO_VIGENTE_LABEL[e] || ESTADOS_CUADRO_VIGENTE_LABEL[raw] || e || 'C.C. en elaboración';
}

/** True si el valor es evidencia real (no solo existencia de campo). */
export function isTruthyEvidence(v) {
  if (v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE') return true;
  if (v == null || v === false || v === 0 || v === '' || v === '0' || v === 'false') return false;
  if (v instanceof Date) return !Number.isNaN(v.getTime());
  if (typeof v === 'string') return String(v).trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v) && v !== 0;
  return !!v;
}

/**
 * Normaliza nombres heterogéneos de evidencia a contrato común.
 */
export function normalizeEstadoFlags(row = {}, opts = {}) {
  const r = row && typeof row === 'object' ? row : {};
  const o = opts && typeof opts === 'object' ? opts : {};
  const codigoCcp = String(o.codigoCcp || r.codigo_ccp || r.codigoCcp || '').trim();
  const estadoHint = normalizeEstadoCode(
    o.estadoCcp || r.estado_ccp || r.estado_codigo || r.estado_vigente || '',
  );
  const ccpRegistrada = !!(
    o.ccpActivo === true || o.ccp_activo === true
    || r.ccp_activo === true || r.tiene_codigo === true
    || r.ccp_registrado === true || r.ccpRegistrado === true
    || estadoHint === 'CCP_REGISTRADA'
    || codigoCcp
  );
  const ordenEstado = normalizeEstadoCode(
    o.estadoOrden || r.orden_estado || r.estado_orden || r.estado_orden_contratacion || '',
  );
  const ordenNotificada = !!(
    isTruthyEvidence(r.enviado_proveedor_at) || o.ordenEnviada || o.ordenNotificada
    || ordenEstado === 'ORDEN_NOTIFICADA'
  );
  const ordenRegistrada = !!(
    ordenNotificada
    || ordenEstado === 'ORDEN_REGISTRADA'
    || ordenEstado === 'ORDEN_LISTA_NOTIFICACION'
    || ordenEstado === 'ORDEN_RECEPCION_CONFIRMADA'
    || ordenEstado === 'EN_EJECUCION'
    || isTruthyEvidence(r.orden_id) || isTruthyEvidence(o.ordenId)
  );
  const ordenResuelta = !!(
    o.ordenResuelta || r.orden_resuelta === true
    || isTruthyEvidence(r.orden_resuelta_at) || isTruthyEvidence(r.resuelta_at)
    || ordenEstado === 'ORDEN_RESUELTA'
    || normalizeEstadoCode(r.estado_resolucion || '') === 'ORDEN_RESUELTA'
  );
  const expedienteDerivadoPago = !!(
    o.expedienteDerivadoPago || r.expediente_derivado_pago === true
    || isTruthyEvidence(r.derivado_pago_at) || isTruthyEvidence(r.derivado_a_pago_at)
    || normalizeEstadoCode(r.estado_pago || r.pago_estado || '') === 'EXPEDIENTE_DERIVADO_PAGO'
    || ordenEstado === 'EXPEDIENTE_DERIVADO_PAGO'
    || normalizeEstadoCode(r.recepcion_estado_global || r.estado_recepcion_bienes || '') === 'EXPEDIENTE_DERIVADO_PAGO'
  );

  const recepcionEstado = normalizeEstadoCode(
    o.recepcionEstado || r.recepcion_estado_global || r.estado_recepcion_bienes || r.estado_global_recepcion || '',
  );
  const recepcionBienesCodes = new Set([
    'RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA', 'BIEN_RECIBIDO_ALMACEN',
    'CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU', 'CONFORMIDAD_EN_COORDINACION_CM',
  ]);
  const enRecepcionBienes = !!(
    recepcionBienesCodes.has(recepcionEstado)
    || o.recepcionBienesPendiente || r.recepcion_bienes_pendiente
    || isTruthyEvidence(r.recepcion_bienes_expediente_id)
  );

  return {
    requerimientoRegistrado: isTruthyEvidence(r.id || r.requerimiento_id),
    requerimientoAprobado: !!(o.requerimientoAprobado || r.requerimiento_aprobado),
    programacionAprobada: !!(o.programacionAprobada || r.programacion_aprobada),
    invitacionEnviada: !!(o.invitacionEnviada || r.invitacion_enviada),
    cotizacionesRecibidas: !!(o.cotizacionesRecibidas || r.cotizaciones_recibidas),
    validacionEnviada: !!(o.validacionEnviada || r.validacion_enviada),
    validadoPorAu: !!(o.validadoPorAu || r.validado_por_au),
    cuadroGenerado: !!(o.cuadroGenerado || r.cuadro_generado || r.cuadro_id),
    cuadroEnCoordinacion: !!(o.cuadroEnCoordinacion
      || normalizeEstadoCode(r.estado_cuadro || '') === 'CUADRO_EN_COORDINACION_CM'),
    cuadroEnDec: !!(o.cuadroEnDec
      || normalizeEstadoCode(r.estado_cuadro || '') === 'CUADRO_EN_DEC'),
    cuadroAprobado: !!(o.cuadroAprobado
      || normalizeEstadoCuadroCode(r.estado_cuadro || r.cuadro_estado || '')
        === 'CUADRO_COMPARATIVO_APROBADO'),
    ccpRegistrada,
    ordenRegistrada,
    ordenNotificada,
    ordenResuelta,
    expedienteDerivadoPago,
    enRecepcionBienes,
    recepcionEstado,
    ordenEstado,
    codigoCcp,
    enviadoProveedorAt: r.enviado_proveedor_at || null,
    recibidoProveedorAt: r.recibido_proveedor_at || null,
    derivadoEjecucionAt: r.derivado_ejecucion_at || null,
  };
}

function extractWorkflowSnapshot(row = {}) {
  const direct = row.workflowSnapshot || row.workflow_snapshot;
  if (direct && typeof direct === 'object') return direct;
  try {
    const p = typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : (row.payload || {});
    return p.workflowSnapshot || p.workflow_snapshot || null;
  } catch (_) {
    return null;
  }
}

function resolveWorkflowEtapa(row = {}, snap = null) {
  // BD / fila enriquecida gana sobre snapshot (puede quedar obsoleto tras derivar)
  const fromRow = String(row.estado_actual || row.estadoActual || row.etapa || '').toUpperCase();
  if (fromRow) return fromRow;
  const s = snap || extractWorkflowSnapshot(row);
  if (s?.etapaActual) return String(s.etapaActual).toUpperCase();
  return '';
}

function detectSituacionObservada(row = {}, opts = {}, rawCodes = []) {
  if (opts.situacion && typeof opts.situacion === 'object') return opts.situacion;
  if (row.situacion && typeof row.situacion === 'object') return row.situacion;

  const raws = rawCodes.map((x) => String(x || '').trim().toUpperCase());
  const isObsCoord = raws.some((s) => s === 'OBSERVADO_COORDINADOR' || s === 'OBSERVADO');
  const isObsDec = raws.some((s) => s === 'OBSERVADO_DEC');
  if (!isObsCoord && !isObsDec && !opts.observado && !row.observado) return null;

  return {
    codigo: SITUACIONES.OBSERVADO.codigo,
    label: SITUACIONES.OBSERVADO.label,
    observadoPor: opts.observadoPor || row.observado_por || null,
    origen: opts.origen || row.origen_observacion || (isObsDec ? 'DEC' : 'COORDINACION_CM'),
    destino: opts.destino || row.destino_observacion || null,
    motivo: opts.motivo || row.motivo_observacion || row.observacion || null,
    observadoAt: opts.observadoAt || row.observado_at || null,
    responsableSubsanacion: opts.responsableSubsanacion || row.responsable_subsanacion || null,
  };
}

function composeLabel(codigo, situacion) {
  const base = getLabelEstado(codigo) || ESTADOS_CUADRO_VIGENTE_LABEL[codigo] || codigo;
  if (situacion?.codigo === 'OBSERVADO') {
    if (codigo === 'CUADRO_EN_COORDINACION_CM') return 'C.C. en Coordinación CM - Observado';
    if (codigo === 'CUADRO_EN_DEC') return 'C.C. en DEC - Observado';
    return `${base} - Observado`;
  }
  return base;
}

function pickBestByPriority(codes, { normalize = normalizeEstadoCode } = {}) {
  let best = '';
  let bestPrio = -1;
  for (const raw of codes) {
    const c = normalize(raw);
    if (!c) continue;
    if (c === 'ANULADO' || c === 'ORDEN_ANULADA') {
      // Anulado solo gana si no hay nada más; prioridad baja en catálogo
    }
    const p = c === 'ANULADO' ? 9999 : getPrioridad(c);
    // Ignorar códigos desconocidos (prioridad -1): no deben “ganar” el fallback
    if (p < 0 && c !== 'ANULADO') continue;
    if (p > bestPrio) {
      bestPrio = p;
      best = c;
    }
  }
  return best;
}

/** Solo códigos del dominio cuadro (estado_cuadro / revisión). */
function pickBestEstadoCuadro(codes) {
  return pickBestByPriority(codes, { normalize: normalizeEstadoCuadroCode });
}

/**
 * RC118 — mapea etapa de workflow (trazabilidad) → estado canónico.
 * Evita el fallback histórico a PENDIENTE_ELABORAR (“C.C. en elaboración”)
 * cuando el expediente aún está en Registro / Evaluación / … sin evidencia de cuadro.
 */
function resolveEstadoFromWorkflowEtapa(workflowEtapa, row = {}) {
  const etapa = String(workflowEtapa || '').toUpperCase();
  const estadoNegocio = String(row.estado || '').trim();
  const hints = [
    estadoNegocio,
    row.estado_codigo,
    row.estado_vigente,
    row.estadoVigente?.codigo,
  ].filter(Boolean).join(' ');
  const esPostDec = /aprobado\s*dec/i.test(hints)
    || /\bAPROBADO_DEC\b/i.test(hints)
    || /\bREQUERIMIENTO_APROBADO_DEC\b/i.test(hints);
  switch (etapa) {
    case 'REGISTRADO':
      return 'REQUERIMIENTO_REGISTRADO';
    case 'EVALUACION':
      if (/aprobad/i.test(estadoNegocio) && !/observ/i.test(estadoNegocio)) {
        return 'REQUERIMIENTO_APROBADO';
      }
      return 'REQUERIMIENTO_EN_EVALUACION';
    case 'DEC':
      if (esPostDec) return 'REQUERIMIENTO_APROBADO_DEC';
      return 'REQUERIMIENTO_EN_DEC';
    case 'PROGRAMACION':
      // El badge refleja el submódulo actual (Programación), no el origen DEC.
      if (/aprobad.*program/i.test(hints)) return 'PROGRAMACION_APROBADA';
      return 'EN_PROGRAMACION';
    case 'ACTOS_PREPARATORIOS':
      if (/aprobad/i.test(estadoNegocio)) return 'COORDINACION_CM_APROBADA';
      return 'EN_COORDINACION_CM';
    case 'INVITACIONES':
      if (/enviad/i.test(estadoNegocio)) return 'INVITACION_ENVIADA';
      return 'INVITACION_EN_ELABORACION';
    case 'RECEPCION_COTIZACIONES':
      return 'COTIZACIONES_RECIBIDAS';
    case 'VALIDACION_USUARIO':
      if (/validado/i.test(estadoNegocio)) return 'VALIDADO_POR_AU';
      return 'VALIDACION_ENVIADA';
    case 'CUADRO_COMPARATIVO':
      return 'PENDIENTE_ELABORAR';
    default:
      return '';
  }
}

/** Etapas anteriores a Cuadro Comparativo: no deben heredar default de C.C. */
const ETAPAS_PRE_CUADRO = new Set([
  'REGISTRADO',
  'EVALUACION',
  'DEC',
  'PROGRAMACION',
  'ACTOS_PREPARATORIOS',
  'INVITACIONES',
  'RECEPCION_COTIZACIONES',
  'VALIDACION_USUARIO',
]);

function resolveEstadoOrdenFromFlags(flags, row = {}, opts = {}) {
  if (flags.ordenResuelta) return 'ORDEN_RESUELTA';
  if (flags.expedienteDerivadoPago) return 'EXPEDIENTE_DERIVADO_PAGO';
  const code = flags.ordenEstado;
  const ordenCodes = new Set([
    'REGISTRO_ORDENES', 'ORDEN_REGISTRADA', 'ORDEN_LISTA_NOTIFICACION',
    'ORDEN_NOTIFICADA', 'ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION',
    'ORDEN_ANULADA', 'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
  ]);
  if (code && code !== 'ORDEN_ANULADA' && (ESTADOS_ORDEN_LABEL[code] || ordenCodes.has(code))) {
    return code;
  }
  if (isTruthyEvidence(row.derivado_ejecucion_at) || opts.derivadoEjecucion) return 'EN_EJECUCION';
  if (isTruthyEvidence(row.recibido_proveedor_at) || opts.recepcionConfirmada) {
    return 'ORDEN_RECEPCION_CONFIRMADA';
  }
  if (flags.ordenNotificada) return 'ORDEN_NOTIFICADA';
  if (flags.ordenRegistrada) return 'ORDEN_REGISTRADA';
  if (opts.enRegistroOrdenes === true || row.en_registro_ordenes === true) {
    return 'REGISTRO_ORDENES';
  }
  if (opts.ccpFirmado === true || row.ccp_firmado === true || row.ccp_firmado_id) {
    return 'REGISTRO_ORDENES';
  }
  // Obs45 — solicitud ya derivada a RO (p.ej. Locadores sin OC aún) supera CCP_REGISTRADA.
  const solEst = String(
    row.solicitud_estado || row.estado_solicitud || opts.solicitudEstado || '',
  ).toUpperCase();
  if (solEst === 'EN_ORDEN') return 'REGISTRO_ORDENES';
  if (solEst === 'EN_EJECUCION') return 'EN_EJECUCION';
  const etapaHint = String(
    row.etapa_codigo || row.etapaCodigo || opts.etapaCodigo || '',
  ).toUpperCase();
  if (etapaHint === 'REGISTRO_ORDEN' || etapaHint === 'REGISTRO_ORDENES' || etapaHint === 'ORDEN') {
    return 'REGISTRO_ORDENES';
  }
  return '';
}

function buildResult(codigo, {
  situacion = null,
  fuente = '',
  evidencia = null,
  workflowEtapa = '',
  estadoInterno = null,
} = {}) {
  const def = getEstadoDef(codigo);
  const label = composeLabel(codigo, situacion);
  const etapa = def?.etapa || workflowEtapa || '';
  const prioridad = def ? def.prioridad : getPrioridad(codigo);
  const isCcpOrLater = prioridad >= getPrioridad('DERIVADO_CCP');
  const isCcpRegistradaOrLater = prioridad >= getPrioridad('CCP_REGISTRADA');
  const isOrdenFamily = prioridad >= getPrioridad('REGISTRO_ORDENES')
    && codigo !== 'CCP_REGISTRADA';

  return {
    // Contrato nuevo
    codigo,
    label,
    etapa,
    prioridad,
    scope: SCOPE.GLOBAL,
    situacion: situacion || null,
    fuente,
    evidencia,
    estadoInterno: estadoInterno || null,
    estadoVigente: {
      codigo,
      label,
      etapa,
      prioridad,
    },
    // Compat histórico (resolveEstadoActualExpediente / badges)
    code: codigo,
    workflowEtapa: etapa || workflowEtapa,
    derivadoCcp: isCcpOrLater || isOrdenFamily,
    ccpRegistrado: isCcpRegistradaOrLater || isOrdenFamily,
    soloLectura: isCcpOrLater || isTerminalEstado(codigo)
      || ['CUADRO_EN_COORDINACION_CM', 'CUADRO_EN_DEC', 'ANULADO'].includes(codigo),
  };
}

/**
 * API pública principal.
 * @param {object} evidence — fila enriquecida o flags normalizados + campos crudos
 */
export function resolveEstadoExpedienteVigente(evidence = {}, opts = {}) {
  const row = evidence && typeof evidence === 'object' ? evidence : {};
  const flags = normalizeEstadoFlags(row, opts);
  const snap = extractWorkflowSnapshot(row);
  // Preferir ubicación de fila (BD) sobre opts/snapshot — evita "En DEC" con REQ en Programación
  let workflowEtapa = String(
    row.estado_actual || row.estadoActual
    || opts.workflowEtapa
    || resolveWorkflowEtapa(row, snap)
    || '',
  ).toUpperCase();
  // Negocio "Aprobado DEC" implica salida de DEC → Programación (sincerar etapa desfasada)
  const estadoNegRaw = String(row.estado || '').trim();
  if (/^aprobado\s*dec$/i.test(estadoNegRaw) && (!workflowEtapa || workflowEtapa === 'DEC')) {
    workflowEtapa = 'PROGRAMACION';
  }
  const solicitudEstado = String(
    row.solicitud_estado || row.estado_solicitud || opts.solicitudEstado || '',
  ).toUpperCase();

  const rawCuadroCodes = [
    opts.estadoCuadro,
    row.estado_cuadro,
    row.cuadro_estado,
    row.estado_cuadro_db,
    opts.revisionEstado,
    snap?.revisionEstado,
    row.estado,
  ];
  const situacion = detectSituacionObservada(row, opts, rawCuadroCodes);

  // Terminal / post-orden explícitos
  if (flags.ordenResuelta) {
    return buildResult('ORDEN_RESUELTA', {
      situacion: null, fuente: 'orden_resuelta', evidencia: flags, workflowEtapa: 'RESOLUCION',
    });
  }
  if (flags.expedienteDerivadoPago) {
    return buildResult('EXPEDIENTE_DERIVADO_PAGO', {
      situacion: null, fuente: 'derivado_pago', evidencia: flags, workflowEtapa: 'PAGO',
    });
  }

  // Recepción de bienes / conformidad (supera ORDEN_NOTIFICADA)
  const recepcionCodes = [
    'CONFORMIDAD_EN_COORDINACION_CM',
    'CONFORMIDAD_RECIBIDA_AU',
    'CONFORMIDAD_PENDIENTE_AU',
    'BIEN_RECIBIDO_ALMACEN',
    'RECEPCION_BIENES_OBSERVADA',
    'RECEPCION_BIENES_PENDIENTE',
  ];
  if (flags.recepcionEstado && recepcionCodes.includes(flags.recepcionEstado)) {
    const sit = (flags.recepcionEstado === 'CONFORMIDAD_EN_COORDINACION_CM'
      || flags.recepcionEstado === 'CONFORMIDAD_PENDIENTE_AU'
      || flags.recepcionEstado === 'CONFORMIDAD_RECIBIDA_AU')
      ? situacionAplicableAlEstado(flags.recepcionEstado, situacion)
      : null;
    return buildResult(flags.recepcionEstado, {
      situacion: sit,
      fuente: 'recepcion_bienes',
      evidencia: flags,
      workflowEtapa: getEstadoDef(flags.recepcionEstado)?.etapa || 'RECEPCION_BIENES',
      estadoInterno: row.recepcion_estado_interno
        ? {
          codigo: row.recepcion_estado_interno,
          label: row.recepcion_estado_interno,
          modulo: 'RECEPCION_BIENES',
        }
        : null,
    });
  }
  // OC bienes notificada sin expediente de recepción explícito aún
  if (flags.enRecepcionBienes && flags.ordenNotificada) {
    return buildResult('RECEPCION_BIENES_PENDIENTE', {
      situacion: null, fuente: 'recepcion_bienes_pendiente', evidencia: flags, workflowEtapa: 'RECEPCION_BIENES',
    });
  }

  // Órdenes (siempre por encima de CCP)
  const ordenCode = resolveEstadoOrdenFromFlags(flags, row, opts);
  if (ordenCode && (ESTADOS_ORDEN_LABEL[ordenCode] || getEstadoDef(ordenCode))) {
    return buildResult(ordenCode, {
      situacion: null,
      fuente: 'orden_contratacion',
      evidencia: flags,
      workflowEtapa: ordenCode === 'EN_EJECUCION' ? 'EJECUCION' : 'ORDEN',
      estadoInterno: ordenCode === 'ORDEN_LISTA_NOTIFICACION'
        ? { codigo: ordenCode, label: getLabelEstado(ordenCode), modulo: 'REGISTRO_ORDENES' }
        : null,
    });
  }

  // CCP registrada
  if (flags.ccpRegistrada) {
    return buildResult('CCP_REGISTRADA', {
      situacion: null, fuente: 'ccp_codigo_activo', evidencia: flags, workflowEtapa: 'CCP',
    });
  }

  // Enviada OPPM
  const consolidacion = normalizeEstadoCode(
    opts.consolidacionEstado || row.consolidacion_estado || row.estado_ccp || '',
  );
  if (opts.enviadaOppm === true || row.enviada_oppm === true || consolidacion === 'ENVIADA_OPPM') {
    return buildResult('ENVIADA_OPPM', {
      situacion: null, fuente: 'ccp_enviada_oppm', evidencia: flags, workflowEtapa: 'CCP',
    });
  }

  // Derivado CCP
  if (
    workflowEtapa === 'CCP'
    || solicitudEstado === 'EN_CCP'
    || normalizeEstadoCode(opts.estadoCuadro) === 'DERIVADO_CCP'
    || normalizeEstadoCode(row.estado_cuadro) === 'DERIVADO_CCP'
    || normalizeEstadoCode(row.cuadro_estado) === 'DERIVADO_CCP'
    || normalizeEstadoCode(row.estado) === 'DERIVADO_CCP'
    || normalizeEstadoCode(opts.revisionEstado) === 'DERIVADO_CCP'
    || normalizeEstadoCode(snap?.revisionEstado) === 'DERIVADO_CCP'
  ) {
    return buildResult('DERIVADO_CCP', {
      situacion: null, fuente: 'workflow_ccp', evidencia: flags, workflowEtapa: 'CCP',
    });
  }

  // Prioridad segura (post órdenes/CCP/recepción):
  // 1) estado_cuadro / revisión de cuadro (evidencia real del dominio)
  // 2) etapa workflow (estado_actual) — evita que aliases de negocio salten a C.C.
  // 3) estado de negocio / códigos canónicos de requerimiento
  const estadoCuadroAuth = pickBestEstadoCuadro([
    opts.estadoCuadro,
    row.estado_cuadro,
    row.cuadro_estado,
    row.estado_cuadro_db,
  ]);
  // Revisión de cuadro (snapshot): también con normalizador de dominio cuadro
  const revisionAuth = pickBestEstadoCuadro([
    opts.revisionEstado,
    snap?.revisionEstado,
  ]);

  let best = '';
  let fuente = 'prioridad_catalogo';
  if (estadoCuadroAuth && revisionAuth) {
    best = getPrioridad(estadoCuadroAuth) >= getPrioridad(revisionAuth)
      ? estadoCuadroAuth
      : revisionAuth;
  } else {
    best = estadoCuadroAuth || revisionAuth || '';
  }

  // Etapa de trazabilidad antes que negocio ambiguo (p.ej. "Aprobado DEC" en PROGRAMACION)
  if (!best && workflowEtapa) {
    const fromEtapa = resolveEstadoFromWorkflowEtapa(workflowEtapa, row);
    if (fromEtapa) {
      best = fromEtapa;
      fuente = 'workflow_etapa';
    }
  }

  if (!best && workflowEtapa === 'CUADRO_COMPARATIVO') {
    best = 'CUADRO_BORRADOR';
    fuente = 'workflow_cuadro';
  }

  // Estado de negocio / códigos canónicos (APROBADO_DEC → REQUERIMIENTO_APROBADO_DEC)
  if (!best) {
    const fromEstadoNegocio = pickBestByPriority([
      row.estado_codigo,
      row.estado_vigente,
      row.estadoVigente?.codigo,
      row.estado,
    ]);
    if (fromEstadoNegocio) {
      // Guardrail: nunca promover familia cuadro solo desde row.estado sin evidencia
      const defNeg = getEstadoDef(fromEstadoNegocio);
      if (defNeg?.familia === 'cuadro') {
        // ignorar — requiere estado_cuadro
      } else {
        best = fromEstadoNegocio;
        fuente = 'estado_negocio';
      }
    }
  }

  // Fallback controlado: estado inicial de Requerimiento — NUNCA C.C. en elaboración
  // salvo evidencia real de cuadro / etapa CUADRO_COMPARATIVO (ramas anteriores).
  if (!best) {
    best = ETAPAS_PRE_CUADRO.has(workflowEtapa)
      ? resolveEstadoFromWorkflowEtapa(workflowEtapa, row) || 'REQUERIMIENTO_REGISTRADO'
      : 'REQUERIMIENTO_REGISTRADO';
    fuente = 'default_requerimiento_registrado';
  }

  // Situación OBSERVADO solo adorna estados de cuadro aún en revisión.
  // No contaminar DERIVADO_CCP / CCP / Órdenes con observaciones históricas.
  const situacionAplicada = situacionAplicableAlEstado(best, situacion);

  return buildResult(best, {
    situacion: situacionAplicada,
    fuente,
    evidencia: flags,
    workflowEtapa: workflowEtapa || getEstadoDef(best)?.etapa || '',
  });
}

/** OBSERVADO solo si el estado global vigente es aún la etapa observada. */
function situacionAplicableAlEstado(codigo, situacion) {
  if (!situacion || situacion.codigo !== 'OBSERVADO') return null;
  const c = normalizeEstadoCode(codigo);
  const permite = new Set([
    'CUADRO_EN_COORDINACION_CM',
    'CUADRO_EN_DEC',
    'CUADRO_BORRADOR',
    'PENDIENTE_ELABORAR',
    'CUADRO_COMPARATIVO_GENERADO',
    'EN_COORDINACION_CM',
    'EN_PROGRAMACION',
    'REQUERIMIENTO_EN_EVALUACION',
    'REQUERIMIENTO_EN_DEC',
    'CONFORMIDAD_PENDIENTE_AU',
    'CONFORMIDAD_RECIBIDA_AU',
    'CONFORMIDAD_EN_COORDINACION_CM',
    'BIEN_RECIBIDO_ALMACEN',
  ]);
  return permite.has(c) ? situacion : null;
}

/**
 * Compat histórico — mismos campos que antes + contrato nuevo embebido.
 */
export function resolveEstadoActualExpediente(row = {}, opts = {}) {
  return resolveEstadoExpedienteVigente(row, opts);
}

export function esExpedienteDerivadoCcp(row = {}, opts = {}) {
  return resolveEstadoExpedienteVigente(row, opts).derivadoCcp === true;
}

export function esExpedienteCcpRegistrado(row = {}, opts = {}) {
  const v = resolveEstadoExpedienteVigente(row, opts);
  return v.ccpRegistrado === true
    || v.codigo === 'CCP_REGISTRADA'
    || v.code === 'CCP_REGISTRADA';
}

export const BADGE_COLOR_CCP = '#6f42c1';
export const BADGE_COLOR_CCP_REGISTRADO = '#198754';

export function badgeVisualEstadoVigente(rowOrCode = {}, opts = {}) {
  const row = (rowOrCode && typeof rowOrCode === 'object')
    ? rowOrCode
    : { estado_cuadro: rowOrCode, estado: rowOrCode };
  const vigente = resolveEstadoExpedienteVigente(row, opts);
  const code = vigente.codigo || vigente.code;

  if (ESTADOS_ORDEN_LABEL[code]
    || ['REGISTRO_ORDENES', 'ORDEN_REGISTRADA', 'ORDEN_LISTA_NOTIFICACION',
      'ORDEN_NOTIFICADA', 'ORDEN_RECEPCION_CONFIRMADA', 'EN_EJECUCION',
      'ORDEN_RESUELTA', 'EXPEDIENTE_DERIVADO_PAGO',
      'RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA', 'BIEN_RECIBIDO_ALMACEN',
      'CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU',
      'CONFORMIDAD_EN_COORDINACION_CM'].includes(code)) {
    const colorMap = {
      EN_EJECUCION: '#212529',
      ORDEN_RECEPCION_CONFIRMADA: '#0d6efd',
      ORDEN_NOTIFICADA: '#fd7e14',
      ORDEN_LISTA_NOTIFICACION: '#20c997',
      ORDEN_REGISTRADA: '#0dcaf0',
      REGISTRO_ORDENES: '#6f42c1',
      ORDEN_ANULADA: '#6c757d',
      ORDEN_RESUELTA: '#212529',
      EXPEDIENTE_DERIVADO_PAGO: '#198754',
      RECEPCION_BIENES_PENDIENTE: '#fd7e14',
      RECEPCION_BIENES_OBSERVADA: '#dc3545',
      BIEN_RECIBIDO_ALMACEN: '#0d6efd',
      CONFORMIDAD_PENDIENTE_AU: '#6610f2',
      CONFORMIDAD_RECIBIDA_AU: '#20c997',
      CONFORMIDAD_EN_COORDINACION_CM: '#6f42c1',
    };
    const color = colorMap[code] || '#6f42c1';
    return {
      code,
      label: vigente.label,
      className: 'badge badge-estado-mod',
      style: `background:${color};color:#fff`,
      bootstrap: null,
      derivadoCcp: true,
      ccpRegistrado: true,
      color,
    };
  }
  if (code === 'CCP_REGISTRADA' || code === 'CCP_REGISTRADO' || vigente.ccpRegistrado) {
    return {
      code: 'CCP_REGISTRADA',
      label: 'CCP registrada',
      className: 'badge badge-estado-mod',
      style: `background:${BADGE_COLOR_CCP_REGISTRADO};color:#fff`,
      bootstrap: 'success',
      derivadoCcp: true,
      ccpRegistrado: true,
      color: BADGE_COLOR_CCP_REGISTRADO,
    };
  }
  if (code === 'ENVIADA_OPPM') {
    return {
      code: 'ENVIADA_OPPM',
      label: 'Solicitud enviada a OPPM',
      className: 'badge badge-estado-mod',
      style: 'background:#0d6efd;color:#fff',
      bootstrap: 'primary',
      derivadoCcp: true,
      ccpRegistrado: false,
      color: '#0d6efd',
    };
  }
  if (vigente.derivadoCcp || code === 'DERIVADO_CCP') {
    return {
      code: 'DERIVADO_CCP',
      label: 'Derivado a CCP',
      className: 'badge badge-estado-mod',
      style: `background:${BADGE_COLOR_CCP};color:#fff`,
      bootstrap: null,
      derivadoCcp: true,
      ccpRegistrado: false,
      color: BADGE_COLOR_CCP,
    };
  }
  return {
    code,
    label: vigente.label,
    className: 'badge',
    style: '',
    bootstrap: null,
    derivadoCcp: false,
    ccpRegistrado: false,
    color: null,
  };
}

export function renderBadgeEstadoVigenteHtml(rowOrCode, escFn = (s) => String(s ?? ''), opts = {}) {
  const v = badgeVisualEstadoVigente(rowOrCode, opts);
  if (ESTADOS_ORDEN_LABEL[v.code] || v.code === 'CCP_REGISTRADA' || v.code === 'CCP_REGISTRADO'
    || v.code === 'ENVIADA_OPPM' || v.derivadoCcp
    || ['RECEPCION_BIENES_PENDIENTE', 'RECEPCION_BIENES_OBSERVADA', 'BIEN_RECIBIDO_ALMACEN',
      'CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU',
      'CONFORMIDAD_EN_COORDINACION_CM', 'EXPEDIENTE_DERIVADO_PAGO'].includes(v.code)) {
    return `<span class="${v.className}" style="${v.style}">${escFn(v.label)}</span>`;
  }
  const boot = opts.bootstrapClass || opts.fallbackBootstrap || 'secondary';
  return `<span class="badge bg-${boot}">${escFn(v.label || opts.fallbackLabel || '—')}</span>`;
}

/**
 * Contrato uniforme API para filas de bandeja.
 */
export function buildEstadoApiContract(row = {}, opts = {}) {
  const v = resolveEstadoExpedienteVigente(row, opts);
  return {
    estadoVigente: v.estadoVigente,
    situacion: v.situacion
      ? { codigo: v.situacion.codigo, label: v.situacion.label }
      : null,
    estadoInterno: v.estadoInterno || null,
    // Compat temporal
    estado: v.codigo,
    estado_label: v.label,
    estado_visual: v.label,
    estado_vigente: v.codigo,
    estado_vigente_label: v.label,
    estado_codigo: v.codigo,
    etiqueta_estado: v.label,
  };
}
