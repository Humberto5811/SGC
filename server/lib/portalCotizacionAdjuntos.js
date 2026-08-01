/**
 * Adjuntos de cotización del Portal (binario fuera del JSON de borrador).
 */
import { query } from '../db.js';
import { assertAccesoSolicitud } from './portalDocumentos.js';
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
 * Body JSON: { key, tipo, nombre_archivo, mime_type, contenido_base64, tamaño_bytes }
 */
export async function uploadCotizacionPortalAdjunto(proveedorId, solicitudId, body) {
  await assertAccesoSolicitud(proveedorId, solicitudId);
  const key = String(body?.key || body?.slot_key || '').trim();
  const nombre = String(body?.nombre_archivo || body?.nombre || '').trim();
  const b64 = stripDataUrl(body?.contenido_base64 || body?.base64 || '');
  if (!key) throw Object.assign(new Error('key de adjunto requerido'), { status: 400 });
  if (!nombre || !b64) throw Object.assign(new Error('Archivo incompleto'), { status: 400 });

  const tipo = String(body?.tipo || 'docs_solicitados').trim() || 'docs_solicitados';
  const mime = body?.mime_type || guessMime(nombre);
  const size = Number(body?.tamaño_bytes || body?.size || Math.floor(b64.length * 0.75)) || 0;

  const { rows: cotRows } = await query(
    `SELECT id FROM cotizaciones_proveedor WHERE solicitud_id = $1 AND proveedor_id = $2`,
    [solicitudId, proveedorId],
  );
  const cotizacionId = cotRows[0]?.id || null;

  const { rows } = await query(`
    INSERT INTO cotizaciones_proveedor_adjuntos (
      solicitud_id, proveedor_id, cotizacion_id, slot_key, tipo,
      nombre_archivo, mime_type, contenido_base64, tamaño_bytes, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (solicitud_id, proveedor_id, slot_key) DO UPDATE SET
      cotizacion_id = COALESCE(EXCLUDED.cotizacion_id, cotizaciones_proveedor_adjuntos.cotizacion_id),
      tipo = EXCLUDED.tipo,
      nombre_archivo = EXCLUDED.nombre_archivo,
      mime_type = EXCLUDED.mime_type,
      contenido_base64 = EXCLUDED.contenido_base64,
      tamaño_bytes = EXCLUDED.tamaño_bytes,
      updated_at = NOW()
    RETURNING id, solicitud_id, proveedor_id, cotizacion_id, slot_key, tipo,
      nombre_archivo, mime_type, tamaño_bytes, created_at, updated_at
  `, [solicitudId, proveedorId, cotizacionId, key, tipo, nombre, mime, b64, size]);

  const adj = rows[0];
  return {
    id: adj.id,
    adjunto_id: adj.id,
    key: adj.slot_key,
    tipo: adj.tipo,
    nombre: adj.nombre_archivo,
    nombre_archivo: adj.nombre_archivo,
    mime_type: adj.mime_type,
    size: adj.tamaño_bytes,
    tamaño_bytes: adj.tamaño_bytes,
    created_at: adj.created_at,
    updated_at: adj.updated_at,
  };
}

export async function getCotizacionPortalAdjunto(proveedorId, solicitudId, adjuntoId) {
  await assertAccesoSolicitud(proveedorId, solicitudId);
  const { rows } = await query(`
    SELECT id, nombre_archivo, mime_type, contenido_base64, tamaño_bytes, slot_key, tipo
    FROM cotizaciones_proveedor_adjuntos
    WHERE id = $1 AND solicitud_id = $2 AND proveedor_id = $3
  `, [adjuntoId, solicitudId, proveedorId]);
  if (!rows.length) {
    throw Object.assign(new Error('Adjunto no encontrado'), { status: 404 });
  }
  return rows[0];
}

export async function loadCotizacionAdjuntoById(adjuntoId) {
  const { rows } = await query(`
    SELECT id, solicitud_id, proveedor_id, nombre_archivo, mime_type, contenido_base64, tamaño_bytes, slot_key, tipo
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
