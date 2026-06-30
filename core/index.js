/**
 * Punto de entrada del SGC Core — Fase 2A (Requerimiento como entidad principal).
 */
import { crearContextoCore } from './common/Utils.js';
import { crearTimelineManager } from './trazabilidad/TimelineManager.js';
import { crearHistorialManager } from './trazabilidad/HistorialManager.js';
import { crearObservacionManager } from './trazabilidad/ObservacionManager.js';
import { crearTrazabilidadOrchestrator } from './trazabilidad/TrazabilidadOrchestrator.js';
import { crearAdjuntoManager } from './trazabilidad/AdjuntoManager.js';
import { crearAuditoriaManager } from './trazabilidad/AuditoriaManager.js';
import { crearEstadoManager } from './workflow/EstadoManager.js';
import { crearWorkflowManager } from './workflow/WorkflowManager.js';
import { crearDerivacionManager } from './workflow/DerivacionManager.js';
import { crearRequerimientoManager } from './requerimiento/RequerimientoManager.js';
import { crearExpedienteManager } from './expediente/ExpedienteManager.js';
import { crearWorkflowEngine } from './workflowEngine/index.js';
import { crearEventEngine } from './eventEngine/index.js';

export {
  ESTADOS,
  ESTADOS_REQUERIMIENTO,
  ESTADOS_OBSERVACION,
  CICLO_OBSERVACION,
  ESTADOS_MODULO,
  TRANSICIONES_CICLO_OBSERVACION,
  ESTADOS_OBSERVACION_LEGACY,
  ESTADOS_LEGACY,
  ESTADOS_LIST,
  FLUJO_REQUERIMIENTO,
  esEstadoValido,
  normalizarEstado,
} from './common/ConstantesEstados.js';
export {
  ENTIDAD_PRINCIPAL,
  ENTIDAD_DOCUMENTAL,
  ACCIONES,
  TIPOS_OPERACION_AUDITORIA,
  TIPOS_ADJUNTO,
  TIPOS_DOCUMENTO_EXPEDIENTE,
  ENTIDADES_ADJUNTABLES,
  TIPOS_EVENTO_TIMELINE,
  MODULOS_FLUJO,
  MODULOS_FUTUROS,
  CATEGORIAS_EVENTO,
  EVENTOS_FUNCIONALES,
  EVENTOS_FUNCIONALES_LIST,
  obtenerEvento,
  obtenerEventoDerivacion,
  listarEventosPorCategoria,
} from './common/ConstantesEventos.js';
export {
  TIPOS_NODO_JERARQUIA,
  CAMPOS_REQUERIMIENTO_FUTURO,
  crearPlantillaNodoJerarquia,
  crearPlantillaContextoRequerimiento,
} from './common/ConstantesJerarquia.js';
export {
  generarId,
  ahoraISO,
  crearStoreEnMemoria,
  crearContextoCore,
  resolverRequerimientoId,
  resolverCodigoRequerimiento,
  resolverIdLegacy,
} from './common/Utils.js';

export { TimelineManager, crearTimelineManager } from './trazabilidad/TimelineManager.js';
export { HistorialManager, crearHistorialManager } from './trazabilidad/HistorialManager.js';
export { ObservacionManager, crearObservacionManager } from './trazabilidad/ObservacionManager.js';
export { TrazabilidadOrchestrator, crearTrazabilidadOrchestrator } from './trazabilidad/TrazabilidadOrchestrator.js';
export { AdjuntoManager, crearAdjuntoManager } from './trazabilidad/AdjuntoManager.js';
export { AuditoriaManager, crearAuditoriaManager } from './trazabilidad/AuditoriaManager.js';

export { EstadoManager, crearEstadoManager } from './workflow/EstadoManager.js';
export { WorkflowManager, crearWorkflowManager } from './workflow/WorkflowManager.js';
export { DerivacionManager, crearDerivacionManager } from './workflow/DerivacionManager.js';

export {
  WorkflowEngine,
  crearWorkflowEngine,
  WorkflowContext,
  crearWorkflowContext,
  ETAPAS as ETAPAS_WORKFLOW_ENGINE,
  FLUJO_ETAPAS,
  ACCIONES_WORKFLOW,
  validarTransicionEtapa,
} from './workflowEngine/index.js';

export {
  EventEngine,
  crearEventEngine,
  EventContext,
  crearEventContext,
  EVENTOS as EVENTOS_ENGINE,
  CANALES as CANALES_EVENTO,
  RUTAS_DISTRIBUCION,
  obtenerEventoCatalogo,
} from './eventEngine/index.js';

export { RequerimientoManager, crearRequerimientoManager } from './requerimiento/RequerimientoManager.js';
export { ExpedienteManager, crearExpedienteManager } from './expediente/ExpedienteManager.js';

/** Factory — instancia todos los managers con contexto compartido. */
export function crearCoreSGC(opts = {}) {
  const ctx = crearContextoCore(opts);
  const timeline = crearTimelineManager(ctx);
  const historial = crearHistorialManager(ctx);
  const observaciones = crearObservacionManager(ctx, { timeline, historial });
  const adjuntos = crearAdjuntoManager(ctx);
  const auditoria = crearAuditoriaManager(ctx);
  const estados = crearEstadoManager();
  const workflow = crearWorkflowManager(ctx, { timeline, historial, estadoManager: estados });
  const derivaciones = crearDerivacionManager(ctx);
  const trazabilidad = crearTrazabilidadOrchestrator({
    timeline,
    historial,
    workflow,
    observaciones,
    derivaciones,
  });

  const requerimiento = crearRequerimientoManager(ctx, {
    timeline,
    historial,
    observaciones,
    adjuntos,
    auditoria,
    workflow,
    derivaciones,
  });

  const expediente = crearExpedienteManager(ctx, { adjuntos, requerimiento });
  requerimiento.expediente = expediente;

  const eventEngine = crearEventEngine();

  /** Factory auxiliar — no sustituye rutas operativas en Fase 1–2. */
  const workflowEngineFactory = (row, opts) => crearWorkflowEngine(row, opts, {
    estadoManager: estados,
    workflowManager: workflow,
    eventEngine,
    emitPlanEvents: true,
  });

  return {
    ctx,
    requerimiento,
    expediente,
    timeline,
    historial,
    observaciones,
    adjuntos,
    auditoria,
    estados,
    workflow,
    derivaciones,
    trazabilidad,
    eventEngine,
    workflowEngineFactory,
    crearWorkflowEngine: workflowEngineFactory,
    crearEventEngine: () => eventEngine,
  };
}

export default { crearCoreSGC };
