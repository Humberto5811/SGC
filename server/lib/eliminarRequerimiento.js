/**
 * RC8.15.6G-8D1 / G-8D1A — Eliminación segura de requerimientos en etapa inicial.
 */
import { getClient } from '../db.js';
import { normalizarEtapaCodigo } from '../../shared/workflow/workflowContract.js';

export const MSG_REQUERIMIENTO_NO_ELIMINABLE = 'El requerimiento ya tiene movimientos posteriores y no puede eliminarse.';

const ETAPAS_ELIMINABLES = new Set(['REGISTRO', 'REGISTRADO']);

/** Tablas operativas: presencia de fila → 409 funcional. */
const TABLAS_BLOQUEO = [
  'ordenes_contratacion',
  'ccp_codigos',
  'ccp_solicitud_requerimientos',
  'ccp_firmados',
  'recepcion_bienes_expedientes',
  'solicitud_requerimientos',
  'invitacion_proveedores',
  'cotizaciones_proveedor',
  'orden_inicio_actividad',
  'entregable_estado_vigente',
  'entregable_asignaciones',
  'entregable_eventos',
];

/**
 * Artefactos iniciales del requerimiento, en orden FK seguro (hijos antes que padre).
 * [tabla, columna]
 */
const ARTEFACTOS_INICIALES_DELETE = [
  ['workflow_observaciones', 'expediente_id'],
  ['workflow_alertas', 'expediente_id'],
  ['workflow_eventos', 'expediente_id'],
  ['requerimientos_adjuntos', 'requerimiento_id'],
  ['requerimiento_pedidos', 'requerimiento_id'],
  ['paquete_requerimientos', 'requerimiento_id'],
  ['expediente_asignaciones', 'requerimiento_id'],
  ['expediente_estado_vigente', 'requerimiento_id'],
];

function httpError(message, status = 409, code = 'REQUERIMIENTO_NO_ELIMINABLE') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function rethrowDeleteError(err) {
  if (err?.status) throw err;
  if (err?.code === '23503') {
    throw httpError(MSG_REQUERIMIENTO_NO_ELIMINABLE);
  }
  throw err;
}

async function tablaExiste(client, tableName) {
  const { rows } = await client.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
    LIMIT 1
  `, [tableName]);
  return rows.length > 0;
}

async function columnaExiste(client, tableName, columnName) {
  const { rows } = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    LIMIT 1
  `, [tableName, columnName]);
  return rows.length > 0;
}

async function tieneFilasBloqueo(client, tableName, requerimientoId) {
  if (!(await tablaExiste(client, tableName))) return false;
  if (!(await columnaExiste(client, tableName, 'requerimiento_id'))) return false;
  const { rows } = await client.query(
    `SELECT 1 FROM ${tableName} WHERE requerimiento_id = $1 LIMIT 1`,
    [requerimientoId],
  );
  return rows.length > 0;
}

async function eliminarArtefactosIniciales(client, requerimientoId) {
  for (const [table, column] of ARTEFACTOS_INICIALES_DELETE) {
    if (!(await tablaExiste(client, table))) continue;
    if (!(await columnaExiste(client, table, column))) continue;
    await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [requerimientoId]);
  }
}

/**
 * @param {object} client
 * @param {number} requerimientoId
 * @returns {Promise<object>} fila requerimiento (locked)
 */
export async function assertPuedeEliminarRequerimiento(client, requerimientoId) {
  const rid = parseInt(requerimientoId, 10);
  if (!Number.isFinite(rid) || rid <= 0) {
    throw httpError('requerimientoId inválido', 400, 'INVALID_REQUERIMIENTO');
  }

  const { rows: reqs } = await client.query(
    'SELECT * FROM requerimientos WHERE id = $1 FOR UPDATE',
    [rid],
  );
  if (!reqs.length) {
    const err = new Error('No encontrado');
    err.status = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }
  const req = reqs[0];

  const { rows: ervRows } = await client.query(
    'SELECT etapa_codigo FROM expediente_estado_vigente WHERE requerimiento_id = $1',
    [rid],
  ).catch((err) => {
    if (err?.code === '42P01') return { rows: [] };
    throw err;
  });
  const etapaRaw = ervRows[0]?.etapa_codigo || req.estado_actual || 'REGISTRO';
  const etapa = String(normalizarEtapaCodigo(etapaRaw) || etapaRaw || '').toUpperCase();

  if (!ETAPAS_ELIMINABLES.has(etapa)) {
    throw httpError(MSG_REQUERIMIENTO_NO_ELIMINABLE);
  }

  let evRows = [];
  try {
    const { rows } = await client.query(`
      SELECT 1 FROM workflow_eventos
      WHERE expediente_id = $1
        AND UPPER(TRIM(evento_codigo)) <> 'REQUERIMIENTO_REGISTRADO'
      LIMIT 1
    `, [rid]);
    evRows = rows;
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }
  if (evRows.length) {
    throw httpError(MSG_REQUERIMIENTO_NO_ELIMINABLE);
  }

  for (const table of TABLAS_BLOQUEO) {
    if (await tieneFilasBloqueo(client, table, rid)) {
      throw httpError(MSG_REQUERIMIENTO_NO_ELIMINABLE);
    }
  }

  return req;
}

/** Elimina requerimiento inicial y registros auxiliares (tx + orden FK seguro). */
export async function eliminarRequerimientoInicial(requerimientoId) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const req = await assertPuedeEliminarRequerimiento(client, requerimientoId);
    const rid = Number(req.id);

    await eliminarArtefactosIniciales(client, rid);

    const { rows } = await client.query(
      'DELETE FROM requerimientos WHERE id = $1 RETURNING id, codigo, tipo, estado, estado_actual',
      [rid],
    );
    if (!rows.length) {
      throw httpError('No encontrado', 404, 'NOT_FOUND');
    }

    await client.query('COMMIT');
    return { ok: true, deleted: rows[0] };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    rethrowDeleteError(err);
  } finally {
    client.release();
  }
}

export default {
  MSG_REQUERIMIENTO_NO_ELIMINABLE,
  assertPuedeEliminarRequerimiento,
  eliminarRequerimientoInicial,
};
