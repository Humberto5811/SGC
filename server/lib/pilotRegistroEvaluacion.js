/**
 * RC8.17.2B-F1 — Piloto canónico Registro / Evaluación.
 * Alcance: REQUERIMIENTO_REGISTRADO + REQUERIMIENTO_ENVIADO_EVALUACION.
 * No modifica resolverResponsableSincero globalmente.
 */
import { getEtapaMeta } from '../../shared/workflow/etapas.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { hasFunctionalProfile, isAdminSecurityRole, PERFILES_FUNCIONALES } from '../utils/userRoleCatalog.js';
import { resolverCentroDesdeRequerimiento, normalizarCodigoCentro } from './recepcionBienesAlcance.js';
import { FUENTE_RESPONSABLE } from './expedienteEstadoPersistido.js';
import { esDestinoRegistroRequerimiento } from './candidatosObservacionDestino.js';

export const PILOT_EVENTOS = Object.freeze([
  'REQUERIMIENTO_REGISTRADO',
  'REQUERIMIENTO_ENVIADO_EVALUACION',
]);

export const ESTADO_PILOT_EN_TRAMITE = 'EN_TRAMITE';
export const LABEL_PILOT_EN_TRAMITE = 'En trámite';

export function isPilotEvento(eventoCodigo) {
  return PILOT_EVENTOS.includes(String(eventoCodigo || '').toUpperCase());
}

export function getPilotEstadoLabels() {
  return {
    estadoCodigo: ESTADO_PILOT_EN_TRAMITE,
    estadoLabel: LABEL_PILOT_EN_TRAMITE,
  };
}

function nombreUsuario(u = {}) {
  const comp = [u.apellidos, u.nombres].filter(Boolean).join(' ').trim();
  return comp || u.nombre || u.username || u.dni || (u.id ? `Usuario #${u.id}` : '');
}

async function queryClient(client, text, params) {
  if (client?.query) return client.query(text, params);
  const { query } = await import('../db.js');
  return query(text, params);
}

const USUARIOS_CENTRO_SQL = `SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.permisos,
            u.centro, u.codigo_centro_costo, u.activo
     FROM usuarios u
     WHERE u.activo = TRUE
       AND (
         UPPER(REPLACE(REPLACE(COALESCE(u.centro, ''), ' ', ''), '.', '')) = $1
         OR UPPER(REPLACE(REPLACE(COALESCE(u.codigo_centro_costo, ''), ' ', ''), '.', '')) = $1
       )`;

function mapCandidatoDirector(u, extra = {}) {
  return {
    id: Number(u.id),
    username: u.username || u.dni || '',
    nombre: nombreUsuario(u),
    cargo: u.cargo || '',
    activo: u.activo !== false,
    centro: u.centro || u.codigo_centro_costo || '',
    ...extra,
  };
}

export function esDirectorEvaluacionElegible(u = {}) {
  if (u.activo === false) return false;
  if (isAdminSecurityRole(u)) return false;
  return hasFunctionalProfile(
    { id: u.id, rol: u.rol, cargo: u.cargo, permisos: u.permisos },
    PERFILES_FUNCIONALES.DIRECTOR_CENTRO,
  );
}

function filtrarDirectoresEvaluacion(usuarios = []) {
  return usuarios.filter(esDirectorEvaluacionElegible);
}

function matchesSearchDirector(c, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < 2) return true;
  return [c.nombre, c.username, c.cargo].some((p) => String(p || '').toLowerCase().includes(needle));
}

async function cargarUsuariosActivosCentro(codigoCentro, client = null) {
  const { rows } = await queryClient(client, USUARIOS_CENTRO_SQL, [codigoCentro]);
  return rows;
}

async function resolverContextoCentroRequerimiento(requerimientoId, row = null, client = null) {
  let reqRow = row;
  if (!reqRow) {
    const { rows } = await queryClient(client, 'SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
    reqRow = rows[0] || null;
  }
  if (!reqRow) {
    return { error: 'requerimiento_no_encontrado', reqRow: null, codigoCentro: null, centro: null };
  }
  try {
    const centro = resolverCentroDesdeRequerimiento(reqRow);
    const codigoCentro = normalizarCodigoCentro(centro.centro_codigo);
    if (!codigoCentro) {
      return { error: 'centro_vacio', reqRow, codigoCentro: null, centro };
    }
    return { reqRow, codigoCentro, centro, error: null };
  } catch (err) {
    return { error: err?.code || 'centro_no_resuelto', reqRow, codigoCentro: null, centro: null };
  }
}

/**
 * Lista candidatos PERSONA elegibles para derivación Registro → Evaluación.
 */
export async function listarCandidatosDerivacionEvaluacion(
  requerimientoId,
  { search = '' } = {},
  row = null,
  client = null,
) {
  const ctx = await resolverContextoCentroRequerimiento(requerimientoId, row, client);
  if (ctx.error) {
    return {
      soportado: true,
      destino: 'Evaluación de Requerimiento',
      destino_etapa: 'EVALUACION',
      centro: ctx.centro ? { codigo: ctx.codigoCentro, nombre: ctx.centro?.centro_nombre } : null,
      error: ctx.error,
      recomendado: null,
      candidatos: [],
    };
  }

  const usuarios = await cargarUsuariosActivosCentro(ctx.codigoCentro, client);
  const elegibles = filtrarDirectoresEvaluacion(usuarios).map((u) => mapCandidatoDirector(u));
  const auto = await resolveDirectorEvaluacionParaRequerimiento(requerimientoId, ctx.reqRow, client);

  let recomendado = null;
  if (auto.usuarioId) {
    const found = elegibles.find((c) => c.id === auto.usuarioId);
    if (found) {
      recomendado = {
        ...found,
        etiqueta: 'Director recomendado',
        recomendado: true,
        fuente: 'resolucion_automatica',
      };
    }
  }

  let otros = elegibles.filter((c) => !recomendado || c.id !== recomendado.id);
  const q = String(search || '').trim();
  if (q.length >= 2) {
    otros = otros.filter((c) => matchesSearchDirector(c, q));
    if (recomendado && !matchesSearchDirector(recomendado, q)) {
      recomendado = null;
    }
  }
  otros.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const metaEval = getEtapaMeta('EVALUACION');
  return {
    soportado: true,
    destino: 'Evaluación de Requerimiento',
    destino_etapa: 'EVALUACION',
    destino_submodulo_codigo: metaEval?.submoduloCodigo || 'EVALUACION_REQUERIMIENTO',
    centro: {
      codigo: ctx.codigoCentro,
      nombre: ctx.centro?.centro_nombre || ctx.codigoCentro,
    },
    recomendado,
    candidatos: otros,
    resolucion_automatica: auto.usuarioId
      ? { usuarioId: auto.usuarioId, ambiguo: false }
      : { usuarioId: null, ambiguo: auto.ambiguo, motivo: auto.motivo, candidatos: auto.candidatos },
  };
}

export async function assertUsuarioDestinoEvaluacionElegible(
  requerimientoId,
  usuarioId,
  row = null,
  client = null,
) {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid) || uid <= 0) {
    const err = new Error('usuario_destino_id inválido');
    err.status = 400;
    throw err;
  }
  const lista = await listarCandidatosDerivacionEvaluacion(requerimientoId, {}, row, client);
  const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
  const found = todos.find((c) => c.id === uid);
  if (!found) {
    const err = new Error('Usuario destino no elegible para Evaluación');
    err.status = 422;
    err.code = 'RESPONSABLE_EVALUACION_INVALIDO';
    throw err;
  }
  return { ok: true, candidato: found, recomendado: lista.recomendado, lista };
}

function buildMetaSeleccionEvaluacion(usuarioDestinoId, metadata = {}) {
  const sel = Number(usuarioDestinoId);
  const recRaw = metadata.responsable_recomendado_id ?? null;
  const rec = recRaw != null && Number.isFinite(Number(recRaw)) ? Number(recRaw) : null;
  return {
    responsable_seleccionado_id: sel,
    responsable_recomendado_id: rec,
    reasignacion_manual: metadata.reasignacion_manual === true || (rec != null && rec !== sel),
  };
}

/**
 * Resuelve ID de usuario desde actor autenticado o username legacy.
 */
export async function resolveUsuarioIdDesdeActor(
  { usuarioOrigenId = null, actorRol = null, row = null } = {},
  client = null,
) {
  if (usuarioOrigenId != null && Number.isFinite(Number(usuarioOrigenId))) {
    return Number(usuarioOrigenId);
  }
  const hints = [actorRol, row?.usuario_modificacion].filter(Boolean);
  for (const hint of hints) {
    const s = String(hint).trim();
    if (!s || /^sistema$/i.test(s)) continue;
    if (/^\d+$/.test(s)) return Number(s);
    const { rows } = await queryClient(
      client,
      `SELECT id FROM usuarios
       WHERE activo = TRUE
         AND (LOWER(username) = LOWER($1) OR LOWER(dni) = LOWER($1))
       LIMIT 2`,
      [s],
    );
    if (rows.length === 1) return Number(rows[0].id);
  }
  return null;
}

/**
 * Busca exactamente un Director/Gerente de centro para evaluación.
 * Reutiliza perfil funcional DIRECTOR_CENTRO + centro del requerimiento.
 */
export async function resolveDirectorEvaluacionParaRequerimiento(
  requerimientoId,
  row = null,
  client = null,
) {
  let reqRow = row;
  if (!reqRow) {
    const { rows } = await queryClient(
      client,
      'SELECT * FROM requerimientos WHERE id = $1',
      [requerimientoId],
    );
    reqRow = rows[0] || null;
  }
  if (!reqRow) {
    return {
      usuarioId: null,
      ambiguo: true,
      motivo: 'requerimiento_no_encontrado',
      candidatos: 0,
    };
  }

  let centro;
  try {
    centro = resolverCentroDesdeRequerimiento(reqRow);
  } catch (err) {
    return {
      usuarioId: null,
      ambiguo: true,
      motivo: err?.code || 'centro_no_resuelto',
      candidatos: 0,
    };
  }

  const codigoCentro = normalizarCodigoCentro(centro.centro_codigo);
  if (!codigoCentro) {
    return {
      usuarioId: null,
      ambiguo: true,
      motivo: 'centro_vacio',
      candidatos: 0,
    };
  }

  const usuarios = await cargarUsuariosActivosCentro(codigoCentro, client);
  const candidatos = filtrarDirectoresEvaluacion(usuarios);

  if (candidatos.length === 1) {
    const u = candidatos[0];
    return {
      usuarioId: Number(u.id),
      ambiguo: false,
      persona: {
        id: Number(u.id),
        nombre: nombreUsuario(u),
        username: u.username || u.dni || '',
      },
      centro: codigoCentro,
      candidatos: 1,
    };
  }

  return {
    usuarioId: null,
    ambiguo: true,
    motivo: candidatos.length === 0 ? 'sin_director_resoluble' : 'multiples_directores',
    candidatos: candidatos.length,
    centro: codigoCentro,
    personas: candidatos.map((u) => ({
      id: Number(u.id),
      nombre: nombreUsuario(u),
      username: u.username || '',
    })),
  };
}

/**
 * Piloto creación: responsable = PERSONA creadora.
 */
export async function applyPilotCreacion({
  resp,
  usuarioOrigenId = null,
  usuarioDestinoId = null,
  actorRol = null,
  row = null,
  unidadDestino = null,
  etapaCodigo = 'REGISTRO',
  client = null,
} = {}) {
  let uid = usuarioDestinoId;
  if (uid == null) {
    uid = await resolveUsuarioIdDesdeActor({ usuarioOrigenId, actorRol, row }, client);
  }
  if (uid == null) return { resp, usuarioDestinoId: null };

  const meta = getEtapaMeta(etapaCodigo) || getEtapaMeta('REGISTRO');
  return {
    resp: {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: unidadDestino || meta?.responsableLabel || 'Usuario AU',
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    },
    usuarioDestinoId: uid,
  };
}

/**
 * Piloto envío a evaluación: responsable = Director AU si resoluble inequívocamente.
 */
export async function applyPilotEnvioEvaluacion({
  resp,
  usuarioDestinoId = null,
  unidadDestino = null,
  requerimientoId,
  row = null,
  etapaCodigo = 'EVALUACION',
  client = null,
  metadata = {},
} = {}) {
  const meta = getEtapaMeta(etapaCodigo) || getEtapaMeta('EVALUACION');
  const unidadCtx = unidadDestino || meta?.responsableLabel || 'Director / Gerente';

  if (usuarioDestinoId != null && Number.isFinite(Number(usuarioDestinoId))) {
    const sel = Number(usuarioDestinoId);
    return {
      resp: {
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: sel,
        responsableUnidad: unidadCtx,
        responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
      },
      ambiguedad: null,
      metaExtra: buildMetaSeleccionEvaluacion(sel, metadata),
    };
  }

  const director = await resolveDirectorEvaluacionParaRequerimiento(requerimientoId, row, client);
  if (director.usuarioId) {
    return {
      resp: {
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: director.usuarioId,
        responsableUnidad: unidadCtx,
        responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
      },
      ambiguedad: null,
      director,
      metaExtra: buildMetaSeleccionEvaluacion(director.usuarioId, {
        ...metadata,
        responsable_recomendado_id: director.usuarioId,
        reasignacion_manual: false,
      }),
    };
  }

  if (director.ambiguo) {
    console.warn('[PILOT_RC8172B] Director evaluación no resuelto inequívocamente', {
      requerimientoId,
      motivo: director.motivo,
      candidatos: director.candidatos,
      centro: director.centro,
    });
  }

  return { resp, ambiguedad: director.ambiguo ? director : null, metaExtra: {} };
}

export function isObservacionDestinoRegistro(metadata = {}) {
  const sub = metadata.destino_submodulo || metadata.destinoSubmodulo || '';
  const etapa = String(metadata.destino_etapa || metadata.destinoEtapa || '').toUpperCase();
  return esDestinoRegistroRequerimiento(sub)
    || etapa === 'REGISTRO'
    || etapa === 'REGISTRADO';
}

/**
 * Piloto: Evaluación observa → destino Registro.
 * Etapa REGISTRO, estado OBSERVADO, responsable PERSONA seleccionada.
 */
const PILOT_SUBSANACION_RETORNO_ETAPAS = Object.freeze(['EVALUACION', 'REGISTRO']);

export function resolveDestinoEtapaSubsanacion(metadata = {}) {
  const raw = metadata.destino_etapa || metadata.destinoEtapa || '';
  const etapa = String(raw || '').trim().toUpperCase();
  if (etapa === 'REGISTRADO') return 'REGISTRO';
  return etapa || null;
}

/**
 * Piloto: subsanación en Registro retorna a la etapa emisora (p. ej. Evaluación).
 * Etapa destino, EN_TRAMITE, responsable PERSONA del observador original.
 */
export async function applyPilotObservacionSubsanada({
  resp,
  usuarioDestinoId = null,
  unidadDestino = null,
  metadata = {},
  etapaEfectiva = 'REGISTRO',
  labels = {},
  row = null,
  requerimientoId = null,
  client = null,
} = {}) {
  const destinoEtapa = resolveDestinoEtapaSubsanacion(metadata);
  if (!destinoEtapa || !PILOT_SUBSANACION_RETORNO_ETAPAS.includes(destinoEtapa)) {
    return { resp, etapaEfectiva, labels, metaExtra: {}, usuarioDestinoEfectivo: usuarioDestinoId };
  }
  if (destinoEtapa === etapaEfectiva) {
    return { resp, etapaEfectiva, labels, metaExtra: {}, usuarioDestinoEfectivo: usuarioDestinoId };
  }
  // Alcance focalizado: Registro subsana → Evaluación (no DEC/CM/Programación).
  if (destinoEtapa !== 'EVALUACION' || etapaEfectiva !== 'REGISTRO') {
    return { resp, etapaEfectiva, labels, metaExtra: {}, usuarioDestinoEfectivo: usuarioDestinoId };
  }

  const metaEval = getEtapaMeta('EVALUACION');
  let uid = usuarioDestinoId ?? metadata.usuario_destino_id ?? null;
  if (uid != null && Number.isFinite(Number(uid))) uid = Number(uid);
  else uid = null;

  const personaHint = metadata.destino_persona || metadata.destinoPersona || '';
  if (!uid && personaHint) {
    uid = await resolveUsuarioIdDesdeActor({ actorRol: personaHint, row }, client);
  }
  if (!uid && requerimientoId) {
    const director = await resolveDirectorEvaluacionParaRequerimiento(requerimientoId, row, client);
    if (!director.ambiguo && director.usuarioId) uid = director.usuarioId;
  }

  let newResp = resp;
  if (uid) {
    newResp = {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: unidadDestino || metaEval?.responsableLabel || 'Director / Gerente',
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    };
  }

  const newLabels = {
    ...labels,
    etapaCodigo: 'EVALUACION',
    etapaLabel: metaEval?.label || 'Evaluación de Requerimiento',
    estadoCodigo: ESTADO_PILOT_EN_TRAMITE,
    estadoLabel: LABEL_PILOT_EN_TRAMITE,
  };

  return {
    resp: newResp,
    etapaEfectiva: 'EVALUACION',
    labels: newLabels,
    metaExtra: {
      pilot_observacion_subsanada_retorno: true,
      destino_etapa: destinoEtapa,
      responsable_seleccionado_id: uid,
    },
    usuarioDestinoEfectivo: uid,
  };
}

export function applyPilotObservacionEvaluacionRegistro({
  resp,
  usuarioDestinoId = null,
  unidadDestino = null,
  metadata = {},
  etapaEfectiva = 'EVALUACION',
  labels = {},
} = {}) {
  if (!isObservacionDestinoRegistro(metadata)) {
    return { resp, etapaEfectiva, labels, metaExtra: {}, usuarioDestinoEfectivo: usuarioDestinoId };
  }

  const metaReg = getEtapaMeta('REGISTRO');
  const unidadCtx = unidadDestino || metaReg?.responsableLabel || 'Usuario AU';
  const uidRaw = usuarioDestinoId ?? metadata.usuario_destino_id ?? null;
  const uid = uidRaw != null && Number.isFinite(Number(uidRaw)) ? Number(uidRaw) : null;

  let newResp = resp;
  if (uid) {
    newResp = {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: unidadCtx,
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    };
  }

  const newLabels = {
    ...labels,
    etapaCodigo: 'REGISTRO',
    etapaLabel: metaReg?.label || 'Registro de Requerimientos',
    estadoCodigo: 'OBSERVADO',
    estadoLabel: 'Observado',
  };

  const recomendadoId = metadata.responsable_recomendado_id ?? null;
  const reasignacion = uid && recomendadoId && Number(recomendadoId) !== uid;

  return {
    resp: newResp,
    etapaEfectiva: 'REGISTRO',
    labels: newLabels,
    metaExtra: {
      pilot_observacion_destino_registro: true,
      responsable_recomendado_id: recomendadoId,
      responsable_seleccionado_id: uid,
      reasignacion_manual: reasignacion || metadata.reasignacion_manual === true,
    },
    usuarioDestinoEfectivo: uid,
  };
}

export default {
  PILOT_EVENTOS,
  ESTADO_PILOT_EN_TRAMITE,
  LABEL_PILOT_EN_TRAMITE,
  isPilotEvento,
  getPilotEstadoLabels,
  resolveUsuarioIdDesdeActor,
  resolveDirectorEvaluacionParaRequerimiento,
  listarCandidatosDerivacionEvaluacion,
  assertUsuarioDestinoEvaluacionElegible,
  esDirectorEvaluacionElegible,
  applyPilotCreacion,
  applyPilotEnvioEvaluacion,
  isObservacionDestinoRegistro,
  resolveDestinoEtapaSubsanacion,
  applyPilotObservacionSubsanada,
  applyPilotObservacionEvaluacionRegistro,
};
