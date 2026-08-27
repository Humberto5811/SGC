/**
 * RC8.8 / Obs47 — Contrato canónico único de Estado/Responsable.
 *
 * Lectura normal de bandejas/diagnóstico: SOLO
 *   expediente_estado_vigente + asignación activa + usuarios + catálogo labels.
 *
 * Evidencia de dominio (cotización/cuadro/orden/recepción/historial) NUNCA
 * se usa aquí — pertenece únicamente a reconciliarEstadoResponsablePorEvidencia().
 */
import { query } from '../db.js';
import { TIPO_RESPONSABLE } from '../../shared/resolvedorEstadoResponsable.js';
import { getLabelEstado } from '../../shared/estadoExpedienteCatalog.js';
import { getEtapaMeta, getLabelEtapa } from '../../shared/workflow/etapas.js';
import { getEstadoCatalogEntry } from '../../src/ui/workflow/estadoCatalogo.js';

function esc(v) {
  return String(v == null ? '' : v).trim();
}

function normalizarEstadoCodigo(raw) {
  let c = esc(raw);
  if (c === 'REGISTRO_ORDEN' || c === 'ORDEN') c = 'REGISTRO_ORDENES';
  return c;
}

function normalizarEtapaCodigo(raw) {
  let c = esc(raw).toUpperCase();
  if (c === 'REGISTRO_ORDENES' || c === 'ORDEN') c = 'REGISTRO_ORDEN';
  if (c === 'REGISTRADO') c = 'REGISTRO';
  return c;
}

/** RC8.15.6G-8D0 — corrige filas con texto humano en estado_codigo (backfill/sync legacy). */
function resolverEstadoPersistido(e) {
  let etapaCodigo = normalizarEtapaCodigo(e.etapa_codigo || e.etapaCodigo);
  const rawCodigo = esc(e.estado_codigo || e.estadoCodigo);
  let estadoCodigo = normalizarEstadoCodigo(rawCodigo);
  let estadoLabel = esc(e.estado_label || e.estadoLabel);
  const labelCatalogo = estadoCodigo ? getLabelEstado(estadoCodigo) : '';
  const pareceTextoHumano = rawCodigo
    && (/[\s]/.test(rawCodigo) || /^En /i.test(rawCodigo))
    && !labelCatalogo;

  if (pareceTextoHumano && etapaCodigo) {
    estadoLabel = rawCodigo;
    estadoCodigo = etapaCodigo;
  } else if (!labelCatalogo && etapaCodigo && (!estadoCodigo || estadoCodigo === estadoLabel)) {
    estadoCodigo = etapaCodigo;
    if (!estadoLabel) {
      const meta = getEtapaMeta(etapaCodigo);
      estadoLabel = meta?.label || getLabelEtapa(etapaCodigo) || rawCodigo;
    }
  }

  const etapaMeta = getEtapaMeta(etapaCodigo);
  const etapaLabel = esc(e.etapa_label || e.etapaLabel)
    || etapaMeta?.label
    || getLabelEtapa(etapaCodigo)
    || (etapaCodigo === 'REGISTRO_ORDEN' ? 'Registro de Órdenes' : etapaCodigo);

  const catalog = getEstadoCatalogEntry(estadoCodigo, estadoLabel);
  if (!estadoLabel) {
    estadoLabel = catalog.label
      || getLabelEstado(estadoCodigo)
      || (estadoCodigo === etapaCodigo ? etapaLabel : estadoCodigo)
      || (estadoCodigo === 'REGISTRO_ORDENES' ? 'Registro de órdenes' : '');
  }

  return { estadoCodigo, estadoLabel, etapaCodigo, etapaLabel };
}

/**
 * Construye el contrato canónico desde filas persistidas (sin evidencia).
 */
export function buildContratoCanonico(estadoRow, asignacion = null) {
  const e = estadoRow || {};
  const a = asignacion || null;

  const {
    estadoCodigo,
    estadoLabel,
    etapaCodigo,
    etapaLabel,
  } = resolverEstadoPersistido(e);
  const catalog = getEstadoCatalogEntry(estadoCodigo, estadoLabel);

  let responsableTipo = esc(
    a?.tipo_responsable || a?.tipoResponsable || e.responsable_tipo || e.responsableTipo || TIPO_RESPONSABLE.PENDIENTE,
  ).toUpperCase();
  let responsableUsuarioId = a?.usuario_id ?? a?.usuarioId ?? e.responsable_usuario_id ?? e.responsableUsuarioId ?? null;
  if (responsableUsuarioId != null && Number.isFinite(Number(responsableUsuarioId))) {
    responsableUsuarioId = Number(responsableUsuarioId);
  } else {
    responsableUsuarioId = null;
  }
  let responsableUsername = esc(a?.usuario_username || a?.usuarioUsername || e.responsable_username || e.responsableUsername);
  let responsableNombre = esc(a?.usuario_nombre || a?.usuarioNombre || e.responsable_nombre || e.responsableNombre);
  let responsableUnidad = esc(a?.unidad_codigo || a?.unidadCodigo || e.responsable_unidad || e.responsableUnidad);
  const responsableFuente = esc(
    e.responsable_fuente || e.responsableFuente || a?.origen_asignacion || a?.origenAsignacion || 'persistido',
  );

  if (responsableTipo === 'PERSONA' && !responsableUsuarioId && !responsableUsername && !responsableNombre) {
    responsableTipo = responsableUnidad ? TIPO_RESPONSABLE.UNIDAD : TIPO_RESPONSABLE.PENDIENTE;
  }
  if (responsableTipo === 'PENDIENTE') {
    responsableUsuarioId = null;
    responsableUsername = '';
    responsableNombre = '';
    responsableUnidad = '';
  }
  if (responsableTipo === 'UNIDAD') {
    responsableUsuarioId = null;
    responsableUsername = '';
    responsableNombre = '';
  }

  const version = Number(e.version || 0) || null;
  const actualizadoAt = e.actualizado_at || e.actualizadoAt || null;
  const requerimientoId = Number(e.requerimiento_id || e.requerimientoId || 0) || null;

  return Object.freeze({
    requerimientoId,
    estadoCodigo,
    estadoLabel,
    estadoCategoria: catalog.categoria,
    etapaCodigo,
    etapaLabel,
    responsableTipo,
    responsableUsuarioId,
    responsableUsername,
    responsableNombre,
    responsableUnidad: responsableTipo === 'PENDIENTE' ? '' : responsableUnidad,
    responsableFuente,
    actualizadoAt,
    version,
    canonicalMissing: false,
  });
}

/** Contrato vacío canónico (sin inventar evidencia). */
export function contratoCanonicoVacio(requerimientoId = null) {
  const catalog = getEstadoCatalogEntry('', 'Estado no disponible');
  return Object.freeze({
    requerimientoId: requerimientoId != null ? Number(requerimientoId) : null,
    estadoCodigo: '',
    estadoLabel: 'Estado no disponible',
    estadoCategoria: catalog.categoria || 'DESCONOCIDO',
    etapaCodigo: '',
    etapaLabel: '',
    responsableTipo: TIPO_RESPONSABLE.PENDIENTE,
    responsableUsuarioId: null,
    responsableUsername: '',
    responsableNombre: '',
    responsableUnidad: '',
    responsableFuente: 'sin_vigente',
    actualizadoAt: null,
    version: null,
    canonicalMissing: true,
  });
}

/**
 * Shape mínimo comparable entre endpoints (deepEqual tests).
 */
export function pickContratoComparable(c) {
  if (!c || c.canonicalMissing) return c?.canonicalMissing ? { canonicalMissing: true } : null;
  return {
    estadoCodigo: c.estadoCodigo || '',
    estadoLabel: c.estadoLabel || '',
    estadoCategoria: c.estadoCategoria || '',
    etapaCodigo: c.etapaCodigo || '',
    etapaLabel: c.etapaLabel || '',
    responsableTipo: c.responsableTipo || '',
    responsableUsuarioId: c.responsableUsuarioId != null ? Number(c.responsableUsuarioId) : null,
    responsableNombre: c.responsableNombre || c.responsableUsername || '',
    responsableUnidad: c.responsableUnidad || '',
  };
}

/**
 * @param {{ requerimientoIds?: number[], client?: object }} opts
 * @returns {Promise<Map<number, object>>}
 */
export async function getEstadoResponsableCanonico({
  requerimientoIds = [],
  client = null,
} = {}) {
  const ids = [...new Set(
    (requerimientoIds || []).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  const out = new Map();
  if (!ids.length) return out;

  const run = async (text, params) => (client
    ? client.query(text, params)
    : query(text, params));

  const nombreSql = `COALESCE(
    NULLIF(TRIM(u.nombre), ''),
    NULLIF(TRIM(CONCAT(COALESCE(u.apellidos, ''), ' ', COALESCE(u.nombres, ''))), ''),
    NULLIF(TRIM(u.username), ''),
    CASE WHEN u.id IS NOT NULL THEN 'Usuario #' || u.id::text ELSE NULL END
  )`;

  const [{ rows: estados }, { rows: asignaciones }] = await Promise.all([
    run(
      `SELECT e.*,
              u.username AS responsable_username,
              ${nombreSql} AS responsable_nombre
       FROM expediente_estado_vigente e
       LEFT JOIN usuarios u ON u.id = e.responsable_usuario_id
       WHERE e.requerimiento_id = ANY($1::int[])`,
      [ids],
    ),
    run(
      `SELECT a.*,
              u.username AS usuario_username,
              ${nombreSql} AS usuario_nombre
       FROM expediente_asignaciones a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.requerimiento_id = ANY($1::int[]) AND a.activo = TRUE`,
      [ids],
    ),
  ]);

  const estadoById = new Map(estados.map((r) => [Number(r.requerimiento_id), r]));
  const asgById = new Map(asignaciones.map((r) => [Number(r.requerimiento_id), r]));

  for (const id of ids) {
    const e = estadoById.get(id);
    if (!e) {
      out.set(id, contratoCanonicoVacio(id));
      continue;
    }
    out.set(id, buildContratoCanonico(e, asgById.get(id) || null));
  }
  return out;
}

/**
 * Enriquece filas con estado_responsable_vigente = contrato canónico.
 * No re-infiere. No muta campos de dominio.
 */
export async function attachEstadoResponsableCanonico(rows, idField = 'requerimiento_id', client = null) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const ids = [...new Set(
    rows.map((r) => parseInt(r?.[idField], 10)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  if (!ids.length) return rows;
  const map = await getEstadoResponsableCanonico({ requerimientoIds: ids, client });
  for (const row of rows) {
    const rid = parseInt(row?.[idField], 10);
    if (Number.isFinite(rid) && map.has(rid)) {
      row.estado_responsable_vigente = map.get(rid);
    } else {
      row.estado_responsable_vigente = null;
    }
  }
  return rows;
}

export default {
  getEstadoResponsableCanonico,
  buildContratoCanonico,
  contratoCanonicoVacio,
  pickContratoComparable,
  attachEstadoResponsableCanonico,
};
