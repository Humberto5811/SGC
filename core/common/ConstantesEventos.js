/**
 * Catálogo de acciones, entidades y eventos del SGC Core — Fase 2A.
 */

/** Entidad principal del Core. */
export const ENTIDAD_PRINCIPAL = Object.freeze({
  REQUERIMIENTO: 'REQUERIMIENTO',
});

/** Contenedor documental asociado al requerimiento. */
export const ENTIDAD_DOCUMENTAL = Object.freeze({
  EXPEDIENTE: 'EXPEDIENTE',
});

export const ACCIONES = Object.freeze({
  CREADO: 'CREADO',
  EDITADO: 'EDITADO',
  APROBADO: 'APROBADO',
  RECHAZADO: 'RECHAZADO',
  OBSERVADO: 'OBSERVADO',
  SUBSANADO: 'SUBSANADO',
  DERIVADO: 'DERIVADO',
  REENVIADO: 'REENVIADO',
  FIRMADO: 'FIRMADO',
  DESCARGADO: 'DESCARGADO',
  EXPORTADO: 'EXPORTADO',
  ANULADO: 'ANULADO',
  FINALIZADO: 'FINALIZADO',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
});

export const TIPOS_OPERACION_AUDITORIA = Object.freeze({
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
});

export const TIPOS_ADJUNTO = Object.freeze({
  DOCUMENTO: 'DOCUMENTO',
  PDF: 'PDF',
  EXCEL: 'EXCEL',
  IMAGEN: 'IMAGEN',
  WORD: 'WORD',
  OTROS: 'OTROS',
});

export const TIPOS_DOCUMENTO_EXPEDIENTE = Object.freeze({
  ADJUNTO: 'ADJUNTO',
  PEDIDO: 'PEDIDO',
  INFORME: 'INFORME',
  COTIZACION: 'COTIZACION',
  CONTRATO: 'CONTRATO',
  CCP: 'CCP',
  ORDEN: 'ORDEN',
  OTRO: 'OTRO',
});

/**
 * Entidades a las que se pueden asociar adjuntos.
 * REQUERIMIENTO = nivel 1; EXPEDIENTE y demás = nivel documental / relacional.
 */
export const ENTIDADES_ADJUNTABLES = Object.freeze({
  REQUERIMIENTO: 'REQUERIMIENTO',
  EXPEDIENTE: 'EXPEDIENTE',
  OBSERVACION: 'OBSERVACION',
  SOLICITUD_COTIZACION: 'SOLICITUD_COTIZACION',
  PROVEEDOR: 'PROVEEDOR',
  VALIDACION: 'VALIDACION',
  CONTRATO: 'CONTRATO',
});

export const TIPOS_EVENTO_TIMELINE = Object.freeze({
  ETAPA: 'ETAPA',
  OBSERVACION: 'OBSERVACION',
  SUBSANACION: 'SUBSANACION',
  DERIVACION: 'DERIVACION',
  AUDITORIA: 'AUDITORIA',
  ADJUNTO: 'ADJUNTO',
});

/** Módulos del flujo del requerimiento (orden del historial). */
export const MODULOS_FLUJO = Object.freeze([
  'Registro',
  'DEC',
  'Programación',
  'Coordinación CM',
  'Invitaciones',
  'Portal Proveedores',
  'Validación',
  'Cuadro Comparativo',
  'CCP',
  'Ejecución',
]);

export default {
  ENTIDAD_PRINCIPAL,
  ENTIDAD_DOCUMENTAL,
  ACCIONES,
  TIPOS_OPERACION_AUDITORIA,
  TIPOS_ADJUNTO,
  TIPOS_DOCUMENTO_EXPEDIENTE,
  ENTIDADES_ADJUNTABLES,
  TIPOS_EVENTO_TIMELINE,
  MODULOS_FLUJO,
};
