/**
 * RC8.8 — Política de VISIBILIDAD de bandejas (separada del contrato Estado/Responsable).
 * Permisos/tipo/etapa afectan QUIÉN VE el expediente, nunca su estado/color/responsable.
 */
import { normalizarTipo, TIPOS_CONTRATACION } from '../../shared/workflow/tiposContratacion.js';

export const BANDEJA_CODIGOS = Object.freeze({
  VALIDACIONES: 'VALIDACIONES',
  CUADRO_COMPARATIVO: 'CUADRO_COMPARATIVO',
  CCP: 'CCP',
  REGISTRO_ORDENES: 'REGISTRO_ORDENES',
  RECEPCION_BIENES: 'RECEPCION_BIENES',
  RECEPCION_COTIZACIONES: 'RECEPCION_COTIZACIONES',
  INVITACIONES: 'INVITACIONES',
  CONSULTAS: 'CONSULTAS',
});

/** Etapas canónicas posteriores a CCP (trámite CCP concluido; sigue consultable). */
const ETAPAS_POST_CCP = new Set([
  'REGISTRO_ORDEN',
  'REGISTRO_ORDENES',
  'ORDEN',
  'RECEPCION_BIENES',
  'PRESENTACION_ENTREGABLES',
  'REVISION_COORDINADOR_CM',
  'CONFORMIDAD',
  'PAGOS',
  'FINALIZADO',
  'EN_EJECUCION',
]);

const ESTADOS_POST_CCP = new Set([
  'REGISTRO_ORDENES',
  'REGISTRO_ORDEN',
  'ORDEN_REGISTRADA',
  'ORDEN_LISTA_NOTIFICACION',
  'ORDEN_NOTIFICADA',
  'ORDEN_RECEPCION_CONFIRMADA',
  'EN_EJECUCION',
  'BIEN_RECIBIDO_ALMACEN',
  'RECEPCION_BIENES_PENDIENTE',
  'RECEPCION_BIENES_OBSERVADA',
  'EXPEDIENTE_DERIVADO_PAGO',
  'ORDEN_RESUELTA',
  'ORDEN_ANULADA',
  'FINALIZADO',
]);

export function tipoPermitidoEnBandeja(bandeja, tipoRaw) {
  const tipo = normalizarTipo(tipoRaw);
  const b = String(bandeja || '').toUpperCase();
  if (b === BANDEJA_CODIGOS.VALIDACIONES || b === BANDEJA_CODIGOS.CUADRO_COMPARATIVO) {
    // LOCACION: Recepción Cotizaciones → CCP → RO (nunca Validaciones ni Cuadro).
    return tipo === TIPOS_CONTRATACION.BIEN || tipo === TIPOS_CONTRATACION.SERVICIO;
  }
  if (b === BANDEJA_CODIGOS.RECEPCION_BIENES) {
    return tipo === TIPOS_CONTRATACION.BIEN;
  }
  return true;
}

export function esBandejaOperativa(bandeja) {
  const b = String(bandeja || '').toUpperCase();
  return [
    BANDEJA_CODIGOS.CCP,
    BANDEJA_CODIGOS.REGISTRO_ORDENES,
    BANDEJA_CODIGOS.RECEPCION_BIENES,
    BANDEJA_CODIGOS.VALIDACIONES,
    BANDEJA_CODIGOS.CUADRO_COMPARATIVO,
    BANDEJA_CODIGOS.RECEPCION_COTIZACIONES,
  ].includes(b);
}

/**
 * Bandejas que conservan filas históricas (pertenencia formal ≠ etapa vigente).
 * RC8.9 — CCP conserva expedientes con evidencia CCP aunque la etapa haya avanzado.
 */
export function esSeguimientoHistorico(bandeja) {
  const b = String(bandeja || '').toUpperCase();
  return [
    BANDEJA_CODIGOS.CCP,
    BANDEJA_CODIGOS.REGISTRO_ORDENES,
    BANDEJA_CODIGOS.INVITACIONES,
    BANDEJA_CODIGOS.CONSULTAS,
    BANDEJA_CODIGOS.RECEPCION_COTIZACIONES,
  ].includes(b);
}

export function etapaEsPostCcp({ etapaCodigo = '', estadoCodigo = '' } = {}) {
  const et = String(etapaCodigo || '').toUpperCase();
  const es = String(estadoCodigo || '').toUpperCase();
  return ETAPAS_POST_CCP.has(et) || ESTADOS_POST_CCP.has(es);
}

/**
 * Visibilidad en bandeja (NO altera contrato canónico).
 *
 * RC8.9 — CCP/RO:
 * - `operativo`: solo trámites abiertos en esa etapa.
 * - `historial` / `seguimiento`: conserva pertenencia formal (consulta).
 * - `todos` (CCP): operativo + histórico con evidencia (default listado CCP).
 */
export function puedeVerExpedienteEnBandeja({
  bandeja,
  tipo,
  etapaCodigo = '',
  estadoCodigo = '',
  modo = 'operativo', // 'operativo' | 'seguimiento' | 'historial' | 'todos'
  tieneEvidenciaCcp = false,
} = {}) {
  const b = String(bandeja || '').toUpperCase();
  if (!tipoPermitidoEnBandeja(b, tipo)) return false;

  if (modo === 'seguimiento' || modo === 'historial' || modo === 'todos') {
    if (b === BANDEJA_CODIGOS.CCP) {
      // Histórico CCP exige evidencia formal; operativo CCP no la exige aún.
      if (modo === 'todos') return true;
      return !!tieneEvidenciaCcp || !etapaEsPostCcp({ etapaCodigo, estadoCodigo });
    }
    return true;
  }

  // Operativo CCP: no listar si ya avanzó (usar modo historial/todos para consulta).
  if (b === BANDEJA_CODIGOS.CCP && etapaEsPostCcp({ etapaCodigo, estadoCodigo })) {
    return false;
  }

  return true;
}

/** Clasifica fila CCP: operativo (trámite abierto) vs historico (concluido/derivado). */
export function clasificarModoFilaCcp({ etapaCodigo = '', estadoCodigo = '' } = {}) {
  return etapaEsPostCcp({ etapaCodigo, estadoCodigo }) ? 'historico' : 'operativo';
}

/** SQL fragment helper: excluye LOCACION de Validaciones/Cuadro. */
export function sqlExcludeLocacion(aliasTipo = 'sc.tipo') {
  return `(
    UPPER(TRIM(COALESCE(${aliasTipo}, ''))) NOT IN ('LOCACION', 'LOCACIÓN', 'LOCACION DE SERVICIOS', 'LOCACIÓN DE SERVICIOS')
    AND UPPER(TRIM(COALESCE(${aliasTipo}, ''))) NOT LIKE 'LOCAC%'
  )`;
}

export default {
  BANDEJA_CODIGOS,
  tipoPermitidoEnBandeja,
  esBandejaOperativa,
  esSeguimientoHistorico,
  etapaEsPostCcp,
  puedeVerExpedienteEnBandeja,
  clasificarModoFilaCcp,
  sqlExcludeLocacion,
};
