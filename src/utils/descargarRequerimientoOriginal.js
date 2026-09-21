import { adjuntosService } from '../services/adjuntosService.js';
import { printRequerimiento } from '../views/requerimiento/registroRequerimientoView.js';
import { RESOLUCION_DOC_REQ } from '../../shared/requerimientoDocumentoCanonico.js';

export const MSG_DESCARGA_REGENERADA = [
  'No se encontró un PDF del requerimiento registrado como documento original.',
  'Se abrirá una versión generada desde los datos guardados (puede diferir del documento firmado).',
].join('\n');

export const MSG_DESCARGA_AMBIGUA = [
  'Hay más de un PDF que podría ser el documento del requerimiento.',
  'Use la acción Adjuntos para elegir el archivo correcto.',
].join('\n');

/** Acción de UI tras consultar documento-canonico (sin side effects). */
export const ACCION_DESCARGA = Object.freeze({
  ADJUNTO: 'adjunto',
  FALLBACK_PRINT: 'fallback_print',
  AMBIGUOUS: 'ambiguous',
  ERROR: 'error',
});

/**
 * Contrato de respuesta API → acción permitida.
 * ERROR: status desconocido o inválido (no fallback).
 */
export function resolveAccionDescargaDocumento(status) {
  if (status === RESOLUCION_DOC_REQ.FOUND) return ACCION_DESCARGA.ADJUNTO;
  if (status === RESOLUCION_DOC_REQ.NONE) return ACCION_DESCARGA.FALLBACK_PRINT;
  if (status === RESOLUCION_DOC_REQ.AMBIGUOUS) return ACCION_DESCARGA.AMBIGUOUS;
  return ACCION_DESCARGA.ERROR;
}

/**
 * Invitaciones > Descargar: prioriza adjunto canónico; fallback solo si status === none.
 */
export async function descargarRequerimientoDesdeInvitaciones(requerimientoId) {
  const rid = Number(requerimientoId);
  if (!Number.isInteger(rid) || rid <= 0) {
    throw new Error('Identificador de requerimiento inválido');
  }

  const resolved = await adjuntosService.getDocumentoRequerimientoCanonico(rid);
  const accion = resolveAccionDescargaDocumento(resolved?.status);

  if (accion === ACCION_DESCARGA.ERROR) {
    const msg = resolved?.error || resolved?.message
      || `No se pudo interpretar la respuesta del servidor (status: ${String(resolved?.status ?? '')}).`;
    throw new Error(msg);
  }

  if (accion === ACCION_DESCARGA.ADJUNTO) {
    if (!resolved.adjunto?.id) {
      throw new Error('El documento identificado no incluye un adjunto válido.');
    }
    await adjuntosService.descargarAdjunto(
      resolved.adjunto.id,
      resolved.adjunto.nombre_archivo || 'Requerimiento.pdf',
    );
    return { mode: 'adjunto', adjunto_id: resolved.adjunto.id };
  }

  if (accion === ACCION_DESCARGA.AMBIGUOUS) {
    alert(MSG_DESCARGA_AMBIGUA);
    return { mode: 'ambiguous' };
  }

  alert(MSG_DESCARGA_REGENERADA);
  await printRequerimiento(rid);
  return { mode: 'fallback_print' };
}
