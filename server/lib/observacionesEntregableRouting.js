/**
 * RC8.15.6F-1 — Base canónica para routing institucional por entregable.
 *
 * El submódulo destino es un permiso institucional. No se interpreta como una
 * etapa workflow ni cambia por sí mismo la responsabilidad del entregable.
 */
import { getClient, query } from '../db.js';
import {
  MODULOS,
  getActividadesForSubmodulo,
  resolveUserPermissions,
} from './permissionsCatalog.js';
import { isAdminSecurityRole } from '../utils/userRoleCatalog.js';

const CODIGOS_DESTINO_HABILITADOS = Object.freeze([
  'REGISTRO_ORDENES_CONTRATACION',
]);

function findSubmodulo(codigo) {
  const code = String(codigo || '').trim().toUpperCase();
  for (const modulo of MODULOS) {
    const submodulo = modulo.submodulos.find((item) => item.id === code);
    if (submodulo) return { modulo, submodulo };
  }
  return null;
}

function submoduloLabel(codigo) {
  return findSubmodulo(codigo)?.submodulo?.label || String(codigo || '');
}

export const CATALOGO_DESTINOS_OBSERVACION = Object.freeze(
  CODIGOS_DESTINO_HABILITADOS.map((codigo) => {
    const found = findSubmodulo(codigo);
    if (!found) {
      throw new Error(`Submódulo de observaciones no existe en permissionsCatalog: ${codigo}`);
    }
    return Object.freeze({
      submodulo_codigo: found.submodulo.id,
      label: found.submodulo.label,
      permiso_requerido: 'VER',
      modulo: found.modulo.id,
      activo: true,
    });
  }),
);

function httpError(message, status = 400, code = 'OBSERVACION_ROUTING_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function obtenerDestinoObservacion(submoduloDestino) {
  const code = String(submoduloDestino || '').trim().toUpperCase();
  const destino = CATALOGO_DESTINOS_OBSERVACION.find(
    (item) => item.activo && item.submodulo_codigo === code,
  );
  if (!destino) {
    throw httpError(
      'Submódulo destino no habilitado para observaciones',
      400,
      'SUBMODULO_DESTINO_INVALIDO',
    );
  }
  return destino;
}

function usuarioCompatible(row, destino) {
  if (!row?.activo) return false;
  const permisos = resolveUserPermissions(row);
  const actividades = getActividadesForSubmodulo(permisos, destino.submodulo_codigo);
  return actividades.includes(destino.permiso_requerido);
}

function mapDestinatario(row) {
  return {
    id: Number(row.id),
    nombre: row.nombre
      || [row.apellidos, row.nombres].filter(Boolean).join(' ').trim()
      || row.username
      || row.dni
      || '',
    username: row.username || row.dni || '',
    cargo: row.cargo || '',
    rol: row.rol || '',
    centro: row.centro || row.codigo_centro_costo || '',
  };
}

export function clasificarObservacionEntregable(observacion = null) {
  if (!observacion) return null;
  const hasRouting = Boolean(observacion.workflow_observacion_id);
  const hasDestino = Number(observacion.usuario_destino_id) > 0;
  if (!hasRouting || !hasDestino) return 'LEGACY_SIN_ROUTING';
  return 'DIRIGIDA_CANONICA';
}

export function esEmisorObservacionEntregable(observacion = null, userCtx = null) {
  if (!observacion || !userCtx) return false;
  const uid = Number(userCtx.id);
  if (Number(observacion.usuario_origen_id) === uid) return true;
  const observado = String(observacion.observado_por || '').trim().toLowerCase();
  if (!observado) return false;
  const aliases = [
    userCtx.nombre,
    userCtx.username,
    userCtx.username && String(userCtx.username).includes('@')
      ? String(userCtx.username).split('@')[0]
      : null,
  ].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  return aliases.includes(observado);
}

/** Lista únicamente usuarios activos con acceso efectivo al submódulo destino. */
export async function listarDestinatariosObservacion({
  submoduloDestino,
  client = null,
} = {}) {
  const destino = obtenerDestinoObservacion(submoduloDestino);
  const run = client || { query };
  const { rows } = await run.query(`
    SELECT id, dni, username, apellidos, nombres, nombre, cargo, rol, activo,
      centro, codigo_centro_costo, permisos
    FROM usuarios
    WHERE activo=TRUE
    ORDER BY apellidos ASC NULLS LAST, nombres ASC NULLS LAST, id ASC
  `);
  return rows.filter((row) => usuarioCompatible(row, destino)).map(mapDestinatario);
}

/** Revalida por ID; los nombres libres nunca son una identidad canónica. */
export async function validarDestinatarioObservacion({
  submoduloDestino,
  usuarioDestinoId,
  client = null,
} = {}) {
  const destino = obtenerDestinoObservacion(submoduloDestino);
  const uid = Number(usuarioDestinoId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw httpError(
      'usuario_destino_id debe ser un ID real',
      400,
      'USUARIO_DESTINO_ID_INVALIDO',
    );
  }
  const run = client || { query };
  const { rows } = await run.query(`
    SELECT id, dni, username, apellidos, nombres, nombre, cargo, rol, activo,
      centro, codigo_centro_costo, permisos
    FROM usuarios
    WHERE id=$1
  `, [uid]);
  const row = rows[0];
  if (!row) {
    throw httpError('Usuario destino no encontrado', 404, 'USUARIO_DESTINO_NO_ENCONTRADO');
  }
  if (!row.activo) {
    throw httpError('Usuario destino inactivo', 409, 'USUARIO_DESTINO_INACTIVO');
  }
  if (!usuarioCompatible(row, destino)) {
    throw httpError(
      'Usuario destino sin permiso para el submódulo',
      403,
      'USUARIO_DESTINO_SIN_PERMISO',
    );
  }
  return mapDestinatario(row);
}

function mapObservacionDirigida(row) {
  return {
    workflow_observacion_id: Number(row.workflow_observacion_id),
    entregable_observacion_id: Number(row.entregable_observacion_id),
    requerimiento_id: Number(row.requerimiento_id),
    requerimiento_codigo: row.requerimiento_codigo || '',
    orden_id: Number(row.orden_id),
    orden_numero: row.orden_numero || '',
    orden_entrega_id: Number(row.orden_entrega_id),
    numero_entregable: Number(row.numero_entregable),
    proveedor: row.proveedor || '',
    origen_submodulo_codigo: row.origen_submodulo_codigo || '',
    origen_submodulo_label: submoduloLabel(row.origen_submodulo_codigo),
    destino_submodulo_codigo: row.destino_submodulo_codigo || '',
    destino_submodulo_label: submoduloLabel(row.destino_submodulo_codigo),
    usuario_origen_id: Number(row.usuario_origen_id),
    usuario_origen_nombre: row.usuario_origen_nombre || row.emitida_por || '',
    usuario_destino_id: Number(row.usuario_destino_id),
    usuario_destino_nombre: row.usuario_destino_nombre || row.responsable_subsanacion || '',
    motivo: row.motivo || '',
    estado_observacion: row.estado_observacion,
    fecha_emision: row.fecha_emision,
    fecha_atencion: row.fecha_atencion || null,
  };
}

/**
 * Bandeja personal. Ignora cualquier identidad externa: el filtro se obtiene
 * exclusivamente de userCtx; admin conserva override institucional.
 */
export async function listarMisObservacionesDirigidas({
  userCtx,
  estado = 'ABIERTAS',
  q = '',
  page = 1,
  pageSize = 25,
  client = null,
} = {}) {
  const uid = Number(userCtx?.id);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw httpError('Autenticación requerida', 401, 'AUTH_REQUIRED');
  }
  const run = client || { query };
  const admin = isAdminSecurityRole(userCtx);
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 25));
  const currentPage = Math.max(1, Number(page) || 1);
  const params = [];
  const where = ['wo.usuario_destino_id IS NOT NULL'];
  if (!admin) {
    params.push(uid);
    where.push(`wo.usuario_destino_id=$${params.length}`);
  }
  const estadoCodigo = String(estado || 'ABIERTAS').trim().toUpperCase();
  if (estadoCodigo === 'ABIERTAS') {
    where.push(`wo.estado IN ('OBS_EMITIDA','OBS_EN_ATENCION')`);
  } else if (['OBS_EMITIDA', 'OBS_EN_ATENCION', 'OBS_SUBSANADA', 'OBS_CERRADA'].includes(estadoCodigo)) {
    params.push(estadoCodigo);
    where.push(`wo.estado=$${params.length}`);
  }
  const search = String(q || '').trim();
  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    where.push(`(
      r.codigo ILIKE ${p}
      OR oc.numero_orden ILIKE ${p}
      OR COALESCE(p.razon_social,'') ILIKE ${p}
      OR wo.motivo ILIKE ${p}
    )`);
  }
  const from = `
    FROM workflow_observaciones wo
    JOIN entregable_observaciones eo ON eo.workflow_observacion_id=wo.id
    JOIN orden_entregas oe ON oe.id=eo.orden_entrega_id AND oe.orden_id=eo.orden_id
    JOIN ordenes_contratacion oc ON oc.id=eo.orden_id
      AND oc.requerimiento_id=wo.expediente_id
    JOIN entregable_recepciones er ON er.id=eo.recepcion_id
      AND er.orden_entrega_id=eo.orden_entrega_id AND er.orden_id=eo.orden_id
    LEFT JOIN requerimientos r ON r.id=wo.expediente_id
    LEFT JOIN proveedores p ON p.id=oc.proveedor_id
    LEFT JOIN usuarios uo ON uo.id=wo.usuario_origen_id
    LEFT JOIN usuarios ud ON ud.id=wo.usuario_destino_id
    WHERE ${where.join(' AND ')}
  `;
  const total = Number((await run.query(`SELECT COUNT(*)::int AS n ${from}`, params)).rows[0]?.n || 0);
  const dataParams = [...params, limit, (currentPage - 1) * limit];
  const { rows } = await run.query(`
    SELECT
      wo.id AS workflow_observacion_id,
      eo.id AS entregable_observacion_id,
      wo.expediente_id AS requerimiento_id,
      r.codigo AS requerimiento_codigo,
      eo.orden_id,
      oc.numero_orden AS orden_numero,
      eo.orden_entrega_id,
      oe.numero_entrega AS numero_entregable,
      p.razon_social AS proveedor,
      wo.origen_submodulo_codigo,
      wo.destino_submodulo_codigo,
      wo.usuario_origen_id,
      COALESCE(NULLIF(TRIM(uo.nombre),''), NULLIF(TRIM(uo.username),''), wo.emitida_por)
        AS usuario_origen_nombre,
      wo.usuario_destino_id,
      COALESCE(NULLIF(TRIM(ud.nombre),''), NULLIF(TRIM(ud.username),''), wo.responsable_subsanacion)
        AS usuario_destino_nombre,
      wo.emitida_por,
      wo.responsable_subsanacion,
      wo.motivo,
      wo.estado AS estado_observacion,
      wo.emitida_at AS fecha_emision,
      COALESCE(wo.subsanada_at, wo.cerrada_at, eo.subsanado_at) AS fecha_atencion
    ${from}
    ORDER BY wo.emitida_at DESC, wo.id DESC
    LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
  `, dataParams);
  return {
    data: rows.map(mapObservacionDirigida),
    meta: {
      total,
      page: currentPage,
      pageSize: limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      estado: estadoCodigo,
      admin_override: admin,
    },
  };
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

/**
 * Registra atómicamente routing institucional + observación específica.
 * No ejecuta transicionarEntregable: destino institucional y etapa workflow
 * son conceptos diferentes y su equivalencia debe definirse explícitamente.
 */
export async function registrarRoutingObservacionEntregable({
  requerimientoId,
  ordenId,
  ordenEntregaId,
  recepcionId,
  origen = 'ENTREGABLE_SERVICIO',
  origenSubmoduloCodigo = 'PRESENTACION_ENTREGABLES',
  destinoSubmoduloCodigo,
  usuarioOrigenId,
  usuarioDestinoId,
  motivo,
  documentos = [],
  diasPlazo = 5,
  client = null,
} = {}) {
  const rid = Number(requerimientoId);
  const oid = Number(ordenId);
  const eid = Number(ordenEntregaId);
  const recepcion = Number(recepcionId);
  const origenUid = Number(usuarioOrigenId);
  const texto = String(motivo || '').trim();
  if (![rid, oid, eid, recepcion, origenUid].every((id) => Number.isInteger(id) && id > 0)) {
    throw httpError('Contexto de observación inválido', 400, 'CONTEXTO_OBSERVACION_INVALIDO');
  }
  if (!texto) {
    throw httpError('El motivo de observación es obligatorio', 400, 'MOTIVO_OBSERVACION_REQUERIDO');
  }

  return runInTransaction(client, async (tx) => {
    const destino = obtenerDestinoObservacion(destinoSubmoduloCodigo);
    const destinatario = await validarDestinatarioObservacion({
      submoduloDestino: destino.submodulo_codigo,
      usuarioDestinoId,
      client: tx,
    });
    const { rows: origenRows } = await tx.query(`
      SELECT id, dni, username, apellidos, nombres, nombre, activo
      FROM usuarios
      WHERE id=$1
    `, [origenUid]);
    const usuarioOrigen = origenRows[0];
    if (!usuarioOrigen?.activo) {
      throw httpError('Usuario origen inexistente o inactivo', 409, 'USUARIO_ORIGEN_INVALIDO');
    }

    const { rows: contextoRows } = await tx.query(`
      SELECT oe.id AS orden_entrega_id, oe.orden_id, oc.requerimiento_id,
        er.id AS recepcion_id
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id=oe.orden_id
      JOIN entregable_recepciones er
        ON er.orden_entrega_id=oe.id AND er.orden_id=oe.orden_id
      WHERE oe.id=$1 AND oe.orden_id=$2
        AND oc.requerimiento_id=$3 AND er.id=$4
      FOR UPDATE OF oe, er
    `, [eid, oid, rid, recepcion]);
    if (!contextoRows.length) {
      throw httpError(
        'Orden, entregable, recepción y requerimiento no forman el mismo contexto',
        409,
        'CONTEXTO_OBSERVACION_CRUZADO',
      );
    }

    const origenNombre = usuarioOrigen.username
      || usuarioOrigen.nombre
      || usuarioOrigen.dni
      || String(origenUid);
    const { rows: workflowRows } = await tx.query(`
      INSERT INTO workflow_observaciones (
        expediente_id, origen, estado, emitida_por, responsable_subsanacion,
        motivo, documentos, dias_plazo, emitida_at,
        origen_submodulo_codigo, destino_submodulo_codigo,
        usuario_origen_id, usuario_destino_id
      ) VALUES (
        $1,$2,'OBS_EMITIDA',$3,$4,$5,$6::jsonb,$7,NOW(),$8,$9,$10,$11
      )
      RETURNING *
    `, [
      rid,
      String(origen || 'ENTREGABLE_SERVICIO').slice(0, 60),
      origenNombre.slice(0, 150),
      (destinatario.username || destinatario.nombre).slice(0, 150),
      texto,
      JSON.stringify(Array.isArray(documentos) ? documentos : []),
      Number.isInteger(Number(diasPlazo)) && Number(diasPlazo) > 0 ? Number(diasPlazo) : 5,
      String(origenSubmoduloCodigo || 'PRESENTACION_ENTREGABLES').slice(0, 80),
      destino.submodulo_codigo,
      origenUid,
      destinatario.id,
    ]);
    const workflowObservacion = workflowRows[0];

    const { rows: entregableRows } = await tx.query(`
      INSERT INTO entregable_observaciones (
        orden_id, orden_entrega_id, recepcion_id, workflow_observacion_id,
        motivo, estado, observado_por, observado_at
      ) VALUES ($1,$2,$3,$4,$5,'OBS_EMITIDA',$6,NOW())
      RETURNING *
    `, [
      oid,
      eid,
      recepcion,
      Number(workflowObservacion.id),
      texto,
      origenNombre.slice(0, 150),
    ]);

    return {
      workflow_observacion: workflowObservacion,
      entregable_observacion: entregableRows[0],
      destinatario,
      cambio_responsable: {
        preparado: true,
        ejecutado: false,
        usuario_origen_id: origenUid,
        usuario_destino_id: destinatario.id,
        submodulo_destino_codigo: destino.submodulo_codigo,
        requiere_etapa_workflow_explicita: true,
      },
    };
  });
}

const ETAPAS_RETORNO_VALIDAS = Object.freeze([
  'REVISION_COORDINADOR_CM',
  'REVISION_ANALISTA_CM',
]);

function parseRoutingDocumentos(documentos) {
  if (!documentos) return {};
  if (typeof documentos === 'object' && !Array.isArray(documentos)) return documentos;
  if (typeof documentos === 'string') {
    try { return JSON.parse(documentos); } catch (_) { return {}; }
  }
  return {};
}

export function extraerEtapaRetornoObservacion(observacion = null) {
  const routing = parseRoutingDocumentos(observacion?.documentos);
  const code = String(routing?.etapa_retorno || '').trim().toUpperCase();
  return ETAPAS_RETORNO_VALIDAS.includes(code) ? code : null;
}

/**
 * RC8.15.6G-2 — Routing canónico CM/Analista → Área Usuaria con etapa de retorno.
 */
export async function registrarRoutingObservacionEntregableAreaUsuaria({
  requerimientoId,
  ordenId,
  ordenEntregaId,
  recepcionId,
  origenSubmoduloCodigo,
  etapaRetornoCodigo,
  usuarioOrigenId,
  usuarioDestinoId,
  destinatario,
  motivo,
  client = null,
} = {}) {
  const rid = Number(requerimientoId);
  const oid = Number(ordenId);
  const eid = Number(ordenEntregaId);
  const recepcion = Number(recepcionId);
  const origenUid = Number(usuarioOrigenId);
  const destinoUid = Number(usuarioDestinoId);
  const texto = String(motivo || '').trim();
  const origenEtapa = String(origenSubmoduloCodigo || '').trim().toUpperCase();
  const etapaRetorno = String(etapaRetornoCodigo || '').trim().toUpperCase();
  if (![rid, oid, eid, recepcion, origenUid, destinoUid].every((id) => Number.isInteger(id) && id > 0)) {
    throw httpError('Contexto de observación inválido', 400, 'CONTEXTO_OBSERVACION_INVALIDO');
  }
  if (!texto) {
    throw httpError('El motivo de observación es obligatorio', 400, 'MOTIVO_OBSERVACION_REQUERIDO');
  }
  if (!ETAPAS_RETORNO_VALIDAS.includes(etapaRetorno)) {
    throw httpError('Etapa de retorno inválida', 400, 'ETAPA_RETORNO_INVALIDA');
  }
  if (!destinatario?.id) {
    throw httpError('Destinatario Área Usuaria inválido', 422, 'USUARIO_DESTINO_INVALIDO');
  }

  return runInTransaction(client, async (tx) => {
    const { rows: origenRows } = await tx.query(`
      SELECT id, dni, username, apellidos, nombres, nombre, activo
      FROM usuarios WHERE id=$1
    `, [origenUid]);
    const usuarioOrigen = origenRows[0];
    if (!usuarioOrigen?.activo) {
      throw httpError('Usuario origen inexistente o inactivo', 409, 'USUARIO_ORIGEN_INVALIDO');
    }

    const { rows: contextoRows } = await tx.query(`
      SELECT oe.id AS orden_entrega_id, oe.orden_id, oc.requerimiento_id, er.id AS recepcion_id
      FROM orden_entregas oe
      JOIN ordenes_contratacion oc ON oc.id=oe.orden_id
      JOIN entregable_recepciones er
        ON er.orden_entrega_id=oe.id AND er.orden_id=oe.orden_id
      WHERE oe.id=$1 AND oe.orden_id=$2
        AND oc.requerimiento_id=$3 AND er.id=$4
      FOR UPDATE OF oe, er
    `, [eid, oid, rid, recepcion]);
    if (!contextoRows.length) {
      throw httpError(
        'Orden, entregable, recepción y requerimiento no forman el mismo contexto',
        409,
        'CONTEXTO_OBSERVACION_CRUZADO',
      );
    }

    const origenNombre = usuarioOrigen.username
      || usuarioOrigen.nombre
      || usuarioOrigen.dni
      || String(origenUid);
    const routingMeta = JSON.stringify({
      etapa_retorno: etapaRetorno,
      tipo_routing: 'CM_ANALISTA_AU',
      origen_etapa: origenEtapa,
    });
    const { rows: workflowRows } = await tx.query(`
      INSERT INTO workflow_observaciones (
        expediente_id, origen, estado, emitida_por, responsable_subsanacion,
        motivo, documentos, dias_plazo, emitida_at,
        origen_submodulo_codigo, destino_submodulo_codigo,
        usuario_origen_id, usuario_destino_id
      ) VALUES (
        $1,'ENTREGABLE_SERVICIO','OBS_EMITIDA',$2,$3,$4,$5::jsonb,5,NOW(),$6,'PRESENTACION_ENTREGABLES',$7,$8
      )
      RETURNING *
    `, [
      rid,
      origenNombre.slice(0, 150),
      (destinatario.username || destinatario.nombre).slice(0, 150),
      texto,
      routingMeta,
      origenEtapa.slice(0, 80),
      origenUid,
      destinatario.id,
    ]);
    const workflowObservacion = workflowRows[0];

    const { rows: entregableRows } = await tx.query(`
      INSERT INTO entregable_observaciones (
        orden_id, orden_entrega_id, recepcion_id, workflow_observacion_id,
        motivo, estado, observado_por, observado_at
      ) VALUES ($1,$2,$3,$4,$5,'OBS_EMITIDA',$6,NOW())
      RETURNING *
    `, [
      oid,
      eid,
      recepcion,
      Number(workflowObservacion.id),
      texto,
      origenNombre.slice(0, 150),
    ]);

    return {
      workflow_observacion: workflowObservacion,
      entregable_observacion: entregableRows[0],
      destinatario,
      cambio_responsable: {
        preparado: true,
        ejecutado: false,
        usuario_origen_id: origenUid,
        usuario_destino_id: destinatario.id,
        etapa_retorno: etapaRetorno,
        origen_etapa: origenEtapa,
        requiere_etapa_workflow_explicita: true,
      },
    };
  });
}

export default {
  CATALOGO_DESTINOS_OBSERVACION,
  clasificarObservacionEntregable,
  esEmisorObservacionEntregable,
  obtenerDestinoObservacion,
  listarDestinatariosObservacion,
  validarDestinatarioObservacion,
  listarMisObservacionesDirigidas,
  registrarRoutingObservacionEntregable,
  registrarRoutingObservacionEntregableAreaUsuaria,
  extraerEtapaRetornoObservacion,
};
