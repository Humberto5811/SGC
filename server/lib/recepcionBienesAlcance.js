/**
 * RB8.1B — Centro organizacional y alcance por centro para Recepción de Bienes.
 * Autorización SIEMPRE en backend. Nunca se confía en centro enviado por el cliente.
 */
import { query } from '../db.js';

/** trim + uppercase + colapso de espacios y puntos (C.N.S.P. → CNSP). Devuelve '' si no es válido. */
export function normalizarCodigoCentro(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .replace(/[\s.]+/g, '');
}

function parsePayload(payload) {
  if (payload && typeof payload === 'object') return payload;
  try {
    return JSON.parse(payload || '{}') || {};
  } catch (_) {
    return {};
  }
}

/**
 * Resuelve el centro desde una fila de requerimientos.
 * Prioridad (evidencia RB8.1B con datos reales):
 *   1. cmn estructurado → payload.area.responsable (centro responsable del área)
 *   2. payload.centro_codigo/codigo_centro/centro_display/centro_nombre/centro
 *   3. cmn numérico (código de centro, ej. 05277) como centro_codigo
 * NO usa area.nombre ni area.codigo como centro.
 */
export function resolverCentroDesdeRequerimiento(row) {
  const payload = parsePayload(row?.payload);
  const cmn = row?.cmn;
  let cmnObj = null;
  if (cmn && typeof cmn === 'object') cmnObj = cmn;
  else if (typeof cmn === 'string' && cmn.includes('{')) {
    try { cmnObj = JSON.parse(cmn); } catch (_) { cmnObj = null; }
  }
  const areaResp = payload?.area?.responsable ?? payload?.area_responsable ?? null;
  const cmnRaw = String(cmnObj?.centro ?? cmnObj?.centro_codigo ?? cmnObj?.codigo ?? '');
  const cmnNum = String(cmn || '').trim();
  const fuentes = [
    areaResp, // sigla del centro responsable del área (ej. CNSP)
    cmnRaw,
    cmnObj?.centro_nombre,
    payload?.centro_codigo,
    payload?.codigo_centro,
    payload?.centro_display,
    payload?.centro_nombre,
    payload?.centro,
  ];
  let centro_codigo = '';
  let centro_nombre = '';
  const esNum = (s) => /^\d{4,6}$/.test(s);
  for (const f of fuentes) {
    const n = normalizarCodigoCentro(f);
    if (!n) continue;
    if (!centro_codigo && !esNum(n)) centro_codigo = n;
    else if (!centro_nombre && esNum(n)) centro_nombre = n;
  }
  // Evidencia real: cmn es código numérico de centro (ej. 05277) sin sigla.
  if (!centro_codigo && cmnNum && esNum(normalizarCodigoCentro(cmnNum))) {
    centro_codigo = normalizarCodigoCentro(cmnNum);
    centro_nombre = centro_codigo;
  }
  if (!centro_codigo) {
    const err = new Error('No se pudo resolver el centro del requerimiento');
    err.code = 'CENTRO_NO_RESUELTO';
    throw err;
  }
  return {
    centro_codigo,
    centro_nombre: centro_nombre || centro_codigo,
    area_id: row?.cmn_obj?.area_id ?? payload?.area_id ?? null,
    area_nombre: row?.area || payload?.area?.nombre || payload?.area_nombre || '',
  };
}

/**
 * Resuelve el centro real desde expediente_id.
 * recepcion_bienes_expedientes → requerimientos (un solo JOIN).
 */
export async function resolveCentroExpediente(expedienteId, client = null) {
  const eid = parseInt(expedienteId, 10);
  if (!Number.isFinite(eid)) {
    const err = new Error('Expediente inválido');
    err.code = 'EXPEDIENTE_INVALIDO';
    throw err;
  }
  const db = client || { query };
  const { rows } = await db.query(`
    SELECT rbe.id AS expediente_id,
           rbe.requerimiento_id,
           rbe.orden_id,
           r.cmn AS requerimiento_cmn,
           r.area AS requerimiento_area,
           r.payload AS requerimiento_payload
    FROM recepcion_bienes_expedientes rbe
    JOIN requerimientos r ON r.id = rbe.requerimiento_id
    WHERE rbe.id = $1
  `, [eid]);
  if (!rows.length) {
    const err = new Error('Expediente no encontrado');
    err.code = 'EXPEDIENTE_NO_ENCONTRADO';
    err.status = 404;
    throw err;
  }
  const row = rows[0];
  const centro = resolverCentroDesdeRequerimiento({
    cmn: row.requerimiento_cmn,
    area: row.requerimiento_area,
    payload: row.requerimiento_payload,
  });
  return {
    expediente_id: Number(row.expediente_id),
    requerimiento_id: Number(row.requerimiento_id),
    orden_id: row.orden_id ? Number(row.orden_id) : null,
    ...centro,
  };
}

/** Alcance global real: admin, alcance_datos global/institucional o permisos. */
export function esAlcanceGlobal(user) {
  const rol = String(user?.rol || '').toLowerCase();
  if (['admin', 'administrador', 'dec'].includes(rol)) return true;
  const alcance = String(user?.alcance_datos || '').toUpperCase();
  if (alcance.includes('GLOBAL') || alcance.includes('INSTITUCIONAL')) return true;
  const perms = user?.permisos;
  if (perms) {
    const texto = typeof perms === 'string' ? perms : JSON.stringify(perms);
    if (/alcance.*(global|institucional)/i.test(texto)) return true;
  }
  return false;
}

function centrosDelUsuario(user) {
  const lista = [user?.centro, user?.codigo_centro_costo];
  return lista.map((c) => normalizarCodigoCentro(c)).filter(Boolean);
}

/** Acceso por centro: admin/global → OK; restringido → coincidencia; sin centro → false. */
export function puedeAccederRecepcionBienes(user, centro) {
  if (!user) return false;
  if (esAlcanceGlobal(user)) return true;
  const target = normalizarCodigoCentro(centro?.centro_codigo);
  const mine = centrosDelUsuario(user);
  if (!target || !mine.length) return false;
  return mine.some((m) => m === target || m.endsWith(target) || target.endsWith(m));
}

/** Lanza 403 genérico sin revelar centro ni datos. */
export function assertAccesoRecepcionBienes(user, centro) {
  if (!puedeAccederRecepcionBienes(user, centro)) {
    const err = new Error('No tiene acceso a este expediente');
    err.code = 'ACCESO_CENTRO_DENEGADO';
    err.status = 403;
    throw err;
  }
}

/** Valida responsable: existe, activo, mismo centro (+ área si aplica). */
export async function validarResponsableCentro(responsableId, centro, areaId = null, client = null) {
  const rid = parseInt(responsableId, 10);
  if (!Number.isFinite(rid)) {
    const err = new Error('Responsable inválido');
    err.status = 422;
    throw err;
  }
  const db = client || { query };
  const { rows } = await db.query(
    `SELECT id, activo, centro, codigo_centro_costo, area_id
     FROM usuarios WHERE id = $1`,
    [rid],
  );
  if (!rows.length) {
    const err = new Error('El responsable seleccionado no existe');
    err.code = 'RESPONSABLE_NO_ENCONTRADO';
    err.status = 422;
    throw err;
  }
  const u = rows[0];
  if (!u.activo) {
    const err = new Error('El responsable seleccionado está inactivo');
    err.status = 409;
    throw err;
  }
  const target = normalizarCodigoCentro(centro?.centro_codigo);
  const mine = [u?.centro, u?.codigo_centro_costo].map((c) => normalizarCodigoCentro(c)).filter(Boolean);
  if (!target || !mine.some((m) => m === target || m.endsWith(target) || target.endsWith(m))) {
    const err = new Error('El responsable no pertenece al centro del expediente');
    err.code = 'RESPONSABLE_CENTRO_INVALIDO';
    err.status = 422;
    throw err;
  }
  if (areaId != null && Number(areaId) && u.area_id != null && Number(u.area_id) !== Number(areaId)) {
    const err = new Error('El responsable no pertenece al área destino');
    err.code = 'RESPONSABLE_AREA_INVALIDO';
    err.status = 422;
    throw err;
  }
  return u;
}