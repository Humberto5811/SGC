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
  resolveEstadoActualExpediente,
} from '../../shared/estadoExpedienteVigente.js';
import { enrichReqRow, ETAPA_LABELS } from './trazabilidad.js';
import {
  getSubmoduloByLabel,
  SUBMODULOS_DESTINO,
} from './observacionDestino.js';

const ESTADO_COLORES = Object.freeze({
  REGISTRADO: { bg: '#0d6efd', fg: '#fff' },
  EVALUACION: { bg: '#ffc107', fg: '#212529' },
  DEC: { bg: '#6f42c1', fg: '#fff' },
  PROGRAMACION: { bg: '#0dcaf0', fg: '#055160' },
  ACTOS_PREPARATORIOS: { bg: '#fd7e14', fg: '#fff' },
  INVITACIONES: { bg: '#0a4275', fg: '#fff' },
  RECEPCION_COTIZACIONES: { bg: '#0a4275', fg: '#fff' },
  VALIDACION_USUARIO: { bg: '#ffc107', fg: '#212529' },
  CUADRO_COMPARATIVO: { bg: '#495057', fg: '#fff' },
  CCP: { bg: '#6f42c1', fg: '#fff' },
  CCP_REGISTRADO: { bg: '#198754', fg: '#fff' },
  ENVIADA_OPPM: { bg: '#0d6efd', fg: '#fff' },
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
  const snap = extractWorkflowSnapshot(row);
  if (snap?.etapaActual) return String(snap.etapaActual).toUpperCase();
  const enriched = enrichReqRow(row);
  return String(enriched.estado_actual || enriched.estadoActual || 'REGISTRADO').toUpperCase();
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

  // OD32/OD35 — estado vigente unificado (CCP_REGISTRADO > DERIVADO_CCP > obs. históricas)
  const vigente = resolveEstadoActualExpediente(enriched, {
    revisionEstado: opts.revisionEstado || snap?.revisionEstado || '',
    estadoCuadro: opts.estadoCuadro || enriched.estado_cuadro || row?.estado_cuadro || '',
    workflowEtapa: workflowActual,
    solicitudEstado: enriched.solicitud_estado || row?.solicitud_estado || '',
    codigoCcp: enriched.codigo_ccp || row?.codigo_ccp || '',
    ccpActivo: enriched.ccp_activo || row?.ccp_activo || enriched.ccp_registrado || false,
  });

  const moduloReceptorRaw = pendienteReceptor
    ? String(pendienteReceptor.destino_submodulo || pendienteReceptor.moduloReceptor || pendienteReceptor.moduloDestino || '').trim()
    : '';

  // Tras DERIVADO_CCP / CCP_REGISTRADO no se usa el módulo receptor de obs. históricas
  const etapaMostrada = vigente.ccpRegistrado
    ? 'CCP_REGISTRADO'
    : (vigente.derivadoCcp
      ? 'CCP'
      : (pendienteReceptor
        ? (etapaFromSubmodulo(moduloReceptorRaw) || workflowActual)
        : workflowActual));

  const labelRevision = CUADRO_REVISION_ESTADO_LABELS[vigente.code] || vigente.label || '';
  const textoPrincipal = vigente.ccpRegistrado
    ? 'CCP registrado'
    : (vigente.code === 'ENVIADA_OPPM'
      ? 'Solicitud enviada a OPPM'
      : (vigente.derivadoCcp
        ? 'Derivado a CCP'
        : (labelRevision || labelFromEtapa(etapaMostrada))));

  const moduloResponsable = vigente.derivadoCcp
    ? 'CCP'
    : (pendienteReceptor
      ? (moduloReceptorRaw || fullModuloLabelFromEtapa(etapaMostrada) || textoPrincipal)
      : (fullModuloLabelFromEtapa(workflowActual) || textoPrincipal));

  const moduloBadgeKey = vigente.derivadoCcp
    ? 'CCP'
    : (pendienteReceptor
      ? (moduloReceptorRaw || fullModuloLabelFromEtapa(etapaMostrada))
      : fullModuloLabelFromEtapa(workflowActual));

  const motorBadge = obtenerEstadoObservaciones(enriched, moduloBadgeKey || null);
  const motorActions = obtenerEstadoObservaciones(enriched, opts.moduloContext || null);
  // Observación histórica NO marca badge principal si el expediente ya avanzó a CCP
  const badgeObservado = (!vigente.derivadoCcp && pendienteReceptor)
    ? (motorBadge.requiereBadge === true)
    : false;

  const color = ESTADO_COLORES[String(etapaMostrada).toUpperCase()]
    || (vigente.ccpRegistrado
      ? ESTADO_COLORES.CCP_REGISTRADO
      : (vigente.derivadoCcp ? ESTADO_COLORES.CCP : ESTADO_COLORES.REGISTRADO));

  return {
    textoPrincipal,
    badgeObservado,
    workflowActual: vigente.derivadoCcp ? 'CCP' : workflowActual,
    moduloResponsable,
    color,
    puedeSubsanar: vigente.derivadoCcp ? false : motorActions.puedeSubsanar,
    puedeCerrar: motorActions.puedeCerrar,
    pendientesCount: motorBadge.pendientesModuloCount ?? motorBadge.pendientesCount ?? 0,
    motor: motorActions,
    motorBadge,
    estadoVigente: vigente,
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
