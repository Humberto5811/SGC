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
