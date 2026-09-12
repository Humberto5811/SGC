/**
 * RC8.17.3 — Servicio compartido: etapa destino + responsable PERSONA en transiciones.
 * Fuente de destinos: shared/workflow/transiciones.js (matriz canónica).
 */
import { getTransition } from '../../shared/workflow/transiciones.js';
import { getEtapaMeta } from '../../shared/workflow/etapas.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import {
  hasFunctionalProfile,
  isAdminSecurityRole,
  PERFILES_FUNCIONALES,
  PERFILES_TRANSVERSALES,
} from '../utils/userRoleCatalog.js';
import { getActividadesForSubmodulo, normalizePermisos } from './permissionsCatalog.js';
import { resolverCentroDesdeRequerimiento, normalizarCodigoCentro } from './recepcionBienesAlcance.js';
import { FUENTE_RESPONSABLE } from './expedienteEstadoPersistido.js';
import { tipoDeRequerimiento } from './workflow/workflowRepository.js';
import {
  listarCandidatosDerivacionEvaluacion,
  assertUsuarioDestinoEvaluacionElegible,
} from './pilotRegistroEvaluacion.js';

export const EVENTOS_PILOT_EN_TRAMITE = Object.freeze([
  'REQUERIMIENTO_ENVIADO_EVALUACION',
  'EVALUACION_APROBADA',
  'DEC_APROBADO',
  'PROGRAMACION_APROBADA',
  'COORDINACION_CM_APROBADA',
  'COTIZACIONES_DERIVADAS_VALIDACION',
  'VALIDACION_COMPLETADA',
  'CUADRO_APROBADO_DEC',
  'CCP_REGISTRADA',
]);

/** Transiciones que usan applyPilotTransicionPersona (selector obligatorio en ruta). */
export const EVENTOS_TRANSICION_PERSONA = Object.freeze([
  'EVALUACION_APROBADA',
  'DEC_APROBADO',
  'PROGRAMACION_APROBADA',
  'COORDINACION_CM_APROBADA',
  'COTIZACIONES_DERIVADAS_VALIDACION',
  'VALIDACION_COMPLETADA',
  'CUADRO_APROBADO_DEC',
  'CCP_REGISTRADA',
]);

export function isEventoTransicionPersona(eventoCodigo) {
  return EVENTOS_TRANSICION_PERSONA.includes(String(eventoCodigo || '').toUpperCase());
}

const ACTIVIDADES_OPERATIVAS = Object.freeze(['VER', 'CREAR', 'EDITAR', 'APROBAR', 'DERIVAR', 'OBSERVAR']);

const RESPONSABLE_DESTINO_A_PERFIL = Object.freeze({
  USUARIO_AU: PERFILES_FUNCIONALES.AREA_USUARIA,
  DIRECTOR_GERENTE: PERFILES_FUNCIONALES.DIRECTOR_CENTRO,
  DEC: PERFILES_FUNCIONALES.DEC,
  PROGRAMADOR: PERFILES_FUNCIONALES.PROGRAMACION,
  COORDINADOR_CM: PERFILES_FUNCIONALES.COORDINADOR_CM,
  ESPECIALISTA_CONTRATACIONES: PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES,
  AREA_USUARIA: PERFILES_FUNCIONALES.AREA_USUARIA,
  COMITE_CCP: PERFILES_FUNCIONALES.RESPONSABLE_CONFORMIDAD,
  ALMACEN: PERFILES_FUNCIONALES.ALMACENERO,
  ANALISTA_CONTRATACIONES: PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES,
  ANALISTA_PAGO: PERFILES_FUNCIONALES.ANALISTA_PAGO,
  ANALISTA_PAGOS: PERFILES_FUNCIONALES.ANALISTA_PAGO,
  SISTEMA: null,
});

function nombreUsuario(u = {}) {
  const comp = [u.apellidos, u.nombres].filter(Boolean).join(' ').trim();
  return comp || u.nombre || u.username || u.dni || (u.id ? `Usuario #${u.id}` : '');
}

async function queryClient(client, text, params) {
  if (client?.query) return client.query(text, params);
  const { query } = await import('../db.js');
  return query(text, params);
}

function mapCandidato(u, extra = {}) {
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

function matchesSearch(c, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < 2) return true;
  return [c.nombre, c.username, c.cargo].some((p) => String(p || '').toLowerCase().includes(needle));
}

export function mapResponsableDestinoAPerfil(responsableDestino = '') {
  const key = String(responsableDestino || '').trim().toUpperCase();
  return RESPONSABLE_DESTINO_A_PERFIL[key] || null;
}

export function isPerfilAlcanceTransversal(perfil) {
  return PERFILES_TRANSVERSALES.has(perfil);
}

export function esUsuarioElegibleParaPerfil(usuarioRow, perfil, submoduloCodigo) {
  if (!usuarioRow?.activo) return false;
  if (isAdminSecurityRole(usuarioRow)) return false;
  if (!perfil || !hasFunctionalProfile(
    { id: usuarioRow.id, rol: usuarioRow.rol, cargo: usuarioRow.cargo, permisos: usuarioRow.permisos },
    perfil,
  )) return false;
  if (!submoduloCodigo) return true;
  const permisos = normalizePermisos(usuarioRow.permisos, usuarioRow.rol);
  const acts = getActividadesForSubmodulo(permisos, submoduloCodigo);
  return acts.some((a) => ACTIVIDADES_OPERATIVAS.includes(String(a).toUpperCase()));
}

function usuarioPerteneceCentro(u, centroCodigo) {
  const c = normalizarCodigoCentro(centroCodigo);
  if (!c) return false;
  const uc = normalizarCodigoCentro(u.centro);
  const ucc = normalizarCodigoCentro(u.codigo_centro_costo);
  return uc === c || ucc === c;
}

async function loadReqRow(requerimientoId, row, client) {
  if (row) return row;
  const { rows } = await queryClient(client, 'SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
  return rows[0] || null;
}

export async function resolveTransicionWorkflow(requerimientoId, eventoCodigo, row = null, client = null) {
  const reqRow = await loadReqRow(requerimientoId, row, client);
  if (!reqRow) {
    const err = new Error('Requerimiento no encontrado');
    err.status = 404;
    throw err;
  }
  const tipo = tipoDeRequerimiento(reqRow);
  const etapaOrigen = String(reqRow.estado_actual || reqRow.estadoActual || 'REGISTRO').toUpperCase();
  const transicion = getTransition({
    tipoContratacion: tipo,
    etapaOrigen,
    eventoCodigo,
  });
  if (!transicion) {
    const err = new Error(`Transición no permitida: ${tipo} ${etapaOrigen} ${eventoCodigo}`);
    err.status = 409;
    err.code = 'TRANSITION_NOT_FOUND';
    throw err;
  }
  const metaDestino = getEtapaMeta(transicion.etapa_destino) || {};
  return { reqRow, transicion, tipo, etapaOrigen, metaDestino };
}

export function getPilotEstadoLabelsForEvento(eventoCodigo) {
  if (EVENTOS_PILOT_EN_TRAMITE.includes(String(eventoCodigo || '').toUpperCase())) {
    return { estadoCodigo: 'EN_TRAMITE', estadoLabel: 'En trámite' };
  }
  return null;
}

export function buildMetadataSeleccionResponsable(usuarioDestinoId, metadata = {}, extras = {}) {
  const sel = Number(usuarioDestinoId);
  const recRaw = metadata.responsable_recomendado_id ?? null;
  const rec = recRaw != null && Number.isFinite(Number(recRaw)) ? Number(recRaw) : null;
  return {
    ...extras,
    responsable_seleccionado_id: sel,
    responsable_recomendado_id: rec,
    reasignacion_manual: metadata.reasignacion_manual === true || (rec != null && rec !== sel),
  };
}

export async function listarCandidatosPorPerfil({
  perfil,
  submoduloCodigo,
  centroCodigo = null,
  alcanceTransversal = false,
  search = '',
  client = null,
} = {}) {
  let usuarios = [];
  if (alcanceTransversal) {
    const { rows } = await queryClient(
      client,
      `SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.permisos,
              u.centro, u.codigo_centro_costo, u.activo
       FROM usuarios u WHERE u.activo = TRUE`,
    );
    usuarios = rows;
  } else if (centroCodigo) {
    const c = normalizarCodigoCentro(centroCodigo);
    const { rows } = await queryClient(
      client,
      `SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.permisos,
              u.centro, u.codigo_centro_costo, u.activo
       FROM usuarios u
       WHERE u.activo = TRUE
         AND (
           UPPER(REPLACE(REPLACE(COALESCE(u.centro, ''), ' ', ''), '.', '')) = $1
           OR UPPER(REPLACE(REPLACE(COALESCE(u.codigo_centro_costo, ''), ' ', ''), '.', '')) = $1
         )`,
      [c],
    );
    usuarios = rows;
  }

  let elegibles = usuarios
    .filter((u) => esUsuarioElegibleParaPerfil(u, perfil, submoduloCodigo))
    .filter((u) => alcanceTransversal || usuarioPerteneceCentro(u, centroCodigo))
    .map((u) => mapCandidato(u));

  if (elegibles.length === 1) {
    return {
      recomendado: {
        ...elegibles[0],
        etiqueta: 'Responsable recomendado',
        recomendado: true,
        fuente: 'resolucion_automatica',
      },
      candidatos: [],
      resolucion_automatica: { usuarioId: elegibles[0].id, ambiguo: false },
    };
  }

  if (elegibles.length > 1) {
    elegibles.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return {
      recomendado: null,
      candidatos: elegibles,
      resolucion_automatica: { usuarioId: null, ambiguo: true, candidatos: elegibles.length },
    };
  }

  return {
    recomendado: null,
    candidatos: [],
    resolucion_automatica: { usuarioId: null, ambiguo: true, motivo: 'sin_candidatos', candidatos: 0 },
  };
}

/**
 * Lista etapas destino + candidatos PERSONA para un evento de workflow.
 */
export async function listarCandidatosTransicion(
  requerimientoId,
  eventoCodigo,
  { search = '' } = {},
  row = null,
  client = null,
) {
  const ev = String(eventoCodigo || '').toUpperCase();

  if (ev === 'REQUERIMIENTO_ENVIADO_EVALUACION') {
    const data = await listarCandidatosDerivacionEvaluacion(requerimientoId, { search }, row, client);
    const { transicion, metaDestino, etapaOrigen } = await resolveTransicionWorkflow(requerimientoId, ev, row, client);
    return {
      ...data,
      evento_codigo: ev,
      etapa_origen: etapaOrigen,
      etapa_destino: transicion.etapa_destino,
      etapa_destino_label: metaDestino.label || transicion.etapa_destino,
      destinos: [{
        etapa_codigo: transicion.etapa_destino,
        etapa_label: metaDestino.label || transicion.etapa_destino,
        evento_codigo: ev,
        unica: true,
      }],
    };
  }

  const { reqRow, transicion, etapaOrigen, metaDestino } = await resolveTransicionWorkflow(
    requerimientoId,
    ev,
    row,
    client,
  );
  const perfil = mapResponsableDestinoAPerfil(transicion.responsable_destino);
  const submoduloCodigo = metaDestino.submoduloCodigo || transicion.etapa_destino;
  const alcanceTransversal = perfil ? isPerfilAlcanceTransversal(perfil) : true;

  let centroCodigo = null;
  if (!alcanceTransversal) {
    try {
      centroCodigo = normalizarCodigoCentro(resolverCentroDesdeRequerimiento(reqRow).centro_codigo);
    } catch (_) {
      centroCodigo = null;
    }
  }

  const base = perfil
    ? await listarCandidatosPorPerfil({
      perfil,
      submoduloCodigo,
      centroCodigo,
      alcanceTransversal,
      search,
      client,
    })
    : { recomendado: null, candidatos: [], resolucion_automatica: { usuarioId: null, ambiguo: true } };

  let { recomendado, candidatos } = base;
  const q = String(search || '').trim();
  if (q.length >= 2) {
    candidatos = candidatos.filter((c) => matchesSearch(c, q));
    if (recomendado && !matchesSearch(recomendado, q)) recomendado = null;
  }

  return {
    soportado: true,
    evento_codigo: ev,
    etapa_origen: etapaOrigen,
    etapa_destino: transicion.etapa_destino,
    etapa_destino_label: metaDestino.label || transicion.etapa_destino,
    destinos: [{
      etapa_codigo: transicion.etapa_destino,
      etapa_label: metaDestino.label || transicion.etapa_destino,
      evento_codigo: ev,
      unica: true,
    }],
    perfil_responsable: perfil,
    alcance: alcanceTransversal ? 'TRANSVERSAL' : 'CENTRO',
    centro: centroCodigo ? { codigo: centroCodigo } : null,
    recomendado,
    candidatos,
    resolucion_automatica: base.resolucion_automatica,
  };
}

export async function assertUsuarioDestinoTransicionElegible(
  requerimientoId,
  eventoCodigo,
  usuarioId,
  row = null,
  client = null,
) {
  const ev = String(eventoCodigo || '').toUpperCase();
  if (ev === 'REQUERIMIENTO_ENVIADO_EVALUACION') {
    return assertUsuarioDestinoEvaluacionElegible(requerimientoId, usuarioId, row, client);
  }

  const lista = await listarCandidatosTransicion(requerimientoId, ev, {}, row, client);
  const uid = Number(usuarioId);
  const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
  const found = todos.find((c) => c.id === uid);
  if (!found) {
    const err = new Error('Usuario destino no elegible para la transición');
    err.status = 422;
    err.code = 'RESPONSABLE_TRANSICION_INVALIDO';
    throw err;
  }
  return { ok: true, candidato: found, recomendado: lista.recomendado, lista };
}

/**
 * Piloto RC8.17.3 — aplica PERSONA seleccionada + metadata en transiciones piloto.
 */
export async function applyPilotTransicionPersona({
  resp,
  usuarioDestinoId = null,
  unidadDestino = null,
  requerimientoId,
  row = null,
  etapaCodigo = 'EVALUACION',
  eventoCodigo = '',
  client = null,
  metadata = {},
} = {}) {
  const meta = getEtapaMeta(etapaCodigo) || getEtapaMeta('EVALUACION');
  const unidadCtx = unidadDestino || meta?.responsableLabel || 'Responsable';

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
      metaExtra: buildMetadataSeleccionResponsable(sel, metadata, {
        etapa_origen: metadata.etapa_origen || null,
        etapa_destino: metadata.etapa_destino || etapaCodigo,
        evento: eventoCodigo || metadata.evento || null,
      }),
    };
  }

  const lista = await listarCandidatosTransicion(requerimientoId, eventoCodigo, {}, row, client);
  const autoId = lista.resolucion_automatica?.usuarioId;
  if (autoId) {
    return applyPilotTransicionPersona({
      resp,
      usuarioDestinoId: autoId,
      unidadDestino: unidadCtx,
      requerimientoId,
      row,
      etapaCodigo,
      eventoCodigo,
      client,
      metadata: {
        ...metadata,
        responsable_recomendado_id: autoId,
        reasignacion_manual: false,
      },
    });
  }

  return {
    resp,
    ambiguedad: lista.resolucion_automatica || { ambiguo: true },
    metaExtra: {},
  };
}

const ETAPAS_OBSERVACION_DEC = Object.freeze(['REGISTRO', 'EVALUACION', 'PROGRAMACION']);

/**
 * Piloto RC8.17.3B — DEC observa hacia REGISTRO / EVALUACION / PROGRAMACION.
 * Etapa = destino, estado OBSERVADO, responsable PERSONA seleccionada.
 */
export function applyPilotObservacionDecDestino({
  resp,
  usuarioDestinoId = null,
  unidadDestino = null,
  metadata = {},
  etapaEfectiva = 'DEC',
  labels = {},
} = {}) {
  const etapaDest = String(
    metadata.etapa_destino || metadata.destino_etapa || '',
  ).toUpperCase().replace('REGISTRADO', 'REGISTRO');

  if (!ETAPAS_OBSERVACION_DEC.includes(etapaDest)) {
    return {
      resp,
      etapaEfectiva,
      labels,
      metaExtra: {},
      usuarioDestinoEfectivo: usuarioDestinoId,
    };
  }

  const metaEtapa = getEtapaMeta(etapaDest) || getEtapaMeta('REGISTRO');
  const unidadCtx = unidadDestino || metaEtapa?.responsableLabel || 'Responsable';
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

  const metaExtra = buildMetadataSeleccionResponsable(uid, metadata, {
    etapa_origen: metadata.etapa_origen || 'DEC',
    etapa_destino: etapaDest,
    evento: metadata.evento || 'DEC_OBSERVADA',
    pilot_observacion_dec_destino: true,
  });

  return {
    resp: newResp,
    etapaEfectiva: etapaDest,
    labels: {
      ...labels,
      etapaCodigo: etapaDest,
      etapaLabel: metaEtapa?.label || etapaDest,
      estadoCodigo: 'OBSERVADO',
      estadoLabel: 'Observado',
    },
    metaExtra,
    usuarioDestinoEfectivo: uid,
  };
}

export default {
  EVENTOS_PILOT_EN_TRAMITE,
  EVENTOS_TRANSICION_PERSONA,
  isEventoTransicionPersona,
  mapResponsableDestinoAPerfil,
  isPerfilAlcanceTransversal,
  esUsuarioElegibleParaPerfil,
  resolveTransicionWorkflow,
  getPilotEstadoLabelsForEvento,
  buildMetadataSeleccionResponsable,
  listarCandidatosTransicion,
  listarCandidatosPorPerfil,
  assertUsuarioDestinoTransicionElegible,
  applyPilotTransicionPersona,
  applyPilotObservacionDecDestino,
  ETAPAS_OBSERVACION_DEC,
};
