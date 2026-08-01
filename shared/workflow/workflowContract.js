/**
 * Contratos del Workflow SGC.
 * Compartido BE/FE. Sin dependencias de BD.
 *
 * Contratos:
 * A. Ubicación: responde "¿dónde está el requerimiento?" (solo expediente).
 * B. Estados: estados por dominio (un dominio ausente = null).
 * C. Visual: cómo presenta el FE (claves semánticas, sin colores CSS en backend).
 */

import { TIPOS_CONTRATACION } from './tiposContratacion.js';
import { ETAPAS } from './etapas.js';
import { EVENTOS } from './eventos.js';

export const VERSION_WORKFLOW = Object.freeze('1.0.0');

/** Claves semánticas de estado visual (sin colores CSS en backend). */
export const ESTADO_VISUAL = Object.freeze({
  COMPLETED: 'completed',
  CURRENT: 'current',
  PENDING: 'pending',
  OBSERVED: 'observed',
  BLOCKED: 'blocked',
  RETURNED: 'returned',
  CANCELLED: 'cancelled',
  FINISHED: 'finished',
});

/** Dominios expuestos en el contrato B (preservan orden). */
export const DOMINIOS_CONTRATO = Object.freeze([
  'expediente',
  'solicitud',
  'invitacion',
  'recepcion',
  'cotizacion',
  'validacion',
  'cuadro',
  'ccp',
  'orden',
  'ejecucion',
  'observacion',
]);

/** Mapeo dominio canónico → clave del contrato. */
export const DOMINIO_A_CLAVE = Object.freeze({
  EXPEDIENTE: 'expediente',
  SOLICITUD_COTIZACION: 'solicitud',
  INVITACION: 'invitacion',
  RECEPCION_COTIZACIONES: 'recepcion',
  COTIZACION: 'cotizacion',
  VALIDACION: 'validacion',
  CUADRO_COMPARATIVO: 'cuadro',
  CCP: 'ccp',
  ORDEN: 'orden',
  EJECUCION: 'ejecucion',
  OBSERVACION: 'observacion',
});

function stringOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

/**
 * A. Contrato de ubicación vigente.
 * Solo responde dónde está el requerimiento; no incluye estados de dominio.
 */
export function buildContratoUbicacion({
  expediente_id,
  tipo_contratacion,
  etapa_codigo,
  etapa_label,
  submodulo_codigo,
  submodulo_label,
  responsable_codigo,
  responsable_label,
  actualizado_en,
  version_workflow = VERSION_WORKFLOW,
} = {}) {
  return {
    expediente_id: expediente_id ?? null,
    tipo_contratacion: stringOrNull(tipo_contratacion),
    etapa_codigo: stringOrNull(etapa_codigo),
    etapa_label: stringOrNull(etapa_label),
    submodulo_codigo: stringOrNull(submodulo_codigo),
    submodulo_label: stringOrNull(submodulo_label),
    responsable_codigo: stringOrNull(responsable_codigo),
    responsable_label: stringOrNull(responsable_label),
    version_workflow,
    actualizado_en: actualizado_en || null,
  };
}

/**
 * B. Contrato de estados por dominio.
 * `domainStates` es un objeto { dominioCanonico: { codigo, label } | null }.
 * Un dominio no disponible debe ser null; nunca se usa otro dominio como fallback.
 */
export function buildContratoEstados({
  tipo_contratacion,
  etapa_codigo,
  etapa_label,
  submodulo_codigo,
  submodulo_label,
  responsable_codigo,
  responsable_label,
  domainStates = {},
} = {}) {
  const estados = {};
  for (const clave of DOMINIOS_CONTRATO) {
    // Buscar el valor por clave o por dominio canónico.
    let value = domainStates[clave];
    if (value === undefined) {
      const dominioCanonico = Object.keys(DOMINIO_A_CLAVE)
        .find((d) => DOMINIO_A_CLAVE[d] === clave);
      if (dominioCanonico !== undefined) value = domainStates[dominioCanonico];
    }
    if (value && typeof value === 'object' && value.codigo) {
      estados[clave] = {
        codigo: String(value.codigo),
        label: String(value.label || value.codigo),
      };
    } else {
      estados[clave] = null;
    }
  }
  return {
    workflow: {
      tipo_contratacion: stringOrNull(tipo_contratacion),
      etapa_codigo: stringOrNull(etapa_codigo),
      etapa_label: stringOrNull(etapa_label),
      submodulo_codigo: stringOrNull(submodulo_codigo),
      submodulo_label: stringOrNull(submodulo_label),
      responsable_codigo: stringOrNull(responsable_codigo),
      responsable_label: stringOrNull(responsable_label),
    },
    estados,
  };
}

/**
 * C. Contrato visual.
 * Claves semánticas (completed/current/pending/observed/blocked/returned/cancelled/finished).
 * No se codifican colores CSS en backend.
 */
export function buildContratoVisual({
  etapa_actual,
  etapa_label,
  responsable_actual,
  responsable_label,
  estado_visible = ESTADO_VISUAL.CURRENT,
  estado_visible_label,
  fecha_ingreso_etapa,
  dias_en_etapa = 0,
  proxima_accion = null,
  siguiente_etapa = null,
  bloqueado = false,
  motivo_bloqueo = null,
} = {}) {
  return {
    etapa_actual: stringOrNull(etapa_actual),
    etapa_label: stringOrNull(etapa_label),
    responsable_actual: stringOrNull(responsable_actual),
    responsable_label: stringOrNull(responsable_label),
    estado_visible: stringOrNull(estado_visible),
    estado_visible_label: stringOrNull(estado_visible_label),
    fecha_ingreso_etapa: fecha_ingreso_etapa || null,
    dias_en_etapa: Number.isFinite(Number(dias_en_etapa)) ? Number(dias_en_etapa) : 0,
    proxima_accion: stringOrNull(proxima_accion),
    siguiente_etapa: stringOrNull(siguiente_etapa),
    bloqueado: !!bloqueado,
    motivo_bloqueo: stringOrNull(motivo_bloqueo),
  };
}

/** Normaliza un código de evento enviado por cliente. */
export function normalizarEventoCodigo(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return EVENTOS[s] ? EVENTOS[s] : (s || null);
}

/** Normaliza un código de etapa enviado por cliente. */
export function normalizarEtapaCodigo(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return ETAPAS[s] ? ETAPAS[s] : (s || null);
}

/** Normaliza código de tipo de contratación. */
export function normalizarTipoCodigo(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return TIPOS_CONTRATACION[s] ? TIPOS_CONTRATACION[s] : (s || null);
}

export default {
  VERSION_WORKFLOW,
  ESTADO_VISUAL,
  DOMINIOS_CONTRATO,
  DOMINIO_A_CLAVE,
  buildContratoUbicacion,
  buildContratoEstados,
  buildContratoVisual,
  normalizarEventoCodigo,
  normalizarEtapaCodigo,
  normalizarTipoCodigo,
};