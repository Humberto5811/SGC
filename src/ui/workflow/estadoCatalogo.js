/**
 * RC8.6B — Catálogo visual institucional de estados (solo presentación).
 * No inventa códigos de Workflow; reutiliza labels canónicos cuando existen.
 * Sin colores hex/RGB ni estilos CSS aquí.
 */
import { getLabelEstado, normalizeEstadoCode } from '../../../shared/estadoExpedienteCatalog.js';

export const CATEGORIAS_VISUALES = Object.freeze([
  'PENDIENTE',
  'EN_PROCESO',
  'DERIVADO',
  'OBSERVADO',
  'DEVUELTO',
  'APROBADO',
  'COMPLETADO',
  'ANULADO',
  'FINALIZADO',
  'DESCONOCIDO',
]);

/** codigo → categoría visual */
const CATEGORIA_BY_CODE = Object.freeze({
  REQUERIMIENTO_REGISTRADO: 'PENDIENTE',
  REQUERIMIENTO_EN_EVALUACION: 'EN_PROCESO',
  REQUERIMIENTO_APROBADO: 'APROBADO',
  REQUERIMIENTO_EN_DEC: 'EN_PROCESO',
  REQUERIMIENTO_APROBADO_DEC: 'APROBADO',
  EN_PROGRAMACION: 'EN_PROCESO',
  PROGRAMACION_APROBADA: 'APROBADO',
  EN_COORDINACION_CM: 'EN_PROCESO',
  COORDINACION_CM_APROBADA: 'APROBADO',
  INVITACION_EN_ELABORACION: 'EN_PROCESO',
  INVITACION_ENVIADA: 'DERIVADO',
  CONSULTAS_RECIBIDAS: 'EN_PROCESO',
  CONSULTAS_ABSUELTAS: 'COMPLETADO',
  COTIZACIONES_RECIBIDAS: 'EN_PROCESO',
  VALIDACION_ENVIADA: 'DERIVADO',
  VALIDADO_POR_AU: 'APROBADO',
  VALIDACION_REVISADA_POR_AU: 'EN_PROCESO',
  PENDIENTE_ELABORAR: 'PENDIENTE',
  CUADRO_BORRADOR: 'EN_PROCESO',
  CUADRO_COMPARATIVO_GENERADO: 'EN_PROCESO',
  CUADRO_EN_COORDINACION_CM: 'EN_PROCESO',
  CUADRO_EN_DEC: 'EN_PROCESO',
  CUADRO_COMPARATIVO_APROBADO: 'APROBADO',
  DERIVADO_CCP: 'DERIVADO',
  ENVIADA_OPPM: 'DERIVADO',
  CCP_REGISTRADA: 'COMPLETADO',
  REGISTRO_ORDENES: 'EN_PROCESO',
  REGISTRO_ORDEN: 'EN_PROCESO',
  ORDEN_REGISTRADA: 'EN_PROCESO',
  ORDEN_LISTA_NOTIFICACION: 'EN_PROCESO',
  ORDEN_NOTIFICADA: 'DERIVADO',
  ORDEN_RECEPCION_CONFIRMADA: 'COMPLETADO',
  EN_EJECUCION: 'EN_PROCESO',
  ORDEN_ANULADA: 'ANULADO',
  ORDEN_RESUELTA: 'FINALIZADO',
  RECEPCION_BIENES_PENDIENTE: 'PENDIENTE',
  RECEPCION_BIENES_OBSERVADA: 'OBSERVADO',
  BIEN_RECIBIDO_ALMACEN: 'COMPLETADO',
  CONFORMIDAD_PENDIENTE_AU: 'PENDIENTE',
  CONFORMIDAD_RECIBIDA_AU: 'APROBADO',
  CONFORMIDAD_EN_COORDINACION_CM: 'EN_PROCESO',
  EXPEDIENTE_DERIVADO_PAGO: 'DERIVADO',
  OBSERVADO: 'OBSERVADO',
  OBSERVADO_COORDINADOR: 'OBSERVADO',
  OBSERVADO_DEC: 'OBSERVADO',
  ENTREGABLE_RECIBIDO_AREA_USUARIA: 'COMPLETADO',
  CONFORMIDAD_DERIVADA_ANALISTA: 'DERIVADO',
  // Etapas / códigos legacy frecuentes en bandejas
  REGISTRADO: 'PENDIENTE',
  EVALUACION: 'EN_PROCESO',
  DEC: 'EN_PROCESO',
  PROGRAMACION: 'EN_PROCESO',
  ACTOS_PREPARATORIOS: 'EN_PROCESO',
  COORDINACION_CM: 'EN_PROCESO',
  INVITACIONES: 'EN_PROCESO',
  RECEPCION_COTIZACIONES: 'EN_PROCESO',
  VALIDACION_USUARIO: 'EN_PROCESO',
  VALIDACIONES: 'EN_PROCESO',
  CUADRO_COMPARATIVO: 'EN_PROCESO',
  CCP: 'EN_PROCESO',
  EJECUCION: 'EN_PROCESO',
  FINALIZADO: 'FINALIZADO',
  TESORERIA: 'DERIVADO',
  DERIVACION_PAGO: 'DERIVADO',
});

const ICONO_BY_CATEGORIA = Object.freeze({
  PENDIENTE: 'bi-hourglass-split',
  EN_PROCESO: 'bi-arrow-repeat',
  DERIVADO: 'bi-box-arrow-right',
  OBSERVADO: 'bi-exclamation-triangle',
  DEVUELTO: 'bi-arrow-return-left',
  APROBADO: 'bi-check-circle',
  COMPLETADO: 'bi-check2-all',
  ANULADO: 'bi-x-circle',
  FINALIZADO: 'bi-flag',
  DESCONOCIDO: 'bi-question-circle',
});

const PRIORIDAD_BY_CATEGORIA = Object.freeze({
  ANULADO: 10,
  OBSERVADO: 20,
  DEVUELTO: 30,
  PENDIENTE: 40,
  EN_PROCESO: 50,
  DERIVADO: 60,
  APROBADO: 70,
  COMPLETADO: 80,
  FINALIZADO: 90,
  DESCONOCIDO: 0,
});

function titleCaseLabel(label) {
  const s = String(label || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @returns {{ codigo: string, label: string, categoria: string, icono: string, prioridad: number, tooltip: string }}
 */
export function getEstadoCatalogEntry(codigoRaw, labelHint = '') {
  const raw = String(codigoRaw || '').trim();
  const rawUpper = raw.toUpperCase().replace(/\s+/g, '_');
  // Preferir clave visual exacta antes de aliases de negocio:
  // normalizeEstadoCode('OBSERVADO') → CUADRO_EN_COORDINACION_CM (situación ≠ estado base).
  const codigo = (Object.prototype.hasOwnProperty.call(CATEGORIA_BY_CODE, rawUpper)
    ? rawUpper
    : (normalizeEstadoCode(raw) || rawUpper))
    || 'DESCONOCIDO';
  const fromCatalog = getLabelEstado(codigo === 'OBSERVADO' ? 'OBSERVADO' : codigo)
    || (codigo === 'OBSERVADO' ? 'Observado' : '');
  const label = titleCaseLabel(fromCatalog || labelHint || (codigo !== 'DESCONOCIDO' ? codigo.replace(/_/g, ' ').toLowerCase() : ''))
    || 'Estado no catalogado';
  const categoria = CATEGORIA_BY_CODE[codigo]
    || CATEGORIA_BY_CODE[rawUpper]
    || 'DESCONOCIDO';
  const icono = ICONO_BY_CATEGORIA[categoria] || ICONO_BY_CATEGORIA.DESCONOCIDO;
  const prioridad = PRIORIDAD_BY_CATEGORIA[categoria] ?? 0;
  return {
    codigo: codigo || 'DESCONOCIDO',
    label,
    categoria,
    icono,
    prioridad,
    tooltip: label,
  };
}

export function getCategoriaCssClass(categoria) {
  const c = String(categoria || 'DESCONOCIDO').toUpperCase();
  const map = {
    PENDIENTE: 'pending',
    EN_PROCESO: 'progress',
    DERIVADO: 'derived',
    OBSERVADO: 'observed',
    DEVUELTO: 'returned',
    APROBADO: 'approved',
    COMPLETADO: 'completed',
    ANULADO: 'cancelled',
    FINALIZADO: 'finalized',
    DESCONOCIDO: 'unknown',
  };
  return map[c] || 'unknown';
}

/** Garantiza un solo label por código canónico. */
export function assertUniqueLabels(entries = null) {
  const list = entries || Object.keys(CATEGORIA_BY_CODE).map((c) => getEstadoCatalogEntry(c));
  const byCode = new Map();
  for (const e of list) {
    if (!byCode.has(e.codigo)) byCode.set(e.codigo, e.label);
    else if (byCode.get(e.codigo) !== e.label) {
      return { ok: false, codigo: e.codigo, a: byCode.get(e.codigo), b: e.label };
    }
  }
  return { ok: true };
}

export default {
  CATEGORIAS_VISUALES,
  getEstadoCatalogEntry,
  getCategoriaCssClass,
  assertUniqueLabels,
};
