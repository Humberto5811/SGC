/**
 * RC8.17.8H6-C3-D1 — Resolución explícita invitación ↔ cotización (sin invitación vigente).
 */
import { query } from '../db.js';

const ESTADOS_INVITACION_ACCESO = Object.freeze([
  'ENVIADA', 'ENVIADO', 'ABIERTA', 'PARTICIPANDO', 'COTIZACION_PRESENTADA',
]);

export function parseInvitacionId(raw) {
  const invId = parseInt(raw, 10);
  if (!Number.isFinite(invId) || invId <= 0) return null;
  return invId;
}

/**
 * Carga la invitación exacta para cotizar (proveedor + SC + id).
 * No usa MAX(nro_invitacion) ni invitación vigente.
 */
export async function assertInvitacionParaCotizacion(proveedorId, solicitudId, invitacionId) {
  const invId = parseInvitacionId(invitacionId);
  if (!invId) {
    const err = new Error('invitacion_id requerido para cotizar');
    err.status = 400;
    throw err;
  }
  const sid = parseInt(solicitudId, 10);
  const pid = parseInt(proveedorId, 10);
  if (!Number.isFinite(sid) || sid <= 0 || !Number.isFinite(pid) || pid <= 0) {
    const err = new Error('Solicitud o proveedor inválido');
    err.status = 400;
    throw err;
  }

  const { rows } = await query(`
    SELECT ip.*, sc.estado AS solicitud_estado, sc.cotizaciones_fin
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.id = $1
      AND ip.proveedor_id = $2
      AND ip.solicitud_id = $3
  `, [invId, pid, sid]);

  if (!rows.length) {
    const err = new Error('Invitación no encontrada o sin acceso');
    err.status = 403;
    throw err;
  }

  const inv = rows[0];
  const est = String(inv.estado || '').toUpperCase();
  if (!ESTADOS_INVITACION_ACCESO.includes(est)) {
    const err = new Error('La invitación no está disponible para cotizar');
    err.status = 409;
    throw err;
  }

  return inv;
}

/**
 * Invitación explícita para acciones portal (consulta, observación, etc.).
 * No sustituye id inválido ni usa invitación vigente.
 */
export async function assertInvitacionPortalAccion(proveedorId, solicitudId, invitacionId) {
  const invId = parseInvitacionId(invitacionId);
  if (!invId) {
    const err = new Error('invitacion_id requerido');
    err.status = 400;
    throw err;
  }
  const sid = parseInt(solicitudId, 10);
  const pid = parseInt(proveedorId, 10);
  if (!Number.isFinite(sid) || sid <= 0 || !Number.isFinite(pid) || pid <= 0) {
    const err = new Error('Solicitud o proveedor inválido');
    err.status = 400;
    throw err;
  }

  const { rows } = await query(`
    SELECT ip.*, sc.estado AS solicitud_estado, sc.consultas_fin, sc.cotizaciones_fin
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.id = $1
      AND ip.proveedor_id = $2
      AND ip.solicitud_id = $3
  `, [invId, pid, sid]);

  if (!rows.length) {
    const err = new Error('Invitación no encontrada o sin acceso');
    err.status = 403;
    throw err;
  }

  const inv = rows[0];
  const est = String(inv.estado || '').toUpperCase();
  if (!ESTADOS_INVITACION_ACCESO.includes(est)) {
    const err = new Error('La invitación no está disponible para esta operación');
    err.status = 409;
    throw err;
  }

  return inv;
}

/**
 * Si existen invitaciones para SC+proveedor, exige invitacion_id válido.
 * Sin filas de invitación (legacy extremo), permite operar sin FK.
 */
export async function resolveInvitacionParaPortalAccion(proveedorId, solicitudId, invitacionIdRaw) {
  const sid = parseInt(solicitudId, 10);
  const pid = parseInt(proveedorId, 10);
  if (!Number.isFinite(sid) || sid <= 0 || !Number.isFinite(pid) || pid <= 0) {
    const err = new Error('Solicitud o proveedor inválido');
    err.status = 400;
    throw err;
  }

  const { rows: cntRows } = await query(`
    SELECT COUNT(*)::int AS n FROM invitacion_proveedores
    WHERE solicitud_id = $1 AND proveedor_id = $2
  `, [sid, pid]);
  const tieneInvitaciones = (cntRows[0]?.n || 0) > 0;
  const invId = parseInvitacionId(invitacionIdRaw);

  if (tieneInvitaciones) {
    return assertInvitacionPortalAccion(pid, sid, invId);
  }

  if (invId) {
    return assertInvitacionPortalAccion(pid, sid, invId);
  }

  const { rows } = await query(`
    SELECT sc.id AS solicitud_id, sc.estado AS solicitud_estado,
      sc.consultas_fin, sc.cotizaciones_fin,
      sr.requerimiento_id
    FROM solicitudes_cotizacion sc
    JOIN solicitud_requerimientos sr ON sr.solicitud_id = sc.id
    WHERE sc.id = $1
    LIMIT 1
  `, [sid]);
  if (!rows.length) {
    const err = new Error('Sin acceso a esta convocatoria');
    err.status = 403;
    throw err;
  }
  return {
    id: null,
    solicitud_id: sid,
    proveedor_id: pid,
    requerimiento_id: rows[0].requerimiento_id,
    solicitud_estado: rows[0].solicitud_estado,
    consultas_fin: rows[0].consultas_fin,
    cotizaciones_fin: rows[0].cotizaciones_fin,
  };
}

export async function loadCotizacionByInvitacionId(invitacionId) {
  const invId = parseInvitacionId(invitacionId);
  if (!invId) return null;
  const { rows } = await query(
    'SELECT * FROM cotizaciones_proveedor WHERE invitacion_id = $1 LIMIT 1',
    [invId],
  );
  return rows[0] || null;
}

/** Cotización legacy (sin invitacion_id) — como máximo una por SC+proveedor. */
export async function loadLegacyCotizacion(proveedorId, solicitudId) {
  const { rows } = await query(`
    SELECT * FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND proveedor_id = $2 AND invitacion_id IS NULL
    LIMIT 1
  `, [solicitudId, proveedorId]);
  return rows[0] || null;
}

/** Enlaza adjuntos portal subidos bajo una invitación a la fila cotizaciones_proveedor. */
export async function linkAdjuntosPortalToCotizacion(invitacionId, cotizacionId, db = query) {
  const invId = parseInvitacionId(invitacionId);
  const cotId = parseInt(cotizacionId, 10);
  if (!invId || !Number.isFinite(cotId) || cotId <= 0) return;
  const run = typeof db === 'function' ? db : db.query?.bind(db) || query;
  await run(`
    UPDATE cotizaciones_proveedor_adjuntos
    SET cotizacion_id = $2, updated_at = NOW()
    WHERE invitacion_id = $1
  `, [invId, cotId]);
}

/**
 * Resuelve la única cotización legacy (invitacion_id NULL) o lanza si hay ambigüedad canónica.
 * C3-D2: flujos con cotizacion_id explícito no deben usar esto.
 */
export async function resolveCotizacionUnicaPorSolicitudProveedor(solicitudId, proveedorId, { context } = {}) {
  const { rows } = await query(`
    SELECT id, invitacion_id, estado FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND proveedor_id = $2
    ORDER BY id ASC
  `, [solicitudId, proveedorId]);
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  const err = new Error(
    `${context || 'Consulta'}: existen ${rows.length} cotizaciones para la misma solicitud y proveedor; `
    + 'use cotizacion_id explícito (bloqueo C3-D2).',
  );
  err.code = 'COTIZACION_AMBIGUA';
  err.status = 409;
  throw err;
}

function parseDatosJsonCuadro(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}'); } catch (_) { return {}; }
}

function collectCotizacionIdsCuadroProveedor(datos, proveedorId) {
  const ids = new Set();
  const pid = Number(proveedorId);
  const filas = datos?.matriz_v2?.filas || datos?.informe?.matriz_v2?.filas || [];
  for (const f of filas) {
    if (Number(f.proveedor_id) === pid && f.cotizacion_id) ids.add(Number(f.cotizacion_id));
  }
  for (const pf of datos.primera_fuente || []) {
    if (Number(pf.proveedor_id) === pid && pf.cotizacion_id) ids.add(Number(pf.cotizacion_id));
  }
  for (const it of datos.items || []) {
    for (const f of it.filas || []) {
      if (Number(f.proveedor_id) === pid && f.cotizacion_id) ids.add(Number(f.cotizacion_id));
    }
  }
  return ids;
}

/**
 * Cotización del proveedor adjudicado en una orden (cuadro → id explícito; si no, única SC+proveedor o 409).
 */
export async function loadCotizacionParaOrdenAdjudicada(orden, { context = 'Orden' } = {}, client = null) {
  const run = client?.query ? client.query.bind(client) : query;
  const sid = orden?.solicitud_cotizacion_id;
  const pid = orden?.proveedor_id;
  if (!sid || !pid) return null;

  if (orden.cuadro_comparativo_id) {
    const { rows: cuadroRows } = await run(
      'SELECT datos_json FROM cuadros_comparativos WHERE id = $1',
      [orden.cuadro_comparativo_id],
    );
    const ids = collectCotizacionIdsCuadroProveedor(
      parseDatosJsonCuadro(cuadroRows[0]?.datos_json),
      pid,
    );
    if (ids.size === 1) {
      const cid = [...ids][0];
      const { rows } = await run(
        'SELECT * FROM cotizaciones_proveedor WHERE id = $1 AND proveedor_id = $2',
        [cid, pid],
      );
      if (rows[0]) return rows[0];
    }
    if (ids.size > 1) {
      const err = new Error(
        `${context}: varias cotizaciones en cuadro para el proveedor; use cotizacion_id (bloqueo C3-D2).`,
      );
      err.code = 'COTIZACION_AMBIGUA';
      err.status = 409;
      throw err;
    }
  }

  const unique = await resolveCotizacionUnicaPorSolicitudProveedor(sid, pid, { context });
  if (!unique) return null;
  const { rows } = await run('SELECT * FROM cotizaciones_proveedor WHERE id = $1', [unique.id]);
  return rows[0] || unique;
}

function parseInformeJson(val) {
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || '{}'); } catch (_) { return {}; }
}

function hasDerivacionCcpMark(cot) {
  const inf = parseInformeJson(cot?.validacion_informe);
  return !!(inf && typeof inf === 'object' && Object.prototype.hasOwnProperty.call(inf, 'derivacion_ccp'));
}

/**
 * Resuelve la cotización presentada de un expediente (locación / contexto RO) sin LIMIT 1 arbitrario.
 */
export async function resolveCotizacionPresentadaExpediente(
  solicitudId,
  { proveedorId, context = 'Expediente' } = {},
  client = null,
) {
  const run = client?.query ? client.query.bind(client) : query;
  const sid = parseInt(solicitudId, 10);
  if (!Number.isFinite(sid) || sid <= 0) return null;

  const { rows } = await run(`
    SELECT * FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND estado = 'COTIZACION_PRESENTADA'
    ORDER BY id ASC
  `, [sid]);
  if (rows.length === 0) return null;

  const pid = proveedorId != null ? parseInt(proveedorId, 10) : null;
  const scoped = Number.isFinite(pid) && pid > 0
    ? rows.filter((r) => Number(r.proveedor_id) === pid)
    : rows;

  const ccpMarked = scoped.filter(hasDerivacionCcpMark);
  if (ccpMarked.length === 1) return ccpMarked[0];
  if (ccpMarked.length > 1) {
    const err = new Error(
      `${context}: varias cotizaciones con derivación CCP; use cotizacion_id (bloqueo C3-D2).`,
    );
    err.code = 'COTIZACION_AMBIGUA';
    err.status = 409;
    throw err;
  }

  if (scoped.length === 1) return scoped[0];
  if (scoped.length > 1) {
    const err = new Error(
      `${context}: existen ${scoped.length} cotizaciones presentadas; use cotizacion_id (bloqueo C3-D2).`,
    );
    err.code = 'COTIZACION_AMBIGUA';
    err.status = 409;
    throw err;
  }

  if (rows.length === 1) return rows[0];
  const err = new Error(
    `${context}: varias cotizaciones presentadas en la solicitud; use cotizacion_id (bloqueo C3-D2).`,
  );
  err.code = 'COTIZACION_AMBIGUA';
  err.status = 409;
  throw err;
}
