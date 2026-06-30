/**
 * WorkflowPermissions — catálogo único de permisos por módulo del SGC.
 * Fase 1: reglas estáticas + delegación dinámica al Motor de Observaciones.
 */
import {
  puedeSubsanar as motorPuedeSubsanar,
  hayObservacionPendienteAccion,
  getObservacionEmisorPendienteCierre,
} from '../../shared/observacionesMotor.js';
import { ETAPAS, normalizarEtapa, resolveEtapaFromRow } from './WorkflowState.js';

export const ACCIONES = Object.freeze({
  EDITAR: 'editar',
  APROBAR: 'aprobar',
  OBSERVAR: 'observar',
  SUBSANAR: 'subsanar',
  CERRAR: 'cerrar',
  DERIVAR: 'derivar',
  ADJUNTOS: 'adjuntos',
  TIMELINE: 'timeline',
  ELIMINAR: 'eliminar',
});

/** Matriz base por etapa (sin contexto de fila). */
export const PERMISOS_BASE_POR_ETAPA = Object.freeze({
  [ETAPAS.REGISTRADO]: Object.freeze([ACCIONES.EDITAR, ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE, ACCIONES.ELIMINAR]),
  [ETAPAS.EVALUACION]: Object.freeze([ACCIONES.EDITAR, ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE, ACCIONES.ELIMINAR]),
  [ETAPAS.DEC]: Object.freeze([ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.CERRAR, ACCIONES.DERIVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.PROGRAMACION]: Object.freeze([ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.DERIVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.ACTOS_PREPARATORIOS]: Object.freeze([ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.DERIVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.INVITACIONES]: Object.freeze([ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.DERIVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.PORTAL_PROVEEDORES]: Object.freeze([ACCIONES.OBSERVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.VALIDACION_USUARIO]: Object.freeze([ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.CUADRO_COMPARATIVO]: Object.freeze([ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.DERIVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.CCP]: Object.freeze([ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.DERIVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.ORDEN_COMPRA]: Object.freeze([ACCIONES.APROBAR, ACCIONES.DERIVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.EJECUCION]: Object.freeze([ACCIONES.APROBAR, ACCIONES.OBSERVAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.LIQUIDACION]: Object.freeze([ACCIONES.APROBAR, ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.ARCHIVO]: Object.freeze([ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
  [ETAPAS.FINALIZADO]: Object.freeze([ACCIONES.ADJUNTOS, ACCIONES.TIMELINE]),
});

function normalizeModuloConsulta(modulo) {
  const etapa = normalizarEtapa(modulo);
  if (etapa) return etapa;
  return String(modulo || '').trim();
}

function evaluarReglasDinamicas(accion, context) {
  const row = context?.raw || context?.row || {};
  const modulo = context?.moduloConsulta || context?.moduloActual || resolveEtapaFromRow(row);
  const moduloLabel = context?.moduloLabel || modulo;
  const estado = String(row.estado || context?.estado || '');

  if (accion === ACCIONES.SUBSANAR) {
    return motorPuedeSubsanar(moduloLabel, row);
  }
  if (accion === ACCIONES.OBSERVAR) {
    return hayObservacionPendienteAccion(row, moduloLabel)
      || PERMISOS_BASE_POR_ETAPA[normalizarEtapa(modulo) || resolveEtapaFromRow(row)]?.includes(ACCIONES.OBSERVAR);
  }
  if (accion === ACCIONES.CERRAR) {
    return !!getObservacionEmisorPendienteCierre(row, moduloLabel);
  }
  if (accion === ACCIONES.APROBAR) {
    const etapa = normalizarEtapa(modulo) || resolveEtapaFromRow(row);
    const ubicacion = String(row.estado_actual || row.estadoActual || '').toUpperCase();
    if (etapa === ETAPAS.DEC) {
      return ubicacion === 'DEC' && /^Aprobado$/i.test(estado);
    }
    if (etapa === ETAPAS.REGISTRADO) {
      return !/aprobad/i.test(estado) && !/tr[aá]mite/i.test(estado);
    }
    if (etapa === ETAPAS.EVALUACION) {
      return /tr[aá]mite/i.test(estado) && !/aprobad/i.test(estado);
    }
    if (etapa === ETAPAS.PROGRAMACION) {
      return ubicacion === 'PROGRAMACION' || /^Aprobado DEC$/i.test(estado);
    }
    return PERMISOS_BASE_POR_ETAPA[etapa]?.includes(ACCIONES.APROBAR) ?? false;
  }
  if (accion === ACCIONES.EDITAR) {
    return !/aprobad/i.test(estado);
  }
  if (accion === ACCIONES.ELIMINAR) {
    return !/aprobad/i.test(estado);
  }
  return null;
}

export function obtenerPermisosBase(moduloOrEtapa) {
  const etapa = normalizarEtapa(moduloOrEtapa);
  return etapa ? (PERMISOS_BASE_POR_ETAPA[etapa] || []) : [];
}

export function puedeAccion(accion, context = {}) {
  const acc = String(accion || '').toLowerCase();
  const dinamico = evaluarReglasDinamicas(acc, context);
  if (dinamico !== null) return dinamico;

  const etapa = normalizarEtapa(context.moduloConsulta || context.moduloActual)
    || resolveEtapaFromRow(context.raw || context.row || context);
  const base = etapa ? PERMISOS_BASE_POR_ETAPA[etapa] : [];
  return base.includes(acc);
}

export function obtenerAccionesPermitidas(context = {}) {
  const etapa = normalizarEtapa(context.moduloConsulta || context.moduloActual)
    || resolveEtapaFromRow(context.raw || context.row || context);
  const base = etapa ? [...(PERMISOS_BASE_POR_ETAPA[etapa] || [])] : [];
  const out = new Set(base.filter((a) => puedeAccion(a, context)));
  if (puedeAccion(ACCIONES.SUBSANAR, context)) out.add(ACCIONES.SUBSANAR);
  if (puedeAccion(ACCIONES.CERRAR, context)) out.add(ACCIONES.CERRAR);
  return [...out];
}

export default {
  ACCIONES,
  PERMISOS_BASE_POR_ETAPA,
  puedeAccion,
  obtenerAccionesPermitidas,
  obtenerPermisosBase,
};
