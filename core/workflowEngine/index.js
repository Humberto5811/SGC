/**
 * Punto de entrada del Workflow Engine — Fase 1 SGC.
 */
import { WorkflowEngine, crearWorkflowEngine } from './WorkflowEngine.js';
import { WorkflowContext, crearWorkflowContext } from './WorkflowContext.js';

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

export { WorkflowContext, crearWorkflowContext, WorkflowEngine, crearWorkflowEngine };

export default {
  WorkflowEngine,
  crearWorkflowEngine,
  WorkflowContext,
  crearWorkflowContext,
};
