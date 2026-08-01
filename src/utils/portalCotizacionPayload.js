/**
 * Payload ligero de cotización Portal Proveedores.
 * Nunca serializa base64 / File / Blob / data-URL en borrador ni presentación.
 */

const HEAVY_KEYS = new Set([
  'file', 'blob', 'base64', 'dataurl', 'data_url', 'contenido', 'contenido_base64',
  'buffer', 'bytes', 'arraybuffer', 'array_buffer', 'preview', 'previewurl', 'preview_url',
  'objecturl', 'object_url', 'raw', 'binary', 'stream', 'arraybuffer',
]);

const META_KEEP = new Set([
  'id', 'adjunto_id', 'documento_id', 'requisito_id', 'key', 'slot_key',
  'tipo', 'tipo_documento', 'documento', 'etiqueta', 'nombre', 'nombre_archivo',
  'archivo', 'archivo_nombre', 'mime_type', 'tamano', 'tamaño_bytes', 'size',
  'ruta', 'ref', 'fecha_registro', 'uploaded_at', 'estado', 'comentario',
  'group', 'tipo_anexo_tecnico', 'tipo_anexo_economico',
]);

const MAX_SAFE_JSON_BYTES = 1024 * 1024; // 1 MB

function isDataUrlString(v) {
  return typeof v === 'string' && /^data:/i.test(v.trim());
}

function isHeavyValue(v) {
  if (v == null) return false;
  if (typeof Blob !== 'undefined' && v instanceof Blob) return true;
  if (typeof File !== 'undefined' && v instanceof File) return true;
  if (typeof ArrayBuffer !== 'undefined' && v instanceof ArrayBuffer) return true;
  if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(v)) return true;
  if (isDataUrlString(v)) return true;
  if (typeof v === 'string' && v.length > 8192 && /^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 200))) {
    return true;
  }
  return false;
}

/** Metadatos de un archivo adjunto (sin binario). */
export function sanitizePortalAdjuntoMeta(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k);
    const low = key.toLowerCase();
    if (HEAVY_KEYS.has(low)) continue;
    if (isHeavyValue(v)) continue;
    if (!META_KEEP.has(key) && !META_KEEP.has(low)) {
      if (v && typeof v === 'object') continue;
      if (typeof v === 'string' && v.length > 2000) continue;
    }
    out[key] = v;
  }
  if (out.adjunto_id == null && out.id != null && Number.isFinite(Number(out.id))) {
    out.adjunto_id = Number(out.id);
  }
  if (out.nombre_archivo == null && (out.nombre || out.archivo)) {
    out.nombre_archivo = out.nombre || out.archivo;
  }
  if (out.nombre == null && out.nombre_archivo) out.nombre = out.nombre_archivo;
  if (out.tamano == null && (out.size != null || out.tamaño_bytes != null)) {
    out.tamano = out.size ?? out.tamaño_bytes;
  }
  // Sin referencia ni nombre no hay adjunto útil
  if (!out.adjunto_id && !out.nombre && !out.nombre_archivo && !out.key) return null;
  return out;
}

function sanitizeAnexos(anexos = {}) {
  const src = anexos && typeof anexos === 'object' && !Array.isArray(anexos) ? anexos : {};
  const docs = Array.isArray(src.docs_solicitados)
    ? src.docs_solicitados.map(sanitizePortalAdjuntoMeta).filter(Boolean)
    : [];
  const requisitos = Array.isArray(src.requisitos)
    ? src.requisitos.map(sanitizePortalAdjuntoMeta).filter(Boolean)
    : [];
  return {
    docs_solicitados: docs,
    requisitos,
    anexo_tecnico_firmado: sanitizePortalAdjuntoMeta(src.anexo_tecnico_firmado || src.anexo05a_firmado),
    anexo_economico_firmado: sanitizePortalAdjuntoMeta(src.anexo_economico_firmado || src.anexo05b_firmado),
    anexo05a_firmado: sanitizePortalAdjuntoMeta(src.anexo05a_firmado || src.anexo_tecnico_firmado),
    anexo05b_firmado: sanitizePortalAdjuntoMeta(src.anexo05b_firmado || src.anexo_economico_firmado),
    tipo_anexo_tecnico: src.tipo_anexo_tecnico || null,
    tipo_anexo_economico: src.tipo_anexo_economico || null,
    datos_proveedor: sanitizeDeep(src.datos_proveedor || {}),
  };
}

/** Sanitiza recursivamente eliminando binarios / data URLs. */
export function sanitizeDeep(value, depth = 0) {
  if (depth > 20) return null;
  if (value == null) return value;
  if (isHeavyValue(value)) return undefined;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeDeep(v, depth + 1)).filter((v) => v !== undefined);
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const low = String(k).toLowerCase();
    if (HEAVY_KEYS.has(low)) continue;
    const next = sanitizeDeep(v, depth + 1);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

/**
 * Construye body ligero para POST /cotizaciones/borrador y /cotizaciones.
 * @param {object} body
 */
export function buildPortalCotizacionPayload(body = {}) {
  const src = body || {};
  return {
    solicitud_id: src.solicitud_id,
    propuesta_tecnica: sanitizeDeep(src.propuesta_tecnica || {}),
    propuesta_economica: sanitizeDeep(src.propuesta_economica || {}),
    anexos: sanitizeAnexos(src.anexos || {}),
    certificados: Array.isArray(src.certificados)
      ? src.certificados.map(sanitizePortalAdjuntoMeta).filter(Boolean)
      : [],
  };
}

/** Alias pedido en el ticket. */
export function sanitizePortalCotizacionPayload(payload) {
  return buildPortalCotizacionPayload(payload);
}

export function measurePayloadBytes(payload) {
  const s = JSON.stringify(payload || {});
  try {
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(s, 'utf8');
  } catch (_) { /* noop */ }
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return s.length;
}

export function payloadContainsBinary(payload) {
  const found = [];
  const walk = (v, path) => {
    if (v == null) return;
    if (typeof v === 'string') {
      if (isDataUrlString(v)) found.push(`${path}:dataUrl`);
      else if (v.length > 8192 && /^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 200))) found.push(`${path}:base64`);
      return;
    }
    if (typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`));
      return;
    }
    for (const [k, val] of Object.entries(v)) {
      const low = k.toLowerCase();
      if (HEAVY_KEYS.has(low) && val != null && val !== '') found.push(`${path}.${k}`);
      walk(val, `${path}.${k}`);
    }
  };
  walk(payload, '$');
  return found;
}

export function assertPortalPayloadSafe(payload, { maxBytes = MAX_SAFE_JSON_BYTES } = {}) {
  const binary = payloadContainsBinary(payload);
  if (binary.length) {
    const err = new Error(
      `Payload de cotización contiene binarios embebidos (${binary.slice(0, 5).join(', ')}). `
      + 'Los archivos deben cargarse por separado.',
    );
    err.code = 'PORTAL_PAYLOAD_BINARY';
    throw err;
  }
  const bytes = measurePayloadBytes(payload);
  if (bytes > maxBytes) {
    const err = new Error(
      `Payload de cotización demasiado grande (${bytes} bytes). Los archivos deben cargarse por separado.`,
    );
    err.code = 'PORTAL_PAYLOAD_TOO_LARGE';
    throw err;
  }
  return bytes;
}

export { HEAVY_KEYS, MAX_SAFE_JSON_BYTES };
