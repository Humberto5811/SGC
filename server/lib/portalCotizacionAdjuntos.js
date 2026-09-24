/**
 * Adjuntos de cotización del Portal (binario fuera del JSON de borrador).
 */
import { query } from '../db.js';
import {
  assertInvitacionParaCotizacion,
  loadLegacyCotizacion,
  parseInvitacionId,
} from './cotizacionInvitacionContract.js';
import {
  buildPortalCotizacionPayload,
  assertPortalPayloadSafe,
} from '../../src/utils/portalCotizacionPayload.js';

function guessMime(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (n.endsWith('.doc')) return 'application/msword';
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function stripDataUrl(b64) {
  const s = String(b64 || '');
  if (s.includes(',')) return s.split(',')[1] || '';
  return s;
}

/**
 * Sube/reemplaza un adjunto de cotización portal (un archivo por request).
 * Body JSON: { invitacion_id, key, tipo, nombre_archivo, mime_type, contenido_base64, tamaño_bytes }
 */
export async function uploadCotizacionPortalAdjunto(proveedorId, solicitudId, body) {
  const key = String(body?.key || body?.slot_key || '').trim();
  const nombre = String(body?.nombre_archivo || body?.nombre || '').trim();
  const b64 = stripDataUrl(body?.contenido_base64 || body?.base64 || '');
  if (!key) throw Object.assign(new Error('key de adjunto requerido'), { status: 400 });
  if (!nombre || !b64) throw Object.assign(new Error('Archivo incompleto'), { status: 400 });

  const tipo = String(body?.tipo || 'docs_solicitados').trim() || 'docs_solicitados';
  const mime = body?.mime_type || guessMime(nombre);
  const size = Number(body?.tamaño_bytes || body?.size || Math.floor(b64.length * 0.75)) || 0;

  const invitacionId = parseInvitacionId(body?.invitacion_id);
  let cotizacionId = null;

  const { rows: canonRows } = await query(`
    SELECT 1 FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND proveedor_id = $2 AND invitacion_id IS NOT NULL
    LIMIT 1
  `, [solicitudId, proveedorId]);
  if (canonRows.length && !invitacionId) {
    throw Object.assign(new Error('invitacion_id requerido para adjuntos de cotización'), { status: 400 });
  }

  if (invitacionId) {
    await assertInvitacionParaCotizacion(proveedorId, solicitudId, invitacionId);
    const { rows: byInv } = await query(
      'SELECT id FROM cotizaciones_proveedor WHERE invitacion_id = $1',
      [invitacionId],
    );
    cotizacionId = byInv[0]?.id || null;

    const { rows } = await query(`
      INSERT INTO cotizaciones_proveedor_adjuntos (
        solicitud_id, proveedor_id, invitacion_id, cotizacion_id, slot_key, tipo,
        nombre_archivo, mime_type, contenido_base64, tamaño_bytes, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (invitacion_id, slot_key) WHERE invitacion_id IS NOT NULL DO UPDATE SET
        cotizacion_id = COALESCE(EXCLUDED.cotizacion_id, cotizaciones_proveedor_adjuntos.cotizacion_id),
        tipo = EXCLUDED.tipo,
        nombre_archivo = EXCLUDED.nombre_archivo,
        mime_type = EXCLUDED.mime_type,
        contenido_base64 = EXCLUDED.contenido_base64,
        tamaño_bytes = EXCLUDED.tamaño_bytes,
        updated_at = NOW()
      RETURNING id, solicitud_id, proveedor_id, invitacion_id, cotizacion_id, slot_key, tipo,
        nombre_archivo, mime_type, tamaño_bytes, created_at, updated_at
    `, [solicitudId, proveedorId, invitacionId, cotizacionId, key, tipo, nombre, mime, b64, size]);

    return formatAdjuntoResponse(rows[0], key);
  }

  // Legacy: sin invitacion_id — solo cotización legacy nullable
  const legacy = await loadLegacyCotizacion(proveedorId, solicitudId);
  cotizacionId = legacy?.id || null;

  const { rows } = await query(`
    INSERT INTO cotizaciones_proveedor_adjuntos (
      solicitud_id, proveedor_id, invitacion_id, cotizacion_id, slot_key, tipo,
      nombre_archivo, mime_type, contenido_base64, tamaño_bytes, updated_at
    ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (solicitud_id, proveedor_id, slot_key) WHERE invitacion_id IS NULL DO UPDATE SET
      cotizacion_id = COALESCE(EXCLUDED.cotizacion_id, cotizaciones_proveedor_adjuntos.cotizacion_id),
      tipo = EXCLUDED.tipo,
      nombre_archivo = EXCLUDED.nombre_archivo,
      mime_type = EXCLUDED.mime_type,
      contenido_base64 = EXCLUDED.contenido_base64,
      tamaño_bytes = EXCLUDED.tamaño_bytes,
      updated_at = NOW()
    RETURNING id, solicitud_id, proveedor_id, invitacion_id, cotizacion_id, slot_key, tipo,
      nombre_archivo, mime_type, tamaño_bytes, created_at, updated_at
  `, [solicitudId, proveedorId, cotizacionId, key, tipo, nombre, mime, b64, size]);

  return formatAdjuntoResponse(rows[0], key);
}

function formatAdjuntoResponse(adj, key) {
  return {
    id: adj.id,
    adjunto_id: adj.id,
    key: adj.slot_key || key,
    tipo: adj.tipo,
    nombre: adj.nombre_archivo,
    nombre_archivo: adj.nombre_archivo,
    mime_type: adj.mime_type,
    size: adj.tamaño_bytes,
    tamaño_bytes: adj.tamaño_bytes,
    invitacion_id: adj.invitacion_id,
    cotizacion_id: adj.cotizacion_id,
    created_at: adj.created_at,
    updated_at: adj.updated_at,
  };
}

export async function getCotizacionPortalAdjunto(proveedorId, solicitudId, adjuntoId) {
  const { rows } = await query(`
    SELECT id, nombre_archivo, mime_type, contenido_base64, tamaño_bytes, slot_key, tipo,
      invitacion_id, cotizacion_id
    FROM cotizaciones_proveedor_adjuntos
    WHERE id = $1 AND solicitud_id = $2 AND proveedor_id = $3
  `, [adjuntoId, solicitudId, proveedorId]);
  if (!rows.length) {
    throw Object.assign(new Error('Adjunto no encontrado'), { status: 404 });
  }
  return rows[0];
}

export async function deleteCotizacionPortalAdjunto(proveedorId, solicitudId, adjuntoId) {
  const { rowCount } = await query(`
    DELETE FROM cotizaciones_proveedor_adjuntos
    WHERE id = $1 AND solicitud_id = $2 AND proveedor_id = $3
  `, [adjuntoId, solicitudId, proveedorId]);
  if (!rowCount) {
    throw Object.assign(new Error('Adjunto no encontrado'), { status: 404 });
  }
  return { success: true };
}

export async function loadCotizacionAdjuntoById(adjuntoId) {
  const { rows } = await query(`
    SELECT id, solicitud_id, proveedor_id, invitacion_id, cotizacion_id,
      nombre_archivo, mime_type, contenido_base64, tamaño_bytes, slot_key, tipo
    FROM cotizaciones_proveedor_adjuntos WHERE id = $1
  `, [adjuntoId]);
  return rows[0] || null;
}

/** Sanitiza body de borrador/presentación y valida tamaño. */
export function prepareCotizacionPortalBody(body) {
  const light = buildPortalCotizacionPayload(body || {});
  assertPortalPayloadSafe(light);
  return light;
}

export { buildPortalCotizacionPayload, assertPortalPayloadSafe };
