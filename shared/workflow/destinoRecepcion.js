/**
 * Destino oficial desde Recepción de Cotizaciones según tipo de expediente.
 * Compartido BE/FE — no duplicar la condición en vistas.
 */
import { TIPOS_CONTRATACION, normalizarTipo } from './tiposContratacion.js';

export const DESTINOS_RECEPCION = Object.freeze({
  VALIDACIONES: 'VALIDACIONES',
  CCP: 'CCP',
});

/**
 * @param {string} tipoExpediente — tipo crudo o canónico (BIEN / SERVICIO / LOCACION / aliases)
 * @returns {'VALIDACIONES'|'CCP'|null}
 */
export function resolveDestinoDesdeRecepcionCotizaciones(tipoExpediente) {
  const tipo = normalizarTipo(tipoExpediente);
  if (tipo === TIPOS_CONTRATACION.LOCACION) return DESTINOS_RECEPCION.CCP;
  if (tipo === TIPOS_CONTRATACION.BIEN || tipo === TIPOS_CONTRATACION.SERVICIO) {
    return DESTINOS_RECEPCION.VALIDACIONES;
  }
  return null;
}

/** Etiqueta de acción en menú Acciones de Recepción. */
export function labelAccionDerivacionRecepcion(tipoExpediente) {
  const dest = resolveDestinoDesdeRecepcionCotizaciones(tipoExpediente);
  if (dest === DESTINOS_RECEPCION.CCP) return 'Derivar a CCP';
  if (dest === DESTINOS_RECEPCION.VALIDACIONES) return 'Derivar a Validaciones';
  return '';
}

/** Evento Workflow asociado al destino. */
export function eventoDerivacionRecepcion(tipoExpediente) {
  const dest = resolveDestinoDesdeRecepcionCotizaciones(tipoExpediente);
  if (dest === DESTINOS_RECEPCION.CCP) return 'LOCACION_APROBADA_RECEPCION';
  if (dest === DESTINOS_RECEPCION.VALIDACIONES) return 'COTIZACIONES_DERIVADAS_VALIDACION';
  return null;
}

export default {
  DESTINOS_RECEPCION,
  resolveDestinoDesdeRecepcionCotizaciones,
  labelAccionDerivacionRecepcion,
  eventoDerivacionRecepcion,
};
