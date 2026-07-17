/**
 * Catálogo único de eventos funcionales del Timeline SGC.
 * Preparado para Validación, Cuadro Comparativo, CCP, Ejecución, Contrato, Liquidación.
 */

export const CATEGORIAS_EVENTO = Object.freeze({
  RECEPCION: 'RECEPCION',
  DERIVACION: 'DERIVACION',
  OBSERVACION: 'OBSERVACION',
  SUBSANACION: 'SUBSANACION',
  APROBACION: 'APROBACION',
  DOCUMENTO: 'DOCUMENTO',
  INVITACION: 'INVITACION',
  VALIDACION: 'VALIDACION',
  CONTRATO: 'CONTRATO',
  LIQUIDACION: 'LIQUIDACION',
  ETAPA: 'ETAPA',
});

/** @typedef {{ codigo: string, label: string, categoria: string, tipoEvento: string }} EventoDef */

export const EVENTOS_FUNCIONALES = Object.freeze({
  // Recepción
  REQUERIMIENTO_RECIBIDO: { codigo: 'REQUERIMIENTO_RECIBIDO', label: 'Requerimiento recibido', categoria: 'RECEPCION', tipoEvento: 'ETAPA' },
  EXPEDIENTE_RECIBIDO: { codigo: 'EXPEDIENTE_RECIBIDO', label: 'Expediente documental recibido', categoria: 'RECEPCION', tipoEvento: 'ETAPA' },
  OBSERVACION_RECIBIDA: { codigo: 'OBSERVACION_RECIBIDA', label: 'Observación recibida', categoria: 'OBSERVACION', tipoEvento: 'OBSERVACION' },
  SUBSANACION_RECIBIDA: { codigo: 'SUBSANACION_RECIBIDA', label: 'Subsanación recibida', categoria: 'SUBSANACION', tipoEvento: 'SUBSANACION' },

  // Derivación
  DERIVADO: { codigo: 'DERIVADO', label: 'Derivado', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_DEC: { codigo: 'DERIVADO_A_DEC', label: 'Derivado a DEC', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_PROGRAMACION: { codigo: 'DERIVADO_A_PROGRAMACION', label: 'Derivado a Programación', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_COORDINACION_CM: { codigo: 'DERIVADO_A_COORDINACION_CM', label: 'Derivado a Coordinación CM', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_INVITACIONES: { codigo: 'DERIVADO_A_INVITACIONES', label: 'Derivado a Invitaciones', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_VALIDACION: { codigo: 'DERIVADO_A_VALIDACION', label: 'Derivado a Validación', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_CUADRO_COMPARATIVO: { codigo: 'DERIVADO_A_CUADRO_COMPARATIVO', label: 'Derivado a Cuadro Comparativo', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_CCP: { codigo: 'DERIVADO_A_CCP', label: 'Derivado a CCP', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_EJECUCION: { codigo: 'DERIVADO_A_EJECUCION', label: 'Derivado a Ejecución', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_CONTRATO: { codigo: 'DERIVADO_A_CONTRATO', label: 'Derivado a Contrato', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },
  DERIVADO_A_LIQUIDACION: { codigo: 'DERIVADO_A_LIQUIDACION', label: 'Derivado a Liquidación', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },

  // Observaciones
  OBSERVACION_REGISTRADA: { codigo: 'OBSERVACION_REGISTRADA', label: 'Observación registrada', categoria: 'OBSERVACION', tipoEvento: 'OBSERVACION' },
  OBSERVACION_ENVIADA: { codigo: 'OBSERVACION_ENVIADA', label: 'Observación enviada', categoria: 'OBSERVACION', tipoEvento: 'OBSERVACION' },
  OBSERVACION_ATENDIDA: { codigo: 'OBSERVACION_ATENDIDA', label: 'Observación atendida', categoria: 'OBSERVACION', tipoEvento: 'OBSERVACION' },
  OBSERVACION_CERRADA: { codigo: 'OBSERVACION_CERRADA', label: 'Observación cerrada', categoria: 'OBSERVACION', tipoEvento: 'OBSERVACION' },

  // Subsanaciones
  SUBSANACION_INICIADA: { codigo: 'SUBSANACION_INICIADA', label: 'Subsanación iniciada', categoria: 'SUBSANACION', tipoEvento: 'SUBSANACION' },
  SUBSANACION_REGISTRADA: { codigo: 'SUBSANACION_REGISTRADA', label: 'Subsanación registrada', categoria: 'SUBSANACION', tipoEvento: 'SUBSANACION' },
  SUBSANACION_ENVIADA: { codigo: 'SUBSANACION_ENVIADA', label: 'Subsanación enviada', categoria: 'SUBSANACION', tipoEvento: 'SUBSANACION' },
  SUBSANACION_ACEPTADA: { codigo: 'SUBSANACION_ACEPTADA', label: 'Subsanación aceptada', categoria: 'SUBSANACION', tipoEvento: 'SUBSANACION' },

  // Aprobaciones / resolución
  APROBADO: { codigo: 'APROBADO', label: 'Aprobado', categoria: 'APROBACION', tipoEvento: 'ETAPA' },
  RECHAZADO: { codigo: 'RECHAZADO', label: 'Rechazado', categoria: 'APROBACION', tipoEvento: 'ETAPA' },
  DEVUELTO: { codigo: 'DEVUELTO', label: 'Devuelto', categoria: 'APROBACION', tipoEvento: 'ETAPA' },
  ARCHIVADO: { codigo: 'ARCHIVADO', label: 'Archivado', categoria: 'APROBACION', tipoEvento: 'ETAPA' },

  // Documentos
  DOCUMENTO_AGREGADO: { codigo: 'DOCUMENTO_AGREGADO', label: 'Documento agregado', categoria: 'DOCUMENTO', tipoEvento: 'ADJUNTO' },
  DOCUMENTO_ELIMINADO: { codigo: 'DOCUMENTO_ELIMINADO', label: 'Documento eliminado', categoria: 'DOCUMENTO', tipoEvento: 'ADJUNTO' },
  DOCUMENTO_ACTUALIZADO: { codigo: 'DOCUMENTO_ACTUALIZADO', label: 'Documento actualizado', categoria: 'DOCUMENTO', tipoEvento: 'ADJUNTO' },

  // Invitaciones
  SOLICITUD_COTIZACION_CREADA: { codigo: 'SOLICITUD_COTIZACION_CREADA', label: 'Solicitud de Cotización creada', categoria: 'INVITACION', tipoEvento: 'ETAPA' },
  INVITACION_ENVIADA: { codigo: 'INVITACION_ENVIADA', label: 'Invitación enviada', categoria: 'INVITACION', tipoEvento: 'ETAPA' },
  INVITACION_ACEPTADA: { codigo: 'INVITACION_ACEPTADA', label: 'Invitación aceptada', categoria: 'INVITACION', tipoEvento: 'ETAPA' },
  COTIZACION_RECIBIDA: { codigo: 'COTIZACION_RECIBIDA', label: 'Cotización recibida', categoria: 'INVITACION', tipoEvento: 'ETAPA' },

  // Validaciones (futuro)
  VALIDACION_REGISTRADA: { codigo: 'VALIDACION_REGISTRADA', label: 'Validación registrada', categoria: 'VALIDACION', tipoEvento: 'ETAPA' },
  VALIDACION_APROBADA: { codigo: 'VALIDACION_APROBADA', label: 'Validación aprobada', categoria: 'VALIDACION', tipoEvento: 'ETAPA' },
  VALIDACION_OBSERVADA: { codigo: 'VALIDACION_OBSERVADA', label: 'Validación observada', categoria: 'VALIDACION', tipoEvento: 'OBSERVACION' },
  CUADRO_COMPARATIVO_GENERADO: { codigo: 'CUADRO_COMPARATIVO_GENERADO', label: 'Cuadro Comparativo generado', categoria: 'APROBACION', tipoEvento: 'ETAPA' },
  CUADRO_COMPARATIVO_ADJUDICADO: { codigo: 'CUADRO_COMPARATIVO_ADJUDICADO', label: 'Cuadro Comparativo adjudicado', categoria: 'APROBACION', tipoEvento: 'ETAPA' },
  CUADRO_COMPARATIVO_FIRMADO: { codigo: 'CUADRO_COMPARATIVO_FIRMADO', label: 'Cuadro Comparativo firmado', categoria: 'APROBACION', tipoEvento: 'ETAPA' },
  CUADRO_COMPARATIVO_DERIVADO: { codigo: 'CUADRO_COMPARATIVO_DERIVADO', label: 'Cuadro Comparativo derivado a CCP', categoria: 'DERIVACION', tipoEvento: 'DERIVACION' },

  // Módulo / workflow
  RECIBIDO: { codigo: 'RECIBIDO', label: 'Recibido', categoria: 'ETAPA', tipoEvento: 'ETAPA' },
  EN_PROCESO: { codigo: 'EN_PROCESO', label: 'En proceso', categoria: 'ETAPA', tipoEvento: 'ETAPA' },
  REQUERIMIENTO_CREADO: { codigo: 'REQUERIMIENTO_CREADO', label: 'Requerimiento creado', categoria: 'ETAPA', tipoEvento: 'ETAPA' },
});

export const EVENTOS_FUNCIONALES_LIST = Object.freeze(Object.values(EVENTOS_FUNCIONALES));

const MAPA_DERIVACION_MODULO = Object.freeze({
  DEC: 'DERIVADO_A_DEC',
  'DEC': 'DERIVADO_A_DEC',
  Programación: 'DERIVADO_A_PROGRAMACION',
  PROGRAMACION: 'DERIVADO_A_PROGRAMACION',
  'Coordinación CM': 'DERIVADO_A_COORDINACION_CM',
  ACTOS_PREPARATORIOS: 'DERIVADO_A_COORDINACION_CM',
  Invitaciones: 'DERIVADO_A_INVITACIONES',
  INVITACIONES: 'DERIVADO_A_INVITACIONES',
  Validación: 'DERIVADO_A_VALIDACION',
  VALIDACION: 'DERIVADO_A_VALIDACION',
  'Cuadro Comparativo': 'DERIVADO_A_CUADRO_COMPARATIVO',
  CUADRO_COMPARATIVO: 'DERIVADO_A_CUADRO_COMPARATIVO',
  CCP: 'DERIVADO_A_CCP',
  Ejecución: 'DERIVADO_A_EJECUCION',
  EJECUCION: 'DERIVADO_A_EJECUCION',
  Contrato: 'DERIVADO_A_CONTRATO',
  Liquidación: 'DERIVADO_A_LIQUIDACION',
});

export function obtenerEvento(codigo) {
  const key = String(codigo || '').trim();
  if (!key) return null;
  const direct = EVENTOS_FUNCIONALES[key] || EVENTOS_FUNCIONALES[key.toUpperCase()];
  if (direct) return direct;
  return EVENTOS_FUNCIONALES_LIST.find(
    (e) => e.codigo === key || e.codigo === key.toUpperCase(),
  ) || null;
}

export function obtenerEventoDerivacion(moduloDestino) {
  const m = String(moduloDestino || '').trim();
  const codigo = MAPA_DERIVACION_MODULO[m] || MAPA_DERIVACION_MODULO[m.toUpperCase()];
  return codigo ? obtenerEvento(codigo) : obtenerEvento('DERIVADO');
}

export function listarEventosPorCategoria(categoria) {
  return EVENTOS_FUNCIONALES_LIST.filter((e) => e.categoria === categoria);
}

export default EVENTOS_FUNCIONALES;
