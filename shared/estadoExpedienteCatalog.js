/**
 * Catálogo central de estados del expediente SGC.
 * Consumible por FE y BE. Fuente única de códigos, labels, prioridad y aliases.
 *
 * Decisiones aprobadas:
 * - ORDEN_NOTIFICADA (aliases ORDEN_ENVIADA*)
 * - CCP_REGISTRADA (alias CCP_REGISTRADO)
 * - OBSERVADO = situación, no estado global aislado
 * - EXPEDIENTE_DERIVADO_PAGO = fin alcance actual
 * - ORDEN_RESUELTA = terminal
 */

export const SCOPE = Object.freeze({
  GLOBAL: 'GLOBAL',
  INTERNAL: 'INTERNAL',
  DOCUMENT: 'DOCUMENT',
  ENTITY: 'ENTITY',
  EVENT: 'EVENT',
  SITUATION: 'SITUATION',
});

export const SITUACIONES = Object.freeze({
  NORMAL: { codigo: 'NORMAL', label: 'Normal' },
  OBSERVADO: { codigo: 'OBSERVADO', label: 'Observado' },
  DEVUELTO: { codigo: 'DEVUELTO', label: 'Devuelto' },
  SUSPENDIDO: { codigo: 'SUSPENDIDO', label: 'Suspendido' },
  RESUELTO: { codigo: 'RESUELTO', label: 'Resuelto' },
  ANULADO: { codigo: 'ANULADO', label: 'Anulado' },
  CANCELADO: { codigo: 'CANCELADO', label: 'Cancelado' },
});

/** @type {ReadonlyArray<{ codigo: string, label: string, etapa: string, prioridad: number, scope: string, familia: string, tipos: string[], terminal?: boolean, reversible?: boolean, aliases?: string[], descripcion?: string, reserved?: boolean }>} */
const ESTADOS_DEF = [
  // —— Globales flujo común ——
  { codigo: 'REQUERIMIENTO_REGISTRADO', label: 'Requerimiento registrado', etapa: 'REGISTRADO', prioridad: 100, scope: SCOPE.GLOBAL, familia: 'requerimiento', tipos: ['todos'] },
  { codigo: 'REQUERIMIENTO_EN_EVALUACION', label: 'En evaluación', etapa: 'EVALUACION', prioridad: 110, scope: SCOPE.GLOBAL, familia: 'requerimiento', tipos: ['todos'] },
  { codigo: 'REQUERIMIENTO_APROBADO', label: 'Requerimiento aprobado', etapa: 'EVALUACION', prioridad: 120, scope: SCOPE.GLOBAL, familia: 'requerimiento', tipos: ['todos'] },
  { codigo: 'REQUERIMIENTO_EN_DEC', label: 'En DEC', etapa: 'DEC', prioridad: 200, scope: SCOPE.GLOBAL, familia: 'dec', tipos: ['todos'] },
  { codigo: 'REQUERIMIENTO_APROBADO_DEC', label: 'Aprobado por DEC', etapa: 'DEC', prioridad: 210, scope: SCOPE.GLOBAL, familia: 'dec', tipos: ['todos'] },
  { codigo: 'EN_PROGRAMACION', label: 'En programación', etapa: 'PROGRAMACION', prioridad: 220, scope: SCOPE.GLOBAL, familia: 'programacion', tipos: ['todos'], aliases: ['PROGRAMACION'] },
  { codigo: 'PROGRAMACION_APROBADA', label: 'Programación aprobada', etapa: 'PROGRAMACION', prioridad: 230, scope: SCOPE.GLOBAL, familia: 'programacion', tipos: ['todos'] },
  { codigo: 'EN_COORDINACION_CM', label: 'En Coordinación CM', etapa: 'ACTOS_PREPARATORIOS', prioridad: 300, scope: SCOPE.GLOBAL, familia: 'coordinacion_cm', tipos: ['todos'], aliases: ['ACTOS_PREPARATORIOS', 'COORDINACION_CM'] },
  { codigo: 'COORDINACION_CM_APROBADA', label: 'Coordinación CM aprobada', etapa: 'ACTOS_PREPARATORIOS', prioridad: 310, scope: SCOPE.GLOBAL, familia: 'coordinacion_cm', tipos: ['todos'] },
  { codigo: 'INVITACION_EN_ELABORACION', label: 'Invitación en elaboración', etapa: 'INVITACIONES', prioridad: 400, scope: SCOPE.GLOBAL, familia: 'invitaciones', tipos: ['todos'] },
  { codigo: 'INVITACION_ENVIADA', label: 'Invitación enviada', etapa: 'INVITACIONES', prioridad: 410, scope: SCOPE.GLOBAL, familia: 'invitaciones', tipos: ['todos'] },
  { codigo: 'CONSULTAS_RECIBIDAS', label: 'Consultas recibidas', etapa: 'INVITACIONES', prioridad: 420, scope: SCOPE.INTERNAL, familia: 'consultas', tipos: ['todos'] },
  { codigo: 'CONSULTAS_ABSUELTAS', label: 'Consultas absueltas', etapa: 'INVITACIONES', prioridad: 430, scope: SCOPE.INTERNAL, familia: 'consultas', tipos: ['todos'] },
  { codigo: 'COTIZACIONES_RECIBIDAS', label: 'Cotizaciones recibidas', etapa: 'RECEPCION_COTIZACIONES', prioridad: 510, scope: SCOPE.GLOBAL, familia: 'cotizacion', tipos: ['todos'] },
  { codigo: 'VALIDACION_ENVIADA', label: 'Validación enviada', etapa: 'VALIDACION_USUARIO', prioridad: 520, scope: SCOPE.INTERNAL, familia: 'validacion', tipos: ['todos'] },
  { codigo: 'VALIDADO_POR_AU', label: 'Validado por Área Usuaria', etapa: 'VALIDACION_USUARIO', prioridad: 530, scope: SCOPE.GLOBAL, familia: 'validacion', tipos: ['todos'] },
  { codigo: 'VALIDACION_REVISADA_POR_AU', label: 'Validación revisada por AU', etapa: 'VALIDACION_USUARIO', prioridad: 535, scope: SCOPE.INTERNAL, familia: 'validacion', tipos: ['todos'] },

  // —— Cuadro ——
  { codigo: 'PENDIENTE_ELABORAR', label: 'C.C. en elaboración', etapa: 'CUADRO_COMPARATIVO', prioridad: 580, scope: SCOPE.GLOBAL, familia: 'cuadro', tipos: ['todos'] },
  { codigo: 'CUADRO_BORRADOR', label: 'C.C. en elaboración', etapa: 'CUADRO_COMPARATIVO', prioridad: 585, scope: SCOPE.GLOBAL, familia: 'cuadro', tipos: ['todos'], aliases: ['BORRADOR', 'EN_ELABORACION', 'GENERADO', 'GENERADO_PRELIMINAR', 'ADJUDICADO'] },
  { codigo: 'CUADRO_COMPARATIVO_GENERADO', label: 'C.C. generado', etapa: 'CUADRO_COMPARATIVO', prioridad: 600, scope: SCOPE.GLOBAL, familia: 'cuadro', tipos: ['todos'] },
  { codigo: 'CUADRO_EN_COORDINACION_CM', label: 'C.C. en Coordinación CM', etapa: 'CUADRO_COMPARATIVO', prioridad: 610, scope: SCOPE.GLOBAL, familia: 'cuadro', tipos: ['todos'], aliases: ['PENDIENTE_COORDINADOR', 'FIRMADO_COORDINADOR'] },
  { codigo: 'CUADRO_EN_DEC', label: 'C.C. en DEC', etapa: 'CUADRO_COMPARATIVO', prioridad: 620, scope: SCOPE.GLOBAL, familia: 'cuadro', tipos: ['todos'], aliases: ['PENDIENTE_DEC'] },
  { codigo: 'CUADRO_COMPARATIVO_APROBADO', label: 'C.C. aprobado', etapa: 'CUADRO_COMPARATIVO', prioridad: 630, scope: SCOPE.GLOBAL, familia: 'cuadro', tipos: ['todos'], aliases: ['APROBADO_DEC', 'PENDIENTE_CCP', 'FIRMADO'] },
  { codigo: 'DERIVADO_CCP', label: 'Derivado a CCP', etapa: 'CCP', prioridad: 650, scope: SCOPE.GLOBAL, familia: 'ccp', tipos: ['todos'], aliases: ['DERIVADO_A_CCP'] },
  { codigo: 'ENVIADA_OPPM', label: 'Solicitud enviada a OPPM', etapa: 'CCP', prioridad: 680, scope: SCOPE.GLOBAL, familia: 'ccp', tipos: ['todos'], aliases: ['ENVIADO_OPPM', 'SOLICITUD_ENVIADA_OPPM'] },
  { codigo: 'CCP_REGISTRADA', label: 'CCP registrada', etapa: 'CCP', prioridad: 700, scope: SCOPE.GLOBAL, familia: 'ccp', tipos: ['todos'], aliases: ['CCP_REGISTRADO', 'REGISTRADO_CCP', 'CCP_CARGADO'] },

  // —— Órdenes ——
  { codigo: 'REGISTRO_ORDENES', label: 'Registro de órdenes', etapa: 'ORDEN', prioridad: 780, scope: SCOPE.GLOBAL, familia: 'orden', tipos: ['todos'], aliases: ['PENDIENTE_CCP_FIRMADO', 'CCP_FIRMADO_RECIBIDO', 'PENDIENTE_REGISTRO_ORDEN', 'REGISTRO_DE_ORDENES'] },
  { codigo: 'ORDEN_REGISTRADA', label: 'Orden registrada', etapa: 'ORDEN', prioridad: 800, scope: SCOPE.GLOBAL, familia: 'orden', tipos: ['todos'], aliases: ['ORDEN_BORRADOR', 'CRONOGRAMA_DEFINIDO'] },
  { codigo: 'ORDEN_LISTA_NOTIFICACION', label: 'Orden lista para notificación', etapa: 'ORDEN', prioridad: 820, scope: SCOPE.INTERNAL, familia: 'orden', tipos: ['todos'], aliases: ['ORDEN_FIRMADA', 'LISTA_NOTIFICACION'] },
  { codigo: 'ORDEN_NOTIFICADA', label: 'Orden notificada', etapa: 'ORDEN', prioridad: 840, scope: SCOPE.GLOBAL, familia: 'orden', tipos: ['todos'], aliases: ['ORDEN_ENVIADA', 'ORDEN_ENVIADA_PENDIENTE_CONFIRMACION', 'ORDEN_ENVIADA_PROVEEDOR', 'ENVIADO_PROVEEDOR', 'PENDIENTE_CONFIRMACION', 'NOTIFICADA', 'ORDEN_NOTIFICADA_PROVEEDOR'] },
  { codigo: 'ORDEN_RECEPCION_CONFIRMADA', label: 'Recepción de orden confirmada', etapa: 'ORDEN', prioridad: 860, scope: SCOPE.GLOBAL, familia: 'orden', tipos: ['todos'], aliases: ['RECEPCION_CONFIRMADA'] },
  { codigo: 'EN_EJECUCION', label: 'En ejecución', etapa: 'EJECUCION', prioridad: 880, scope: SCOPE.GLOBAL, familia: 'orden', tipos: ['todos'], aliases: ['ORDEN_EN_EJECUCION', 'DERIVADO_EJECUCION'] },
  { codigo: 'ORDEN_ANULADA', label: 'Orden anulada', etapa: 'ORDEN', prioridad: 50, scope: SCOPE.GLOBAL, familia: 'orden', tipos: ['todos'], terminal: true, reversible: false },

  // —— Recepción de bienes / conformidad ——
  {
    codigo: 'RECEPCION_BIENES_PENDIENTE',
    label: 'OC pendiente de recepción',
    etapa: 'RECEPCION_BIENES',
    prioridad: 900,
    scope: SCOPE.GLOBAL,
    familia: 'bienes',
    tipos: ['bienes'],
    aliases: ['OC_PENDIENTE_RECEPCION', 'PENDIENTE_RECEPCION_BIENES'],
    descripcion: 'Orden de compra de bienes notificada, pendiente de recepción en almacén',
  },
  {
    codigo: 'RECEPCION_BIENES_OBSERVADA',
    label: 'Recepción observada',
    etapa: 'RECEPCION_BIENES',
    prioridad: 905,
    scope: SCOPE.GLOBAL,
    familia: 'bienes',
    tipos: ['bienes'],
    aliases: ['RECEPCION_OBSERVADA', 'BIEN_RECEPCION_OBSERVADA'],
    descripcion: 'Recepción física con faltantes, defectos o diferencias de cantidad',
  },
  {
    codigo: 'BIEN_RECIBIDO_ALMACEN',
    label: 'Recibido por almacén',
    etapa: 'RECEPCION_BIENES',
    prioridad: 910,
    scope: SCOPE.GLOBAL,
    familia: 'bienes',
    tipos: ['bienes'],
    aliases: ['RECIBIDO_ALMACEN', 'RECEPCION_PARCIAL_ALMACEN'],
  },
  {
    codigo: 'CONFORMIDAD_PENDIENTE_AU',
    label: 'Conformidad pendiente AU',
    etapa: 'CONFORMIDAD',
    prioridad: 950,
    scope: SCOPE.GLOBAL,
    familia: 'conformidad',
    tipos: ['bienes'],
    aliases: ['ACTA_ENVIADA_AU'],
  },
  {
    codigo: 'CONFORMIDAD_RECIBIDA_AU',
    label: 'Conformidad recibida del AU',
    etapa: 'CONFORMIDAD',
    prioridad: 970,
    scope: SCOPE.GLOBAL,
    familia: 'conformidad',
    tipos: ['bienes'],
    aliases: ['ACTA_FIRMADA_AU_RECIBIDA'],
  },
  {
    codigo: 'CONFORMIDAD_EN_COORDINACION_CM',
    label: 'Conformidad en Coordinación CM',
    etapa: 'CONFORMIDAD',
    prioridad: 1000,
    scope: SCOPE.GLOBAL,
    familia: 'conformidad',
    tipos: ['bienes'],
    aliases: ['CONFORMIDAD_DERIVADA_COORDINACION_CM'],
  },

  // —— Terminales alcance actual ——
  { codigo: 'EXPEDIENTE_DERIVADO_PAGO', label: 'Expediente derivado a pago', etapa: 'PAGO', prioridad: 1100, scope: SCOPE.GLOBAL, familia: 'pago', tipos: ['todos'], terminal: false, descripcion: 'Fin operativo del SGC en el alcance actual' },
  { codigo: 'ORDEN_RESUELTA', label: 'Orden resuelta', etapa: 'RESOLUCION', prioridad: 1200, scope: SCOPE.GLOBAL, familia: 'resolucion', tipos: ['todos'], terminal: true, reversible: false },

  // —— Situaciones (no globales) ——
  { codigo: 'OBSERVADO', label: 'Observado', etapa: '', prioridad: 0, scope: SCOPE.SITUATION, familia: 'situacion', tipos: ['todos'], descripcion: 'Nunca usar como estado global aislado' },

  // —— Legacy cuadro observación (map a situación + base) ——
  { codigo: 'OBSERVADO_COORDINADOR', label: 'C.C. en Coordinación CM - Observado', etapa: 'CUADRO_COMPARATIVO', prioridad: 610, scope: SCOPE.GLOBAL, familia: 'cuadro', tipos: ['todos'], aliases: ['OBSERVADO'] },
  { codigo: 'OBSERVADO_DEC', label: 'C.C. en DEC - Observado', etapa: 'CUADRO_COMPARATIVO', prioridad: 620, scope: SCOPE.GLOBAL, familia: 'cuadro', tipos: ['todos'] },

  // —— Reservados post-orden (servicios / locadores) ——
  { codigo: 'ENTREGABLE_RECIBIDO_AREA_USUARIA', label: 'Entregable recibido', etapa: 'ENTREGABLE', prioridad: 920, scope: SCOPE.GLOBAL, familia: 'servicios', tipos: ['servicios'], reserved: true },
  { codigo: 'CONFORMIDAD_DERIVADA_ANALISTA', label: 'Conformidad asignada a analista', etapa: 'PAGO', prioridad: 1010, scope: SCOPE.GLOBAL, familia: 'conformidad', tipos: ['todos'], reserved: true },
];

const BY_CODE = Object.freeze(Object.fromEntries(ESTADOS_DEF.map((e) => [e.codigo, e])));

/** Alias → código canónico */
const ALIAS_MAP = (() => {
  const m = Object.create(null);
  for (const e of ESTADOS_DEF) {
    m[e.codigo] = e.codigo;
    for (const a of (e.aliases || [])) {
      m[String(a).toUpperCase()] = e.codigo;
    }
  }
  // Aliases explícitos adicionales
  m.CCP_REGISTRADO = 'CCP_REGISTRADA';
  m.REGISTRADO_CCP = 'CCP_REGISTRADA';
  m.CCP_CARGADO = 'CCP_REGISTRADA';
  m.ORDEN_ENVIADA = 'ORDEN_NOTIFICADA';
  m.ORDEN_ENVIADA_PENDIENTE_CONFIRMACION = 'ORDEN_NOTIFICADA';
  m.ORDEN_ENVIADA_PROVEEDOR = 'ORDEN_NOTIFICADA';
  m.ENVIADO_PROVEEDOR = 'ORDEN_NOTIFICADA';
  m.ORDEN_NOTIFICADA_PROVEEDOR = 'ORDEN_NOTIFICADA';
  m.PENDIENTE_CONFIRMACION = 'ORDEN_NOTIFICADA';
  m.NOTIFICADA = 'ORDEN_NOTIFICADA';
  m.DERIVADO_A_CCP = 'DERIVADO_CCP';
  m.EN_CCP = 'DERIVADO_CCP';
  m.CCP = 'DERIVADO_CCP';
  m.PENDIENTE_COORDINADOR = 'CUADRO_EN_COORDINACION_CM';
  m.FIRMADO_COORDINADOR = 'CUADRO_EN_COORDINACION_CM';
  m.PENDIENTE_DEC = 'CUADRO_EN_DEC';
  m.APROBADO_DEC = 'CUADRO_COMPARATIVO_APROBADO';
  m.PENDIENTE_CCP = 'CUADRO_COMPARATIVO_APROBADO';
  m.FIRMADO = 'CUADRO_COMPARATIVO_APROBADO';
  m.GENERADO = 'CUADRO_BORRADOR';
  m.GENERADO_PRELIMINAR = 'CUADRO_BORRADOR';
  m.ADJUDICADO = 'CUADRO_BORRADOR';
  m.BORRADOR = 'CUADRO_BORRADOR';
  m.EN_ELABORACION = 'CUADRO_BORRADOR';
  m.PENDIENTE_ELABORAR = 'PENDIENTE_ELABORAR';
  m.PENDIENTE = 'PENDIENTE_ELABORAR';
  m.PENDIENTE_DE_ELABORAR = 'PENDIENTE_ELABORAR';
  m.ELABORACION = 'CUADRO_BORRADOR';
  m.ENVIADO_OPPM = 'ENVIADA_OPPM';
  m.SOLICITUD_ENVIADA_OPPM = 'ENVIADA_OPPM';
  m.ORDEN_BORRADOR = 'ORDEN_REGISTRADA';
  m.CRONOGRAMA_DEFINIDO = 'ORDEN_REGISTRADA';
  m.ORDEN_FIRMADA = 'ORDEN_LISTA_NOTIFICACION';
  m.LISTA_NOTIFICACION = 'ORDEN_LISTA_NOTIFICACION';
  m.RECEPCION_CONFIRMADA = 'ORDEN_RECEPCION_CONFIRMADA';
  m.ORDEN_EN_EJECUCION = 'EN_EJECUCION';
  m.DERIVADO_EJECUCION = 'EN_EJECUCION';
  m.PENDIENTE_CCP_FIRMADO = 'REGISTRO_ORDENES';
  m.CCP_FIRMADO_RECIBIDO = 'REGISTRO_ORDENES';
  m.PENDIENTE_REGISTRO_ORDEN = 'REGISTRO_ORDENES';
  m.REGISTRO_DE_ORDENES = 'REGISTRO_ORDENES';
  m.OBSERVADO_COORDINADOR = 'CUADRO_EN_COORDINACION_CM'; // base; situación aparte
  m.OBSERVADO_DEC = 'CUADRO_EN_DEC';
  m.OBSERVADO = 'CUADRO_EN_COORDINACION_CM'; // situación aparte vía detectSituacion
  m.OC_PENDIENTE_RECEPCION = 'RECEPCION_BIENES_PENDIENTE';
  m.PENDIENTE_RECEPCION_BIENES = 'RECEPCION_BIENES_PENDIENTE';
  m.RECEPCION_OBSERVADA = 'RECEPCION_BIENES_OBSERVADA';
  m.BIEN_RECEPCION_OBSERVADA = 'RECEPCION_BIENES_OBSERVADA';
  m.RECIBIDO_ALMACEN = 'BIEN_RECIBIDO_ALMACEN';
  m.RECEPCION_PARCIAL_ALMACEN = 'BIEN_RECIBIDO_ALMACEN';
  m.ACTA_ENVIADA_AU = 'CONFORMIDAD_PENDIENTE_AU';
  m.ACTA_FIRMADA_AU_RECIBIDA = 'CONFORMIDAD_RECIBIDA_AU';
  m.CONFORMIDAD_DERIVADA_COORDINACION_CM = 'CONFORMIDAD_EN_COORDINACION_CM';
  return Object.freeze(m);
})();

const UNKNOWN_CODES = new Set();

export function getEstadoDef(codigo) {
  const c = normalizeEstadoCode(codigo);
  return BY_CODE[c] || null;
}

export function getCatalogoEstados() {
  return ESTADOS_DEF.slice();
}

export function getPrioridad(codigo) {
  const def = getEstadoDef(codigo);
  return def ? def.prioridad : -1;
}

export function getLabelEstado(codigo) {
  const def = getEstadoDef(codigo);
  return def ? def.label : (codigo || '');
}

export function isTerminalEstado(codigo) {
  const def = getEstadoDef(codigo);
  return !!(def && def.terminal);
}

/**
 * Normaliza cualquier código histórico al canónico.
 * Códigos desconocidos se registran y se devuelven en mayúsculas (no se ocultan).
 */
export function normalizeEstadoCode(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '_');
  if (!s) return '';
  if (ALIAS_MAP[s]) return ALIAS_MAP[s];
  if (BY_CODE[s]) return s;
  UNKNOWN_CODES.add(s);
  return s;
}

export function getUnknownEstadoCodes() {
  return [...UNKNOWN_CODES];
}

export function clearUnknownEstadoCodes() {
  UNKNOWN_CODES.clear();
}

/** Compat: lista de prioridad (mayor índice = más avanzado). */
export function getPrioridadLista() {
  return ESTADOS_DEF
    .filter((e) => e.scope === SCOPE.GLOBAL || e.codigo === 'ORDEN_LISTA_NOTIFICACION' || e.codigo === 'CUADRO_BORRADOR' || e.codigo === 'PENDIENTE_ELABORAR')
    .sort((a, b) => a.prioridad - b.prioridad)
    .map((e) => e.codigo);
}

export { ESTADOS_DEF as CATALOGO_ESTADOS, ALIAS_MAP, BY_CODE };
