/**
 * RC8.15.6G-6 — Documentos Pagos (filesystem, sin binario en filas operativas).
 */
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'storage', 'entregables-pago');

const MIME_ALLOWED = new Set([
  'application/pdf',
  'image/png', 'image/jpeg', 'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function sanitizeFilename(name) {
  return String(name || 'documento')
    .replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, '_')
    .slice(0, 200) || 'documento';
}

export function validatePagoDocumentoArchivo({ contenido_base64, nombre_archivo, mime_type } = {}) {
  const mime = String(mime_type || 'application/pdf').toLowerCase();
  if (!MIME_ALLOWED.has(mime)) {
    const err = new Error('Tipo de archivo no permitido');
    err.status = 422;
    err.code = 'MIME_NO_PERMITIDO';
    throw err;
  }
  const raw = String(contenido_base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw) {
    const err = new Error('El documento adjunto es obligatorio');
    err.status = 400;
    err.code = 'DOCUMENTO_REQUERIDO';
    throw err;
  }
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) {
    const err = new Error('El documento adjunto es inválido');
    err.status = 400;
    err.code = 'DOCUMENTO_INVALIDO';
    throw err;
  }
  if (buf.length > 25 * 1024 * 1024) {
    const err = new Error('El documento excede 25 MB');
    err.status = 413;
    err.code = 'DOCUMENTO_DEMASIADO_GRANDE';
    throw err;
  }
  return {
    buffer: buf,
    mime,
    nombre: sanitizeFilename(nombre_archivo),
    bytes: buf.length,
  };
}

export async function persistirPagoDocumento({
  client = null,
  ordenId,
  ordenEntregaId,
  tipoDocumento = 'AMPLIACION_PLAZO',
  archivo,
  createdBy = null,
}) {
  const validado = validatePagoDocumentoArchivo(archivo);
  await mkdir(ROOT, { recursive: true });
  const rel = path.join(
    String(ordenId),
    String(ordenEntregaId),
    `${Date.now()}-${validado.nombre}`,
  ).replace(/\\/g, '/');
  const abs = path.join(ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, validado.buffer);
  const runner = client || { query: (...args) => query(...args) };
  const { rows } = await runner.query(`
    INSERT INTO entregable_pago_documentos (
      orden_id, orden_entrega_id, tipo_documento, nombre_archivo, mime_type,
      storage_path, tamanio_bytes, created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [
    Number(ordenId),
    Number(ordenEntregaId),
    tipoDocumento,
    validado.nombre,
    validado.mime,
    rel,
    validado.bytes,
    createdBy,
  ]);
  return rows[0];
}

export async function leerPagoDocumentoBytes(documentoRow) {
  const rel = String(documentoRow?.storage_path || '');
  if (!rel) {
    const err = new Error('Documento sin ruta de almacenamiento');
    err.status = 404;
    throw err;
  }
  const abs = path.join(ROOT, rel);
  return readFile(abs);
}

export async function eliminarPagoDocumentoFisico(documentoRow) {
  const rel = String(documentoRow?.storage_path || '');
  if (!rel) return;
  try {
    await unlink(path.join(ROOT, rel));
  } catch (_) { /* ya eliminado */ }
}
