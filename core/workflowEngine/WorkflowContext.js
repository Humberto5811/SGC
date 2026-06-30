/**
 * WorkflowContext — encapsula la información necesaria para decidir transiciones.
 * Adaptadores internos para compatibilidad con `estado_actual` y `sub_modulo_actual`.
 */
import {
  resolveEtapaFromRow,
  resolveModuloActualFromRow,
  resolveResponsableFromRow,
  resolveEstadoNegocioFromRow,
  parseHistorialEstadosReadOnly,
  etapaToModuloLabel,
  normalizarEtapa,
} from './WorkflowState.js';

export class WorkflowContext {
  /**
   * @param {Object} row - fila requerimiento (BD o API)
   * @param {Object} opts
   * @param {string} [opts.moduloConsulta] - módulo/etapa que consulta permisos
   * @param {string} [opts.moduloLabel] - etiqueta submódulo para Motor de Observaciones
   * @param {string} [opts.usuario] - usuario en sesión (futuro Event Engine)
   */
  constructor(row = {}, opts = {}) {
    this.raw = row;
    this.requerimientoId = row.id ?? row.requerimientoId ?? null;
    this.codigo = row.codigo ?? row.codigoRequerimiento ?? null;
    this.estado = resolveEstadoNegocioFromRow(row);
    this.estadoNegocio = this.estado;
    this.etapaActual = resolveEtapaFromRow(row);
    this.moduloActual = resolveModuloActualFromRow(row);
    this.subModuloActual = row.sub_modulo_actual || row.subModuloActual || this.moduloActual;
    this.responsable = resolveResponsableFromRow(row);
    this.responsableActual = row.responsable_actual || row.responsableActual || this.responsable;
    this.historialEstados = parseHistorialEstadosReadOnly(row.historial_estados || row.historialEstados);
    this.moduloConsulta = normalizarEtapa(opts.moduloConsulta) || opts.moduloConsulta || this.etapaActual;
    this.moduloLabel = opts.moduloLabel || etapaToModuloLabel(this.moduloConsulta) || this.moduloActual;
    this.usuario = opts.usuario || null;
    this.payload = typeof row.payload === 'string'
      ? (() => { try { return JSON.parse(row.payload || '{}'); } catch (_) { return {}; } })()
      : (row.payload || {});
  }

  /** Compatibilidad: campos legacy de trazabilidad. */
  get estado_actual() { return this.etapaActual; }
  get sub_modulo_actual() { return this.subModuloActual; }
  get responsable_actual() { return this.responsableActual; }

  toJSON() {
    return {
      requerimientoId: this.requerimientoId,
      codigo: this.codigo,
      estado: this.estado,
      etapaActual: this.etapaActual,
      moduloActual: this.moduloActual,
      subModuloActual: this.subModuloActual,
      responsable: this.responsable,
      moduloConsulta: this.moduloConsulta,
      moduloLabel: this.moduloLabel,
      historialEstadosCount: this.historialEstados.length,
    };
  }
}

export function crearWorkflowContext(row, opts) {
  return new WorkflowContext(row, opts);
}

export default WorkflowContext;
