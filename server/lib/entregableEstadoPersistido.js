/**
 * RC8.15.6C-2A — Persistencia canónica por orden_entrega_id.
 *
 * Coexiste con expediente_estado_vigente. Las lecturas históricas hacen
 * fallback controlado al expediente global, pero las transiciones de este
 * módulo nunca mutan el requerimiento ni sus asignaciones.
 */
import { getClient, query } from '../db.js';
import { buildContratoCanonico } from './estadoResponsableCanonico.js';
import {
  buildEstadoLabels,
  FUENTE_RESPONSABLE,
  resolverResponsableSincero,
} from './expedienteEstadoPersistido.js';
import { getTransition } from '../../shared/workflow/transiciones.js';
import { ETAPAS } from '../../shared/workflow/etapas.js';
import { normalizarTipo } from '../../shared/workflow/tiposContratacion.js';

export const REGLA_AGREGACION_ENTREGABLES_FUTURA = Object.freeze({
  actualizaExpedienteGlobal: false,
  descripcion: 'Las transiciones por entregable, incluida DERIVACION_PAGO, no proyectan ni actualizan el expediente global. La agregación y el cierre global se definirán en una RC posterior.',
});

function httpError(message, status = 400, code = 'ENTREGABLE_ESTADO_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function runInTransaction(client, work) {
  if (client) return work(client);
  const tx = await getClient();
  try {
    await tx.query('BEGIN');
    const result = await work(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    try { await tx.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw error;
  } finally {
    tx.release();
  }
}

async function getEntregableContext(client, ordenEntregaId, { lock = false } = {}) {
  const eid = parseInt(ordenEntregaId, 10);
  if (!Number.isFinite(eid)) throw httpError('orden_entrega_id inválido');
  const { rows } = await client.query(`
    SELECT oe.id AS orden_entrega_id, oe.orden_id, oe.estado AS entrega_estado,
      oc.requerimiento_id, oc.tipo_orden, oc.tipo_contratacion,
      r.tipo AS requerimiento_tipo
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN requerimientos r ON r.id = oc.requerimiento_id
    WHERE oe.id = $1
    ${lock ? 'FOR UPDATE OF oe' : ''}
  `, [eid]);
  if (!rows.length) throw httpError('Entregable no encontrado', 404, 'ENTREGABLE_NO_ENCONTRADO');
  return rows[0];
}

async function getEstadoEspecifico(client, ordenEntregaId, { lock = false } = {}) {
  const estado = await client.query(`
    SELECT e.*,
      u.username AS responsable_username,
      COALESCE(NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.username), '')) AS responsable_nombre
    FROM entregable_estado_vigente e
    LEFT JOIN usuarios u ON u.id = e.responsable_usuario_id
    WHERE e.orden_entrega_id = $1
    ${lock ? 'FOR UPDATE OF e' : ''}
  `, [Number(ordenEntregaId)]);
  if (!estado.rows.length) return null;
  const asignacion = await client.query(`
    SELECT a.*,
      u.username AS usuario_username,
      COALESCE(NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.username), '')) AS usuario_nombre
    FROM entregable_asignaciones a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.orden_entrega_id = $1 AND a.activo = TRUE
    ${lock ? 'FOR UPDATE OF a' : ''}
  `, [Number(ordenEntregaId)]);
  return { estado: estado.rows[0], asignacion: asignacion.rows[0] || null };
}

async function getEstadoGlobalFallback(client, requerimientoId) {
  const estado = await client.query(`
    SELECT e.*,
      u.username AS responsable_username,
      COALESCE(NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.username), '')) AS responsable_nombre
    FROM expediente_estado_vigente e
    LEFT JOIN usuarios u ON u.id = e.responsable_usuario_id
    WHERE e.requerimiento_id = $1
  `, [Number(requerimientoId)]);
  if (!estado.rows.length) return null;
  const asignacion = await client.query(`
    SELECT a.*,
      u.username AS usuario_username,
      COALESCE(NULLIF(TRIM(u.nombre), ''), NULLIF(TRIM(u.username), '')) AS usuario_nombre
    FROM expediente_asignaciones a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.requerimiento_id = $1 AND a.activo = TRUE
  `, [Number(requerimientoId)]);
  return { estado: estado.rows[0], asignacion: asignacion.rows[0] || null };
}

function buildEntregableContract(context, persisted, fuenteEstado) {
  if (!persisted) return null;
  const contract = buildContratoCanonico(persisted.estado, persisted.asignacion);
  return {
    ...contract,
    ordenId: Number(context.orden_id),
    ordenEntregaId: Number(context.orden_entrega_id),
    requerimientoId: Number(context.requerimiento_id),
    fuenteEstado,
    fallbackGlobal: fuenteEstado === 'EXPEDIENTE_GLOBAL_FALLBACK',
  };
}

/** Lee estado específico y usa fallback global sin crear filas. */
export async function obtenerEstadoResponsableEntregable(ordenEntregaId, { client = null } = {}) {
  const run = client || { query };
  const context = await getEntregableContext(run, ordenEntregaId);
  const especifico = await getEstadoEspecifico(run, context.orden_entrega_id);
  if (especifico) return buildEntregableContract(context, especifico, 'ENTREGABLE');
  const global = await getEstadoGlobalFallback(run, context.requerimiento_id);
  return buildEntregableContract(context, global, 'EXPEDIENTE_GLOBAL_FALLBACK');
}

/** Lectura múltiple conservadora para bandejas; no realiza backfill. */
export async function listarEstadosResponsablesEntregables(ordenEntregaIds = [], { client = null } = {}) {
  const ids = [...new Set(
    ordenEntregaIds.map((id) => parseInt(id, 10)).filter(Number.isFinite),
  )];
  const entries = await Promise.all(
    ids.map((id) => obtenerEstadoResponsableEntregable(id, { client })),
  );
  return new Map(ids.map((id, index) => [id, entries[index]]));
}

/**
 * Inicializa explícitamente un entregable nuevo. La etapa siempre empieza en
 * PRESENTACION_ENTREGABLES y el responsable se copia del expediente vigente.
 * Esta función no se ejecuta como backfill ni durante lecturas.
 */
export async function inicializarEstadoResponsableEntregable(
  ordenEntregaId,
  { actualizadoPor = null, metadata = null, client = null } = {},
) {
  return runInTransaction(client, async (tx) => {
    const context = await getEntregableContext(tx, ordenEntregaId, { lock: true });
    const existente = await getEstadoEspecifico(tx, context.orden_entrega_id, { lock: true });
    if (existente) return buildEntregableContract(context, existente, 'ENTREGABLE');

    const global = await getEstadoGlobalFallback(tx, context.requerimiento_id);
    const globalContract = global ? buildContratoCanonico(global.estado, global.asignacion) : null;
    const responsableTipo = globalContract?.responsableTipo || 'PENDIENTE';
    const responsableUsuarioId = globalContract?.responsableUsuarioId || null;
    const responsableUnidad = globalContract?.responsableUnidad || null;
    const responsableFuente = globalContract?.responsableFuente || FUENTE_RESPONSABLE.PENDIENTE;
    const labels = buildEstadoLabels(ETAPAS.PRESENTACION_ENTREGABLES);

    await tx.query(`
      INSERT INTO entregable_estado_vigente (
        orden_id, orden_entrega_id, requerimiento_id,
        estado_codigo, estado_label, etapa_codigo, etapa_label,
        responsable_tipo, responsable_usuario_id, responsable_unidad,
        responsable_fuente, version, actualizado_por, metadata_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,$13::jsonb)
    `, [
      Number(context.orden_id),
      Number(context.orden_entrega_id),
      Number(context.requerimiento_id),
      labels.estadoCodigo,
      labels.estadoLabel,
      labels.etapaCodigo,
      labels.etapaLabel,
      responsableTipo,
      responsableUsuarioId,
      responsableUnidad,
      responsableFuente,
      actualizadoPor,
      metadata ? JSON.stringify(metadata) : null,
    ]);
    await tx.query(`
      INSERT INTO entregable_asignaciones (
        orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
        usuario_id, unidad_codigo, tipo_responsable, activo,
        asignado_por, motivo, origen_asignacion, metadata_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,'herencia_expediente',$10::jsonb)
    `, [
      Number(context.orden_id),
      Number(context.orden_entrega_id),
      Number(context.requerimiento_id),
      labels.etapaCodigo,
      responsableUsuarioId,
      responsableUnidad,
      responsableTipo,
      actualizadoPor,
      'Inicialización canónica por entregable',
      metadata ? JSON.stringify(metadata) : null,
    ]);

    const creado = await getEstadoEspecifico(tx, context.orden_entrega_id);
    return buildEntregableContract(context, creado, 'ENTREGABLE');
  });
}

/**
 * Transición canónica aislada por entregable. Valida la matriz compartida,
 * pero solo muta entregable_estado_vigente/asignaciones/eventos.
 */
export async function transicionarEntregable({
  ordenEntregaId,
  evento,
  usuarioOrigenId = null,
  ejecutadoPor = null,
  usuarioDestinoId = null,
  unidadDestino = null,
  motivo = null,
  metadata = null,
  client = null,
} = {}) {
  return runInTransaction(client, async (tx) => {
    const context = await getEntregableContext(tx, ordenEntregaId, { lock: true });
    if (String(context.entrega_estado || '').toUpperCase() !== 'ACTIVO') {
      throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
    }
    await inicializarEstadoResponsableEntregable(context.orden_entrega_id, {
      actualizadoPor: ejecutadoPor,
      metadata: { origen: 'transicion_entregable' },
      client: tx,
    });
    const previo = await getEstadoEspecifico(tx, context.orden_entrega_id, { lock: true });
    const tipo = normalizarTipo(context.tipo_contratacion)
      || normalizarTipo(context.requerimiento_tipo)
      || normalizarTipo(String(context.tipo_orden).toUpperCase() === 'OS' ? 'SERVICIO' : '');
    const eventoCodigo = String(evento || '').trim().toUpperCase();
    const transicion = getTransition({
      tipoContratacion: tipo,
      etapaOrigen: previo.estado.etapa_codigo,
      eventoCodigo,
    });
    if (!transicion) {
      throw httpError(
        `Transición no permitida para el entregable: ${tipo} ${previo.estado.etapa_codigo} ${eventoCodigo}`,
        409,
        'TRANSICION_ENTREGABLE_NO_PERMITIDA',
      );
    }

    const responsable = resolverResponsableSincero({
      usuarioDestinoId,
      unidadDestino: unidadDestino || transicion.responsable_destino,
      etapaCodigo: transicion.etapa_destino,
    });
    const labels = buildEstadoLabels(transicion.etapa_destino);
    const actor = String(ejecutadoPor || usuarioOrigenId || '').slice(0, 150) || null;

    await tx.query(`
      UPDATE entregable_asignaciones
      SET activo=FALSE, cerrado_por=$2, cerrado_at=NOW()
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [Number(context.orden_entrega_id), actor]);

    const { rows: estados } = await tx.query(`
      UPDATE entregable_estado_vigente
      SET estado_codigo=$2, estado_label=$3, etapa_codigo=$4, etapa_label=$5,
          responsable_tipo=$6, responsable_usuario_id=$7,
          responsable_unidad=$8, responsable_fuente=$9,
          version=version+1, actualizado_por=$10, actualizado_at=NOW(),
          metadata_json=$11::jsonb
      WHERE orden_entrega_id=$1
      RETURNING *
    `, [
      Number(context.orden_entrega_id),
      labels.estadoCodigo,
      labels.estadoLabel,
      labels.etapaCodigo,
      labels.etapaLabel,
      responsable.responsableTipo,
      responsable.responsableUsuarioId,
      responsable.responsableUnidad,
      responsable.responsableFuente,
      actor,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    const { rows: asignaciones } = await tx.query(`
      INSERT INTO entregable_asignaciones (
        orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
        usuario_id, unidad_codigo, tipo_responsable, activo,
        asignado_por, motivo, origen_asignacion, metadata_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,'transicion',$10::jsonb)
      RETURNING *
    `, [
      Number(context.orden_id),
      Number(context.orden_entrega_id),
      Number(context.requerimiento_id),
      labels.etapaCodigo,
      responsable.responsableUsuarioId,
      responsable.responsableUnidad,
      responsable.responsableTipo,
      actor,
      motivo,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    const { rows: eventos } = await tx.query(`
      INSERT INTO entregable_eventos (
        orden_id, orden_entrega_id, requerimiento_id, evento_codigo,
        estado_anterior_codigo, estado_anterior_label,
        estado_nuevo_codigo, estado_nuevo_label,
        etapa_anterior_codigo, etapa_nueva_codigo,
        responsable_anterior_tipo, responsable_anterior_usuario,
        responsable_anterior_unidad, responsable_nuevo_tipo,
        responsable_nuevo_usuario, responsable_nuevo_unidad,
        ejecutado_usuario_id, ejecutado_por, motivo, metadata_json
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb
      ) RETURNING *
    `, [
      Number(context.orden_id),
      Number(context.orden_entrega_id),
      Number(context.requerimiento_id),
      eventoCodigo,
      previo.estado.estado_codigo,
      previo.estado.estado_label,
      labels.estadoCodigo,
      labels.estadoLabel,
      previo.estado.etapa_codigo,
      labels.etapaCodigo,
      previo.estado.responsable_tipo,
      previo.estado.responsable_usuario_id,
      previo.estado.responsable_unidad,
      responsable.responsableTipo,
      responsable.responsableUsuarioId,
      responsable.responsableUnidad,
      usuarioOrigenId != null ? Number(usuarioOrigenId) : null,
      actor,
      motivo,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    return {
      estado: estados[0],
      asignacion: asignaciones[0],
      evento: eventos[0],
      expedienteGlobalActualizado: false,
    };
  });
}

/**
 * Reasigna la PERSONA responsable conservando la etapa workflow vigente.
 * Usado por observaciones dirigidas sin transicionarExpediente ni forzar etapa nueva.
 */
export async function reasignarResponsableEntregableMismaEtapa({
  ordenEntregaId,
  usuarioDestinoId,
  eventoCodigo = 'ENTREGABLE_OBSERVACION_DIRIGIDA',
  usuarioOrigenId = null,
  ejecutadoPor = null,
  motivo = null,
  metadata = null,
  client = null,
} = {}) {
  return runInTransaction(client, async (tx) => {
    const context = await getEntregableContext(tx, ordenEntregaId, { lock: true });
    if (String(context.entrega_estado || '').toUpperCase() !== 'ACTIVO') {
      throw httpError('El entregable no está ACTIVO', 409, 'ENTREGABLE_NO_ACTIVO');
    }
    await inicializarEstadoResponsableEntregable(context.orden_entrega_id, {
      actualizadoPor: ejecutadoPor,
      metadata: { origen: 'reasignacion_misma_etapa' },
      client: tx,
    });
    const previo = await getEstadoEspecifico(tx, context.orden_entrega_id, { lock: true });
    if (!previo?.estado) {
      throw httpError('Estado específico del entregable no inicializado', 409, 'ENTREGABLE_SIN_ESTADO');
    }
    const destinoId = Number(usuarioDestinoId);
    if (!Number.isInteger(destinoId) || destinoId <= 0) {
      throw httpError('usuario_destino_id debe ser un ID real', 400, 'USUARIO_DESTINO_ID_INVALIDO');
    }
    const responsable = resolverResponsableSincero({
      usuarioDestinoId: destinoId,
      unidadDestino: null,
      etapaCodigo: previo.estado.etapa_codigo,
    });
    const actor = String(ejecutadoPor || usuarioOrigenId || '').slice(0, 150) || null;
    const etapaCodigo = previo.estado.etapa_codigo;
    const labels = buildEstadoLabels(etapaCodigo, previo.estado.estado_codigo || etapaCodigo);
    const etapaLabel = labels.etapaLabel;
    const estadoLabel = labels.estadoLabel;

    await tx.query(`
      UPDATE entregable_asignaciones
      SET activo=FALSE, cerrado_por=$2, cerrado_at=NOW()
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [Number(context.orden_entrega_id), actor]);

    const { rows: estados } = await tx.query(`
      UPDATE entregable_estado_vigente
      SET responsable_tipo=$2, responsable_usuario_id=$3,
          responsable_unidad=$4, responsable_fuente=$5,
          estado_label=$6, etapa_label=$7, version=version+1,
          actualizado_por=$8, actualizado_at=NOW(),
          metadata_json=$9::jsonb
      WHERE orden_entrega_id=$1
      RETURNING *
    `, [
      Number(context.orden_entrega_id),
      responsable.responsableTipo,
      responsable.responsableUsuarioId,
      responsable.responsableUnidad,
      responsable.responsableFuente,
      estadoLabel,
      etapaLabel,
      actor,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    const { rows: asignaciones } = await tx.query(`
      INSERT INTO entregable_asignaciones (
        orden_id, orden_entrega_id, requerimiento_id, etapa_codigo,
        usuario_id, unidad_codigo, tipo_responsable, activo,
        asignado_por, motivo, origen_asignacion, metadata_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,'observacion_dirigida',$10::jsonb)
      RETURNING *
    `, [
      Number(context.orden_id),
      Number(context.orden_entrega_id),
      Number(context.requerimiento_id),
      etapaCodigo,
      responsable.responsableUsuarioId,
      responsable.responsableUnidad,
      responsable.responsableTipo,
      actor,
      motivo,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    const { rows: eventos } = await tx.query(`
      INSERT INTO entregable_eventos (
        orden_id, orden_entrega_id, requerimiento_id, evento_codigo,
        estado_anterior_codigo, estado_anterior_label,
        estado_nuevo_codigo, estado_nuevo_label,
        etapa_anterior_codigo, etapa_nueva_codigo,
        responsable_anterior_tipo, responsable_anterior_usuario,
        responsable_anterior_unidad, responsable_nuevo_tipo,
        responsable_nuevo_usuario, responsable_nuevo_unidad,
        ejecutado_usuario_id, ejecutado_por, motivo, metadata_json
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb
      ) RETURNING *
    `, [
      Number(context.orden_id),
      Number(context.orden_entrega_id),
      Number(context.requerimiento_id),
      String(eventoCodigo || 'ENTREGABLE_OBSERVACION_DIRIGIDA').slice(0, 80),
      previo.estado.estado_codigo,
      previo.estado.estado_label,
      previo.estado.estado_codigo,
      previo.estado.estado_label,
      previo.estado.etapa_codigo,
      etapaCodigo,
      previo.estado.responsable_tipo,
      previo.estado.responsable_usuario_id,
      previo.estado.responsable_unidad,
      responsable.responsableTipo,
      responsable.responsableUsuarioId,
      responsable.responsableUnidad,
      usuarioOrigenId != null ? Number(usuarioOrigenId) : null,
      actor,
      motivo,
      metadata ? JSON.stringify(metadata) : null,
    ]);

    return {
      estado: estados[0],
      asignacion: asignaciones[0],
      evento: eventos[0],
      etapa_conservada: etapaCodigo,
      expedienteGlobalActualizado: false,
    };
  });
}

export default {
  REGLA_AGREGACION_ENTREGABLES_FUTURA,
  obtenerEstadoResponsableEntregable,
  listarEstadosResponsablesEntregables,
  inicializarEstadoResponsableEntregable,
  transicionarEntregable,
  reasignarResponsableEntregableMismaEtapa,
};
