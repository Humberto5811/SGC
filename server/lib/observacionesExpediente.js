// Observaciones bidireccionales — estructura canónica y helpers (servidor)
import { emitirObservacion as emitirObservacionWorkflow } from './observacionesWorkflow.js';

export {
  ESTADOS_OBS,
  emitirObservacion,
  registrarSubsanacionObservacion,
  cerrarObservacion,
  revisarObservacion,
  marcarRecibidaPorEmisor,
  procesarAccionObservacion,
  getObservacionPendiente,
  getObservacionPendienteParaModulo,
  getObservacionesAbiertas,
  hayObservacionPendienteAccion,
  hayObservacionAbiertaRelacionada,
  labelBotonObservaciones,
  observacionPendienteParaSubmodulo,
  autoCerrarObservacionesEmisorAlContinuar,
  obtenerEstadoObservaciones,
  puedeSubsanar,
  migrateObservacion,
} from './observacionesWorkflow.js';

export const SUBMODULO_DISPLAY_LABELS = {
  'Actos Preparatorios': 'Coordinación CM',
  'Coordinación CM': 'Coordinación CM',
  'Programación': 'Programación',
  'DEC': 'DEC',
  'Evaluación de Requerimiento': 'Evaluación',
  'Evaluación de Requerimientos': 'Evaluación',
  'Registro de Requerimiento': 'Registro AU',
  'Invitaciones': 'Invitaciones',
  'Cotizaciones': 'Cotizaciones',
  'Cuadro Comparativo': 'Cuadro Comparativo',
  'CCP': 'CCP',
  'Ejecución Contractual': 'Ejecución',
};

export const ORIGEN_OBSERVACION_LABELS = {
  GERENTE: 'Evaluación',
  DEC: 'DEC',
  PROGRAMACIÓN: 'Programación',
  PROGRAMACION: 'Programación',
  'ACTOS PREPARATORIOS': 'Coordinación CM',
  ACTOS_PREPARATORIOS: 'Coordinación CM',
  INVITACIONES: 'Invitaciones',
  USUARIO: 'Usuario AU',
};

export function normalizeLegacyActosLabel(text) {
  if (text == null || text === '') return text;
  return String(text)
    .replace(/Actos Preparatorios/gi, 'Coordinación CM')
    .replace(/Actos Preparativos/gi, 'Coordinación CM')
    .replace(/\bEN ACTOS PREP\.?\b/gi, 'EN COORDINACIÓN CM')
    .replace(/\bEn Actos Prep\.?\b/gi, 'En Coordinación CM');
}

export function getSubmoduloDisplayLabel(label) {
  const s = String(label || '').trim();
  return normalizeLegacyActosLabel(SUBMODULO_DISPLAY_LABELS[s] || s || '—');
}

export function getObservacionOrigenLabel(entry) {
  if (!entry) return 'Observación';
  const sub = String(entry.origen_submodulo || entry.moduloOrigen || '').trim();
  if (sub) return `Observación ${getSubmoduloDisplayLabel(sub)}`;
  const origen = String(entry.origen || 'GERENTE').toUpperCase().replace(/\s+/g, ' ');
  const mapped = ORIGEN_OBSERVACION_LABELS[origen] || ORIGEN_OBSERVACION_LABELS[origen.replace(/\s/g, '_')];
  if (mapped) return `Observación ${mapped}`;
  if (origen.includes('ACTOS')) return 'Observación Coordinación CM';
  if (origen.includes('PROGRAM')) return 'Observación Programación';
  if (origen.includes('INVITAC')) return 'Observación Invitaciones';
  return 'Observación Evaluación';
}

export function buildObservacionEntry(payload, fields = {}) {
  const list = Array.isArray(payload.observaciones) ? payload.observaciones : [];
  const ronda = list.length + 1;
  const id = fields.id || `obs_${Date.now()}_${ronda}`;
  const motivo = String(fields.motivo || fields.observacion || '').trim();
  const padreId = fields.observacion_padre_id || fields.observacionPadreId || null;
  return {
    id,
    observacionId: id,
    observacion_id: id,
    ronda,
    observacionPadreId: padreId,
    observacion_padre_id: padreId,
    tipoMovimiento: fields.tipoMovimiento || 'observacion',
    moduloOrigen: fields.origen_submodulo || fields.moduloOrigen || '',
    usuarioOrigen: fields.gerente || fields.usuarioOrigen || '',
    moduloDestino: fields.destino_submodulo || fields.moduloDestino || '',
    usuarioDestino: fields.destino_persona || fields.usuarioDestino || '',
    observacion: motivo,
    motivo,
    gerente: fields.gerente || fields.usuarioOrigen || '',
    origen: fields.origen || '',
    origen_submodulo: fields.origen_submodulo || fields.moduloOrigen || '',
    destino_submodulo: fields.destino_submodulo || fields.moduloDestino || '',
    destino_etapa: fields.destino_etapa || '',
    destino_persona: fields.destino_persona || fields.usuarioDestino || '',
    fecha: fields.fecha || new Date().toISOString(),
    respuesta: null,
    subsanacion: null,
    adjuntos: Array.isArray(fields.adjuntos) ? fields.adjuntos : [],
    actuaciones: [],
    estado: fields.estado || 'EMITIDA',
    cerrada: false,
  };
}

/** Delega en workflow unificado. */
export function appendObservacion(payload, fields) {
  const { observacion } = emitirObservacionWorkflow(payload, fields);
  return observacion;
}
