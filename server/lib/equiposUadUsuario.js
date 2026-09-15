/**
 * RC8.17.8B — Reglas organizacionales Equipo UAD + helpers de candidatos.
 */
import {
  normalizeEquipoUadCodigo,
  labelEquipoUad,
  isEquipoUadCodigoValido,
  listEquiposUadCatalogo,
} from '../../shared/equiposUad.js';
import { ROLES_GENERALES, rolGeneralFromUsuario } from '../utils/userRoleCatalog.js';
import { EQUIPOS_UAD } from '../../shared/equiposUad.js';
import { getActividadesForSubmodulo, normalizePermisos } from './permissionsCatalog.js';
import { query } from '../db.js';
import { usuarioPerteneceUnidadAdquisiciones } from './workflowTransicionResponsable.js';

const ACTIVIDADES_OPERATIVAS_TRANSICION = Object.freeze([
  'VER', 'CREAR', 'EDITAR', 'APROBAR', 'DERIVAR', 'OBSERVAR',
]);

export {
  normalizeEquipoUadCodigo,
  labelEquipoUad,
  isEquipoUadCodigoValido,
  listEquiposUadCatalogo,
};

/**
 * Valida entrada API; null/vacío permitido.
 * @throws {{ status: number, message: string }}
 */
export function parseEquipoUadInput(raw) {
  if (raw === undefined) return undefined;
  if (raw == null || String(raw).trim() === '') return null;
  const codigo = normalizeEquipoUadCodigo(raw);
  if (!codigo) {
    const err = new Error('Equipo UAD no válido');
    err.status = 400;
    throw err;
  }
  return codigo;
}

function usuarioRowBasico(usuario = {}) {
  return {
    id: usuario.id,
    rol: usuario.rol,
    cargo: usuario.cargo,
    centro: usuario.centro,
    codigo_centro_costo: usuario.codigo_centro_costo,
    activo: usuario.activo,
    equipo_uad: usuario.equipo_uad,
  };
}

export function labelRolGeneralUsuario(usuario = {}) {
  const rol = rolGeneralFromUsuario(usuarioRowBasico(usuario));
  if (rol === ROLES_GENERALES.COORDINADOR) return 'Coordinador';
  if (rol === ROLES_GENERALES.OPERADOR) return 'Operador';
  if (rol === ROLES_GENERALES.DIRECTOR) return 'Director';
  if (rol === ROLES_GENERALES.USUARIO) return 'Usuario';
  if (rol === ROLES_GENERALES.ADMINISTRADOR) return 'Administrador';
  return rol || '';
}

/**
 * @param {object} usuario
 * @param {string} equipoCodigo
 * @param {{ uadKeys?: object }} [opts]
 */
export function usuarioPerteneceEquipoUad(usuario, equipoCodigo, opts = {}) {
  if (!usuario || usuario.activo === false) return false;
  const equipo = normalizeEquipoUadCodigo(equipoCodigo);
  if (!equipo) return false;
  const uadKeys = opts.uadKeys;
  if (!usuarioPerteneceUnidadAdquisiciones(usuario, uadKeys)) return false;
  return normalizeEquipoUadCodigo(usuario.equipo_uad) === equipo;
}

/**
 * @param {object} usuario
 * @param {string} equipoCodigo
 * @param {{ uadKeys?: object }} [opts]
 */
export function esCoordinadorEquipoUad(usuario, equipoCodigo, opts = {}) {
  if (!usuarioPerteneceEquipoUad(usuario, equipoCodigo, opts)) return false;
  return rolGeneralFromUsuario(usuarioRowBasico(usuario)) === ROLES_GENERALES.COORDINADOR;
}

/**
 * @param {object} usuario
 * @param {string} equipoCodigo
 * @param {{ uadKeys?: object }} [opts]
 */
export function esOperadorEquipoUad(usuario, equipoCodigo, opts = {}) {
  if (!usuarioPerteneceEquipoUad(usuario, equipoCodigo, opts)) return false;
  return rolGeneralFromUsuario(usuarioRowBasico(usuario)) === ROLES_GENERALES.OPERADOR;
}

export function usuarioTieneActividadOperativaSubmodulo(usuario, submoduloCodigo) {
  if (!usuario || usuario.activo === false) return false;
  const permisos = normalizePermisos(usuario.permisos, usuario.rol);
  const acts = getActividadesForSubmodulo(permisos, submoduloCodigo);
  return acts.some((a) => ACTIVIDADES_OPERATIVAS_TRANSICION.includes(String(a).toUpperCase()));
}

export function usuarioTieneActividadSubmodulo(usuario, submoduloCodigo, actividad) {
  if (!usuario || usuario.activo === false) return false;
  const act = String(actividad || '').trim().toUpperCase();
  if (!act) return false;
  const permisos = normalizePermisos(usuario.permisos, usuario.rol);
  const acts = getActividadesForSubmodulo(permisos, submoduloCodigo);
  return acts.some((a) => String(a).toUpperCase() === act);
}

/**
 * Actor Programación → Cont.Menores: UAD + equipo PROGRAMACION + COORD/OPER + DERIVAR.
 */
export function esActorProgramacionPuedeDerivar(usuario, opts = {}) {
  if (!usuario || usuario.activo === false) return false;
  if (!usuarioPerteneceEquipoUad(usuario, EQUIPOS_UAD.PROGRAMACION, opts)) return false;
  const rol = rolGeneralFromUsuario(usuarioRowBasico(usuario));
  if (rol !== ROLES_GENERALES.COORDINADOR && rol !== ROLES_GENERALES.OPERADOR) return false;
  return usuarioTieneActividadSubmodulo(usuario, 'PROGRAMACION', 'DERIVAR');
}

/**
 * Destinatario Cont.Menores con permiso operativo en submódulo (p. ej. ACTOS_PREPARATORIOS).
 * No usar para PROGRAMACION_APROBADA — ver helper organizacional abajo.
 */
export function esDestinatarioContMenoresElegible(usuario, submoduloPermisosCodigo, opts = {}) {
  if (!usuario || usuario.activo === false) return false;
  if (!usuarioPerteneceUnidadAdquisiciones(usuario, opts.uadKeys)) return false;
  if (!usuarioPerteneceEquipoUad(usuario, EQUIPOS_UAD.CONT_MENORES, opts)) return false;
  const rol = rolGeneralFromUsuario(usuarioRowBasico(usuario));
  if (rol !== ROLES_GENERALES.COORDINADOR && rol !== ROLES_GENERALES.OPERADOR) return false;
  return usuarioTieneActividadOperativaSubmodulo(usuario, submoduloPermisosCodigo);
}

/**
 * RC8.17.8H — Destinatario PROGRAMACION_APROBADA → Cont.Menores (solo criterios organizacionales).
 * Recibir responsable ≠ permisos de acción en bandeja CM.
 */
export function esDestinatarioProgramacionAprobadaContMenoresElegible(usuario, opts = {}) {
  if (!usuario || usuario.activo === false) return false;
  if (!usuarioPerteneceUnidadAdquisiciones(usuario, opts.uadKeys)) return false;
  if (!usuarioPerteneceEquipoUad(usuario, EQUIPOS_UAD.CONT_MENORES, opts)) return false;
  const rol = rolGeneralFromUsuario(usuarioRowBasico(usuario));
  return rol === ROLES_GENERALES.COORDINADOR || rol === ROLES_GENERALES.OPERADOR;
}

/**
 * Pool de candidatos PERSONA Cont.Menores para derivación desde Programación (8H).
 * @returns {Promise<{ usuarios: object[], uadKeys: object }>}
 */
export async function listarUsuariosDestinoContMenoresProgramacionAprobada({ client = null } = {}) {
  const { resolveUnidadAdquisicionesKeys } = await import('./workflowTransicionResponsable.js');
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  const { rows } = await queryUsuariosActivosUad(uadKeys, client);
  const usuarios = rows.filter((u) =>
    esDestinatarioProgramacionAprobadaContMenoresElegible(u, { uadKeys }),
  );
  return { usuarios, uadKeys };
}

/**
 * @returns {Promise<{ usuarios: object[], uadKeys: object }>}
 */
export async function listarUsuariosDestinoEquipoUadSubmodulo({
  equipoCodigo,
  submoduloPermisosCodigo,
  client = null,
} = {}) {
  const { resolveUnidadAdquisicionesKeys } = await import('./workflowTransicionResponsable.js');
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  const { rows } = await queryUsuariosActivosUad(uadKeys, client);
  const eq = normalizeEquipoUadCodigo(equipoCodigo);
  const usuarios = rows.filter(
    (u) => normalizeEquipoUadCodigo(u.equipo_uad) === eq
      && esDestinatarioContMenoresElegible(u, submoduloPermisosCodigo, { uadKeys }),
  );
  return { usuarios, uadKeys };
}

/**
 * Coordinador del equipo UAD con permiso operativo en el submódulo destino.
 */
export function esCoordinadorEquipoUadOperativo(usuario, equipoCodigo, submoduloCodigo, opts = {}) {
  return esCoordinadorEquipoUad(usuario, equipoCodigo, opts)
    && usuarioTieneActividadOperativaSubmodulo(usuario, submoduloCodigo);
}

async function queryUsuariosActivosUad(uadKeys, client = null) {
  const codigos = [...uadKeys.codigos];
  const ccParam = `${uadKeys.costPrefix}%`;
  const sql = `
    SELECT u.id, u.dni, u.username, u.apellidos, u.nombres, u.nombre, u.cargo, u.rol, u.permisos,
           u.centro, u.codigo_centro_costo, u.equipo_uad, u.activo
    FROM usuarios u
    WHERE u.activo = TRUE
      AND (
        UPPER(REPLACE(REPLACE(COALESCE(u.centro, ''), ' ', ''), '.', '')) = ANY($1::text[])
        OR UPPER(REPLACE(REPLACE(COALESCE(u.codigo_centro_costo, ''), ' ', ''), '.', '')) LIKE $2
      )`;
  if (client?.query) {
    return client.query(sql, [codigos, ccParam]);
  }
  return query(sql, [codigos, ccParam]);
}

/**
 * RC8.17.8C — Coordinadores activos de un equipo UAD con submódulo operativo.
 * @returns {Promise<{ usuarios: object[], uadKeys: object }>}
 */
export async function listarUsuariosCoordinadoresEquipoUadSubmodulo({
  equipoCodigo,
  submoduloCodigo,
  client = null,
} = {}) {
  const { resolveUnidadAdquisicionesKeys } = await import('./workflowTransicionResponsable.js');
  const uadKeys = await resolveUnidadAdquisicionesKeys(client);
  const { rows } = await queryUsuariosActivosUad(uadKeys, client);
  const usuarios = rows.filter(
    (u) => esCoordinadorEquipoUadOperativo(u, equipoCodigo, submoduloCodigo, { uadKeys }),
  );
  return { usuarios, uadKeys };
}

/** Campos de equipo para DTO de candidato / selector. */
export function appendEquipoUadCandidato(base = {}, usuarioRow = {}) {
  const codigo = normalizeEquipoUadCodigo(usuarioRow.equipo_uad);
  return {
    ...base,
    equipo_uad: codigo,
    equipo_uad_label: labelEquipoUad(codigo),
  };
}
