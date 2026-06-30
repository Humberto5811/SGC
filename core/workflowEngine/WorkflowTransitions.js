/**
 * WorkflowTransitions — catálogo único de transiciones oficiales del SGC.
 * Las observaciones NO forman parte de este catálogo (Motor de Observaciones).
 */
import { ETAPAS, FLUJO_ETAPAS, normalizarEtapa } from './WorkflowState.js';

/** Transiciones lineales oficiales (etapa → etapa). */
export const TRANSICIONES_LINEALES = Object.freeze(
  FLUJO_ETAPAS.slice(0, -1).map((origen, idx) => ({
    origen,
    destino: FLUJO_ETAPAS[idx + 1],
    tipo: 'LINEAL',
    accion: 'AVANZAR',
  })),
);

/** Transiciones por acción de negocio (aprobar / derivar). */
export const TRANSICIONES_POR_ACCION = Object.freeze({
  APROBAR: Object.freeze({
    [ETAPAS.REGISTRADO]: ETAPAS.EVALUACION,
    [ETAPAS.EVALUACION]: ETAPAS.DEC,
    [ETAPAS.DEC]: ETAPAS.PROGRAMACION,
    [ETAPAS.PROGRAMACION]: ETAPAS.ACTOS_PREPARATORIOS,
    [ETAPAS.ACTOS_PREPARATORIOS]: ETAPAS.INVITACIONES,
    [ETAPAS.INVITACIONES]: ETAPAS.VALIDACION_USUARIO,
    [ETAPAS.PORTAL_PROVEEDORES]: ETAPAS.VALIDACION_USUARIO,
    [ETAPAS.VALIDACION_USUARIO]: ETAPAS.CUADRO_COMPARATIVO,
    [ETAPAS.CUADRO_COMPARATIVO]: ETAPAS.CCP,
    [ETAPAS.CCP]: ETAPAS.ORDEN_COMPRA,
    [ETAPAS.ORDEN_COMPRA]: ETAPAS.EJECUCION,
    [ETAPAS.EJECUCION]: ETAPAS.LIQUIDACION,
    [ETAPAS.LIQUIDACION]: ETAPAS.ARCHIVO,
    [ETAPAS.ARCHIVO]: ETAPAS.FINALIZADO,
  }),
  DERIVAR: Object.freeze({
    [ETAPAS.INVITACIONES]: ETAPAS.PORTAL_PROVEEDORES,
    [ETAPAS.RECEPCION_COTIZACIONES]: ETAPAS.CUADRO_COMPARATIVO,
  }),
  RETROCEDER: Object.freeze({
    [ETAPAS.EVALUACION]: ETAPAS.REGISTRADO,
    [ETAPAS.DEC]: ETAPAS.EVALUACION,
    [ETAPAS.PROGRAMACION]: ETAPAS.DEC,
    [ETAPAS.ACTOS_PREPARATORIOS]: ETAPAS.PROGRAMACION,
    [ETAPAS.INVITACIONES]: ETAPAS.ACTOS_PREPARATORIOS,
  }),
});

const TRANSICIONES_MAP = Object.freeze(
  TRANSICIONES_LINEALES.reduce((acc, t) => {
    if (!acc[t.origen]) acc[t.origen] = new Set();
    acc[t.origen].add(t.destino);
    return acc;
  }, {}),
);

function expandWithAcciones(origen) {
  const code = normalizarEtapa(origen);
  if (!code) return [];
  const destinos = new Set(TRANSICIONES_MAP[code] ? [...TRANSICIONES_MAP[code]] : []);
  Object.values(TRANSICIONES_POR_ACCION).forEach((map) => {
    if (map[code]) destinos.add(map[code]);
  });
  return [...destinos];
}

export function obtenerSiguienteEtapa(etapaActual) {
  const code = normalizarEtapa(etapaActual);
  if (!code) return null;
  const idx = FLUJO_ETAPAS.indexOf(code);
  return idx >= 0 && idx < FLUJO_ETAPAS.length - 1 ? FLUJO_ETAPAS[idx + 1] : null;
}

export function obtenerEtapaAnterior(etapaActual) {
  const code = normalizarEtapa(etapaActual);
  if (!code) return null;
  const idx = FLUJO_ETAPAS.indexOf(code);
  if (idx > 0) return FLUJO_ETAPAS[idx - 1];
  return TRANSICIONES_POR_ACCION.RETROCEDER[code] || null;
}

export function obtenerDestinoPorAccion(etapaActual, accion = 'APROBAR') {
  const code = normalizarEtapa(etapaActual);
  if (!code) return null;
  const key = String(accion || 'APROBAR').toUpperCase();
  const map = TRANSICIONES_POR_ACCION[key];
  if (map?.[code]) return map[code];
  if (key === 'APROBAR') return obtenerSiguienteEtapa(code);
  return null;
}

export function obtenerTransicionesPermitidas(etapaActual) {
  const code = normalizarEtapa(etapaActual);
  if (!code) return [];
  return expandWithAcciones(code).map((destino) => ({
    origen: code,
    destino,
    valido: true,
  }));
}

export function validarTransicionEtapa(etapaOrigen, etapaDestino) {
  const origen = normalizarEtapa(etapaOrigen);
  const destino = normalizarEtapa(etapaDestino);
  if (!origen || !destino) {
    return { valido: false, motivo: 'Etapa origen o destino inválida' };
  }
  const permitidos = expandWithAcciones(origen);
  const valido = permitidos.includes(destino);
  return {
    valido,
    origen,
    destino,
    motivo: valido ? '' : `Transición ${origen} → ${destino} no permitida en el catálogo oficial`,
  };
}

export function validarTransicionEstadoCore(estadoActual, estadoNuevo, estadoManager) {
  if (!estadoManager?.validarTransicion) {
    return validarTransicionEtapa(
      estadoActual,
      estadoNuevo,
    );
  }
  return estadoManager.validarTransicion(estadoActual, estadoNuevo);
}

export default {
  TRANSICIONES_LINEALES,
  TRANSICIONES_POR_ACCION,
  obtenerSiguienteEtapa,
  obtenerEtapaAnterior,
  obtenerDestinoPorAccion,
  obtenerTransicionesPermitidas,
  validarTransicionEtapa,
};
