/**
 * Punto de entrada del Workflow Engine — Fase 1 SGC.
 */
import { WorkflowEngine, crearWorkflowEngine } from './WorkflowEngine.js';
import { WorkflowContext, crearWorkflowContext } from './WorkflowContext.js';
import { MigrationFacade, crearMigrationFacade } from './MigrationFacade.js';

export {
  ETAPAS,
  ETAPA_META,
  FLUJO_ETAPAS,
  ESTADOS,
  ESTADOS_REQUERIMIENTO,
  FLUJO_REQUERIMIENTO,
  normalizarEtapa,
  mapEstadoNegocioToEtapa,
  resolveEtapaFromRow,
  resolveModuloActualFromRow,
  resolveResponsableFromRow,
  resolveEstadoNegocioFromRow,
  parseHistorialEstadosReadOnly,
  etapaToModuloLabel,
} from './WorkflowState.js';

export {
  TRANSICIONES_LINEALES,
  TRANSICIONES_POR_ACCION,
  obtenerSiguienteEtapa,
  obtenerEtapaAnterior,
  obtenerDestinoPorAccion,
  obtenerTransicionesPermitidas,
  validarTransicionEtapa,
} from './WorkflowTransitions.js';

export {
  ACCIONES as ACCIONES_WORKFLOW,
  PERMISOS_BASE_POR_ETAPA,
  puedeAccion,
  obtenerAccionesPermitidas,
  obtenerPermisosBase,
} from './WorkflowPermissions.js';

export { WorkflowContext, crearWorkflowContext } from './WorkflowContext.js';
export { WorkflowEngine, crearWorkflowEngine } from './WorkflowEngine.js';
export { MigrationFacade, crearMigrationFacade } from './MigrationFacade.js';
export { migrationLog, migrationWarn, isMigrationLogEnabled } from './MigrationLogger.js';
export { RegistroWorkflowAdapter, crearRegistroWorkflowAdapter, MODULO_REGISTRO } from './adapters/index.js';

export default {
  WorkflowEngine,
  crearWorkflowEngine,
  WorkflowContext,
  crearWorkflowContext,
  MigrationFacade,
  crearMigrationFacade,
};
