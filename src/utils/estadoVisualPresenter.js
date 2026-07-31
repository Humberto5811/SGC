/**
 * ÚNICA autoridad del estado visual — RC4.1 / OD32.
 * Ningún otro archivo debe interpretar estado/estado_actual/sub_modulo/workflowSnapshot para UI.
 */
import {
  obtenerEstadoObservaciones,
  getObservacionPendiente,
  receptorDebeActuar,
  bloqueaSubsanacionPorHijos,
  getListaObservaciones,
} from '../../shared/observacionesMotor.js';
import {
  ESTADOS_CUADRO_VIGENTE_LABEL,
  resolveEstadoExpedienteVigente,
} from '../../shared/estadoExpedienteVigente.js';
import { presentEstadoExpediente } from './estadoExpedientePresenter.js';
import { enrichReqRow, ETAPA_LABELS } from './trazabilidad.js';
import {
  getSubmoduloByLabel,
  SUBMODULOS_DESTINO,
} from './observacionDestino.js';

const ESTADO_COLORES = Object.freeze({
  REGISTRADO: { bg: '#0d6efd', fg: '#fff' },
  REQUERIMIENTO_REGISTRADO: { bg: '#0d6efd', fg: '#fff' },
  REQUERIMIENTO_EN_EVALUACION: { bg: '#ffc107', fg: '#212529' },
  REQUERIMIENTO_APROBADO: { bg: '#ffc107', fg: '#212529' },
  EVALUACION: { bg: '#ffc107', fg: '#212529' },
  DEC: { bg: '#6f42c1', fg: '#fff' },
  REQUERIMIENTO_EN_DEC: { bg: '#6f42c1', fg: '#fff' },
  REQUERIMIENTO_APROBADO_DEC: { bg: '#6f42c1', fg: '#fff' },
  PROGRAMACION: { bg: '#0dcaf0', fg: '#055160' },
  EN_PROGRAMACION: { bg: '#0dcaf0', fg: '#055160' },
  ACTOS_PREPARATORIOS: { bg: '#fd7e14', fg: '#fff' },
  EN_COORDINACION_CM: { bg: '#fd7e14', fg: '#fff' },
  INVITACIONES: { bg: '#0a4275', fg: '#fff' },
  INVITACION_EN_ELABORACION: { bg: '#0a4275', fg: '#fff' },
  INVITACION_ENVIADA: { bg: '#0a4275', fg: '#fff' },
  RECEPCION_COTIZACIONES: { bg: '#0a4275', fg: '#fff' },
  COTIZACIONES_RECIBIDAS: { bg: '#0a4275', fg: '#fff' },
  VALIDACION_USUARIO: { bg: '#ffc107', fg: '#212529' },
  VALIDACION_ENVIADA: { bg: '#ffc107', fg: '#212529' },
  CUADRO_COMPARATIVO: { bg: '#495057', fg: '#fff' },
  PENDIENTE_ELABORAR: { bg: '#495057', fg: '#fff' },
  CUADRO_BORRADOR: { bg: '#495057', fg: '#fff' },
  CCP: { bg: '#6f42c1', fg: '#fff' },
  CCP_REGISTRADO: { bg: '#198754', fg: '#fff' },
  CCP_REGISTRADA: { bg: '#198754', fg: '#fff' },
  ENVIADA_OPPM: { bg: '#0d6efd', fg: '#fff' },
  ORDEN: { bg: '#fd7e14', fg: '#fff' },
  ORDEN_NOTIFICADA: { bg: '#fd7e14', fg: '#fff' },
  ORDEN_REGISTRADA: { bg: '#0dcaf0', fg: '#055160' },
  ORDEN_RESUELTA: { bg: '#212529', fg: '#fff' },
  EXPEDIENTE_DERIVADO_PAGO: { bg: '#198754', fg: '#fff' },
  EJECUCION: { bg: '#495057', fg: '#fff' },
  FINALIZADO: { bg: '#198754', fg: '#fff' },
});

const WORKFLOW_BANDEJA_LABELS = Object.freeze({
  REGISTRADO: 'Registro',
  EVALUACION: 'Evaluación',
  DEC: 'DEC',
  PROGRAMACION: 'Programación',
  ACTOS_PREPARATORIOS: 'Coordinación CM',
  INVITACIONES: 'Invitaciones',
  RECEPCION_COTIZACIONES: 'Cotizaciones',
  VALIDACION_USUARIO: 'Validación Usuario',
  CUADRO_COMPARATIVO: 'Cuadro Comparativo',
  CCP: 'CCP',
  EJECUCION: 'Ejecución',
  FINALIZADO: 'Finalizado',
});

/** RC8.4A / OD32 — etiquetas documentales (alineadas al estado vigente). */
export const CUADRO_REVISION_ESTADO_LABELS = Object.freeze({
  ...ESTADOS_CUADRO_VIGENTE_LABEL,
  CUADRO_BORRADOR: 'C.C. en elaboración',
});

function extractWorkflowSnapshot(row) {
  const direct = row?.workflowSnapshot || row?.workflow_snapshot;
  if (direct && typeof direct === 'object') return direct;
  try {
    const p = typeof row?.payload === 'string' ? JSON.parse(row.payload || '{}') : (row?.payload || {});
    return p.workflowSnapshot || p.workflow_snapshot || null;
  } catch (_) {
    return null;
  }
}

function resolveWorkflowEtapa(row) {
  // Priorizar ubicación real del expediente (BD / enrich) sobre workflowSnapshot.
  // Un snapshot obsoleto en DEC hacía mostrar "En DEC" con el REQ ya en Programación.
  const enriched = enrichReqRow(row);
  const fromRow = String(enriched.estado_actual || enriched.estadoActual || '').toUpperCase();
  if (fromRow) return fromRow;
  const snap = extractWorkflowSnapshot(row);
  if (snap?.etapaActual) return String(snap.etapaActual).toUpperCase();
  return 'REGISTRADO';
}

function labelFromEtapa(etapa) {
  const code = String(etapa || 'REGISTRADO').toUpperCase();
  return WORKFLOW_BANDEJA_LABELS[code] || ETAPA_LABELS[code] || code;
}

function etapaFromSubmodulo(subModulo) {
  return getSubmoduloByLabel(subModulo)?.code || null;
}

function fullModuloLabelFromEtapa(etapa) {
  const code = String(etapa || '').toUpperCase();
  return SUBMODULOS_DESTINO.find((s) => s.code === code)?.label || null;
}

function resolvePendienteReceptor(row) {
  const hilos = getListaObservaciones(row);
  const pending = getObservacionPendiente(row);
  if (!pending || !receptorDebeActuar(pending)) return null;
  if (bloqueaSubsanacionPorHijos(hilos, pending.id)) return null;
  return pending;
}

/** Construye fila mínima para el Presenter desde campos sueltos (Paquetes/Pedidos). */
export function buildPresenterRow(partial = {}) {
  if (partial?.payload != null || partial?.requerimiento) {
    const base = partial.requerimiento || partial;
    return { ...base };
  }
  return {
    id: partial.requerimiento_id || partial.id,
    estado: partial.estado,
    estado_actual: partial.estado_actual || partial.estadoActual,
    sub_modulo_actual: partial.sub_modulo_actual || partial.sub_modulo || partial.estado_actual_texto,
    estado_actual_texto: partial.estado_actual_texto || partial.estadoActualTexto,
    payload: partial.payload,
  };
}

/**
 * Presenter único — fuente de verdad del estado visual en toda la UI.
 */
export function buildEstadoVisual(row, opts = {}) {
  const enriched = enrichReqRow(row);
  const workflowActual = resolveWorkflowEtapa(enriched);
  const pendienteReceptor = resolvePendienteReceptor(enriched);
  const snap = extractWorkflowSnapshot(enriched);

  // Estado vigente: el backend debe aportar evidencia (CCP + órdenes).
  // El presentador NO fuerza "CCP registrada" ni recalcula prioridad.
  const vigente = resolveEstadoExpedienteVigente(enriched, {
    revisionEstado: opts.revisionEstado || snap?.revisionEstado || '',
    estadoCuadro: opts.estadoCuadro || enriched.estado_cuadro || row?.estado_cuadro || '',
    workflowEtapa: workflowActual,
    solicitudEstado: enriched.solicitud_estado || row?.solicitud_estado || '',
    codigoCcp: enriched.codigo_ccp || row?.codigo_ccp || '',
    ccpActivo: enriched.ccp_activo || row?.ccp_activo || false,
    ordenEnviada: !!(enriched.enviado_proveedor_at || row?.enviado_proveedor_at),
    estadoOrden: enriched.orden_estado || row?.orden_estado || '',
  });

  const presentacion = presentEstadoExpediente(vigente.estadoVigente || vigente, vigente.situacion);
  const codigoVigente = vigente.codigo || vigente.code || '';

  const moduloReceptorRaw = pendienteReceptor
    ? String(pendienteReceptor.destino_submodulo || pendienteReceptor.moduloReceptor || pendienteReceptor.moduloDestino || '').trim()
    : '';

  const etapaMostrada = codigoVigente === 'CCP_REGISTRADA' || codigoVigente === 'CCP_REGISTRADO'
    ? 'CCP_REGISTRADA'
    : (vigente.derivadoCcp
      ? (vigente.etapa || 'CCP')
      : (pendienteReceptor
        ? (etapaFromSubmodulo(moduloReceptorRaw) || workflowActual)
        : workflowActual));

  const labelRevision = CUADRO_REVISION_ESTADO_LABELS[codigoVigente] || vigente.label || '';
  const textoPrincipal = presentacion.label
    || labelRevision
    || labelFromEtapa(etapaMostrada);

  const moduloResponsable = vigente.derivadoCcp
    ? (vigente.etapa === 'ORDEN' || String(codigoVigente).startsWith('ORDEN') || codigoVigente === 'EN_EJECUCION'
      ? 'Registro de Órdenes'
      : 'CCP')
    : (pendienteReceptor
      ? (moduloReceptorRaw || fullModuloLabelFromEtapa(etapaMostrada) || textoPrincipal)
      : (fullModuloLabelFromEtapa(workflowActual) || textoPrincipal));

  const moduloBadgeKey = vigente.derivadoCcp
    ? (vigente.etapa || 'CCP')
    : (pendienteReceptor
      ? (moduloReceptorRaw || fullModuloLabelFromEtapa(etapaMostrada))
      : fullModuloLabelFromEtapa(workflowActual));

  const motorBadge = obtenerEstadoObservaciones(enriched, moduloBadgeKey || null);
  const motorActions = obtenerEstadoObservaciones(enriched, opts.moduloContext || null);
  const badgeObservado = (!vigente.derivadoCcp && (pendienteReceptor || vigente.situacion?.codigo === 'OBSERVADO'))
    ? (motorBadge.requiereBadge === true || vigente.situacion?.codigo === 'OBSERVADO')
    : false;

  const color = ESTADO_COLORES[String(codigoVigente).toUpperCase()]
    || ESTADO_COLORES[String(etapaMostrada).toUpperCase()]
    || (presentacion.color
      ? { bg: presentacion.color.bg, fg: presentacion.color.fg }
      : (vigente.derivadoCcp ? ESTADO_COLORES.CCP : ESTADO_COLORES.REGISTRADO));

  return {
    textoPrincipal,
    badgeObservado,
    workflowActual: vigente.derivadoCcp ? (vigente.etapa || 'CCP') : workflowActual,
    moduloResponsable,
    color,
    puedeSubsanar: vigente.derivadoCcp ? false : motorActions.puedeSubsanar,
    puedeCerrar: motorActions.puedeCerrar,
    pendientesCount: motorBadge.pendientesModuloCount ?? motorBadge.pendientesCount ?? 0,
    motor: motorActions,
    motorBadge,
    estadoVigente: vigente,
    presentacion,
  };
}

export function renderEstadoVisualHtml(row, opts = {}, escFn = (s) => String(s ?? '')) {
  const v = buildEstadoVisual(row, opts);
  const fg = v.color.fg || '#fff';
  const workflowBadge = `<span class="badge badge-estado-mod" style="background:${v.color.bg};color:${fg};">${escFn(v.textoPrincipal)}</span>`;
  if (v.badgeObservado) {
    return `${workflowBadge}<span class="badge bg-danger ms-1" title="Observación pendiente — acción requerida en ${escFn(v.textoPrincipal)}">Observado</span>`;
  }
  return workflowBadge;
}

export default { buildEstadoVisual, renderEstadoVisualHtml, buildPresenterRow };
