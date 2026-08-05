/** Configuración de formatos de cotización por tipo de contratación (Portal Proveedores). */

export const COTIZACION_POR_TIPO = {
  Bienes: {
    propuestaTecnica: '05-A',
    propuestaEconomica: '05-B',
    labelTecnica: 'Anexo 05-A',
    labelEconomica: 'Anexo 05-B',
    downloadTecnica: 'downloadAnexo05A',
    downloadEconomica: 'downloadAnexo05B',
  },
  Servicios: {
    propuestaTecnica: '06-A',
    propuestaEconomica: '11',
    labelTecnica: 'Anexo 06-A',
    labelEconomica: 'Anexo 11',
    downloadTecnica: 'downloadAnexo06A',
    downloadEconomica: 'downloadAnexo11',
  },
  Locadores: {
    propuestaTecnica: '06-A',
    propuestaEconomica: '11',
    labelTecnica: 'Anexo 06-A',
    labelEconomica: 'Anexo 11',
    downloadTecnica: 'downloadAnexo06A',
    downloadEconomica: 'downloadAnexo11',
  },
};

export function normalizeTipoCotizacion(tipo) {
  const t = String(tipo || '').trim();
  // Locadores antes que Servicios: evita clasificar "Locación de servicios" como Servicios
  if (/locador|locaci[oó]n/i.test(t)) return 'Locadores';
  if (/servicio/i.test(t)) return 'Servicios';
  return 'Bienes';
}

export function getCotizacionConfig(tipo) {
  const key = normalizeTipoCotizacion(tipo);
  return COTIZACION_POR_TIPO[key] || COTIZACION_POR_TIPO.Bienes;
}

export function cantidadPorTipo(tipo, cantidad) {
  const t = normalizeTipoCotizacion(tipo);
  if (t === 'Servicios' || t === 'Locadores') return 1;
  return cantidad ?? 1;
}

/**
 * Unidad de medida para cotización portal/PDF.
 * Bienes: respeta el valor o UND.
 * Servicios/Locadores: prioriza el del requerimiento; UND/UNIDAD históricas → SERVICIO.
 */
export function unidadMedidaCotizacion(itemOrUm = {}, tipo = '') {
  const t = normalizeTipoCotizacion(
    tipo
    || itemOrUm?.tipo
    || itemOrUm?.tipo_contratacion
    || itemOrUm?.solicitud_tipo
    || '',
  );
  const raw = typeof itemOrUm === 'string'
    ? itemOrUm
    : String(itemOrUm?.unidad_medida || itemOrUm?.um || '').trim();
  if (t === 'Bienes') return raw || 'UND';
  const up = raw.toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (!raw || up === 'UND' || up === 'UNIDAD' || up === 'UNID' || up === 'U') return 'SERVICIO';
  if (up === 'SERVICIO' || up === 'SERVICIOS') return 'SERVICIO';
  return raw;
}

/** Etiqueta institucional Anexo 11 (Title Case). */
export function unidadMedidaAnexo11(itemOrUm = {}, tipo = 'Locadores') {
  const u = unidadMedidaCotizacion(itemOrUm, tipo);
  if (String(u).toUpperCase() === 'SERVICIO') return 'Servicio';
  return u;
}


/** Textos oficiales — ANEXO Nº 06-A / 06-B (modelo Word INS). */
export const TEXTO_CONFIRMACION_TR_06A =
  'Asimismo, confirmamos haber leído los términos de referencia del presente requerimiento y que nuestra propuesta técnica cumple con todos los aspectos descritos en el requerimiento remitido.';

export const TEXTO_FORMA_PAGO_DEFAULT_06A = 'De acuerdo a lo indicado en al Requerimiento.';

export const TEXTO_AUTORIZACION_CORREO_06 =
  'Asimismo, AUTORIZO que el correo electrónico consignado en la presente Declaración Jurada sea utilizado como medio formal de comunicación con la Entidad para que me notifique las siguientes actuaciones: i) emisión de la Orden o Contrato, ii) ampliación de plazo, iii) otras modificaciones a la Orden o Contrato, iv) Observaciones y Levantamiento de Observaciones al producto o entregable, v) apercibimiento para cumplimiento de obligaciones contractuales, vi) Resolución Parcial o Total del Contrato u Orden, vii) comunicación de penalidades y descargos respectivos; y viii) otras actuaciones durante la etapa de ejecución contractual.';

export const GLOSA_SERVICIOS_06B_TODO_COSTO =
  'La presente cotización es a todo costo, incluye todos los tributos, seguros, transportes, inspecciones, pruebas, seguridad en el trabajo y de ser el caso, los costos laborales conforme a la legislación vigente, así como cualquier otro concepto que sea aplicable y pueda incidir sobre el valor del servicio a contratar. En caso que el precio se encuentre exonerado del IGV, indicarlo.';

export const GLOSA_SERVICIOS_06B_CONFIRMACION =
  'Asimismo, confirmamos que la presente cotización cumple con todos los aspectos descritos en el requerimiento remitido.';

export const GLOSA_SERVICIOS_06B = `${GLOSA_SERVICIOS_06B_TODO_COSTO}\n\n${GLOSA_SERVICIOS_06B_CONFIRMACION}`;

/** Textos oficiales — ANEXO Nº 11 (modelo Word INS). */
export const IMPORTANTE_ANEXO11 =
  'IMPORTANTE: El detalle de la información a consignar en el presente cuadro podrá ser modificado, en función a la cantidad de entregables establecidos en los términos de referencia.';

export const CONFIRMACION_ANEXO11 =
  'Asimismo, confirmamos que la presente cotización cumple con todos los aspectos descritos en los términos de referencia y requisitos contenidos en el requerimiento remitido.';

export const GLOSA_LOCADORES_FORMA_PAGO = 'Forma de pago: De acuerdo a lo indicado en los términos de referencia.';

export const DECLARO_CONOCER_ANEXO11 =
  'Declaro conocer, aceptar y someterme a las características, condiciones y requisitos establecidos en los Términos de Referencia.';

export const GLOSA_PENALIDAD_ANEXO11 =
  'En caso de retraso injustificado en la ejecución de las prestaciones objeto del contrato menor, la entidad contratante le aplica al proveedor una penalidad por cada día de atraso que le sea imputable, hasta por un monto máximo equivalente al 10% del monto de la contratación o ítem correspondiente, que puede descontarse del pago del entregable o del pago final. En todos los casos, la penalidad se aplica automáticamente y se calcula de acuerdo con la siguiente fórmula:';

export const FORMULA_PENALIDAD_ANEXO11 =
  'Penalidad diaria = 0.10 x Monto de la contratación o ítem / F x Plazo en días del entregable';

export const FORMULA_F_ANEXO11 = 'F = 0.40';

export const CIERRE_PENALIDAD_ANEXO11 =
  'Una vez que se llega al monto máximo de la penalidad por mora, la entidad contratante puede optar por resolver el contrato menor.';

export const NOTA_COTIZACION_ANEXO11 =
  '* La cotización está de acuerdo a los términos de referencia solicitados.';

export const PLAZOS_ENTREGABLES_LABELS = [
  'Primer entregable: Hasta los',
  'Segundo entregable: Hasta los',
  'Tercer entregable: Hasta los',
  'Cuarto entregable: Hasta los',
  'Quinto entregable: Hasta los',
  'Sexto entregable: Hasta los',
];

export const MAX_ENTREGABLES_LOCADOR = 6;
