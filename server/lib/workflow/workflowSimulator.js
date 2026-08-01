/**
 * Workflow Simulator — simulación pura de transiciones.
 * Cero escrituras; cero conexión obligatoria a BD.
 *
 * Usa los mismos catálogos, matriz y validator que el motor.
 */
import { getTransition, getAllowedTransitions } from '../../../shared/workflow/transiciones.js';
import { getEventoMeta } from '../../../shared/workflow/eventos.js';
import { getEstadoExpedienteDeEtapa, getEstadoPorCodigo } from '../../../shared/workflow/estadosPorDominio.js';
import { getEtapaMeta } from '../../../shared/workflow/etapas.js';
import { validarTransicion } from './workflowValidator.js';

/**
 * Simula una transición sin escribir.
 *
 * @param {object} input
 * @param {string} input.tipo_contratacion
 * @param {string|null} input.etapa_actual
 * @param {object} [input.estados_dominio] — { dominio: { codigo, label } | null }
 * @param {string} input.evento
 * @param {string} [input.actor_id]
 * @param {string} [input.actor_rol]
 * @param {string[]} [input.documentos]
 * @param {object} [input.metadata]
 * @param {object} [input.flags]
 * @returns {{
 *   permitido, etapa_origen, etapa_destino, cambia_ubicacion,
 *   estados_resultantes, responsable_destino, errores, advertencias, historial_simulado
 * }}
 */
export function simularTransicion(input = {}) {
  const evento = String(input.evento || '').trim().toUpperCase();
  const etapaOrigen = input.etapa_actual ? String(input.etapa_actual).trim().toUpperCase() : '';
  const tipo = String(input.tipo_contratacion || '').trim();

  const validacion = validarTransicion({
    tipo_contratacion: tipo,
    etapa_actual: input.etapa_actual || null,
    evento,
    actor_id: input.actor_id,
    actor_rol: input.actor_rol,
    permiso: input.metadata?.permiso,
    idempotency_key: input.metadata?.idempotency_key,
    documentos: input.documentos,
    requisitos_cumplidos: input.metadata?.requisitos_cumplidos,
    documentos_requeridos: input.metadata?.documentos_requeridos,
    requisitos_obligatorios: input.metadata?.requisitos_obligatorios,
    flags: input.flags,
  });

  const estadosResultantes = {};
  if (input.estados_dominio && typeof input.estados_dominio === 'object') {
    for (const [k, v] of Object.entries(input.estados_dominio)) {
      estadosResultantes[k] = v ? { ...v } : null;
    }
  }

  if (!validacion.transicion_permitida || !validacion.transicion) {
    const etapaDestino = validacion.transicion ? validacion.transicion.etapa_destino : null;
    return {
      permitido: false,
      etapa_origen: etapaOrigen || null,
      etapa_destino: etapaDestino || null,
      cambia_ubicacion: false,
      estados_resultantes: estadosResultantes,
      responsable_destino: validacion.transicion?.responsable_destino || null,
      errores: validacion.errores,
      advertencias: validacion.advertencias,
      historial_simulado: [],
    };
  }

  const transicion = validacion.transicion;
  const etapaDestino = transicion.etapa_destino;
  const cambiaUbicacion = transicion.cambia_ubicacion;

  // Estado de expediente resultante.
  const estadoExpedienteDestino = getEstadoExpedienteDeEtapa(etapaDestino);
  estadosResultantes.expediente = estadoExpedienteDestino
    ? { codigo: estadoExpedienteDestino.codigo, label: estadoExpedienteDestino.label }
    : estadosResultantes.expediente || null;

  const metaDest = getEtapaMeta(etapaDestino);
  const responsableDestino = metaDest?.responsableLabel || transicion.responsable_destino || null;

  const historialSimulado = [
    {
      evento: transicion.evento_codigo,
      etapa_origen: etapaOrigen || null,
      etapa_destino: etapaDestino,
      cambia_ubicacion: cambiaUbicacion,
      responsable_destino: responsableDestino,
    },
  ];

  return {
    permitido: true,
    etapa_origen: etapaOrigen || null,
    etapa_destino: etapaDestino,
    cambia_ubicacion: cambiaUbicacion,
    estados_resultantes: estadosResultantes,
    responsable_destino: responsableDestino,
    errores: [],
    advertencias: validacion.advertencias,
    historial_simulado: historialSimulado,
  };
}

/**
 * Simula un recorrido completo de pasos secuenciales (útil en pruebas).
 * `steps`: array de eventos. Devuelve el resultado de cada paso; si un paso
 * falla, se detiene y devuelve el error (no continúa con etapa inconsistente).
 */
export function simularRecorridoCompleto(tipoContratacion, flags = {}, steps = []) {
  const pasos = [];
  let etapaActual = '';
  const estadosDominio = {};

  for (const paso of steps) {
    const evento = String(paso?.evento || '').trim().toUpperCase();
    const res = simularTransicion({
      tipo_contratacion: tipoContratacion,
      etapa_actual: etapaActual || null,
      estados_dominio: estadosDominio.dominios || {},
      evento,
      actor_id: paso?.actor_id,
      actor_rol: paso?.actor_rol || 'SISTEMA',
      documentos: paso?.documentos,
      metadata: { idempotency_key: `sim:${tipoContratacion}:${etapaActual || 'creacion'}:${evento}`, ...(paso?.metadata || {}) },
      flags,
    });
    pasos.push(res);
    if (!res.permitido) break;
    etapaActual = res.etapa_destino || etapaActual;
    estadosDominio.dominios = res.estados_resultantes || {};
  }
  return pasos;
}

/** Devuelve las transiciones permitidas desde una etapa (incluye flags). */
export function transicionesPermitidasDesde(tipoContratacion, etapaActual, flags = {}) {
  const all = getAllowedTransitions({ tipoContratacion, etapaOrigen: etapaActual });
  return all.filter((t) => {
    if (!t.feature_flag) return true;
    return flags[t.feature_flag] === true;
  });
}

export default {
  simularTransicion,
  transicionesPermitidasDesde,
};