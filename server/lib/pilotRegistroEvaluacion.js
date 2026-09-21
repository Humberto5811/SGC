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

function normalizarNombrePersona(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Compatibilidad histórica: nombre completo → usuario activo solo si hay una coincidencia.
 */
export async function resolveUsuarioIdDesdeNombreCompletoInequivoco(actorNombre, client = null) {
  const norm = normalizarNombrePersona(actorNombre);
  if (!norm || norm.length < 4) return null;
  const { rows } = await queryClient(
    client,
    `SELECT id, apellidos, nombres, username
     FROM usuarios
     WHERE activo = TRUE`,
  );
  const matches = rows.filter((u) => {
    const a = normalizarNombrePersona([u.apellidos, u.nombres].filter(Boolean).join(' '));
    const b = normalizarNombrePersona([u.nombres, u.apellidos].filter(Boolean).join(' '));
    return a === norm || b === norm;
  });
  if (matches.length === 1) return Number(matches[0].id);
  return null;
}

async function resolveObservacionPayload(requerimientoId, observacionId, client) {
  const { rows: reqRows } = await queryClient(
    client,
    'SELECT payload FROM requerimientos WHERE id = $1',
    [requerimientoId],
  );
  if (!reqRows.length) return { payload: {}, obs: null };
  let payload = {};
  try { payload = JSON.parse(reqRows[0].payload || '{}'); } catch (_) { payload = {}; }
  const list = Array.isArray(payload.observaciones) ? payload.observaciones : [];
  let obs = null;
  if (observacionId != null) {
    const key = String(observacionId).trim();
    obs = list.find((o) => o && (String(o.id) === key || String(o.observacion_id) === key));
  }
  if (!obs) obs = [...list].reverse().find((o) => o && !o.cerrada) || list[list.length - 1];
  return { payload, obs };
}

async function resolveUltimaPersonaAsignacionEtapa(requerimientoId, etapaCodigo, client) {
  const etapa = String(etapaCodigo || '').trim().toUpperCase();
  if (!etapa) return null;
  const { rows } = await queryClient(
    client,
    `SELECT usuario_id
     FROM expediente_asignaciones
     WHERE requerimiento_id = $1
       AND etapa_codigo = $2
       AND tipo_responsable = 'PERSONA'
       AND usuario_id IS NOT NULL
     ORDER BY asignado_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [requerimientoId, etapa],
  );
  const uid = rows[0]?.usuario_id;
  return uid != null && Number.isFinite(Number(uid)) ? Number(uid) : null;
}

async function resolvePersonaDesdeEventosWorkflow(requerimientoId, etapaDestino, client) {
  const etapa = String(etapaDestino || '').trim().toUpperCase();
  if (!etapa) return null;
  const { rows } = await queryClient(
    client,
    `SELECT metadata
     FROM workflow_eventos
     WHERE expediente_id = $1
       AND etapa_destino = $2
       AND metadata->>'usuario_destino_id' ~ '^[0-9]+$'
     ORDER BY id DESC
     LIMIT 1`,
    [requerimientoId, etapa],
  );
  const raw = rows[0]?.metadata?.usuario_destino_id;
  if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

export function buildErrorSubsanacionSinPersona(message = 'No se pudo determinar una persona responsable válida para el retorno.') {
  const err = new Error(message);
  err.status = 422;
  err.code = 'SUBSANACION_SIN_PERSONA';
  return err;
}

const ETAPA_CONSULTAS_RETORNO = 'CONSULTAS_OBSERVACIONES';

/**
 * RC8.17.8H6-B5.3 — Emisor de observación CO para retorno interno post-subsanación.
 * Solo payload (usuario_origen_id / gerente); sin ERV vigente ni CONSULTAS_OBSERVADA destinatario.
 */
export async function resolveEmisorConsultasRetornoInterno(
  requerimientoId,
  observacionId = null,
  client = null,
) {
  const rid = Number(requerimientoId);
  if (!Number.isFinite(rid) || rid <= 0) return null;

  const { obs } = await resolveObservacionPayload(rid, observacionId, client);
  if (!obs) return null;

  if (obs.usuario_origen_id != null && Number.isFinite(Number(obs.usuario_origen_id))) {
    return Number(obs.usuario_origen_id);
  }

  const hint = String(obs.gerente || obs.usuarioOrigen || obs.usuario || '').trim();
  if (!hint || /^gerente$/i.test(hint)) return null;
  const byUser = await resolveUsuarioIdDesdeActor({ actorRol: hint }, client);
  if (byUser) return byUser;
  return resolveUsuarioIdDesdeNombreCompletoInequivoco(hint, client);
}

function normalizeEtapaRetornoSubsanacion(destinoEtapa, metadata = {}) {
  return String(
    destinoEtapa || metadata.destino_etapa || metadata.destinoEtapa || '',
  ).trim().toUpperCase().replace('REGISTRADO', 'REGISTRO');
}

/**
 * Resuelve PERSONA destino en retorno por subsanación (prioridad RC8.17.8D).
 */
export async function resolveUsuarioDestinoRetornoSubsanacion({
  requerimientoId,
  observacionId = null,
  usuarioDestinoIdExplicit = null,
  metadata = {},
  destinoEtapa = null,
  destinoPersonaHint = '',
  client = null,
} = {}) {
  const rid = Number(requerimientoId);
  if (!Number.isFinite(rid) || rid <= 0) return null;

  const etapaRetorno = normalizeEtapaRetornoSubsanacion(destinoEtapa, metadata);
  if (etapaRetorno === ETAPA_CONSULTAS_RETORNO) {
    const emisorCo = await resolveEmisorConsultasRetornoInterno(rid, observacionId, client);
    if (emisorCo != null) return emisorCo;
  }

  if (usuarioDestinoIdExplicit != null && Number.isFinite(Number(usuarioDestinoIdExplicit))) {
    return Number(usuarioDestinoIdExplicit);
  }

  const metaCandidates = [
    metadata.usuario_destino_id,
    metadata.responsable_seleccionado_id,
    metadata.responsable_emisor_id,
  ];
  for (const raw of metaCandidates) {
    if (raw != null && Number.isFinite(Number(raw))) return Number(raw);
  }

  const emisor = await resolveEmisorObservacionRetorno(rid, client, {
    observacionId,
    destinoEtapa,
  });
  if (emisor) return emisor;

  const etapa = String(destinoEtapa || metadata.destino_etapa || metadata.destinoEtapa || '').toUpperCase();
  if (etapa) {
    const histAsig = await resolveUltimaPersonaAsignacionEtapa(rid, etapa, client);
    if (histAsig) return histAsig;
    const evUid = await resolvePersonaDesdeEventosWorkflow(rid, etapa, client);
    if (evUid) return evUid;
  }

  const hint = String(destinoPersonaHint || metadata.destino_persona || '').trim();
  if (/^\d+$/.test(hint)) return Number(hint);
  if (hint) {
    const byUser = await resolveUsuarioIdDesdeActor({ actorRol: hint }, client);
    if (byUser) return byUser;
    const byName = await resolveUsuarioIdDesdeNombreCompletoInequivoco(hint, client);
    if (byName) return byName;
  }

  return null;
}

/**
 * Emisor canónico de la observación vigente (Director/Gerente que observó).
 * Prioriza workflow_observaciones.usuario_origen_id y payload canónico.
 */
export async function resolveEmisorObservacionRetorno(
  requerimientoId,
  client = null,
  opts = {},
) {
  const rid = Number(requerimientoId);
  if (!Number.isFinite(rid) || rid <= 0) return null;

  const observacionId = opts.observacionId ?? opts.observacion_id ?? null;

  const { obs } = await resolveObservacionPayload(rid, observacionId, client);
  if (obs?.usuario_origen_id != null && Number.isFinite(Number(obs.usuario_origen_id))) {
    return Number(obs.usuario_origen_id);
  }

  if (observacionId != null && String(observacionId).trim() !== '') {
    const obsKey = String(observacionId).trim();
    if (/^\d+$/.test(obsKey)) {
      const { rows: woOne } = await queryClient(
        client,
        `SELECT usuario_origen_id, emitida_por
         FROM workflow_observaciones
         WHERE expediente_id = $1 AND id = $2
         LIMIT 1`,
        [rid, Number(obsKey)],
      );
      if (woOne[0]?.usuario_origen_id) return Number(woOne[0].usuario_origen_id);
      if (woOne[0]?.emitida_por) {
        const uid = await resolveUsuarioIdDesdeActor({ actorRol: woOne[0].emitida_por }, client);
        if (uid) return uid;
      }
    }
  }

  const { rows: woRows } = await queryClient(
    client,
    `SELECT usuario_origen_id, emitida_por
     FROM workflow_observaciones
     WHERE expediente_id = $1
       AND usuario_origen_id IS NOT NULL
     ORDER BY emitida_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [rid],
  );
  const woUid = woRows[0]?.usuario_origen_id;
  if (woUid != null && Number.isFinite(Number(woUid))) return Number(woUid);

  if (!obs) return null;

  const destinoEtapa = String(opts.destinoEtapa || obs.subsanacion_destino_etapa || obs.moduloEmisor || '').toUpperCase();
  if (destinoEtapa) {
    const histAsig = await resolveUltimaPersonaAsignacionEtapa(rid, destinoEtapa.replace('REGISTRADO', 'REGISTRO'), client);
    if (histAsig) return histAsig;
    const evUid = await resolvePersonaDesdeEventosWorkflow(rid, destinoEtapa.replace('REGISTRADO', 'REGISTRO'), client);
    if (evUid) return evUid;
  }

  const hint = String(obs.gerente || obs.usuarioOrigen || obs.usuario || '').trim();
  if (!hint || /^gerente$/i.test(hint)) return null;
  const byUser = await resolveUsuarioIdDesdeActor({ actorRol: hint }, client);
  if (byUser) return byUser;
  return resolveUsuarioIdDesdeNombreCompletoInequivoco(hint, client);
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
const PILOT_SUBSANACION_RETORNO_ETAPAS = Object.freeze([
  'EVALUACION',
  'REGISTRO',
  'DEC',
  'PROGRAMACION',
  'COORDINACION_CM',
  'INVITACIONES',
  'CONSULTAS_OBSERVACIONES',
  'RECEPCION_COTIZACIONES',
  'VALIDACIONES',
  'REGISTRO_ORDEN',
]);

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
    const retornoInternoConsultas = destinoEtapa === 'CONSULTAS_OBSERVACIONES';
    if (!retornoInternoConsultas) {
      return { resp, etapaEfectiva, labels, metaExtra: {}, usuarioDestinoEfectivo: usuarioDestinoId };
    }
  }
  const obsId = metadata.observacion_id ?? metadata.observacionId ?? null;

  let uid = null;
  if (usuarioDestinoId != null && Number.isFinite(Number(usuarioDestinoId))) {
    uid = Number(usuarioDestinoId);
  }
  if (!uid && requerimientoId) {
    uid = await resolveUsuarioDestinoRetornoSubsanacion({
      requerimientoId,
      observacionId: obsId,
      usuarioDestinoIdExplicit: usuarioDestinoId,
      metadata,
      destinoEtapa,
      destinoPersonaHint: metadata.destino_persona || metadata.destinoPersona || '',
      client,
    });
  }

  if (!uid && destinoEtapa === 'EVALUACION' && requerimientoId) {
    const director = await resolveDirectorEvaluacionParaRequerimiento(requerimientoId, row, client);
    if (!director.ambiguo && director.usuarioId) uid = director.usuarioId;
  }

  const metaDest = getEtapaMeta(destinoEtapa) || getEtapaMeta('REGISTRO');
  let newResp = resp;
  if (uid) {
    newResp = {
      responsableTipo: TIPO_RESPONSABLE.PERSONA,
      responsableUsuarioId: uid,
      responsableUnidad: unidadDestino || metaDest?.responsableLabel || destinoEtapa,
      responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
    };
  }

  const newLabels = {
    ...labels,
    etapaCodigo: destinoEtapa,
    etapaLabel: metaDest?.label || destinoEtapa,
    estadoCodigo: ESTADO_PILOT_EN_TRAMITE,
    estadoLabel: LABEL_PILOT_EN_TRAMITE,
  };

  const metaExtra = {
    pilot_observacion_subsanada_retorno: true,
    destino_etapa: destinoEtapa,
    responsable_emisor_id: uid,
    responsable_seleccionado_id: uid,
    observacion_id: obsId,
  };
  if (destinoEtapa === 'DEC') metaExtra.pilot_observacion_subsanada_retorno_dec = true;

  return {
    resp: newResp,
    etapaEfectiva: destinoEtapa,
    labels: newLabels,
    metaExtra,
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
  resolveEmisorObservacionRetorno,
  resolveEmisorConsultasRetornoInterno,
  resolveUsuarioDestinoRetornoSubsanacion,
  resolveUsuarioIdDesdeNombreCompletoInequivoco,
  buildErrorSubsanacionSinPersona,
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
