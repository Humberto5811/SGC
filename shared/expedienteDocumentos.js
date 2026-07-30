/**
 * Consolidación documental del expediente de orden.
 * Deduplica por clave canónica; filtra por proveedor adjudicado.
 */

import { toCalendarIso, formatCalendarDdMmYyyy } from './calendarDate.js';

function contentFingerprint(entry = {}) {
  const nombre = String(entry.nombre_archivo || entry.nombre || '').trim().toLowerCase();
  const b64 = String(entry.base64 || entry.contenido_base64 || '');
  const len = b64.length;
  const mime = String(entry.mime_type || '').toLowerCase();
  return `${nombre}|${mime}|${len}`;
}

function hasFile(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return !!(entry.base64 || entry.contenido_base64 || entry.nombre_archivo || entry.nombre);
}

function labelFromSolicitudDocs(docsSolicitados = [], idx, keyHint = '') {
  const list = Array.isArray(docsSolicitados) ? docsSolicitados : [];
  const byKey = list.find((d) => {
    if (!keyHint) return false;
    const k = String(d?.key || d?.id || '').toLowerCase();
    return k && k === String(keyHint).toLowerCase();
  });
  if (byKey) {
    return byKey.documento || byKey.archivo || byKey.nombre || byKey.label || null;
  }
  const at = list[idx];
  if (at == null) return null;
  if (typeof at === 'string') return at;
  return at.documento || at.archivo || at.nombre || at.label || null;
}

function labelFromRequisitos(requisitos = [], idx, keyHint = '') {
  const list = Array.isArray(requisitos) ? requisitos : [];
  const byKey = list.find((d) => {
    if (!keyHint) return false;
    const k = String(d?.key || d?.id || '').toLowerCase();
    return k && k === String(keyHint).toLowerCase();
  });
  if (byKey) return byKey.requisito || byKey.documento || byKey.nombre || null;
  const at = list[idx];
  if (!at || typeof at !== 'object') return null;
  return at.requisito || at.documento || at.nombre || null;
}

/**
 * Contrato documental uniforme (OD41).
 */
export function toDocumentoContrato(doc = {}, extras = {}) {
  const fechaEnvioRaw = doc.fechaEnvio || doc.fecha_envio || doc.fecha || doc.created_at || null;
  const fechaRegRaw = doc.fechaRegistro || doc.fecha_registro || doc.created_at || null;
  return {
    documentoId: doc.documentoId ?? doc.documento_id ?? doc.id ?? null,
    nombre: doc.nombre || doc.nombre_archivo || 'documento',
    tipo: doc.tipo || doc.tipo_documento || extras.tipo || 'Documento',
    origen: doc.origen || extras.origen || 'COTIZACION',
    proveedorId: doc.proveedorId ?? doc.proveedor_id ?? null,
    proveedor_id: doc.proveedor_id ?? doc.proveedorId ?? null,
    cotizacionId: doc.cotizacionId ?? doc.cotizacion_id ?? null,
    cotizacion_id: doc.cotizacion_id ?? doc.cotizacionId ?? null,
    mimeType: doc.mimeType || doc.mime_type || 'application/pdf',
    storageKey: doc.storageKey || doc.storage_key || null,
    previewDisponible: doc.previewDisponible !== false,
    version: doc.version ?? null,
    fechaEnvio: toCalendarIso(fechaEnvioRaw),
    fechaEnvioLabel: formatCalendarDdMmYyyy(fechaEnvioRaw),
    fechaRegistro: toCalendarIso(fechaRegRaw),
    endpointVisualizacion: doc.endpointVisualizacion || extras.endpointVisualizacion || null,
    // compat FE existente
    id: doc.id ?? doc.documentoId ?? null,
    mime_type: doc.mimeType || doc.mime_type || 'application/pdf',
    created_at: fechaEnvioRaw,
    fecha: fechaEnvioRaw,
    fecha_envio: toCalendarIso(fechaEnvioRaw),
    ref: doc.ref || null,
    kind: doc.kind || extras.kind || null,
    fingerprint: doc.fingerprint || null,
    registro_origen_id: doc.registro_origen_id ?? doc.cotizacion_id ?? null,
    ...extras,
  };
}

/**
 * Clave canónica de deduplicación (prioridad OD41 / RC109).
 */
export function documentoDedupKey(doc = {}) {
  if (doc.documento_id != null) return `id:${doc.documento_id}`;
  if (doc.documentoId != null && doc.kind !== 'cotizacion') return `id:${doc.documentoId}`;
  if (doc.archivo_id != null) return `arch:${doc.archivo_id}`;
  if (doc.storage_key || doc.storageKey) return `sk:${doc.storage_key || doc.storageKey}`;
  if (doc.hash) return `hash:${doc.hash}`;
  if (doc.fingerprint) return `fp:${doc.fingerprint}`;
  const origen = String(doc.origen || doc.kind || '').toUpperCase();
  const tipo = String(doc.tipo || doc.tipo_documento || '').toUpperCase();
  const reg = doc.registro_origen_id ?? doc.cotizacion_id ?? doc.id ?? '';
  const ver = doc.version ?? '';
  const ref = String(doc.ref || doc.preview_ref || '').toLowerCase();
  if (doc.documentoId != null && doc.kind === 'cotizacion') return `cot:${doc.documentoId}`;
  if (doc.documentoId != null) return `id:${doc.documentoId}`;
  return `combo:${origen}|${tipo}|${reg}|${ver}|${ref}`;
}

export function dedupeDocumentos(docs = []) {
  const seen = new Map();
  const out = [];
  for (const d of docs) {
    const key = documentoDedupKey(d);
    if (seen.has(key)) continue;
    seen.set(key, true);
    out.push(d);
  }
  return out;
}

/**
 * Extrae documentos de cotización del proveedor adjudicado.
 * Incluye 5-A, 5-B, docs solicitados, requisitos y certificados.
 *
 * @param {Array} cotizaciones
 * @param {number|null} proveedorAdjudicadoId
 * @param {{ docsSolicitadosSc?: any[], requisitosTecnicosSc?: any[] }} [ctx]
 */
export function buildDocsCotizacionAdjudicada(cotizaciones = [], proveedorAdjudicadoId, ctx = {}) {
  const pid = proveedorAdjudicadoId != null ? Number(proveedorAdjudicadoId) : null;
  const list = (cotizaciones || []).filter((c) => {
    if (pid == null || !Number.isFinite(pid)) return true;
    return Number(c.proveedor_id) === pid;
  });

  const out = [];
  const seenFp = new Set();
  const docsSolSc = ctx.docsSolicitadosSc || [];
  const reqsSc = ctx.requisitosTecnicosSc || [];

  for (const cot of list) {
    const anexos = typeof cot.anexos === 'object' && cot.anexos
      ? cot.anexos
      : (() => { try { return JSON.parse(cot.anexos || '{}'); } catch (_) { return {}; } })();

    const fechaCot = cot.fecha_presentacion || cot.enviado_at || cot.fecha_envio || cot.updated_at || cot.created_at;

    const pushUnique = (canonicalRef, tipoFallback, entry, labelHint) => {
      if (!hasFile(entry)) return;
      const fp = `${cot.id}|${contentFingerprint(entry)}`;
      if (seenFp.has(fp)) return;
      seenFp.add(fp);
      const tipo = labelHint
        || entry.documento
        || entry.requisito
        || entry.tipo
        || entry.key
        || tipoFallback;
      const nombre = entry.nombre_archivo || entry.nombre || tipo;
      const fechaEnvio = entry.fecha_envio || entry.uploaded_at || entry.fecha || fechaCot;
      out.push(toDocumentoContrato({
        documentoId: `${cot.id}:${canonicalRef}`,
        id: `${cot.id}:${canonicalRef}`,
        cotizacion_id: cot.id,
        cotizacionId: cot.id,
        registro_origen_id: cot.id,
        ref: canonicalRef,
        preview_ref: canonicalRef,
        origen: 'COTIZACION',
        tipo,
        nombre,
        mime_type: entry.mime_type || 'application/pdf',
        mimeType: entry.mime_type || 'application/pdf',
        created_at: fechaEnvio,
        fecha: fechaEnvio,
        fechaEnvio,
        kind: 'cotizacion',
        proveedor: cot.razon_social || cot.ruc || '',
        proveedor_id: cot.proveedor_id,
        proveedorId: cot.proveedor_id,
        fingerprint: fp,
        previewDisponible: true,
        version: null,
      }, {
        endpointVisualizacion: `cotizacion/${encodeURIComponent(`${cot.id}:${canonicalRef}`)}`,
      }));
    };

    const a5a = anexos.anexo05a_firmado || anexos.anexo_tecnico_firmado || anexos.anexo05a || null;
    pushUnique('anexo05a', 'Cotización 5-A', a5a, 'Cotización 5-A');

    const a5b = anexos.anexo05b_firmado || anexos.anexo_economico_firmado || anexos.anexo05b || null;
    pushUnique('anexo05b', 'Cotización 5-B', a5b, 'Cotización 5-B');

    const docsSol = Array.isArray(anexos.docs_solicitados) ? anexos.docs_solicitados : [];
    docsSol.forEach((f, idx) => {
      if (!hasFile(f)) return;
      const label = labelFromSolicitudDocs(docsSolSc, idx, f.key)
        || f.documento || f.tipo || f.key || `Documento técnico ${idx + 1}`;
      pushUnique(`docs-${idx}`, 'Documento técnico del proveedor', f, label);
    });

    const reqs = Array.isArray(anexos.requisitos) ? anexos.requisitos : [];
    reqs.forEach((f, idx) => {
      if (!hasFile(f)) return;
      const label = labelFromRequisitos(reqsSc, idx, f.key)
        || f.requisito || f.documento || f.tipo || `Requisito técnico ${idx + 1}`;
      pushUnique(`req-${idx}`, 'Requisito técnico mínimo', f, label);
    });

    // Certificados / anexos técnicos complementarios
    let certs = cot.certificados;
    if (typeof certs === 'string') {
      try { certs = JSON.parse(certs); } catch (_) { certs = []; }
    }
    (Array.isArray(certs) ? certs : []).forEach((f, idx) => {
      if (!hasFile(f)) return;
      const label = f.tipo || f.documento || f.nombre || `Certificado ${idx + 1}`;
      pushUnique(`cert-${idx}`, 'Certificado', f, label);
    });

    // Otros adjuntos técnicos en anexos (claves conocidas)
    const extraKeys = [
      ['ficha_tecnica', 'Ficha técnica'],
      ['certificado_calidad', 'Certificado de calidad'],
      ['certificado_analisis', 'Certificado de análisis'],
      ['protocolo', 'Protocolo'],
      ['registro_sanitario', 'Registro sanitario'],
      ['garantia', 'Garantía'],
      ['manual', 'Manual'],
      ['vigencia_certificado', 'Vigencia del certificado'],
    ];
    extraKeys.forEach(([key, label], idx) => {
      const entry = anexos[key];
      if (!hasFile(entry)) return;
      pushUnique(`extra-${key}-${idx}`, label, entry, label);
    });
  }

  return dedupeDocumentos(out);
}

/** Filtra orden_documentos: solo activo o última versión por tipo. */
export function consolidateOrdenDocumentos(docs = []) {
  const byTipo = new Map();
  for (const d of docs || []) {
    const tipo = String(d.tipo_documento || d.tipo || '');
    const prev = byTipo.get(tipo);
    const ver = Number(d.version || 0);
    if (!prev || ver > Number(prev.version || 0) || (d.activo && !prev.activo)) {
      byTipo.set(tipo, d);
    }
  }
  const activos = (docs || []).filter((d) => d.activo);
  const source = activos.length ? activos : [...byTipo.values()];
  return dedupeDocumentos(source.map((d) => toDocumentoContrato({
    documentoId: d.id,
    id: d.id,
    origen: 'ORDEN',
    tipo: d.tipo_documento || d.tipo,
    nombre: d.nombre_archivo || d.nombre,
    mime_type: d.mime_type || 'application/pdf',
    mimeType: d.mime_type || 'application/pdf',
    version: d.version,
    created_at: d.subido_at || d.created_at,
    fecha: d.subido_at || d.created_at,
    fechaEnvio: d.subido_at || d.created_at,
    kind: 'orden',
    previewDisponible: true,
    registro_origen_id: d.id,
  }, { kind: 'orden', origen: 'ORDEN' })));
}
