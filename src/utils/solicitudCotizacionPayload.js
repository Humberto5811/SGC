/**
 * Payload ligero de Solicitud de Cotización (pestaña Documentos y updates).
 * Nunca serializa File/Blob/base64/data-URL en el PUT JSON.
 */

const HEAVY_KEYS = new Set([
  'file', 'blob', 'base64', 'dataurl', 'data_url', 'contenido', 'contenido_base64',
  'buffer', 'bytes', 'arraybuffer', 'array_buffer', 'preview', 'previewurl', 'preview_url',
  'objecturl', 'object_url', 'raw', 'binary', 'stream',
]);

const DOC_KEEP = new Set([
  'id', 'documento', 'nombre', 'archivo', 'archivo_nombre', 'adjunto_id',
  'ruta', 'url', 'fecha_registro', 'seleccionado', 'tipo', 'mime_type', 'tamano',
  'tamaño_bytes', 'comentario', 'custom', 'personalizado',
]);

const REQ_KEEP = new Set([
  'requisito', 'obligatorio', 'observacion', 'archivo', 'custom', 'personalizado',
  'adjunto_id', 'mime_type', 'archivo_nombre',
]);

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
  // base64 crudo muy largo (heurística: > 8 KB de caracteres)
  if (typeof v === 'string' && v.length > 8192 && /^[A-Za-z0-9+/=\s]+$/.test(v.slice(0, 200))) {
    return true;
  }
  return false;
}

export function sanitizeDocSolicitado(raw = {}) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const key = String(k);
    const low = key.toLowerCase();
    if (HEAVY_KEYS.has(low)) continue;
    if (!DOC_KEEP.has(key) && !DOC_KEEP.has(low)) {
      // permitir claves desconocidas ligeras (compat), no binarios
      if (isHeavyValue(v) || (v && typeof v === 'object')) continue;
    }
    if (isHeavyValue(v)) continue;
    out[key] = v;
  }
  if (out.archivo_nombre == null && out.archivo) out.archivo_nombre = out.archivo;
  if (out.archivo == null && out.archivo_nombre) out.archivo = out.archivo_nombre;
  if (out.documento == null && out.nombre) out.documento = out.nombre;
  return out;
}

export function sanitizeReqTecnico(raw = {}) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const key = String(k);
    const low = key.toLowerCase();
    if (HEAVY_KEYS.has(low)) continue;
    if (!REQ_KEEP.has(key) && !REQ_KEEP.has(low)) {
      if (isHeavyValue(v) || (v && typeof v === 'object')) continue;
    }
    if (isHeavyValue(v)) continue;
    out[key] = v;
  }
  if (out.obligatorio === 'NO' || out.obligatorio === 'No' || out.obligatorio === 0 || out.obligatorio === '0') {
    out.obligatorio = false;
  } else if (out.obligatorio === 'SI' || out.obligatorio === 'Si' || out.obligatorio === 1 || out.obligatorio === '1') {
    out.obligatorio = true;
  } else {
    out.obligatorio = out.obligatorio !== false;
  }
  out.observacion = String(out.observacion || '');
  out.requisito = String(out.requisito || out.nombre || '').trim();
  out.custom = out.custom === true || out.personalizado === true;
  out.personalizado = out.custom;
  return out;
}

/**
 * Construye el body de update (parcial o completo) sin binarios.
 * @param {object} stateOrPartial — state del wizard o { docs_solicitados, requisitos_tecnicos, ... }
 */
export function buildSolicitudCotizacionUpdatePayload(stateOrPartial = {}) {
  const src = stateOrPartial || {};
  const payload = {};

  const docs = src.docs_solicitados ?? src.docsResumen;
  if (docs != null) {
    payload.docs_solicitados = (Array.isArray(docs) ? docs : []).map(sanitizeDocSolicitado);
  }

  const reqs = src.requisitos_tecnicos ?? src.reqResumen;
  if (reqs != null) {
    payload.requisitos_tecnicos = (Array.isArray(reqs) ? reqs : []).map(sanitizeReqTecnico);
  }

  // Copiar resto de campos ligeros (datos generales, ítems, etc.)
  for (const [k, v] of Object.entries(src)) {
    if (k === 'docsResumen' || k === 'reqResumen' || k === 'docs_solicitados' || k === 'requisitos_tecnicos') continue;
    if (k === 'proveedores' || k === 'proveedoresBusqueda' || k === 'unlocked' || k === 'completed') continue;
    if (k.startsWith('_')) continue;
    if (isHeavyValue(v)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      // objetos anidados: clonar sin pesados
      try {
        payload[k] = JSON.parse(JSON.stringify(v, (key, val) => {
          if (HEAVY_KEYS.has(String(key).toLowerCase())) return undefined;
          if (isHeavyValue(val)) return undefined;
          return val;
        }));
      } catch (_) { /* omit */ }
      continue;
    }
    if (Array.isArray(v)) {
      try {
        payload[k] = JSON.parse(JSON.stringify(v, (key, val) => {
          if (HEAVY_KEYS.has(String(key).toLowerCase())) return undefined;
          if (isHeavyValue(val)) return undefined;
          return val;
        }));
      } catch (_) { /* omit */ }
      continue;
    }
    payload[k] = v;
  }

  return payload;
}

/** Alias pedido en la tarea. */
export function sanitizeSolicitudCotizacionPayload(stateOrPartial) {
  return buildSolicitudCotizacionUpdatePayload(stateOrPartial);
}

export function measureJsonBytes(obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj ?? null);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
  return text.length;
}

export function payloadHasBinaries(obj, path = '') {
  const findings = [];
  const walk = (v, p) => {
    if (v == null) return;
    if (isHeavyValue(v)) {
      findings.push({ path: p || '(root)', kind: typeof v, sample: typeof v === 'string' ? v.slice(0, 32) : String(v).slice(0, 40) });
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`));
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        const low = k.toLowerCase();
        if (HEAVY_KEYS.has(low)) {
          findings.push({ path: `${p}.${k}`, kind: 'heavy-key' });
          continue;
        }
        walk(val, p ? `${p}.${k}` : k);
      }
    }
  };
  walk(obj, path);
  return findings;
}

export function assertPayloadLight(obj, { maxBytes = 1024 * 1024 } = {}) {
  const bytes = measureJsonBytes(obj);
  const binaries = payloadHasBinaries(obj);
  return {
    ok: bytes <= maxBytes && binaries.length === 0,
    bytes,
    maxBytes,
    binaries,
  };
}

export { HEAVY_KEYS, DOC_KEEP, REQ_KEEP };
