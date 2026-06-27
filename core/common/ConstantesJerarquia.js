/**
 * Jerarquía futura del SGC — interfaces preparadas, sin implementación operativa.
 *
 * REQUERIMIENTO → PAQUETE → SOLICITUD DE COTIZACIÓN → PROCESO DE CONTRATACIÓN → CCP → ORDEN DE COMPRA
 */

export const TIPOS_NODO_JERARQUIA = Object.freeze({
  REQUERIMIENTO: 'REQUERIMIENTO',
  PAQUETE: 'PAQUETE',
  SOLICITUD_COTIZACION: 'SOLICITUD_COTIZACION',
  PROCESO_CONTRATACION: 'PROCESO_CONTRATACION',
  CCP: 'CCP',
  ORDEN_COMPRA: 'ORDEN_COMPRA',
});

/** Campos multientidad del requerimiento — reservados para fases posteriores. */
export const CAMPOS_REQUERIMIENTO_FUTURO = Object.freeze([
  'entidad',
  'sede',
  'area',
  'dependencia',
  'programaPresupuestal',
]);

/**
 * Estructura vacía de referencia para nodos jerárquicos.
 * @returns {Object} plantilla de nodo sin datos operativos
 */
export function crearPlantillaNodoJerarquia(tipo, id = null) {
  return {
    tipo,
    id,
    padreId: null,
    hijos: [],
    metadata: {},
  };
}

/**
 * Estructura vacía de contexto multientidad del requerimiento.
 * @returns {Object} plantilla para extensión futura
 */
export function crearPlantillaContextoRequerimiento(requerimientoId = null) {
  return {
    requerimientoId,
    entidad: null,
    sede: null,
    area: null,
    dependencia: null,
    programaPresupuestal: null,
    jerarquia: crearPlantillaNodoJerarquia(TIPOS_NODO_JERARQUIA.REQUERIMIENTO, requerimientoId),
  };
}

export default {
  TIPOS_NODO_JERARQUIA,
  CAMPOS_REQUERIMIENTO_FUTURO,
  crearPlantillaNodoJerarquia,
  crearPlantillaContextoRequerimiento,
};
