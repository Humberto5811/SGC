/**
 * RC8.17.8H4 — Asignación interna PERSONA en Programación (sin cambio etapa/estado).
 */
import { query } from '../db.js';
import { transicionarExpediente } from './expedienteTransicion.js';
import { WHERE_BANDEJA_PROGRAMACION } from './programacionBandeja.js';
import { REQUERIMIENTO_BANDEJA_FROM } from './bandejaRequerimientoSql.js';
import {
  esCoordinadorEquipoUad,
} from './equiposUadUsuario.js';
import { EQUIPOS_UAD } from '../../shared/equiposUad.js';
import {
  resolveUnidadAdquisicionesKeys,
  assertUsuarioDestinoTransicionElegible,
} from './workflowTransicionResponsable.js';
import { esDestinatarioAsignacionInternaProgramacion } from './equiposUadUsuario.js';

export async function assertActorCoordinadorProgramacionPuedeAsignar(user, client = null) {
  const uid = user?.id != null ? Number(user.id) : NaN;
  if (!Number.isFinite(uid)) {
    const err = new Error('No autenticado');
    err.status = 401;
    throw err;
  }
  const { rows } = await (client?.query
    ? client.query(
      `SELECT id, username, apellidos, nombres, cargo, rol, permisos, centro, codigo_centro_costo, equipo_uad, activo
       FROM usuarios WHERE id = $1 LIMIT 1`,
      [uid],
    )
    : query(
      `SELECT id, username, apellidos, nombres, cargo, rol, permisos, centro, codigo_centro_costo, equipo_uad, activo
       FROM usuarios WHERE id = $1 LIMIT 1`,
      [uid],
    ));
  const row = rows[0];
  if (!row || row.activo === false) {
    const err = new Error('Usuario inactivo o no encontrado');
    err.status = 403;
    err.code = 'ACTOR_PROGRAMACION_NO_AUTORIZADO';
    throw err;
  }
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  if (!esCoordinadorEquipoUad(row, EQUIPOS_UAD.PROGRAMACION, { uadKeys })) {
    const err = new Error(
      'Solo el Coordinador del equipo UAD Programación puede asignar responsable interno.',
    );
    err.status = 403;
    err.code = 'ACTOR_PROGRAMACION_NO_AUTORIZADO';
    throw err;
  }
  return { ok: true, usuario: row };
}

export async function assertExpedienteEnProgramacionParaAsignar(requerimientoId, client = null) {
  const run = client?.query
    ? (sql, p) => client.query(sql, p)
    : (sql, p) => query(sql, p);
  const { rows } = await run(
    `SELECT r.id, r.estado, r.estado_actual, r.payload
     ${REQUERIMIENTO_BANDEJA_FROM}
     WHERE r.id = $1 AND ${WHERE_BANDEJA_PROGRAMACION}`,
    [requerimientoId],
  );
  if (!rows.length) {
    const err = new Error('Requerimiento no encontrado en bandeja Programación');
    err.status = 404;
    throw err;
  }
  const etapa = String(rows[0].estado_actual || '').toUpperCase();
  if (etapa !== 'PROGRAMACION') {
    const err = new Error('La asignación interna solo aplica con etapa vigente PROGRAMACION');
    err.status = 409;
    err.code = 'ETAPA_NO_PROGRAMACION';
    throw err;
  }
  return rows[0];
}

export async function ejecutarAsignacionResponsableProgramacion({
  requerimientoId,
  req,
  usuarioDestinoId,
  clientRequestId = null,
}) {
  await assertActorCoordinadorProgramacionPuedeAsignar(req?.user ?? null);
  const reqRow = await assertExpedienteEnProgramacionParaAsignar(requerimientoId);
  const uidDest = Number(usuarioDestinoId);
  if (!Number.isFinite(uidDest)) {
    const err = new Error('Debe seleccionar un operador de Programación');
    err.status = 400;
    throw err;
  }
  await assertUsuarioDestinoTransicionElegible(
    requerimientoId,
    'REASIGNACION_RESPONSABLE',
    uidDest,
    reqRow,
  );

  const actorId = req?.user?.id != null ? Number(req.user.id) : null;
  const clientReq = clientRequestId
    || `prog-reasign:${requerimientoId}:${uidDest}:${actorId || 'sys'}`;

  const result = await transicionarExpediente({
    requerimientoId,
    evento: 'REASIGNACION_RESPONSABLE',
    usuarioDestinoId: uidDest,
    usuarioOrigenId: actorId,
    actorRol: req?.user?.username || req?.user?.nombre || 'Coordinador Programación',
    motivo: 'Asignación interna de responsable en Programación',
    metadata: {
      client_request_id: clientReq,
      via: 'programacionAsignarResponsable',
      reasignacion_interna_programacion: true,
    },
  });

  return result;
}

export async function assertUsuarioOperadorProgramacionElegible(usuarioId, client = null) {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid)) {
    const err = new Error('Usuario destino inválido');
    err.status = 400;
    throw err;
  }
  const { rows } = await (client?.query
    ? client.query('SELECT * FROM usuarios WHERE id = $1', [uid])
    : query('SELECT * FROM usuarios WHERE id = $1', [uid]));
  const u = rows[0];
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  if (!u || !esDestinatarioAsignacionInternaProgramacion(u, { uadKeys })) {
    const err = new Error('Usuario destino no elegible (requiere OPERADOR activo, UAD, equipo Programación)');
    err.status = 422;
    err.code = 'RESPONSABLE_TRANSICION_INVALIDO';
    throw err;
  }
  return u;
}
