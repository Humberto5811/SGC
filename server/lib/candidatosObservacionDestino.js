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

const DESTINO_REGISTRO_LABELS = Object.freeze([
  'Registro de Requerimiento',
  'Registro de Requerimientos',
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
  const permisos = normalizePermisos(usuarioRow.permisos, usuarioRow.rol);
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

  if (!esDestinoRegistroRequerimiento(destinoSubmodulo)) {
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
  let recomendado = null;
  let recomendadoInactivo = null;

  if (recomendadoRaw?.id) {
    const enElegibles = elegibles.find((c) => c.id === recomendadoRaw.id);
    const cand = enElegibles || recomendadoRaw;
    if (cand.activo && esElegibleRegistroRequerimiento(
      { ...cand, permisos: recomendadoRaw.permisos, rol: recomendadoRaw.rol },
      centroCodigo,
    )) {
      recomendado = {
        ...cand,
        etiqueta: 'Responsable anterior',
        recomendado: true,
        fuente: recomendadoRaw.fuente,
      };
    } else if (!cand.activo) {
      recomendadoInactivo = {
        ...cand,
        etiqueta: 'Responsable anterior (inactivo)',
        seleccionable: false,
      };
    }
  }

  const q = String(search || '').trim();
  let otros = elegibles.filter((c) => !recomendado || c.id !== recomendado.id);
  if (q.length >= 2) {
    otros = otros.filter((c) => matchesSearch(c, q));
    if (recomendado && matchesSearch(recomendado, q)) {
      // recomendado stays visible via separate field
    } else if (recomendado && q.length >= 2 && !matchesSearch(recomendado, q)) {
      recomendado = null;
    }
  }

  otros.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const meta = getEtapaMeta('REGISTRO');
  return {
    destino: destinoSubmodulo,
    destino_etapa: 'REGISTRO',
    destino_submodulo_codigo: meta?.submoduloCodigo || 'REGISTRO_REQUERIMIENTO',
    soportado: true,
    centro: { codigo: centroCodigo, nombre: centro.centro_nombre || centroCodigo },
    recomendado,
    recomendado_inactivo: recomendadoInactivo,
    candidatos: otros,
  };
}

export default {
  esDestinoRegistroRequerimiento,
  esElegibleRegistroRequerimiento,
  resolveRecomendadoRegistro,
  listarCandidatosObservacionDestino,
};
