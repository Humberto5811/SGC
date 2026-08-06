/**
 * RC8.6A — Persistencia de estado/asignación vigente (fuente única).
 * Lectura/escritura atómica sobre expediente_estado_vigente + expediente_asignaciones.
 * No infiere responsable desde created_by / usuario_modificacion / centro.
 */
import { getEtapaMeta, getLabelEtapa } from '../../shared/workflow/etapas.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { getLabelEstado } from '../../shared/estadoExpedienteVigente.js';

export const FUENTE_RESPONSABLE = Object.freeze({
  ASIGNACION_EXPLICITA: 'asignacion_explicita',
  UNIDAD_ETAPA: 'unidad_etapa',
  PENDIENTE: 'pendiente',
  BACKFILL: 'backfill_inicial',
});

/** Mapea etapa canónica → código persistido en requerimientos.estado_actual (legacy). */
export function mapEtapaDestinoBD(destino) {
  if (destino === 'COORDINACION_CM') return 'ACTOS_PREPARATORIOS';
  if (destino === 'VALIDACIONES') return 'VALIDACION_USUARIO';
  if (destino === 'RECEPCION_BIENES' || destino === 'PRESENTACION_ENTREGABLES') return 'EN_EJECUCION';
  return destino;
}

export function resolverResponsableSincero({
  usuarioDestinoId = null,
  unidadDestino = null,
  etapaCodigo = '',
} = {}) {
  const uid = usuarioDestinoId != null && Number.isFinite(Number(usuarioDestinoId))
    ? Number(usuarioDestinoId)
    : null;
  if (uid) {
    return {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: unidadDestino || getEtapaMeta(etapaCodigo)?.responsableLabel || null,
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    };
  }
  const unidad = String(unidadDestino || getEtapaMeta(etapaCodigo)?.responsableLabel || '').trim();
  if (unidad) {
    return {
      responsableTipo: TIPO_RESPONSABLE.UNIDAD,
      responsableUsuarioId: null,
      responsableUnidad: unidad,
      responsableFuente: FUENTE_RESPONSABLE.UNIDAD_ETAPA,
    };
  }
  return {
    responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
    responsableUsuarioId: null,
    responsableUnidad: null,
    responsableFuente: FUENTE_RESPONSABLE.PENDIENTE,
  };
}

export function buildEstadoLabels(etapaCodigo, estadoCodigo = null) {
  const meta = getEtapaMeta(etapaCodigo);
  const etapaLabel = meta?.label || getLabelEtapa(etapaCodigo) || etapaCodigo;
  const codigo = estadoCodigo || etapaCodigo;
  const estadoLabel = getLabelEstado(codigo) || etapaLabel || codigo;
  return { estadoCodigo: codigo, estadoLabel, etapaCodigo, etapaLabel };
}

export async function getEstadoVigenteForUpdate(client, requerimientoId) {
  const { rows } = await client.query(
    `SELECT * FROM expediente_estado_vigente WHERE requerimiento_id = $1 FOR UPDATE`,
    [requerimientoId],
  );
  return rows[0] || null;
}

export async function getAsignacionActivaForUpdate(client, requerimientoId) {
  const { rows } = await client.query(
    `SELECT * FROM expediente_asignaciones
     WHERE requerimiento_id = $1 AND activo = TRUE
     FOR UPDATE`,
    [requerimientoId],
  );
  return rows[0] || null;
}

export async function cerrarAsignacionActiva(client, requerimientoId) {
  const { rows } = await client.query(
    `UPDATE expediente_asignaciones
     SET activo = FALSE, cerrado_at = NOW()
     WHERE requerimiento_id = $1 AND activo = TRUE
     RETURNING id`,
    [requerimientoId],
  );
  return rows;
}

export async function crearAsignacion(client, {
  requerimientoId,
  etapaCodigo,
  usuarioId = null,
  unidadCodigo = null,
  tipoResponsable = TIPO_RESPONSABLE.PENDIENTE,
  origenAsignacion = 'transicion',
  asignadoPor = null,
  motivo = null,
}) {
  const { rows } = await client.query(
    `INSERT INTO expediente_asignaciones (
       requerimiento_id, etapa_codigo, usuario_id, unidad_codigo,
       tipo_responsable, origen_asignacion, activo, asignado_at, asignado_por, motivo
     ) VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW(),$7,$8)
     RETURNING *`,
    [
      requerimientoId,
      etapaCodigo,
      usuarioId,
      unidadCodigo,
      tipoResponsable,
      origenAsignacion,
      asignadoPor,
      motivo,
    ],
  );
  return rows[0];
}

export async function upsertEstadoVigente(client, {
  requerimientoId,
  estadoCodigo,
  estadoLabel,
  etapaCodigo,
  etapaLabel,
  responsableTipo,
  responsableUsuarioId = null,
  responsableUnidad = null,
  responsableFuente,
  actualizadoPor = null,
  metadata = null,
}) {
  const { rows } = await client.query(
    `INSERT INTO expediente_estado_vigente (
       requerimiento_id, estado_codigo, estado_label, etapa_codigo, etapa_label,
       responsable_tipo, responsable_usuario_id, responsable_unidad, responsable_fuente,
       actualizado_at, actualizado_por, version, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,1,$11::jsonb)
     ON CONFLICT (requerimiento_id) DO UPDATE SET
       estado_codigo = EXCLUDED.estado_codigo,
       estado_label = EXCLUDED.estado_label,
       etapa_codigo = EXCLUDED.etapa_codigo,
       etapa_label = EXCLUDED.etapa_label,
       responsable_tipo = EXCLUDED.responsable_tipo,
       responsable_usuario_id = EXCLUDED.responsable_usuario_id,
       responsable_unidad = EXCLUDED.responsable_unidad,
       responsable_fuente = EXCLUDED.responsable_fuente,
       actualizado_at = NOW(),
       actualizado_por = EXCLUDED.actualizado_por,
       version = expediente_estado_vigente.version + 1,
       metadata_json = EXCLUDED.metadata_json
     RETURNING *`,
    [
      requerimientoId,
      estadoCodigo,
      estadoLabel,
      etapaCodigo,
      etapaLabel,
      responsableTipo,
      responsableUsuarioId,
      responsableUnidad,
      responsableFuente,
      actualizadoPor,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  return rows[0];
}

/**
 * RC8.6C — actualiza solo responsable vigente; no toca estado_codigo ni etapa_codigo.
 */
export async function actualizarResponsableVigente(client, {
  requerimientoId,
  responsableTipo,
  responsableUsuarioId = null,
  responsableUnidad = null,
  responsableFuente,
  actualizadoPor = null,
  metadataPatch = null,
}) {
  const { rows } = await client.query(
    `UPDATE expediente_estado_vigente SET
       responsable_tipo = $2,
       responsable_usuario_id = $3,
       responsable_unidad = $4,
       responsable_fuente = $5,
       actualizado_at = NOW(),
       actualizado_por = $6,
       version = version + 1,
       metadata_json = CASE
         WHEN $7::jsonb IS NULL THEN metadata_json
         ELSE COALESCE(metadata_json, '{}'::jsonb) || $7::jsonb
       END
     WHERE requerimiento_id = $1
     RETURNING *`,
    [
      requerimientoId,
      responsableTipo,
      responsableUsuarioId,
      responsableUnidad,
      responsableFuente,
      actualizadoPor,
      metadataPatch ? JSON.stringify(metadataPatch) : null,
    ],
  );
  return rows[0] || null;
}

/**
 * Sincroniza columnas legacy de requerimientos (secundarias).
 * responsable_actual: solo persona (id/username) o unidad/Pendiente — nunca created_by.
 */
export async function syncLegacyRequerimiento(client, {
  requerimientoId,
  etapaCodigo,
  estadoNegocio = null,
  responsableTipo,
  responsableUsuarioId = null,
  responsableUnidad = null,
  subModuloLabel = null,
}) {
  const etapaBD = mapEtapaDestinoBD(etapaCodigo);
  const meta = getEtapaMeta(etapaCodigo);
  const sub = subModuloLabel || meta?.submoduloLabel || etapaBD;
  let responsableLegacy = 'Pendiente de asignación';
  if (responsableTipo === TIPO_RESPONSABLE.PERSONA && responsableUsuarioId) {
    responsableLegacy = String(responsableUsuarioId);
  } else if (responsableTipo === TIPO_RESPONSABLE.UNIDAD && responsableUnidad) {
    responsableLegacy = String(responsableUnidad);
  }

  const params = [
    requerimientoId,
    etapaBD,
    sub,
    responsableLegacy,
  ];
  let sql = `
    UPDATE requerimientos SET
      estado_actual = $2,
      sub_modulo_actual = $3,
      responsable_actual = $4,
      fecha_estado_actual = NOW(),
      updated_at = NOW()`;
  if (estadoNegocio != null && String(estadoNegocio).trim() !== '') {
    params.push(String(estadoNegocio));
    sql += `, estado = $5`;
  }
  sql += ` WHERE id = $1`;
  await client.query(sql, params);
}

/** Batch: asignaciones activas + estado vigente enriquecido con usuarios (sin N+1). */
export async function loadEstadoAsignacionPersistidaBatch(requerimientoIds = [], client = null) {
  const ids = [...new Set(
    (requerimientoIds || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  const out = new Map();
  if (!ids.length) return out;

  const run = async (text, params) => (client
    ? client.query(text, params)
    : (await import('../db.js')).query(text, params));

  const nombreSql = `COALESCE(
    NULLIF(TRIM(u.nombre), ''),
    NULLIF(TRIM(CONCAT(COALESCE(u.apellidos, ''), ' ', COALESCE(u.nombres, ''))), ''),
    NULLIF(TRIM(u.username), ''),
    CASE WHEN u.id IS NOT NULL THEN 'Usuario #' || u.id::text ELSE NULL END
  )`;

  try {
    const [{ rows: estados }, { rows: asignaciones }] = await Promise.all([
      run(
        `SELECT e.*,
                u.username AS responsable_username,
                ${nombreSql} AS responsable_nombre
         FROM expediente_estado_vigente e
         LEFT JOIN usuarios u ON u.id = e.responsable_usuario_id
         WHERE e.requerimiento_id = ANY($1::int[])`,
        [ids],
      ),
      run(
        `SELECT a.*,
                u.username AS usuario_username,
                ${nombreSql} AS usuario_nombre
         FROM expediente_asignaciones a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.requerimiento_id = ANY($1::int[]) AND a.activo = TRUE`,
        [ids],
      ),
    ]);
    const asigByReq = new Map(asignaciones.map((a) => [Number(a.requerimiento_id), a]));
    for (const e of estados) {
      const rid = Number(e.requerimiento_id);
      out.set(rid, { estado: e, asignacion: asigByReq.get(rid) || null });
    }
    for (const [rid, a] of asigByReq) {
      if (!out.has(rid)) out.set(rid, { estado: null, asignacion: a });
    }
  } catch (err) {
    // Tabla aún no migrada: el resolvedor cae a legacy.
    if (err?.code !== '42P01') throw err;
  }
  return out;
}

export default {
  FUENTE_RESPONSABLE,
  mapEtapaDestinoBD,
  resolverResponsableSincero,
  buildEstadoLabels,
  getEstadoVigenteForUpdate,
  getAsignacionActivaForUpdate,
  cerrarAsignacionActiva,
  crearAsignacion,
  upsertEstadoVigente,
  actualizarResponsableVigente,
  syncLegacyRequerimiento,
  loadEstadoAsignacionPersistidaBatch,
};
