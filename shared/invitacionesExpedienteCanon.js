/**
 * RC8.17.8H6-A4 — Contrato canónico post-envío de invitaciones a proveedores.
 * "Proveedores" es responsable UNIDAD, no etapa ni submódulo.
 */
export const ESTADO_ESPERANDO_COTIZACIONES = 'ESPERANDO_COTIZACIONES';

export const LABEL_ESPERANDO_COTIZACIONES = 'Esperando cotizaciones';

/** Label persistido en requerimientos.estado (legacy situación). */
export const LEGACY_ESTADO_NEGOCIO_ESPERANDO_COTIZACIONES = LABEL_ESPERANDO_COTIZACIONES;

export const UNIDAD_RESPONSABLE_PROVEEDORES = 'Proveedores';

export const EVENTOS_ENVIO_INVITACION_PROVEEDORES = Object.freeze([
  'INVITACION_ENVIADA',
  'REINVITACION_ENVIADA',
]);

export function isEventoEnvioInvitacionProveedores(eventoCodigo) {
  return EVENTOS_ENVIO_INVITACION_PROVEEDORES.includes(
    String(eventoCodigo || '').trim().toUpperCase(),
  );
}
