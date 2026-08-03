/**
 * Workflow Guards — reglas base de validación (sin SQL productivo aún).
 * En esta fase: permisos declarados, flag de módulo, viáticos, idempotencia.
 */
import { validarTransicion, FEATURE_FLAGS_DEFAULT } from './workflowValidator.js';

export function assertWorkflowEnabled(moduleName, flags = {}) {
  const flagMap = {
    BASE: 'WORKFLOW_ENGINE_BASE',
    INVITACIONES: 'WORKFLOW_ENGINE_INVITACIONES',
    RECEPCION: 'WORKFLOW_ENGINE_RECEPCION',
    VALIDACIONES: 'WORKFLOW_ENGINE_VALIDACIONES',
    CUADRO: 'WORKFLOW_ENGINE_CUADRO',
    REGISTRO: 'WORKFLOW_ENGINE_REGISTRO',
    DEC: 'WORKFLOW_ENGINE_DEC',
    PROGRAMACION: 'WORKFLOW_ENGINE_PROGRAMACION',
    COORDINACION_CM: 'WORKFLOW_ENGINE_COORDINACION_CM',
    ORDENES: 'WORKFLOW_ENGINE_ORDENES',
    VIATICOS: 'WORKFLOW_ENGINE_VIATICOS',
  };
  const flag = flagMap[String(moduleName || '').toUpperCase()] || 'WORKFLOW_ENGINE_BASE';
  const value = flags[flag];
  if (value === true) return true;
  throw new Error(`WORKFLOW_FEATURE_DISABLED:${flag}`);
}

export function leerFlags(env = process.env) {
  return {
    WORKFLOW_ENGINE_BASE: env.WORKFLOW_ENGINE_BASE !== 'false',
    WORKFLOW_ENGINE_WRITE_ENABLED: env.WORKFLOW_ENGINE_WRITE_ENABLED === 'true',
    WORKFLOW_ENGINE_INVITACIONES: env.WORKFLOW_ENGINE_INVITACIONES === 'true',
    WORKFLOW_ENGINE_RECEPCION: env.WORKFLOW_ENGINE_RECEPCION === 'true',
    WORKFLOW_ENGINE_VALIDACIONES: env.WORKFLOW_ENGINE_VALIDACIONES === 'true',
    WORKFLOW_ENGINE_CUADRO: env.WORKFLOW_ENGINE_CUADRO === 'true',
    WORKFLOW_ENGINE_REGISTRO: env.WORKFLOW_ENGINE_REGISTRO === 'true',
    WORKFLOW_ENGINE_DEC: env.WORKFLOW_ENGINE_DEC === 'true',
    WORKFLOW_ENGINE_PROGRAMACION: env.WORKFLOW_ENGINE_PROGRAMACION === 'true',
    WORKFLOW_ENGINE_COORDINACION_CM: env.WORKFLOW_ENGINE_COORDINACION_CM === 'true',
    WORKFLOW_ENGINE_ORDENES: env.WORKFLOW_ENGINE_ORDENES === 'true',
    WORKFLOW_ENGINE_VIATICOS: env.WORKFLOW_ENGINE_VIATICOS === 'true',
  };
}

export function validarPermiso(transicion, contexto = {}) {
  if (contexto.permiso && transicion.permiso && contexto.permiso !== transicion.permiso) {
    return { valido: false, error: `permiso requerido: ${transicion.permiso}` };
  }
  if (!contexto.actor_id && !contexto.actor_rol) {
    return { valido: false, error: 'actor_id o actor_rol requerido' };
  }
  return { valido: true, error: null };
}

export default {
  assertWorkflowEnabled,
  leerFlags,
  validarPermiso,
  FEATURE_FLAGS_DEFAULT,
};