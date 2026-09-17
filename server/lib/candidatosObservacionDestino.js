/**
 * RC8.17.2B-F1.1 — Candidatos elegibles para Persona destino en observaciones.
 * Alcance piloto: destino Registro de Requerimiento.
 * No expone directorio completo de usuarios; requiere acceso al expediente.
 */
import { query } from '../db.js';
import { getEtapaMeta } from '../../shared/workflow/etapas.js';
import { hasFunctionalProfile, PERFILES_FUNCIONALES } from '../utils/userRoleCatalog.js';
import { getActividadesForSubmodulo, normalizePermisos } from './permissionsCatalog.js';
import { resolverCentroDesdeRequerimiento, normalizarCodigoCentro } from './recepcionBienesAlcance.js';
import { listarCandidatosDerivacionEvaluacion } from './pilotRegistroEvaluacion.js';
import {
  listarCandidatosPorPerfil,
  resolveUnidadAdquisicionesKeys,
  esElegibleDirectorUnidadAdquisiciones,
  esCuentaLegacyDecSemilla,
  esUsuarioElegibleParaPerfil,
} from './workflowTransicionResponsable.js';
import { resolveEmisorObservacionRetorno } from './pilotRegistroEvaluacion.js';

const DESTINO_REGISTRO_LABELS = Object.freeze([
  'Registro de Requerimiento',
  'Registro de Requerimientos',
]);

const DESTINO_EVALUACION_LABELS = Object.freeze([
  'Evaluación de Requerimiento',
  'Evaluacion de Requerimiento',
]);

const DESTINO_PROGRAMACION_LABELS = Object.freeze([
  'Programación',
  'Programacion',
]);

export const DESTINOS_OBSERVACION_DEC = Object.freeze([
  ...DESTINO_REGISTRO_LABELS,
  ...DESTINO_EVALUACION_LABELS,
  ...DESTINO_PROGRAMACION_LABELS,
]);

const ACTIVIDADES_REG_ELEGIBLES = Object.freeze(['VER', 'CREAR', 'EDITAR', 'OBSERVAR', 'DERIVAR']);

function nombreUsuario(u = {}) {
  const comp = [u.apellidos, u.nombres].filter(Boolean).join(' ').trim();
  return comp || u.nombre || u.username || u.dni || (u.id ? `Usuario #${u.id}` : '');
}

function usuarioPerteneceCentro(u, centroCodigo) {
  const c = normalizarCodigoCentro(centroCodigo);
  if (!c) return false;
  const uc = normalizarCodigoCentro(u.centro);
  const ucc = normalizarCodigoCentro(u.codigo_centro_costo);
  return uc === c || ucc === c;
}

export function esDestinoRegistroRequerimiento(destinoSubmodulo = '') {
  const s = String(destinoSubmodulo || '').trim();
  return DESTINO_REGISTRO_LABELS.some((l) => l.toLowerCase() === s.toLowerCase())
    || /^registro de requerimiento/i.test(s);
}

export function esDestinoEvaluacionRequerimiento(destinoSubmodulo = '') {
  const s = String(destinoSubmodulo || '').trim().toLowerCase();
  return DESTINO_EVALUACION_LABELS.some((l) => l.toLowerCase() === s)
    || /^evaluaci[oó]n de requerimiento/i.test(s);
}

export function esDestinoProgramacion(destinoSubmodulo = '') {
  const s = String(destinoSubmodulo || '').trim().toLowerCase();
  return DESTINO_PROGRAMACION_LABELS.some((l) => l.toLowerCase() === s)
    || s === 'programacion' || s === 'programación';
}

export function esDestinoDecSubmodulo(destinoSubmodulo = '') {
  const s = String(destinoSubmodulo || '').trim().toUpperCase();
  return s === 'DEC' || /^dependencia encargada/i.test(String(destinoSubmodulo || ''));
}

export function mapDestinoSubmoduloAEtapaObservacion(destinoSubmodulo = '') {
  if (esDestinoRegistroRequerimiento(destinoSubmodulo)) return 'REGISTRO';
  if (esDestinoEvaluacionRequerimiento(destinoSubmodulo)) return 'EVALUACION';
  if (esDestinoProgramacion(destinoSubmodulo)) return 'PROGRAMACION';
  if (esDestinoDecSubmodulo(destinoSubmodulo)) return 'DEC';
  return null;
}

/** RC8.17.8H5-08A — Retorno subsanación desde observación emitida en Coordinación CM. */
export function esDestinoSubsanacionRetornoContMenores(destinoSubmodulo = '') {
  const s = String(destinoSubmodulo || '').trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  if (lower === 'invitaciones') return true;
  if (/^coordinaci[oó]n cm$/i.test(s)) return true;
  if (/actos prep/i.test(s)) return true;
  return false;
}

/**
 * Etapa ERV para subsanación retorno Cont.Menores (submódulo Coordinación CM).
 */
export function mapDestinoSubmoduloAEtapaSubsanacion(destinoSubmodulo = '') {
  if (esDestinoSubsanacionRetornoContMenores(destinoSubmodulo)) return 'COORDINACION_CM';
  return mapDestinoSubmoduloAEtapaObservacion(destinoSubmodulo);
}

export function esDestinoObservacionDecSoportado(destinoSubmodulo = '') {
  return mapDestinoSubmoduloAEtapaObservacion(destinoSubmodulo) != null;
}

function permisosRegistroParaElegibilidad(usuarioRow) {
  const permisos = normalizePermisos(usuarioRow.permisos, usuarioRow.rol);
  const acts = getActividadesForSubmodulo(permisos, 'REGISTRO_REQUERIMIENTO');
  if (acts.some((a) => ACTIVIDADES_REG_ELEGIBLES.includes(String(a).toUpperCase()))) {
    return permisos;
  }
  // Legacy AU (p. ej. rol coordinador + permisos JSON vacío): perfil funcional AU sin submódulo Registro en rol.
  const perfilAu = hasFunctionalProfile(
    {
      id: usuarioRow.id,
      rol: usuarioRow.rol,
      cargo: usuarioRow.cargo,
      permisos: usuarioRow.permisos,
    },
    PERFILES_FUNCIONALES.AREA_USUARIA,
  );
  if (perfilAu) {
    return normalizePermisos(null, 'au');
  }
  return permisos;
}

export function esElegibleRegistroRequerimiento(usuarioRow, centroCodigo) {
  if (!usuarioRow?.activo) return false;
  if (!usuarioPerteneceCentro(usuarioRow, centroCodigo)) return false;
  const perfilAu = hasFunctionalProfile(
    {
      id: usuarioRow.id,
      rol: usuarioRow.rol,
      cargo: usuarioRow.cargo,
      permisos: usuarioRow.permisos,
    },
    PERFILES_FUNCIONALES.AREA_USUARIA,
  );
  if (!perfilAu) return false;
  const permisos = permisosRegistroParaElegibilidad(usuarioRow);
  const acts = getActividadesForSubmodulo(permisos, 'REGISTRO_REQUERIMIENTO');
  return acts.some((a) => ACTIVIDADES_REG_ELEGIBLES.includes(String(a).toUpperCase()));
}

function matchesSearch(u, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (needle.length < 2) return true;
  const parts = [
    u.username,
    u.dni,
    u.nombre,
    u.apellidos,
    u.nombres,
    nombreUsuario(u),
    u.cargo,
  ].filter(Boolean).map((x) => String(x).toLowerCase());
  return parts.some((p) => p.includes(needle));
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

async function queryFn(client, text, params) {
  if (client?.query) return client.query(text, params);
  return query(text, params);
}

/**
 * Resuelve persona recomendada (responsable anterior REGISTRO), sin hardcodear IDs.
 */
export async function resolveRecomendadoRegistro(requerimientoId, client = null) {
  const rid = Number(requerimientoId);
  if (!Number.isFinite(rid) || rid <= 0) return null;

  const { rows: asig } = await queryFn(
    client,
    `SELECT a.usuario_id, u.id, u.username, u.apellidos, u.nombres, u.nombre, u.dni,
            u.cargo, u.rol, u.permisos, u.centro, u.codigo_centro_costo, u.activo, a.asignado_at
     FROM expediente_asignaciones a
     JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.requerimiento_id = $1
       AND UPPER(TRIM(a.etapa_codigo)) = 'REGISTRO'
       AND UPPER(TRIM(a.tipo_responsable)) = 'PERSONA'
       AND a.usuario_id IS NOT NULL
     ORDER BY a.asignado_at DESC NULLS LAST, a.id DESC
     LIMIT 1`,
    [rid],
  );
  if (asig.length) {
    return mapCandidato(asig[0], { fuente: 'asignacion_registro', asignado_at: asig[0].asignado_at });
  }

  const { rows: ev } = await queryFn(
    client,
    `SELECT we.actor_id AS usuario_id, u.id, u.username, u.apellidos, u.nombres, u.nombre, u.dni,
            u.cargo, u.rol, u.permisos, u.centro, u.codigo_centro_costo, u.activo
     FROM workflow_eventos we
     LEFT JOIN usuarios u ON u.id = we.actor_id
     WHERE we.expediente_id = $1
       AND UPPER(TRIM(we.evento_codigo)) = 'REQUERIMIENTO_REGISTRADO'
       AND we.actor_id IS NOT NULL
     ORDER BY we.id ASC
     LIMIT 1`,
    [rid],
  );
  if (ev.length && ev[0].id) {
    return mapCandidato(ev[0], { fuente: 'evento_registro' });
  }

  const { rows: erv } = await queryFn(
    client,
    `SELECT e.responsable_usuario_id AS usuario_id, u.id, u.username, u.apellidos, u.nombres,
            u.nombre, u.dni, u.cargo, u.rol, u.permisos, u.centro, u.codigo_centro_costo, u.activo
     FROM expediente_estado_vigente e
     LEFT JOIN usuarios u ON u.id = e.responsable_usuario_id
     WHERE e.requerimiento_id = $1
       AND UPPER(TRIM(e.etapa_codigo)) = 'REGISTRO'
       AND UPPER(TRIM(e.responsable_tipo)) = 'PERSONA'
       AND e.responsable_usuario_id IS NOT NULL
     LIMIT 1`,
    [rid],
  );
  if (erv.length && erv[0].id) {
    return mapCandidato(erv[0], { fuente: 'erv_registro' });
  }

  return null;
}

/** Participante histórico más reciente en etapa EVALUACION (asignaciones / evento envío). */
export async function resolveRecomendadoEvaluacion(requerimientoId, client = null) {
  const rid = Number(requerimientoId);
  if (!Number.isFinite(rid) || rid <= 0) return null;

  const { rows: asig } = await queryFn(
    client,
    `SELECT a.usuario_id, u.id, u.username, u.apellidos, u.nombres, u.nombre, u.dni,
            u.cargo, u.rol, u.permisos, u.centro, u.codigo_centro_costo, u.activo, a.asignado_at
     FROM expediente_asignaciones a
     JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.requerimiento_id = $1
       AND UPPER(TRIM(a.etapa_codigo)) = 'EVALUACION'
       AND UPPER(TRIM(a.tipo_responsable)) = 'PERSONA'
       AND a.usuario_id IS NOT NULL
     ORDER BY a.asignado_at DESC NULLS LAST, a.id DESC
     LIMIT 1`,
    [rid],
  );
  if (asig.length) {
    return mapCandidato(asig[0], { fuente: 'asignacion_evaluacion', asignado_at: asig[0].asignado_at });
  }

  const { rows: ev } = await queryFn(
    client,
    `SELECT we.metadata, we.actor_id AS usuario_id, u.id, u.username, u.apellidos, u.nombres,
            u.nombre, u.dni, u.cargo, u.rol, u.permisos, u.centro, u.codigo_centro_costo, u.activo
     FROM workflow_eventos we
     LEFT JOIN usuarios u ON u.id = COALESCE(
       NULLIF((we.metadata->>'usuario_destino_id')::int, 0),
       NULLIF((we.metadata->>'responsable_seleccionado_id')::int, 0),
       we.actor_id
     )
     WHERE we.expediente_id = $1
       AND UPPER(TRIM(we.evento_codigo)) = 'REQUERIMIENTO_ENVIADO_EVALUACION'
     ORDER BY we.id DESC
     LIMIT 1`,
    [rid],
  );
  if (ev.length && ev[0].id) {
    return mapCandidato(ev[0], { fuente: 'evento_envio_evaluacion' });
  }

  return null;
}

function aplicarRecomendadoHistorico({
  recomendadoRaw,
  elegibles,
  esElegibleFn,
  centroCodigo = null,
}) {
  let recomendado = null;
  let recomendadoInactivo = null;
  if (!recomendadoRaw?.id) {
    return { recomendado, recomendadoInactivo };
  }
  const enElegibles = elegibles.find((c) => c.id === recomendadoRaw.id);
  const cand = enElegibles || recomendadoRaw;
  const rowCheck = {
    ...recomendadoRaw,
    activo: cand.activo,
    permisos: recomendadoRaw.permisos,
    rol: recomendadoRaw.rol,
    centro: recomendadoRaw.centro,
    codigo_centro_costo: recomendadoRaw.codigo_centro_costo,
  };
  if (cand.activo !== false && esElegibleFn(rowCheck, centroCodigo)) {
    recomendado = {
      ...(enElegibles || mapCandidato(recomendadoRaw)),
      etiqueta: 'Participante anterior',
      recomendado: true,
      fuente: recomendadoRaw.fuente,
    };
  } else if (cand.activo === false) {
    recomendadoInactivo = {
      ...mapCandidato(recomendadoRaw),
      etiqueta: 'Participante anterior (inactivo)',
      seleccionable: false,
    };
  }
  return { recomendado, recomendadoInactivo };
}

function filtrarListaCandidatosObservacion({ recomendado, candidatos, search }) {
  const q = String(search || '').trim();
  let rec = recomendado;
  let otros = candidatos.filter((c) => !rec || c.id !== rec.id);
  if (q.length >= 2) {
    otros = otros.filter((c) => matchesSearch(c, q));
    if (rec && !matchesSearch(rec, q)) rec = null;
  }
  otros.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { recomendado: rec, candidatos: otros };
}

/**
 * @returns {Promise<{ destino: string, recomendado: object|null, recomendado_inactivo: object|null, candidatos: object[] }>}
 */
export async function listarCandidatosObservacionDestino({
  requerimientoId,
  destinoSubmodulo = '',
  search = '',
  client = null,
} = {}) {
  const rid = Number(requerimientoId);
  if (!Number.isFinite(rid) || rid <= 0) {
    const err = new Error('requerimientoId inválido');
    err.status = 400;
    throw err;
  }

  const etapaDest = mapDestinoSubmoduloAEtapaObservacion(destinoSubmodulo);

  if (!etapaDest) {
    return {
      destino: String(destinoSubmodulo || ''),
      soportado: false,
      recomendado: null,
      recomendado_inactivo: null,
      candidatos: [],
    };
  }

  const { rows: reqRows } = await queryFn(client, 'SELECT * FROM requerimientos WHERE id = $1', [rid]);
  if (!reqRows.length) {
    const err = new Error('Requerimiento no encontrado');
    err.status = 404;
    throw err;
  }
  const row = reqRows[0];

  if (etapaDest === 'EVALUACION') {
    const data = await listarCandidatosDerivacionEvaluacion(rid, { search: '' }, row, client);
    const meta = getEtapaMeta('EVALUACION');
    let centroCodigo = null;
    try {
      centroCodigo = normalizarCodigoCentro(resolverCentroDesdeRequerimiento(row).centro_codigo);
    } catch (_) { /* sin centro */ }

    const elegibles = [
      ...(data.recomendado ? [data.recomendado] : []),
      ...(data.candidatos || []),
    ].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

    const { esDirectorEvaluacionElegible } = await import('./pilotRegistroEvaluacion.js');
    const historico = await resolveRecomendadoEvaluacion(rid, client);
    const { recomendado: recHist, recomendadoInactivo } = aplicarRecomendadoHistorico({
      recomendadoRaw: historico,
      elegibles,
      esElegibleFn: (u) => esDirectorEvaluacionElegible(u) && (
        !centroCodigo || usuarioPerteneceCentro(u, centroCodigo)
      ),
      centroCodigo,
    });

    let recomendado = recHist || data.recomendado;
    let candidatos = elegibles.filter((c) => !recomendado || c.id !== recomendado.id);
    if (recomendado && recHist && data.recomendado && data.recomendado.id !== recHist.id) {
      candidatos = [
        ...candidatos.filter((c) => c.id !== data.recomendado.id),
        data.recomendado,
      ].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
    }

    const filtrado = filtrarListaCandidatosObservacion({
      recomendado,
      candidatos,
      search,
    });

    return {
      destino: destinoSubmodulo,
      destino_etapa: 'EVALUACION',
      destino_submodulo_codigo: meta?.submoduloCodigo || 'EVALUACION_REQUERIMIENTO',
      soportado: true,
      perfil_responsable: PERFILES_FUNCIONALES.DIRECTOR_CENTRO,
      recomendado: filtrado.recomendado,
      recomendado_inactivo: recomendadoInactivo,
      candidatos: filtrado.candidatos,
      centro: data.centro || null,
      resolucion_automatica: data.resolucion_automatica,
    };
  }

  if (etapaDest === 'PROGRAMACION') {
    const meta = getEtapaMeta('PROGRAMACION');
    const base = await listarCandidatosPorPerfil({
      perfil: PERFILES_FUNCIONALES.PROGRAMACION,
      submoduloCodigo: meta?.submoduloCodigo || 'PROGRAMACION',
      alcanceTransversal: true,
      search,
      client,
    });
    return {
      destino: destinoSubmodulo,
      destino_etapa: 'PROGRAMACION',
      destino_submodulo_codigo: meta?.submoduloCodigo || 'PROGRAMACION',
      soportado: true,
      perfil_responsable: PERFILES_FUNCIONALES.PROGRAMACION,
      alcance: 'TRANSVERSAL',
      recomendado: base.recomendado,
      recomendado_inactivo: null,
      candidatos: base.candidatos || [],
      resolucion_automatica: base.resolucion_automatica,
    };
  }

  // REGISTRO — lógica piloto existente
  if (!esDestinoRegistroRequerimiento(destinoSubmodulo)) {
    return {
      destino: String(destinoSubmodulo || ''),
      soportado: false,
      recomendado: null,
      recomendado_inactivo: null,
      candidatos: [],
    };
  }

  let centro;
  try {
    centro = resolverCentroDesdeRequerimiento(row);
  } catch (err) {
    return {
      destino: destinoSubmodulo,
      soportado: true,
      centro: null,
      error: err.code || 'centro_no_resuelto',
      recomendado: null,
      recomendado_inactivo: null,
      candidatos: [],
    };
  }

  const centroCodigo = normalizarCodigoCentro(centro.centro_codigo);
  const { rows: usuarios } = await queryFn(
    client,
    `SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol,
            u.permisos, u.centro, u.codigo_centro_costo, u.activo
     FROM usuarios u
     WHERE u.activo = TRUE
       AND (
         UPPER(REPLACE(REPLACE(COALESCE(u.centro, ''), ' ', ''), '.', '')) = $1
         OR UPPER(REPLACE(REPLACE(COALESCE(u.codigo_centro_costo, ''), ' ', ''), '.', '')) = $1
       )`,
    [centroCodigo],
  );

  const elegibles = usuarios
    .filter((u) => esElegibleRegistroRequerimiento(u, centroCodigo))
    .map((u) => mapCandidato(u));

  const recomendadoRaw = await resolveRecomendadoRegistro(rid, client);
  const { recomendado, recomendadoInactivo } = aplicarRecomendadoHistorico({
    recomendadoRaw,
    elegibles,
    esElegibleFn: esElegibleRegistroRequerimiento,
    centroCodigo,
  });

  const filtrado = filtrarListaCandidatosObservacion({
    recomendado,
    candidatos: elegibles,
    search,
  });
  const otros = filtrado.candidatos;
  const recomendadoFinal = filtrado.recomendado;

  const meta = getEtapaMeta('REGISTRO');
  return {
    destino: destinoSubmodulo,
    destino_etapa: 'REGISTRO',
    destino_submodulo_codigo: meta?.submoduloCodigo || 'REGISTRO_REQUERIMIENTO',
    soportado: true,
    centro: { codigo: centroCodigo, nombre: centro.centro_nombre || centroCodigo },
    recomendado: recomendadoFinal,
    recomendado_inactivo: recomendadoInactivo,
    candidatos: otros,
  };
}

async function loadUsuarioRow(usuarioId, client) {
  const uid = Number(usuarioId);
  if (!Number.isFinite(uid)) return null;
  const { rows } = await queryFn(
    client,
    `SELECT id, dni, username, apellidos, nombres, nombre, cargo, rol, permisos, centro, codigo_centro_costo, activo
     FROM usuarios WHERE id = $1`,
    [uid],
  );
  return rows[0] || null;
}

export async function esElegiblePersonaDec(usuarioRow = {}, client = null) {
  if (!usuarioRow?.activo) return false;
  if (esCuentaLegacyDecSemilla(usuarioRow)) return false;
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  if (esElegibleDirectorUnidadAdquisiciones(usuarioRow, uadKeys)) return true;
  return esUsuarioElegibleParaPerfil(usuarioRow, PERFILES_FUNCIONALES.DEC, 'DEC');
}

/** Personas activas elegibles para recibir trabajo en DEC (Director UAD + perfil DEC operativo). */
export async function listarPersonasElegiblesDec({ search = '' } = {}, client = null) {
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  const codigos = [...uadKeys.codigos];
  const ccParam = `${uadKeys.costPrefix}%`;

  const { rows: usuarios } = await queryFn(
    client,
    `SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol,
            u.permisos, u.centro, u.codigo_centro_costo, u.activo
     FROM usuarios u
     WHERE u.activo = TRUE
       AND (
         UPPER(REPLACE(REPLACE(COALESCE(u.centro, ''), ' ', ''), '.', '')) = ANY($1::text[])
         OR UPPER(REPLACE(REPLACE(COALESCE(u.codigo_centro_costo, ''), ' ', ''), '.', '')) LIKE $2
       )`,
    [codigos, ccParam],
  );

  const directors = usuarios
    .filter((u) => esElegibleDirectorUnidadAdquisiciones(u, uadKeys))
    .map((u) => mapCandidato(u));

  const perfilDec = await listarCandidatosPorPerfil({
    perfil: PERFILES_FUNCIONALES.DEC,
    submoduloCodigo: 'DEC',
    alcanceTransversal: true,
    search: '',
    client,
  });
  const decPerfil = [...(perfilDec.recomendado ? [perfilDec.recomendado] : []), ...(perfilDec.candidatos || [])]
    .filter((c) => {
      const row = usuarios.find((u) => Number(u.id) === Number(c.id)) || c;
      return !esCuentaLegacyDecSemilla(row);
    })
    .map((c) => mapCandidato(c));

  const merged = [...directors, ...decPerfil].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
  const q = String(search || '').trim();
  if (q.length >= 2) {
    return merged.filter((c) => matchesSearch(c, q));
  }
  return merged;
}

/**
 * Candidatos PERSONA para subsanación (retorno al emisor de la observación abierta).
 */
export async function listarCandidatosSubsanacionDestino({
  requerimientoId,
  destinoSubmodulo = '',
  observacionId = null,
  search = '',
  client = null,
} = {}) {
  const etapaDest = mapDestinoSubmoduloAEtapaSubsanacion(destinoSubmodulo);
  if (!etapaDest) {
    return {
      destino: String(destinoSubmodulo || ''),
      soportado: false,
      recomendado: null,
      recomendado_inactivo: null,
      candidatos: [],
    };
  }

  const emisorId = await resolveEmisorObservacionRetorno(requerimientoId, client, { observacionId });
  const emisorRow = emisorId ? await loadUsuarioRow(emisorId, client) : null;

  if (etapaDest === 'COORDINACION_CM' && esDestinoSubsanacionRetornoContMenores(destinoSubmodulo)) {
    const { listarCandidatosPoolContMenoresEquipoUad } = await import('./workflowTransicionResponsable.js');
    const base = await listarCandidatosPoolContMenoresEquipoUad({ search: '' }, client);
    const elegibles = [...(base.recomendado ? [base.recomendado] : []), ...(base.candidatos || [])]
      .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
    const idsElegibles = new Set(elegibles.map((c) => Number(c.id)));

    const esElegibleCmRetorno = (u) => {
      if (!u || u.activo === false) return false;
      if (emisorId != null && Number(u.id) === Number(emisorId)) return true;
      return idsElegibles.has(Number(u.id));
    };

    const emisorCand = emisorRow
      ? { ...mapCandidato(emisorRow, { fuente: 'emisor_observacion' }), permisos: emisorRow.permisos, rol: emisorRow.rol }
      : null;
    const { recomendado, recomendadoInactivo } = aplicarRecomendadoHistorico({
      recomendadoRaw: emisorCand,
      elegibles,
      esElegibleFn: esElegibleCmRetorno,
      centroCodigo: null,
    });

    let recomendadoFinal = recomendado;
    if (emisorId && emisorRow && emisorRow.activo !== false && esElegibleCmRetorno(emisorRow)) {
      recomendadoFinal = {
        ...mapCandidato(emisorRow, {
          fuente: 'emisor_observacion',
          recomendado: true,
          etiqueta: 'Emisor de la observación',
        }),
      };
    }
    let candidatos = elegibles.filter((c) => !recomendadoFinal || c.id !== recomendadoFinal.id);
    const filtrado = filtrarListaCandidatosObservacion({
      recomendado: recomendadoFinal,
      candidatos,
      search,
    });
    const meta = getEtapaMeta('COORDINACION_CM');
    return {
      destino: destinoSubmodulo,
      destino_etapa: 'COORDINACION_CM',
      destino_submodulo_codigo: meta?.submoduloCodigo || 'COORDINACION_CM',
      soportado: true,
      perfil_responsable: base.perfil_responsable,
      equipo_uad: base.equipo_uad,
      recomendado: filtrado.recomendado,
      recomendado_inactivo: recomendadoInactivo,
      candidatos: filtrado.candidatos,
      emisor_observacion_id: emisorId,
    };
  }

  if (etapaDest === 'DEC') {
    const uadKeys = await resolveUnidadAdquisicionesKeys(client);
    const elegibles = await listarPersonasElegiblesDec({ search: '' }, client);
    const emisorCand = emisorRow
      ? { ...mapCandidato(emisorRow, { fuente: 'emisor_observacion' }), permisos: emisorRow.permisos, rol: emisorRow.rol }
      : null;
    const { recomendado, recomendadoInactivo } = aplicarRecomendadoHistorico({
      recomendadoRaw: emisorCand,
      elegibles,
      esElegibleFn: (u) => esElegibleDirectorUnidadAdquisiciones(u, uadKeys)
        || (esUsuarioElegibleParaPerfil(u, PERFILES_FUNCIONALES.DEC, 'DEC') && !esCuentaLegacyDecSemilla(u)),
      centroCodigo: null,
    });
    const filtrado = filtrarListaCandidatosObservacion({
      recomendado,
      candidatos: elegibles,
      search,
    });
    const meta = getEtapaMeta('DEC');
    return {
      destino: destinoSubmodulo,
      destino_etapa: 'DEC',
      destino_submodulo_codigo: meta?.submoduloCodigo || 'DEC',
      soportado: true,
      recomendado: filtrado.recomendado,
      recomendado_inactivo: recomendadoInactivo,
      candidatos: filtrado.candidatos,
      emisor_observacion_id: emisorId,
    };
  }

  const base = await listarCandidatosObservacionDestino({
    requerimientoId,
    destinoSubmodulo,
    search: '',
    client,
  });
  if (!base.soportado) return { ...base, emisor_observacion_id: emisorId };

  const elegibles = [...(base.recomendado ? [base.recomendado] : []), ...(base.candidatos || [])]
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  const esElegibleFn = etapaDest === 'REGISTRO'
    ? (u, cc) => esElegibleRegistroRequerimiento(u, cc)
    : () => true;

  let centroCodigo = null;
  if (etapaDest === 'REGISTRO') {
    const { rows: reqRows } = await queryFn(client, 'SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
    try {
      centroCodigo = normalizarCodigoCentro(resolverCentroDesdeRequerimiento(reqRows[0]).centro_codigo);
    } catch (_) { /* noop */ }
  }

  const emisorCand = emisorRow
    ? { ...mapCandidato(emisorRow, { fuente: 'emisor_observacion' }), permisos: emisorRow.permisos, rol: emisorRow.rol }
    : null;
  const { recomendado, recomendadoInactivo } = aplicarRecomendadoHistorico({
    recomendadoRaw: emisorCand,
    elegibles,
    esElegibleFn: (u) => esElegibleFn(u, centroCodigo),
    centroCodigo,
  });

  let recomendadoFinal = recomendado || base.recomendado;
  let candidatos = elegibles.filter((c) => !recomendadoFinal || c.id !== recomendadoFinal.id);
  if (recomendadoFinal && base.recomendado && base.recomendado.id !== recomendadoFinal.id) {
    candidatos = [...candidatos, base.recomendado].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
  }

  const filtrado = filtrarListaCandidatosObservacion({
    recomendado: recomendadoFinal,
    candidatos,
    search,
  });

  return {
    ...base,
    recomendado: filtrado.recomendado,
    recomendado_inactivo: recomendadoInactivo || base.recomendado_inactivo,
    candidatos: filtrado.candidatos,
    emisor_observacion_id: emisorId,
  };
}

export async function assertUsuarioDestinoSubsanacionElegible(
  requerimientoId,
  destinoSubmodulo,
  usuarioId,
  observacionId = null,
  client = null,
) {
  const lista = await listarCandidatosSubsanacionDestino({
    requerimientoId,
    destinoSubmodulo,
    observacionId,
    client,
  });
  if (!lista.soportado) {
    const err = new Error('Destino de subsanación no soportado');
    err.status = 422;
    err.code = 'DESTINO_SUBSANACION_INVALIDO';
    throw err;
  }
  const uid = Number(usuarioId);
  const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
  const found = todos.find((c) => c.id === uid);
  if (!found) {
    const err = new Error('Usuario destino no elegible para la subsanación');
    err.status = 422;
    err.code = 'RESPONSABLE_SUBSANACION_INVALIDO';
    throw err;
  }
  return { ok: true, candidato: found, recomendado: lista.recomendado, lista };
}

export async function assertUsuarioDestinoObservacionElegible(
  requerimientoId,
  destinoSubmodulo,
  usuarioId,
  row = null,
  client = null,
) {
  const lista = await listarCandidatosObservacionDestino({
    requerimientoId,
    destinoSubmodulo,
    client,
  });
  if (!lista.soportado) {
    const err = new Error('Destino de observación no soportado');
    err.status = 422;
    err.code = 'DESTINO_OBSERVACION_INVALIDO';
    throw err;
  }
  const uid = Number(usuarioId);
  const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
  const found = todos.find((c) => c.id === uid);
  if (!found) {
    const err = new Error('Usuario destino no elegible para la observación');
    err.status = 422;
    err.code = 'RESPONSABLE_OBSERVACION_INVALIDO';
    throw err;
  }
  return { ok: true, candidato: found, recomendado: lista.recomendado, lista };
}

export default {
  DESTINOS_OBSERVACION_DEC,
  esDestinoRegistroRequerimiento,
  esDestinoEvaluacionRequerimiento,
  esDestinoProgramacion,
  mapDestinoSubmoduloAEtapaObservacion,
  esDestinoObservacionDecSoportado,
  esElegibleRegistroRequerimiento,
  resolveRecomendadoRegistro,
  resolveRecomendadoEvaluacion,
  listarCandidatosObservacionDestino,
  listarCandidatosSubsanacionDestino,
  listarPersonasElegiblesDec,
  assertUsuarioDestinoSubsanacionElegible,
  assertUsuarioDestinoObservacionElegible,
  esDestinoDecSubmodulo,
  esElegiblePersonaDec,
};
