/**
 * EventCatalog — catálogo único de eventos funcionales del SGC (Event Engine).
 * Extiende el catálogo legacy sin usar strings sueltos en consumidores.
 */
import {
  EVENTOS_FUNCIONALES,
  EVENTOS_FUNCIONALES_LIST,
  CATEGORIAS_EVENTO,
  obtenerEvento as obtenerEventoLegacy,
  obtenerEventoDerivacion,
  listarEventosPorCategoria,
} from '../common/CatalogoEventos.js';

/** Códigos canónicos — usar siempre estas constantes, nunca strings sueltos. */
export const EVENTOS = Object.freeze({
  // Requerimiento / workflow
  REQUERIMIENTO_CREADO: 'REQUERIMIENTO_CREADO',
  REQUERIMIENTO_EDITADO: 'REQUERIMIENTO_EDITADO',
  REQUERIMIENTO_RECIBIDO: 'REQUERIMIENTO_RECIBIDO',
  REQUERIMIENTO_APROBADO: 'REQUERIMIENTO_APROBADO',
  REQUERIMIENTO_DERIVADO: 'REQUERIMIENTO_DERIVADO',
  REQUERIMIENTO_RECHAZADO: 'REQUERIMIENTO_RECHAZADO',
  REQUERIMIENTO_DEVUELTO: 'REQUERIMIENTO_DEVUELTO',
  REQUERIMIENTO_ARCHIVADO: 'REQUERIMIENTO_ARCHIVADO',
  REQUERIMIENTO_FINALIZADO: 'REQUERIMIENTO_FINALIZADO',

  // Observaciones (Event Engine — capa de distribución)
  OBSERVACION_EMITIDA: 'OBSERVACION_EMITIDA',
  OBSERVACION_RECIBIDA: 'OBSERVACION_RECIBIDA',
  OBSERVACION_ATENDIDA: 'OBSERVACION_ATENDIDA',
  OBSERVACION_SUBSANADA: 'OBSERVACION_SUBSANADA',
  OBSERVACION_CERRADA: 'OBSERVACION_CERRADA',

  // Subsanaciones
  SUBSANACION_INICIADA: 'SUBSANACION_INICIADA',
  SUBSANACION_REGISTRADA: 'SUBSANACION_REGISTRADA',
  SUBSANACION_ENVIADA: 'SUBSANACION_ENVIADA',
  SUBSANACION_ACEPTADA: 'SUBSANACION_ACEPTADA',
  SUBSANACION_RECIBIDA: 'SUBSANACION_RECIBIDA',

  // Invitaciones / cotizaciones
  INVITACION_GENERADA: 'INVITACION_GENERADA',
  INVITACION_ENVIADA: 'INVITACION_ENVIADA',
  INVITACION_ACEPTADA: 'INVITACION_ACEPTADA',
  SC_GENERADA: 'SC_GENERADA',
  COTIZACION_RECIBIDA: 'COTIZACION_RECIBIDA',

  // Validación / comparativo / CCP / contrato / orden
  VALIDACION_REGISTRADA: 'VALIDACION_REGISTRADA',
  VALIDACION_APROBADA: 'VALIDACION_APROBADA',
  VALIDACION_OBSERVADA: 'VALIDACION_OBSERVADA',
  CUADRO_COMPARATIVO_GENERADO: 'CUADRO_COMPARATIVO_GENERADO',
  CUADRO_COMPARATIVO_ADJUDICADO: 'CUADRO_COMPARATIVO_ADJUDICADO',
  CUADRO_COMPARATIVO_FIRMADO: 'CUADRO_COMPARATIVO_FIRMADO',
  CUADRO_COMPARATIVO_DERIVADO: 'CUADRO_COMPARATIVO_DERIVADO',
  CUADRO_APROBADO_DEC: 'CUADRO_APROBADO_DEC',
  CCP_GENERADO: 'CCP_GENERADO',
  CCP_DERIVADO: 'CCP_DERIVADO',
  CCP_APROBADO: 'CCP_APROBADO',
  CONTRATO_GENERADO: 'CONTRATO_GENERADO',
  ORDEN_GENERADA: 'ORDEN_GENERADA',
  LIQUIDACION_REGISTRADA: 'LIQUIDACION_REGISTRADA',

  // Derivaciones explícitas
  DERIVADO: 'DERIVADO',
  DERIVADO_A_DEC: 'DERIVADO_A_DEC',
  DERIVADO_A_PROGRAMACION: 'DERIVADO_A_PROGRAMACION',
  DERIVADO_A_COORDINACION_CM: 'DERIVADO_A_COORDINACION_CM',
  DERIVADO_A_INVITACIONES: 'DERIVADO_A_INVITACIONES',
  DERIVADO_A_VALIDACION: 'DERIVADO_A_VALIDACION',
  DERIVADO_A_CUADRO_COMPARATIVO: 'DERIVADO_A_CUADRO_COMPARATIVO',
  DERIVADO_A_CCP: 'DERIVADO_A_CCP',
  DERIVADO_A_EJECUCION: 'DERIVADO_A_EJECUCION',
  DERIVADO_A_CONTRATO: 'DERIVADO_A_CONTRATO',
  DERIVADO_A_LIQUIDACION: 'DERIVADO_A_LIQUIDACION',

  // Documentos / expediente
  EXPEDIENTE_RECIBIDO: 'EXPEDIENTE_RECIBIDO',
  DOCUMENTO_AGREGADO: 'DOCUMENTO_AGREGADO',
  DOCUMENTO_ELIMINADO: 'DOCUMENTO_ELIMINADO',
  DOCUMENTO_ACTUALIZADO: 'DOCUMENTO_ACTUALIZADO',

  // Etapa genérica
  RECIBIDO: 'RECIBIDO',
  EN_PROCESO: 'EN_PROCESO',
  APROBADO: 'APROBADO',
});

const ALIAS_LEGACY = Object.freeze({
  OBSERVACION_REGISTRADA: EVENTOS.OBSERVACION_EMITIDA,
  OBSERVACION_ENVIADA: EVENTOS.OBSERVACION_EMITIDA,
  SOLICITUD_COTIZACION_CREADA: EVENTOS.SC_GENERADA,
  RECHAZADO: EVENTOS.REQUERIMIENTO_RECHAZADO,
  DEVUELTO: EVENTOS.REQUERIMIENTO_DEVUELTO,
  ARCHIVADO: EVENTOS.REQUERIMIENTO_ARCHIVADO,
});

/** Definiciones enriquecidas (Event Engine). */
export const EVENTO_DEFINICIONES = Object.freeze(
  Object.fromEntries(
    Object.values(EVENTOS).map((codigo) => {
      const legacy = obtenerEventoLegacy(codigo) || obtenerEventoLegacy(ALIAS_LEGACY[codigo]);
      if (legacy) {
        return [codigo, { ...legacy, codigo }];
      }
      const categoria = inferirCategoria(codigo);
      return [codigo, {
        codigo,
        label: humanizarCodigo(codigo),
        categoria,
        tipoEvento: inferirTipoEvento(categoria),
      }];
    }),
  ),
);

function inferirCategoria(codigo) {
  const c = String(codigo || '');
  if (/OBSERVACION/i.test(c)) return CATEGORIAS_EVENTO.OBSERVACION;
  if (/SUBSANACION/i.test(c)) return CATEGORIAS_EVENTO.SUBSANACION;
  if (/DERIVADO|DERIV/i.test(c)) return CATEGORIAS_EVENTO.DERIVACION;
  if (/INVITACION|COTIZACION|SC_/i.test(c)) return CATEGORIAS_EVENTO.INVITACION;
  if (/VALIDACION/i.test(c)) return CATEGORIAS_EVENTO.VALIDACION;
  if (/CONTRATO|ORDEN/i.test(c)) return CATEGORIAS_EVENTO.CONTRATO;
  if (/LIQUIDACION/i.test(c)) return CATEGORIAS_EVENTO.LIQUIDACION;
  if (/DOCUMENTO|EXPEDIENTE/i.test(c)) return CATEGORIAS_EVENTO.DOCUMENTO;
  if (/APROBADO|RECHAZADO|DEVUELTO|ARCHIVADO|FINALIZADO/i.test(c)) return CATEGORIAS_EVENTO.APROBACION;
  if (/RECIBIDO|CREADO|EDITADO|EN_PROCESO/i.test(c)) return CATEGORIAS_EVENTO.RECEPCION;
  return CATEGORIAS_EVENTO.ETAPA;
}

function inferirTipoEvento(categoria) {
  const map = {
    [CATEGORIAS_EVENTO.OBSERVACION]: 'OBSERVACION',
    [CATEGORIAS_EVENTO.SUBSANACION]: 'SUBSANACION',
    [CATEGORIAS_EVENTO.DERIVACION]: 'DERIVACION',
    [CATEGORIAS_EVENTO.DOCUMENTO]: 'ADJUNTO',
  };
  return map[categoria] || 'ETAPA';
}

function humanizarCodigo(codigo) {
  return String(codigo || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function normalizarCodigoEvento(codigo) {
  const key = String(codigo || '').trim();
  if (!key) return null;
  if (EVENTO_DEFINICIONES[key]) return key;
  const upper = key.toUpperCase();
  if (EVENTO_DEFINICIONES[upper]) return upper;
  const alias = ALIAS_LEGACY[key] || ALIAS_LEGACY[upper];
  if (alias) return alias;
  const legacyKey = Object.keys(EVENTOS_FUNCIONALES).find((k) => k === upper);
  if (legacyKey && EVENTOS[legacyKey]) return EVENTOS[legacyKey];
  return null;
}

export function obtenerEventoCatalogo(codigo) {
  const normalizado = normalizarCodigoEvento(codigo);
  if (!normalizado) return null;
  return EVENTO_DEFINICIONES[normalizado] || null;
}

export function esEventoValido(codigo) {
  return !!obtenerEventoCatalogo(codigo);
}

export function listarEventosCatalogo(categoria = null) {
  const all = Object.values(EVENTO_DEFINICIONES);
  if (!categoria) return all.slice();
  return all.filter((e) => e.categoria === categoria);
}

/** Mapeo plan Workflow Engine → evento canónico (Fase 2 integración). */
export function mapPlanWorkflowToEvento(plan = {}) {
  const tipo = String(plan.tipo || '').toLowerCase();
  if (tipo === 'aprobar') return EVENTOS.REQUERIMIENTO_APROBADO;
  if (tipo === 'derivar') {
    const dest = plan.destino || plan.moduloDestino || plan.etapaDestino;
    const def = dest ? obtenerEventoDerivacion(dest) : null;
    return def?.codigo && EVENTO_DEFINICIONES[def.codigo]
      ? def.codigo
      : EVENTOS.REQUERIMIENTO_DERIVADO;
  }
  if (tipo === 'observar') return EVENTOS.OBSERVACION_EMITIDA;
  if (tipo === 'subsanar') return EVENTOS.OBSERVACION_SUBSANADA;
  if (tipo === 'cerrar') return EVENTOS.OBSERVACION_CERRADA;
  return null;
}

export {
  EVENTOS_FUNCIONALES,
  EVENTOS_FUNCIONALES_LIST,
  CATEGORIAS_EVENTO,
  obtenerEventoDerivacion,
  listarEventosPorCategoria,
};

export default EVENTOS;
