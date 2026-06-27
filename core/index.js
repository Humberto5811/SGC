/**
 * Punto de entrada del SGC Core — fase 1 (sin integración con módulos legacy).
 */
import { crearContextoCore } from './common/Utils.js';
import { crearTimelineManager } from './trazabilidad/TimelineManager.js';
import { crearHistorialManager } from './trazabilidad/HistorialManager.js';
import { crearObservacionManager } from './trazabilidad/ObservacionManager.js';
import { crearAdjuntoManager } from './trazabilidad/AdjuntoManager.js';
import { crearAuditoriaManager } from './trazabilidad/AuditoriaManager.js';
import { crearEstadoManager } from './workflow/EstadoManager.js';
import { crearWorkflowManager } from './workflow/WorkflowManager.js';
import { crearDerivacionManager } from './workflow/DerivacionManager.js';
import { crearExpedienteManager } from './expediente/ExpedienteManager.js';

export { ESTADOS, ESTADOS_LIST, esEstadoValido, normalizarEstado } from './common/ConstantesEstados.js';
export {
  ACCIONES,
  TIPOS_OPERACION_AUDITORIA,
  TIPOS_ADJUNTO,
  ENTIDADES_ADJUNTABLES,
  TIPOS_EVENTO_TIMELINE,
} from './common/ConstantesEventos.js';
export {
  generarId,
  ahoraISO,
  crearStoreEnMemoria,
  crearContextoCore,
} from './common/Utils.js';

export { TimelineManager, crearTimelineManager } from './trazabilidad/TimelineManager.js';
export { HistorialManager, crearHistorialManager } from './trazabilidad/HistorialManager.js';
export { ObservacionManager, crearObservacionManager } from './trazabilidad/ObservacionManager.js';
export { AdjuntoManager, crearAdjuntoManager } from './trazabilidad/AdjuntoManager.js';
export { AuditoriaManager, crearAuditoriaManager } from './trazabilidad/AuditoriaManager.js';

export { EstadoManager, crearEstadoManager } from './workflow/EstadoManager.js';
export { WorkflowManager, crearWorkflowManager } from './workflow/WorkflowManager.js';
export { DerivacionManager, crearDerivacionManager } from './workflow/DerivacionManager.js';

export { ExpedienteManager, crearExpedienteManager } from './expediente/ExpedienteManager.js';

/** Factory — instancia todos los managers con contexto compartido. */
export function crearCoreSGC(opts = {}) {
  const ctx = crearContextoCore(opts);
  const timeline = crearTimelineManager(ctx);
  const historial = crearHistorialManager(ctx);
  const observaciones = crearObservacionManager(ctx);
  const adjuntos = crearAdjuntoManager(ctx);
  const auditoria = crearAuditoriaManager(ctx);
  const estados = crearEstadoManager();
  const workflow = crearWorkflowManager(ctx, { timeline, historial, estadoManager: estados });
  const derivaciones = crearDerivacionManager(ctx);
  const expediente = crearExpedienteManager(ctx, { timeline, historial, observaciones, adjuntos });

  return {
    ctx,
    timeline,
    historial,
    observaciones,
    adjuntos,
    auditoria,
    estados,
    workflow,
    derivaciones,
    expediente,
  };
}

export default { crearCoreSGC };
