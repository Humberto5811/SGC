/**
 * ÚNICA autoridad del estado visual — RC4.1.
 * Ningún otro archivo debe interpretar estado/estado_actual/sub_modulo/workflowSnapshot para UI.
 */
import {
  obtenerEstadoObservaciones,
  getObservacionPendiente,
  receptorDebeActuar,
  bloqueaSubsanacionPorHijos,
  getListaObservaciones,
} from '../../shared/observacionesMotor.js';
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
  RECEPCION_COTIZACIONES: 'Cotización recibida',
  VALIDACION_USUARIO: 'Validación Usuario',
  CUADRO_COMPARATIVO: 'Cuadro Comparativo',
  CCP: 'CCP',
  EJECUCION: 'Ejecución',
  FINALIZADO: 'Finalizado',
});

/** RC8.4A — Estados documentales de revisión del Cuadro Comparativo */
export const CUADRO_REVISION_ESTADO_LABELS = Object.freeze({
  PENDIENTE_COORDINADOR: 'C.C. en revisión Coordinador CM',
  OBSERVADO_COORDINADOR: 'Observado por Coordinador CM',
  FIRMADO_COORDINADOR: 'Firmado por Coordinador CM',
  PENDIENTE_DEC: 'C.C. en revisión DEC',
  OBSERVADO_DEC: 'Observado por DEC',
  APROBADO_DEC: 'Aprobado por DEC',
  PENDIENTE_CCP: 'Listo para CCP',
  DERIVADO_CCP: 'Derivado a CCP',
  CUADRO_BORRADOR: 'Cuadro borrador',
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
  const revisionEstado = String(
    opts.revisionEstado
    || snap?.revisionEstado
    || enriched.estado_cuadro
    || row?.estado_cuadro
    || '',
  ).toUpperCase();
  const labelRevision = CUADRO_REVISION_ESTADO_LABELS[revisionEstado] || '';

  const moduloReceptorRaw = pendienteReceptor
    ? String(pendienteReceptor.destino_submodulo || pendienteReceptor.moduloReceptor || pendienteReceptor.moduloDestino || '').trim()
    : '';

  const etapaMostrada = pendienteReceptor
    ? (etapaFromSubmodulo(moduloReceptorRaw) || workflowActual)
    : workflowActual;

  // RC8.4A: si hay estado documental de revisión del cuadro, prevalece en el badge
  const textoPrincipal = labelRevision || labelFromEtapa(etapaMostrada);

  const moduloResponsable = pendienteReceptor
    ? (moduloReceptorRaw || fullModuloLabelFromEtapa(etapaMostrada) || textoPrincipal)
    : (fullModuloLabelFromEtapa(workflowActual) || textoPrincipal);

  const moduloBadgeKey = pendienteReceptor
    ? (moduloReceptorRaw || fullModuloLabelFromEtapa(etapaMostrada))
    : fullModuloLabelFromEtapa(workflowActual);

  const motorBadge = obtenerEstadoObservaciones(enriched, moduloBadgeKey || null);
  const motorActions = obtenerEstadoObservaciones(enriched, opts.moduloContext || null);
  const badgeObservado = pendienteReceptor ? (motorBadge.requiereBadge === true) : false;

  const color = ESTADO_COLORES[String(etapaMostrada).toUpperCase()] || ESTADO_COLORES.REGISTRADO;

  return {
    textoPrincipal,
    badgeObservado,
    workflowActual,
    moduloResponsable,
    color,
    puedeSubsanar: motorActions.puedeSubsanar,
    puedeCerrar: motorActions.puedeCerrar,
    pendientesCount: motorBadge.pendientesModuloCount ?? motorBadge.pendientesCount ?? 0,
    motor: motorActions,
    motorBadge,
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
