/**
 * RC8.17.2B-F1 — Piloto canónico Registro / Evaluación.
 * Alcance: REQUERIMIENTO_REGISTRADO + REQUERIMIENTO_ENVIADO_EVALUACION.
 * No modifica resolverResponsableSincero globalmente.
 */
import { getEtapaMeta } from '../../shared/workflow/etapas.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { hasFunctionalProfile, PERFILES_FUNCIONALES } from '../utils/userRoleCatalog.js';
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

  const { rows: usuarios } = await queryClient(
    client,
    `SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.permisos,
            u.centro, u.codigo_centro_costo
     FROM usuarios u
     WHERE u.activo = TRUE
       AND (
         UPPER(REPLACE(REPLACE(COALESCE(u.centro, ''), ' ', ''), '.', '')) = $1
         OR UPPER(REPLACE(REPLACE(COALESCE(u.codigo_centro_costo, ''), ' ', ''), '.', '')) = $1
       )`,
    [codigoCentro],
  );

  const candidatos = usuarios.filter((u) => hasFunctionalProfile(
    { id: u.id, rol: u.rol, cargo: u.cargo, permisos: u.permisos },
    PERFILES_FUNCIONALES.DIRECTOR_CENTRO,
  ));

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
} = {}) {
  const meta = getEtapaMeta(etapaCodigo) || getEtapaMeta('EVALUACION');
  const unidadCtx = unidadDestino || meta?.responsableLabel || 'Director / Gerente';

  if (usuarioDestinoId != null && Number.isFinite(Number(usuarioDestinoId))) {
    return {
      resp: {
        responsableTipo: TIPO_RESPONSABLE.PERSONA,
        responsableUsuarioId: Number(usuarioDestinoId),
        responsableUnidad: unidadCtx,
        responsableFuente: FUENTE_RESPONSABLE.ASIGNACION_EXPLICITA,
      },
      ambiguedad: null,
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

  return { resp, ambiguedad: director.ambiguo ? director : null };
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
  applyPilotCreacion,
  applyPilotEnvioEvaluacion,
  isObservacionDestinoRegistro,
  applyPilotObservacionEvaluacionRegistro,
};
