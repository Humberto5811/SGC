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
  normalizeSecurityRole,
  normalizeTextoInstitucional,
  PERFILES_FUNCIONALES,
  PERFILES_TRANSVERSALES,
  ROLES_GENERALES,
  ROLES_SEGURIDAD_LEGACY,
  rolGeneralFromUsuario,
} from '../utils/userRoleCatalog.js';
import { getActividadesForSubmodulo, normalizePermisos } from './permissionsCatalog.js';
import { resolverCentroDesdeRequerimiento, normalizarCodigoCentro } from './recepcionBienesAlcance.js';
import { FUENTE_RESPONSABLE } from './expedienteEstadoPersistido.js';
import { etapaDeRequerimiento, tipoDeRequerimiento } from './workflow/workflowRepository.js';
import {
  listarCandidatosDerivacionEvaluacion,
  assertUsuarioDestinoEvaluacionElegible,
} from './pilotRegistroEvaluacion.js';
import { EQUIPOS_UAD, labelEquipoUad, normalizeEquipoUadCodigo } from '../../shared/equiposUad.js';
import {
  esActorProgramacionPuedeDerivar,
  esCoordinadorEquipoUad,
  esOperadorEquipoUad,
  labelRolGeneralUsuario,
  listarUsuariosCoordinadoresEquipoUadSubmodulo,
  listarUsuariosDestinoContMenoresProgramacionAprobada,
  listarUsuariosDestinoEquipoUadSubmodulo,
  listarOperadoresProgramacionAsignables,
  appendEquipoUadCandidato,
} from './equiposUadUsuario.js';
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
  const equipoUad = normalizeEquipoUadCodigo(u.equipo_uad);
  const uid = Number(u.id);
  const rolGeneral = rolGeneralFromUsuario(u);
  return {
    id: uid,
    usuario_id: uid,
    username: u.username || u.dni || '',
    nombre: nombreUsuario(u),
    cargo: u.cargo || '',
    activo: u.activo !== false,
    centro: u.centro || u.codigo_centro_costo || '',
    equipo_uad: equipoUad,
    equipo_uad_label: labelEquipoUad(equipoUad),
    rol_general: rolGeneral,
    rol_general_label: labelRolGeneralUsuario(u),
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

/** Prefijo estructural de centro de costo UAD (01.04.01.*). */
const UAD_COST_CENTER_PREFIX = '010401';

function normalizarCentroCosto(valor) {
  return String(valor || '').trim().replace(/\./g, '').toUpperCase();
}

function esCentroCatalogoUnidadAdquisiciones(codigo, nombre = '') {
  const cod = normalizarCodigoCentro(codigo);
  if (cod === 'OA') return true;
  const nom = normalizeTextoInstitucional(nombre);
  return nom.includes('unidad de adquisiciones')
    || nom.includes('dependencia encargada de las contrataciones');
}

/**
 * Claves organizacionales de la Unidad de Adquisiciones (DEC).
 * Prioriza catálogo `centros`; respaldo código OA institucional.
 */
export async function resolveUnidadAdquisicionesKeys(client = null) {
  const { rows } = await queryClient(
    client,
    `SELECT codigo, nombre FROM centros WHERE COALESCE(estado, 'Activo') = 'Activo'`,
  );
  const codigos = new Set();
  for (const r of rows) {
    if (esCentroCatalogoUnidadAdquisiciones(r.codigo, r.nombre)) {
      const c = normalizarCodigoCentro(r.codigo);
      if (c) codigos.add(c);
    }
  }
  if (!codigos.size) codigos.add('OA');
  return { codigos, costPrefix: UAD_COST_CENTER_PREFIX };
}

export function esCuentaLegacyDecSemilla(usuarioRow = {}) {
  const user = normalizeTextoInstitucional(usuarioRow.username || usuarioRow.dni || '');
  return user === 'dec' && normalizeSecurityRole(usuarioRow.rol) === ROLES_SEGURIDAD_LEGACY.DEC;
}

export function esDirectorRolGeneral(usuarioRow = {}) {
  if (rolGeneralFromUsuario(usuarioRow) === ROLES_GENERALES.DIRECTOR) return true;
  return normalizeTextoInstitucional(usuarioRow.rol) === 'director';
}

export function usuarioPerteneceUnidadAdquisiciones(usuarioRow, uadKeys) {
  const keys = uadKeys || { codigos: new Set(['OA']), costPrefix: UAD_COST_CENTER_PREFIX };
  const uc = normalizarCodigoCentro(usuarioRow.centro);
  if (keys.codigos.has(uc)) return true;
  const cc = normalizarCentroCosto(usuarioRow.codigo_centro_costo);
  return cc.length > 0 && cc.startsWith(keys.costPrefix);
}

export function esElegibleDirectorUnidadAdquisiciones(usuarioRow, uadKeys) {
  if (!usuarioRow?.activo) return false;
  if (isAdminSecurityRole(usuarioRow)) return false;
  if (esCuentaLegacyDecSemilla(usuarioRow)) return false;
  if (!esDirectorRolGeneral(usuarioRow)) return false;
  return usuarioPerteneceUnidadAdquisiciones(usuarioRow, uadKeys);
}

/**
 * RC8.17 — Evaluación → DEC: Director activo de la Unidad de Adquisiciones (PERSONA).
 */
export async function listarCandidatosDerivacionDec(
  requerimientoId,
  { search = '' } = {},
  row = null,
  client = null,
) {
  const { transicion, metaDestino, etapaOrigen } = await resolveTransicionWorkflow(
    requerimientoId,
    'EVALUACION_APROBADA',
    row,
    client,
  );
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  const codigos = [...uadKeys.codigos];
  const ccParam = `${uadKeys.costPrefix}%`;

  const { rows: usuarios } = await queryClient(
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

  let elegibles = usuarios
    .filter((u) => esElegibleDirectorUnidadAdquisiciones(u, uadKeys))
    .map((u) => mapCandidato(u));

  let recomendado = null;
  if (elegibles.length === 1) {
    recomendado = {
      ...elegibles[0],
      etiqueta: 'Director — Unidad de Adquisiciones',
      recomendado: true,
      fuente: 'resolucion_automatica',
    };
    elegibles = [];
  } else if (elegibles.length > 1) {
    elegibles.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  const q = String(search || '').trim();
  if (q.length >= 2) {
    elegibles = elegibles.filter((c) => matchesSearch(c, q));
    if (recomendado && !matchesSearch(recomendado, q)) recomendado = null;
  }

  return {
    soportado: true,
    evento_codigo: 'EVALUACION_APROBADA',
    etapa_origen: etapaOrigen,
    etapa_destino: transicion.etapa_destino,
    etapa_destino_label: metaDestino.label || transicion.etapa_destino,
    destinos: [{
      etapa_codigo: transicion.etapa_destino,
      etapa_label: metaDestino.label || transicion.etapa_destino,
      evento_codigo: 'EVALUACION_APROBADA',
      unica: true,
    }],
    perfil_responsable: 'DIRECTOR_UAD',
    alcance: 'UNIDAD_ADQUISICIONES',
    centro: { codigos: [...uadKeys.codigos] },
    recomendado,
    candidatos: elegibles,
    resolucion_automatica: recomendado
      ? { usuarioId: recomendado.id, ambiguo: false }
      : { usuarioId: null, ambiguo: elegibles.length !== 1, candidatos: elegibles.length },
  };
}

async function loadReqRow(requerimientoId, row, client) {
  const hasLegacyEtapa = row?.estado_actual != null && String(row.estado_actual).trim() !== ''
    || row?.estadoActual != null && String(row.estadoActual).trim() !== '';
  const hasTipo = row?.tipo != null && String(row.tipo).trim() !== '';
  if (row && hasLegacyEtapa && hasTipo) return row;
  const { rows } = await queryClient(client, 'SELECT * FROM requerimientos WHERE id = $1', [requerimientoId]);
  return rows[0] || row || null;
}

/** Etapa origen para validación workflow: ERV prevalece; legacy solo si no hay ERV. */
export async function resolveEtapaOrigenCanonicaWorkflow(requerimientoId, reqRow, client = null) {
  const rid = parseInt(requerimientoId, 10);
  if (Number.isFinite(rid) && rid > 0) {
    const { rows: ervRows } = await queryClient(
      client,
      `SELECT etapa_codigo FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
      [rid],
    );
    const ervEtapa = ervRows[0]?.etapa_codigo;
    if (ervEtapa) return String(ervEtapa).toUpperCase();
  }
  const legacy = etapaDeRequerimiento(reqRow) || String(reqRow?.estado_actual || reqRow?.estadoActual || '').trim();
  return String(legacy || 'REGISTRO').toUpperCase();
}

export async function resolveTransicionWorkflow(requerimientoId, eventoCodigo, row = null, client = null) {
  const reqRow = await loadReqRow(requerimientoId, row, client);
  if (!reqRow) {
    const err = new Error('Requerimiento no encontrado');
    err.status = 404;
    throw err;
  }
  const tipo = tipoDeRequerimiento(reqRow);
  const etapaOrigen = await resolveEtapaOrigenCanonicaWorkflow(requerimientoId, reqRow, client);
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
              u.centro, u.codigo_centro_costo, u.equipo_uad, u.activo
       FROM usuarios u WHERE u.activo = TRUE`,
    );
    usuarios = rows;
  } else if (centroCodigo) {
    const c = normalizarCodigoCentro(centroCodigo);
    const { rows } = await queryClient(
      client,
      `SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.permisos,
              u.centro, u.codigo_centro_costo, u.equipo_uad, u.activo
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

/** RC8.17.8H — Coordinador(es) recomendado(s) + operadores en lista de candidatos. */
function empaquetarListaDestinoContMenores(coordinadoresRows = [], operadoresRows = [], mapRow = mapCandidato) {
  const coords = coordinadoresRows.map((u) => mapRow(u));
  const ops = operadoresRows.map((u) => mapRow(u));
  coords.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  ops.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  let recomendado = null;
  const candidatos = [...ops];
  if (coords.length >= 1) {
    recomendado = {
      ...coords[0],
      etiqueta: 'Coordinador recomendado',
      recomendado: true,
      fuente: 'equipo_uad',
    };
    if (coords.length > 1) {
      candidatos.unshift(...coords.slice(1));
    }
  } else {
    candidatos.unshift(...coords);
  }
  candidatos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  if (!recomendado && candidatos.length === 1) {
    return {
      recomendado: { ...candidatos[0], etiqueta: 'Responsable recomendado', recomendado: true },
      candidatos: [],
      resolucion_automatica: { usuarioId: candidatos[0].id, ambiguo: false },
    };
  }
  return {
    recomendado,
    candidatos,
    resolucion_automatica: {
      usuarioId: recomendado?.id ?? null,
      ambiguo: !recomendado && candidatos.length !== 1,
      candidatos: (recomendado ? 1 : 0) + candidatos.length,
    },
  };
}

function empaquetarListaCoordinadoresEquipo(elegiblesRows, mapRow = mapCandidato) {
  let elegibles = elegiblesRows.map((u) => mapRow(u));
  if (elegibles.length === 1) {
    return {
      recomendado: {
        ...elegibles[0],
        etiqueta: 'Coordinador recomendado',
        recomendado: true,
        fuente: 'equipo_uad',
      },
      candidatos: [],
      resolucion_automatica: { usuarioId: elegibles[0].id, ambiguo: false },
    };
  }
  if (elegibles.length > 1) {
    elegibles.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
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

/** RC8.17.8C — DEC_APROBADO: Coordinador UAD equipo Programación + permiso PROGRAMACION. */
export async function listarCandidatosDecAprobadoProgramacion(
  requerimientoId,
  { search = '' } = {},
  row = null,
  client = null,
) {
  const ev = 'DEC_APROBADO';
  const { transicion, metaDestino, etapaOrigen } = await resolveTransicionWorkflow(
    requerimientoId,
    ev,
    row,
    client,
  );
  const submoduloCodigo = metaDestino.submoduloCodigo || 'PROGRAMACION';
  const { usuarios } = await listarUsuariosCoordinadoresEquipoUadSubmodulo({
    equipoCodigo: EQUIPOS_UAD.PROGRAMACION,
    submoduloCodigo,
    client,
  });
  let base = empaquetarListaCoordinadoresEquipo(usuarios);
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
    perfil_responsable: 'COORDINADOR_EQUIPO_UAD',
    equipo_uad: EQUIPOS_UAD.PROGRAMACION,
    equipo_uad_label: labelEquipoUad(EQUIPOS_UAD.PROGRAMACION),
    alcance: 'UAD_EQUIPO',
    centro: null,
    recomendado,
    candidatos,
    resolucion_automatica: base.resolucion_automatica,
  };
}

/** Pool PERSONA Cont.Menores (UAD) sin depender de la etapa vigente del expediente (subsanación retorno CM). */
export async function listarCandidatosPoolContMenoresEquipoUad({ search = '' } = {}, client = null) {
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  const { listarUsuariosDestinoContMenoresProgramacionAprobada } = await import('./equiposUadUsuario.js');
  const { usuarios } = await listarUsuariosDestinoContMenoresProgramacionAprobada({ client });
  const coordinadores = usuarios.filter((u) => esCoordinadorEquipoUad(u, EQUIPOS_UAD.CONT_MENORES, { uadKeys }));
  const operadores = usuarios.filter((u) => esOperadorEquipoUad(u, EQUIPOS_UAD.CONT_MENORES, { uadKeys }));
  let { recomendado, candidatos } = empaquetarListaDestinoContMenores(coordinadores, operadores);
  const q = String(search || '').trim();
  if (q.length >= 2) {
    candidatos = candidatos.filter((c) => matchesSearch(c, q));
    if (recomendado && !matchesSearch(recomendado, q)) recomendado = null;
  }
  return {
    soportado: true,
    perfil_responsable: 'EQUIPO_UAD_CONT_MENORES',
    equipo_uad: EQUIPOS_UAD.CONT_MENORES,
    equipo_uad_label: labelEquipoUad(EQUIPOS_UAD.CONT_MENORES),
    recomendado,
    candidatos,
  };
}

/** RC8.17.8H — PROGRAMACION_APROBADA → PERSONA Cont.Menores (elegibilidad organizacional). */
export async function listarCandidatosProgramacionAprobadaContMenores(
  requerimientoId,
  { search = '', excluirUsuarioId = null } = {},
  row = null,
  client = null,
) {
  const ev = 'PROGRAMACION_APROBADA';
  const { transicion, metaDestino, etapaOrigen } = await resolveTransicionWorkflow(
    requerimientoId,
    ev,
    row,
    client,
  );
  const etapaDest = transicion.etapa_destino || 'COORDINACION_CM';
  const { usuarios } = await listarUsuariosDestinoContMenoresProgramacionAprobada({ client });
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  const exclUid = excluirUsuarioId != null && Number.isFinite(Number(excluirUsuarioId))
    ? Number(excluirUsuarioId)
    : null;
  const filtrados = exclUid != null ? usuarios.filter((u) => Number(u.id) !== exclUid) : usuarios;
  const coordinadores = filtrados.filter((u) => esCoordinadorEquipoUad(u, EQUIPOS_UAD.CONT_MENORES, { uadKeys }));
  const operadores = filtrados.filter((u) => esOperadorEquipoUad(u, EQUIPOS_UAD.CONT_MENORES, { uadKeys }));

  let base = empaquetarListaDestinoContMenores(coordinadores, operadores);
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
    etapa_destino: etapaDest,
    etapa_destino_label: metaDestino.label || 'Coordinación CM',
    destinos: [{
      etapa_codigo: etapaDest,
      etapa_label: metaDestino.label || 'Coordinación CM',
      evento_codigo: ev,
      unica: true,
    }],
    perfil_responsable: 'EQUIPO_UAD_CONT_MENORES',
    equipo_uad: EQUIPOS_UAD.CONT_MENORES,
    equipo_uad_label: labelEquipoUad(EQUIPOS_UAD.CONT_MENORES),
    alcance: 'UAD_EQUIPO',
    centro: null,
    recomendado,
    candidatos,
    resolucion_automatica: base.resolucion_automatica,
    mensaje_sin_candidatos: 'No existen usuarios elegibles de Cont.Menores.',
  };
}

/** RC8.17.8H6-A2 — COORDINACION_CM_APROBADA → operadores UAD Cont.Menores (Invitaciones). */
export async function listarCandidatosCoordinacionCmAprobadaInvitaciones(
  requerimientoId,
  { search = '', excluirUsuarioId = null } = {},
  row = null,
  client = null,
) {
  const ev = 'COORDINACION_CM_APROBADA';
  const { transicion, metaDestino, etapaOrigen } = await resolveTransicionWorkflow(
    requerimientoId,
    ev,
    row,
    client,
  );
  const etapaDest = transicion.etapa_destino || 'INVITACIONES';
  const submoduloCodigo = metaDestino.submoduloCodigo || 'INVITACIONES';
  const perfil = PERFILES_FUNCIONALES.ANALISTA_CONTRATACIONES;

  const { usuarios, uadKeys } = await listarUsuariosDestinoEquipoUadSubmodulo({
    equipoCodigo: EQUIPOS_UAD.CONT_MENORES,
    submoduloPermisosCodigo: submoduloCodigo,
    client,
  });

  const exclUid = excluirUsuarioId != null && Number.isFinite(Number(excluirUsuarioId))
    ? Number(excluirUsuarioId)
    : null;

  let elegibles = usuarios.filter(
    (u) => (exclUid == null || Number(u.id) !== exclUid)
      && esOperadorEquipoUad(u, EQUIPOS_UAD.CONT_MENORES, { uadKeys })
      && esUsuarioElegibleParaPerfil(u, perfil, submoduloCodigo),
  );

  let candidatos = elegibles.map((u) => appendEquipoUadCandidato(mapCandidato(u), u));
  candidatos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  let recomendado = null;
  if (candidatos.length === 1) {
    recomendado = {
      ...candidatos[0],
      etiqueta: 'Analista recomendado',
      recomendado: true,
      fuente: 'equipo_uad',
    };
    candidatos = [];
  }

  const q = String(search || '').trim();
  if (q.length >= 2) {
    candidatos = candidatos.filter((c) => matchesSearch(c, q));
    if (recomendado && !matchesSearch(recomendado, q)) recomendado = null;
  }

  const nTotal = (recomendado ? 1 : 0) + candidatos.length;

  return {
    soportado: true,
    evento_codigo: ev,
    etapa_origen: etapaOrigen,
    etapa_destino: etapaDest,
    etapa_destino_label: metaDestino.label || 'Invitaciones',
    destinos: [{
      etapa_codigo: etapaDest,
      etapa_label: metaDestino.label || 'Invitaciones',
      evento_codigo: ev,
      unica: true,
    }],
    perfil_responsable: perfil,
    equipo_uad: EQUIPOS_UAD.CONT_MENORES,
    equipo_uad_label: labelEquipoUad(EQUIPOS_UAD.CONT_MENORES),
    alcance: 'UAD_EQUIPO',
    centro: null,
    recomendado,
    candidatos,
    resolucion_automatica: recomendado
      ? { usuarioId: recomendado.id, ambiguo: false }
      : { usuarioId: null, ambiguo: nTotal !== 1, candidatos: nTotal },
    mensaje_sin_candidatos: 'No hay operadores Cont.Menores con permiso operativo en Invitaciones.',
  };
}

/** RC8.17.8H4 — REASIGNACION_RESPONSABLE en PROGRAMACION → OPERADOR mismo equipo. */
export async function listarCandidatosReasignacionProgramacion(
  requerimientoId,
  { search = '' } = {},
  row = null,
  client = null,
) {
  const ev = 'REASIGNACION_RESPONSABLE';
  const { transicion, metaDestino, etapaOrigen } = await resolveTransicionWorkflow(
    requerimientoId,
    ev,
    row,
    client,
  );
  if (String(etapaOrigen || '').toUpperCase() !== 'PROGRAMACION') {
    return {
      soportado: false,
      evento_codigo: ev,
      etapa_origen: etapaOrigen,
      candidatos: [],
      recomendado: null,
      mensaje_sin_candidatos: 'El expediente no está en Programación.',
    };
  }
  const { usuarios } = await listarOperadoresProgramacionAsignables({ client });
  let candidatos = usuarios.map((u) => appendEquipoUadCandidato(mapCandidato(u)));
  candidatos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  let recomendado = null;
  const q = String(search || '').trim();
  if (q.length >= 2) {
    candidatos = candidatos.filter((c) => matchesSearch(c, q));
  }
  const etapaLabel = metaDestino?.label || 'Programación';
  return {
    soportado: true,
    evento_codigo: ev,
    etapa_origen: etapaOrigen,
    etapa_destino: etapaOrigen,
    etapa_destino_label: etapaLabel,
    destinos: [{
      etapa_codigo: etapaOrigen,
      etapa_label: `${etapaLabel} (sin cambio)`,
      evento_codigo: ev,
      unica: true,
    }],
    perfil_responsable: 'OPERADOR_EQUIPO_UAD_PROGRAMACION',
    equipo_uad: EQUIPOS_UAD.PROGRAMACION,
    equipo_uad_label: labelEquipoUad(EQUIPOS_UAD.PROGRAMACION),
    alcance: 'UAD_EQUIPO',
    centro: null,
    recomendado,
    candidatos,
    resolucion_automatica: { usuarioId: null, ambiguo: candidatos.length !== 1, candidatos: candidatos.length },
    mensaje_sin_candidatos: 'No hay operadores activos en el equipo UAD Programación.',
  };
}

/**
 * Valida actor de PUT Programación → Cont.Menores (403 si no cumple).
 */
export async function assertActorProgramacionPuedeDerivar(user, client = null) {
  const uid = user?.id != null ? Number(user.id) : NaN;
  if (!Number.isFinite(uid)) {
    const err = new Error('No autenticado');
    err.status = 401;
    throw err;
  }
  const { rows } = await queryClient(
    client,
    `SELECT id, username, apellidos, nombres, cargo, rol, permisos, centro, codigo_centro_costo, equipo_uad, activo
     FROM usuarios WHERE id = $1 LIMIT 1`,
    [uid],
  );
  const row = rows[0];
  if (!row || row.activo === false) {
    const err = new Error('Usuario inactivo o no encontrado');
    err.status = 403;
    err.code = 'ACTOR_PROGRAMACION_NO_AUTORIZADO';
    throw err;
  }
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  if (!esActorProgramacionPuedeDerivar(row, { uadKeys })) {
    const err = new Error(
      'No tiene permiso para derivar desde Programación (requiere equipo UAD Programación, rol Coordinador u Operador, y actividad DERIVAR).',
    );
    err.status = 403;
    err.code = 'ACTOR_PROGRAMACION_NO_AUTORIZADO';
    throw err;
  }
  return { ok: true, usuario: row };
}

/**
 * Lista etapas destino + candidatos PERSONA para un evento de workflow.
 */
export async function listarCandidatosTransicion(
  requerimientoId,
  eventoCodigo,
  { search = '', excluirUsuarioId = null } = {},
  row = null,
  client = null,
) {
  const ev = String(eventoCodigo || '').toUpperCase();

  if (ev === 'EVALUACION_APROBADA') {
    return listarCandidatosDerivacionDec(requerimientoId, { search }, row, client);
  }

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

  if (ev === 'DEC_APROBADO') {
    return listarCandidatosDecAprobadoProgramacion(requerimientoId, { search }, row, client);
  }

  if (ev === 'PROGRAMACION_APROBADA') {
    return listarCandidatosProgramacionAprobadaContMenores(
      requerimientoId,
      { search, excluirUsuarioId },
      row,
      client,
    );
  }

  if (ev === 'COORDINACION_CM_APROBADA') {
    return listarCandidatosCoordinacionCmAprobadaInvitaciones(
      requerimientoId,
      { search, excluirUsuarioId },
      row,
      client,
    );
  }

  if (ev === 'REASIGNACION_RESPONSABLE') {
    return listarCandidatosReasignacionProgramacion(requerimientoId, { search }, row, client);
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
  if (ev === 'EVALUACION_APROBADA') {
    const lista = await listarCandidatosDerivacionDec(requerimientoId, {}, row, client);
    const uid = Number(usuarioId);
    const todos = [...(lista.recomendado ? [lista.recomendado] : []), ...(lista.candidatos || [])];
    const found = todos.find((c) => c.id === uid);
    if (!found) {
      const err = new Error('Usuario destino no elegible para DEC (Director UAD)');
      err.status = 422;
      err.code = 'RESPONSABLE_TRANSICION_INVALIDO';
      throw err;
    }
    return { ok: true, candidato: found, recomendado: lista.recomendado, lista };
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

export const ETAPAS_OBSERVACION_DEC = Object.freeze(['REGISTRO', 'EVALUACION', 'PROGRAMACION', 'DEC']);

/**
 * Piloto RC8.17.3B — observación dirigida hacia REGISTRO / EVALUACION / PROGRAMACION / DEC.
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
  ).toUpperCase().replace(/^REGISTRADO$/, 'REGISTRO');

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
    pilot_observacion_dirigida_destino: true,
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
  resolveEtapaOrigenCanonicaWorkflow,
  getPilotEstadoLabelsForEvento,
  buildMetadataSeleccionResponsable,
  listarCandidatosTransicion,
  listarCandidatosDecAprobadoProgramacion,
  listarCandidatosProgramacionAprobadaContMenores,
  listarCandidatosCoordinacionCmAprobadaInvitaciones,
  listarCandidatosReasignacionProgramacion,
  assertActorProgramacionPuedeDerivar,
  listarCandidatosDerivacionDec,
  resolveUnidadAdquisicionesKeys,
  esElegibleDirectorUnidadAdquisiciones,
  esCuentaLegacyDecSemilla,
  esDirectorRolGeneral,
  usuarioPerteneceUnidadAdquisiciones,
  listarCandidatosPorPerfil,
  assertUsuarioDestinoTransicionElegible,
  applyPilotTransicionPersona,
  applyPilotObservacionDecDestino,
  ETAPAS_OBSERVACION_DEC,
};
