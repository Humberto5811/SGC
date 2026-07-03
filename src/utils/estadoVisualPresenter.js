/**
 * Presenter único del estado visual — capa de presentación RC3.
 * Ningún otro módulo debe calcular texto/badge de estado por su cuenta.
 */
import {
  obtenerEstadoObservaciones,
  getObservacionPendiente,
  receptorDebeActuar,
  bloqueaSubsanacionPorHijos,
  getListaObservaciones,
} from '../../shared/observacionesMotor.js';
import {
  enrichReqRow, ETAPA_LABELS, resolveUbicacionExpediente,
} from './trazabilidad.js';
import { getSubmoduloByLabel, getSubmoduloDisplayLabel } from './observacionDestino.js';

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
  RECEPCION_COTIZACIONES: 'Cotizaciones',
  VALIDACION_USUARIO: 'Validación Usuario',
  CUADRO_COMPARATIVO: 'Cuadro Comparativo',
  CCP: 'CCP',
  EJECUCION: 'Ejecución',
  FINALIZADO: 'Finalizado',
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
  return String(enriched.estado_actual || enriched.estadoActual || resolveUbicacionExpediente(enriched)).toUpperCase();
}

function labelFromEtapa(etapa) {
  const code = String(etapa || 'REGISTRADO').toUpperCase();
  return WORKFLOW_BANDEJA_LABELS[code] || ETAPA_LABELS[code] || code;
}

function labelFromSubmodulo(subModulo) {
  const s = String(subModulo || '').trim();
  if (!s || /observ/i.test(s)) return null;
  return getSubmoduloDisplayLabel(s);
}

function etapaFromSubmodulo(subModulo) {
  return getSubmoduloByLabel(subModulo)?.code || null;
}

function resolveWorkflowModuloLabel(row) {
  const enriched = enrichReqRow(row);
  const etapa = resolveWorkflowEtapa(enriched);
  const snap = extractWorkflowSnapshot(enriched);
  const subModulo = String(
    enriched.sub_modulo_actual || enriched.subModuloActual
    || snap?.subModuloActual || snap?.moduloActual || '',
  ).trim();
  const subEtapa = etapaFromSubmodulo(subModulo);
  if (subModulo && subEtapa === etapa) {
    const lbl = labelFromSubmodulo(subModulo);
    if (lbl) return lbl;
  }
  return labelFromEtapa(etapa);
}

/** Observación abierta cuya acción pendiente es del receptor (subsanar). */
function resolvePendienteReceptor(row) {
  const hilos = getListaObservaciones(row);
  const pending = getObservacionPendiente(row);
  if (!pending || !receptorDebeActuar(pending)) return null;
  if (bloqueaSubsanacionPorHijos(hilos, pending.id)) return null;
  return pending;
}

/**
 * Presenter único — fuente de verdad del estado visual en toda la UI.
 * @param {Object} row - fila del requerimiento
 * @param {Object} [opts]
 * @param {string} [opts.moduloContext] - submódulo de la bandeja (acciones puedeSubsanar/puedeCerrar)
 */
export function buildEstadoVisual(row, opts = {}) {
  const enriched = enrichReqRow(row);
  const workflowActual = resolveWorkflowEtapa(enriched);
  const pendienteReceptor = resolvePendienteReceptor(enriched);
  const moduloResponsable = pendienteReceptor
    ? (pendienteReceptor.destino_submodulo || pendienteReceptor.moduloReceptor || pendienteReceptor.moduloDestino || '')
    : (enriched.sub_modulo_actual || enriched.subModuloActual || workflowActual);

  const etapaReceptor = pendienteReceptor ? etapaFromSubmodulo(moduloResponsable) : null;
  const textoPrincipal = pendienteReceptor
    ? (labelFromEtapa(etapaReceptor) || labelFromSubmodulo(moduloResponsable) || labelFromEtapa(workflowActual))
    : resolveWorkflowModuloLabel(enriched);

  const etapaColor = pendienteReceptor
    ? (etapaFromSubmodulo(moduloResponsable) || workflowActual)
    : workflowActual;
  const color = ESTADO_COLORES[String(etapaColor).toUpperCase()] || ESTADO_COLORES.REGISTRADO;

  const motor = obtenerEstadoObservaciones(enriched, opts.moduloContext || null);
  const badgeObservado = !!pendienteReceptor;

  return {
    textoPrincipal,
    badgeObservado,
    workflowActual,
    moduloResponsable: String(moduloResponsable || '').trim(),
    color,
    puedeSubsanar: motor.puedeSubsanar,
    puedeCerrar: motor.puedeCerrar,
    pendientesCount: motor.pendientesModuloCount ?? motor.pendientesCount ?? 0,
    motor,
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

export default { buildEstadoVisual, renderEstadoVisualHtml };
