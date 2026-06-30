/**
 * Puente servidor — Registro de Requerimiento → MigrationFacade (Fase 3A.2).
 * Modo paralelo: Workflow Engine + Event Engine + Legacy (ejecutarLegacy=true).
 */
import { crearCoreSGC } from '../../core/index.js';
import { crearMigrationFacade } from '../../core/workflowEngine/MigrationFacade.js';
import { query } from '../db.js';
import {
  inicializarTrazabilidad,
  registrarMovimiento,
  registrarSubsanacionDerivacion,
  enrichRequerimientoRow,
  inferAccion,
  ETAPAS,
} from './trazabilidad.js';

export const MODULO_REGISTRO = 'Registro de Requerimiento';
export const DESTINO_EVALUACION = 'Evaluación de Requerimiento';

let _facade = null;

function buildRegistroMigrationFacade() {
  const core = crearCoreSGC();
  const { eventEngine, estados } = core;

  const createWorkflowEngine = (row, opts, deps = {}) => core.crearWorkflowEngine(row, opts, {
    ...deps,
    estadoManager: estados,
    eventEngine,
    emitPlanEvents: false,
  });

  return crearMigrationFacade({
    eventEngine,
    createWorkflowEngine,
    estadoManager: estados,
    ejecutarLegacy: true,
    migrationLogEnabled: process.env.SGC_MIGRATION_LOG !== '0',
    legacy: {
      crear: async (row, _plan, payload) => {
        if (typeof payload.legacyExecutor === 'function') {
          return payload.legacyExecutor(row);
        }
        return inicializarTrazabilidad(row.id, payload.usuario || 'Sistema');
      },
      editar: async (row, _plan, payload) => {
        if (typeof payload.legacyExecutor === 'function') {
          return payload.legacyExecutor(row);
        }
        return { omitido: true, motivo: 'legacyExecutor no provisto' };
      },
      derivar: async (row, _plan, payload) => {
        if (typeof payload.legacyExecutor === 'function') {
          return payload.legacyExecutor(row);
        }
        return { omitido: true, motivo: 'legacyExecutor no provisto' };
      },
      subsanar: async (row, _plan, payload) => {
        if (typeof payload.legacyExecutor === 'function') {
          return payload.legacyExecutor(row);
        }
        return { omitido: true, motivo: 'legacyExecutor no provisto' };
      },
      observar: async (row, _plan, payload) => {
        if (typeof payload.legacyExecutor === 'function') {
          return payload.legacyExecutor(row);
        }
        return { omitido: true, motivo: 'legacyExecutor no provisto' };
      },
      aprobar: async (row, _plan, payload) => {
        if (typeof payload.legacyExecutor === 'function') {
          return payload.legacyExecutor(row);
        }
        return { omitido: true, motivo: 'legacyExecutor no provisto' };
      },
    },
  });
}

export function getRegistroMigrationFacade() {
  if (!_facade) _facade = buildRegistroMigrationFacade();
  return _facade;
}

export function esOrigenRegistro(origenSubmodulo) {
  return String(origenSubmodulo || MODULO_REGISTRO).trim() === MODULO_REGISTRO;
}

async function fetchRow(requerimientoId) {
  const { rows } = await query('SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
  return rows[0] || null;
}

/** R1 — alta de requerimiento (afterCreate). */
export async function ejecutarRegistroCrear(requerimientoId, usuario = 'Sistema') {
  const row = await fetchRow(requerimientoId);
  if (!row) return null;

  const facade = getRegistroMigrationFacade();
  const result = await facade.crear(row, {
    requerimientoId,
    usuario,
    legacyExecutor: () => inicializarTrazabilidad(requerimientoId, usuario),
  });

  if (!result.ok) return null;
  return result.legacy;
}

/**
 * R2 — edición vía CRUD genérico (afterUpdate).
 * @param {Object} ctx
 * @param {Object} ctx.row
 * @param {Object} ctx.prev
 * @param {Object} ctx.body
 * @param {Function} ctx.extractObservacionTrazabilidad
 */
export async function ejecutarRegistroEditar(ctx) {
  const { row, prev, body, extractObservacionTrazabilidad } = ctx;
  const cambioEstado = body.estado && body.estado !== prev.estado;
  const cambioPayload = body.payload != null && String(body.payload) !== String(prev.payload || '');

  if (!cambioEstado && !cambioPayload) return null;

  const freshRow = (await fetchRow(row.id)) || row;
  const usuario = body.usuario_modificacion || prev.usuario_modificacion || 'Sistema';

  const legacyExecutor = async () => {
    if (cambioEstado) {
      const observacion = extractObservacionTrazabilidad(
        body.payload != null ? body.payload : prev.payload,
        prev.estado,
        body.estado,
      );
      return registrarMovimiento({
        requerimientoId: row.id,
        estadoNuevo: body.estado,
        usuario,
        accion: inferAccion(prev.estado, body.estado),
        observacion,
      });
    }
    return registrarMovimiento({
      requerimientoId: row.id,
      estadoNuevo: freshRow.estado || prev.estado,
      usuario,
      accion: 'editado',
      observacion: 'Actualización del expediente',
    });
  };

  const facade = getRegistroMigrationFacade();
  const result = await facade.editar(freshRow, { usuario, legacyExecutor });
  if (!result.ok) return null;
  return result.legacy;
}

/**
 * R3 — solicitar aprobación (derivar a Evaluación).
 */
export async function ejecutarRegistroDerivar({ requerimientoId, usuario, legacyExecutor }) {
  const row = await fetchRow(requerimientoId);
  if (!row) return null;

  const facade = getRegistroMigrationFacade();
  const result = await facade.derivar(row, DESTINO_EVALUACION, {
    usuario: usuario || 'Usuario AU',
    legacyExecutor,
  });

  if (!result.ok) return null;
  return result.legacy;
}

/**
 * R4 — subsanación emitida desde Registro.
 * @param {Object} opts
 * @param {number|string} opts.requerimientoId
 * @param {Object} [opts.row] - fila antes de mutar payload (validación workflow)
 * @param {string} [opts.usuario]
 * @param {Function} opts.legacyExecutor
 */
export async function ejecutarRegistroSubsanar({ requerimientoId, row, usuario, legacyExecutor }) {
  const freshRow = row || await fetchRow(requerimientoId);
  if (!freshRow) return null;

  const facade = getRegistroMigrationFacade();
  const result = await facade.subsanar(freshRow, {
    usuario: usuario || 'Usuario AU',
    obsMotorValidado: true,
    legacyExecutor,
  });

  if (!result.ok) return null;
  return result.legacy;
}

export { enrichRequerimientoRow, ETAPAS };

export default {
  getRegistroMigrationFacade,
  ejecutarRegistroCrear,
  ejecutarRegistroEditar,
  ejecutarRegistroDerivar,
  ejecutarRegistroSubsanar,
  esOrigenRegistro,
};
