/**
 * RC8.5-C1 — Consolidación documental del expediente (Cuadro Comparativo).
 * Deduplicación por identidad física + clasificación origen/categoría.
 * No crea tablas ni visor nuevo.
 */

export const ORIGEN_DOC = Object.freeze({
  REQUERIMIENTO: 'Requerimiento',
  PEDIDO: 'Pedido SIGAMEF',
  SOLICITUD: 'Solicitud Cotización',
  PROVEEDOR: 'Proveedor',
  VALIDACION: 'Validación',
  CUADRO: 'Cuadro Comparativo',
  FIRMA_COORD: 'Firma Coordinador CM',
  FIRMA_DEC: 'Firma DEC',
  OTRO: 'Otro',
});

export const CATEGORIA_DOC = Object.freeze({
  ET: 'Especificaciones Técnicas',
  TDR: 'TDR',
  FICHA: 'Ficha Técnica',
  RTM: 'Requisitos Técnicos Mínimos',
  ANEXO_TEC: 'Anexos Técnicos',
  REQUERIMIENTO: 'Requerimiento',
  PEDIDO: 'Pedido SIGAMEF',
  SOLICITUD: 'Solicitud de Cotización',
  FORMATOS: 'Formatos',
  OTROS: 'Otros anexos',
  CUADRO: 'Cuadro Comparativo',
  FIRMA: 'Firma',
  VALIDACION: 'Validación',
  PROVEEDOR: 'Documento proveedor',
});

const TECH_SET = new Set([
  CATEGORIA_DOC.ET,
  CATEGORIA_DOC.TDR,
  CATEGORIA_DOC.FICHA,
  CATEGORIA_DOC.RTM,
  CATEGORIA_DOC.ANEXO_TEC,
]);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtFecha(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 16).replace('T', ' ');
}

function parseList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(p) ? p : [];
  } catch (_) {
    return [];
  }
}

function normName(n) {
  return String(n || '').trim().toLowerCase();
}

/** Identidad física del archivo (no solo nombre). */
export function documentIdentityKey(doc = {}) {
  const id = doc.document_id ?? doc.attachment_id ?? doc.adjunto_id ?? doc.id;
  if (id != null && String(id).trim() !== '' && String(id) !== 'undefined') {
    return `id:${String(id)}`;
  }
  const sk = doc.storage_key || doc.storageKey || doc.clave_almacenamiento;
  if (sk) return `sk:${String(sk)}`;
  const hash = doc.hash || doc.content_hash || doc.sha256 || doc.checksum;
  if (hash) return `hash:${String(hash)}`;
  const name = normName(doc.nombre_archivo || doc.nombre || doc.documento || doc.archivo || doc.requisito);
  const size = Number(doc.tamaño_bytes ?? doc.tamano ?? doc.size ?? 0);
  const fecha = String(doc.created_at || doc.fecha_registro || doc.fecha || '').slice(0, 16);
  const tipo = String(doc.mime_type || doc.mime || '').toLowerCase();
  return `meta:${name}|${size}|${fecha}|${tipo}`;
}

export function classifyCategoria(doc = {}, hint = '') {
  const n = `${doc.nombre_archivo || doc.nombre || doc.documento || doc.archivo || doc.requisito || ''} ${hint}`.toLowerCase();
  const catHint = String(doc.categoria || doc.tipo_documento || doc.tipo_doc || '').toLowerCase();
  const blob = `${n} ${catHint}`;

  if (/firma\s*dec|firmado\s*dec/.test(blob)) return CATEGORIA_DOC.FIRMA;
  if (/firma\s*coord|firmado\s*coord|cuadro.*firm/.test(blob)) return CATEGORIA_DOC.FIRMA;
  if (/validaci[oó]n|anexo\s*07/.test(blob)) return CATEGORIA_DOC.VALIDACION;
  if (/cuadro\s*comp|anexo\s*08|anexo\s*8[ab]/.test(blob)) return CATEGORIA_DOC.CUADRO;
  if (/fichanet|ficha\s*t[eé]cnica|ficha\s*tec/.test(blob)) return CATEGORIA_DOC.FICHA;
  if (/\btdr\b|t[eé]rminos?\s+de\s+referencia/.test(blob)) return CATEGORIA_DOC.TDR;
  if (/especificaci[oó]n|espec\.?\s*t[eé]c|\bet\b|anexo\s*t[eé]cnic/.test(blob)) return CATEGORIA_DOC.ET;
  if (/requisitos?\s*t[eé]cnic|rtm|m[ií]nimos?\s*t[eé]cnic/.test(blob)) return CATEGORIA_DOC.RTM;
  if (/anexo\s*t[eé]cnic|propuesta\s*t[eé]cnica/.test(blob)) return CATEGORIA_DOC.ANEXO_TEC;
  if (/pedido|sigamef/.test(blob)) return CATEGORIA_DOC.PEDIDO;
  if (/solicitud\s*(de\s*)?cotiz|\bsc[-_\s]?\d|\bformato\b|anexo\s*0?[9]|anexo\s*1[0-6]|anexo\s*a\b|anexo\s*b\b/.test(blob)) {
    if (/formato|anexo\s*0?[9]|anexo\s*1[0-6]|anexo\s*a\b|anexo\s*b\b/.test(blob)) return CATEGORIA_DOC.FORMATOS;
    return CATEGORIA_DOC.SOLICITUD;
  }
  if (/\breq\b|requerimiento|req\s*\d+/i.test(blob)) return CATEGORIA_DOC.REQUERIMIENTO;
  if (/proveedor|cotizaci[oó]n\s*present|anexo\s*05/.test(blob)) return CATEGORIA_DOC.PROVEEDOR;
  if (hint === 'requisito_tecnico' || catHint.includes('requisito')) return CATEGORIA_DOC.RTM;
  if (hint === 'docs_solicitados') return CATEGORIA_DOC.FORMATOS;
  return CATEGORIA_DOC.OTROS;
}

export function classifyOrigen(doc = {}, source = '') {
  if (doc.origen && Object.values(ORIGEN_DOC).includes(doc.origen)) return doc.origen;
  const s = String(source || doc.source || doc.fuente || '').toLowerCase();
  if (/firma\s*dec|firmado_dec/.test(s)) return ORIGEN_DOC.FIRMA_DEC;
  if (/firma\s*coord|firmado_coord/.test(s)) return ORIGEN_DOC.FIRMA_COORD;
  if (/cuadro/.test(s)) return ORIGEN_DOC.CUADRO;
  if (/validaci/.test(s)) return ORIGEN_DOC.VALIDACION;
  if (/proveedor|cotizaci[oó]n/.test(s)) return ORIGEN_DOC.PROVEEDOR;
  if (/solicitud|convocatoria|docs_solicitados|requisito/.test(s)) return ORIGEN_DOC.SOLICITUD;
  if (/pedido|sigamef/.test(s)) return ORIGEN_DOC.PEDIDO;
  if (/requerimiento|req\b|adjunto/.test(s)) return ORIGEN_DOC.REQUERIMIENTO;
  const cat = classifyCategoria(doc, source);
  if (cat === CATEGORIA_DOC.FIRMA) {
    return /dec/i.test(`${doc.nombre_archivo || ''} ${source}`) ? ORIGEN_DOC.FIRMA_DEC : ORIGEN_DOC.FIRMA_COORD;
  }
  if (cat === CATEGORIA_DOC.CUADRO) return ORIGEN_DOC.CUADRO;
  if (cat === CATEGORIA_DOC.VALIDACION) return ORIGEN_DOC.VALIDACION;
  if (cat === CATEGORIA_DOC.PROVEEDOR) return ORIGEN_DOC.PROVEEDOR;
  if (cat === CATEGORIA_DOC.PEDIDO) return ORIGEN_DOC.PEDIDO;
  if (cat === CATEGORIA_DOC.SOLICITUD || cat === CATEGORIA_DOC.FORMATOS) return ORIGEN_DOC.SOLICITUD;
  if (cat === CATEGORIA_DOC.REQUERIMIENTO || TECH_SET.has(cat)) return ORIGEN_DOC.REQUERIMIENTO;
  return ORIGEN_DOC.OTRO;
}

export function isCategoriaTecnica(cat) {
  return TECH_SET.has(cat);
}

export function normalizeExpedienteDoc(raw = {}, meta = {}) {
  const nombre = raw.nombre_archivo || raw.nombre || raw.documento || raw.archivo || raw.requisito || 'documento';
  const id = raw.document_id ?? raw.attachment_id ?? raw.adjunto_id ?? raw.id ?? null;
  const categoria = meta.categoria || classifyCategoria(raw, meta.hint || meta.source || '');
  const origen = meta.origen || classifyOrigen({ ...raw, origen: meta.origen }, meta.source || '');
  return {
    ...raw,
    id,
    adjunto_id: id,
    document_id: id,
    nombre_archivo: nombre,
    mime_type: raw.mime_type || raw.mime || '',
    tamaño_bytes: Number(raw.tamaño_bytes ?? raw.tamano ?? raw.size ?? 0) || 0,
    created_at: raw.created_at || raw.fecha_registro || raw.fecha || null,
    categoria,
    origen,
    estado: raw.estado || (id || raw.contenido_base64 ? 'Disponible' : 'Referencia'),
    contenido_base64: raw.contenido_base64 || null,
    requerimiento_id: raw.requerimiento_id || meta.requerimiento_id || null,
    requerimiento_codigo: raw.requerimiento_codigo || meta.requerimiento_codigo || '',
    source: meta.source || raw.source || '',
  };
}

/** Conserva un único registro por archivo físico. */
export function dedupeDocumentos(docs = []) {
  const map = new Map();
  (docs || []).forEach((d) => {
    const key = documentIdentityKey(d);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, d);
      return;
    }
    // Preferir el que tenga id / base64 / más metadatos
    const score = (x) => (x.id ? 4 : 0) + (x.contenido_base64 ? 2 : 0) + (x.origen && x.origen !== ORIGEN_DOC.OTRO ? 1 : 0);
    if (score(d) > score(prev)) map.set(key, { ...prev, ...d, origen: d.origen || prev.origen, categoria: d.categoria || prev.categoria });
    else {
      map.set(key, {
        ...d,
        ...prev,
        origen: prev.origen || d.origen,
        categoria: prev.categoria || d.categoria,
      });
    }
  });
  return Array.from(map.values());
}

function matchAdjuntoByName(adjuntos, nombre) {
  const n = normName(nombre);
  if (!n || !adjuntos?.length) return null;
  return adjuntos.find((a) => normName(a.nombre_archivo) === n)
    || adjuntos.find((a) => normName(a.nombre_archivo).includes(n) || n.includes(normName(a.nombre_archivo)))
    || null;
}

function resolveSolicitudEntry(entry, adjuntosFlat, meta) {
  const nombre = entry.archivo || entry.documento || entry.nombre || entry.requisito || '';
  const match = matchAdjuntoByName(adjuntosFlat, nombre);
  const base = match
    ? { ...match, contenido_base64: entry.contenido_base64 || null }
    : {
      nombre_archivo: nombre,
      mime_type: entry.mime_type || '',
      tamaño_bytes: entry.tamaño_bytes || entry.tamano || 0,
      created_at: entry.fecha || entry.created_at || null,
      contenido_base64: entry.contenido_base64 || null,
    };
  return normalizeExpedienteDoc(base, meta);
}

/**
 * Construye el universo documental del expediente sin duplicar archivos físicos.
 */
export function buildExpedienteDocumental({
  adjuntosPorReq = {},
  solicitud = null,
  docsPorCot = {},
  cuadro = null,
  proveedores = [],
} = {}) {
  const bag = [];

  Object.entries(adjuntosPorReq || {}).forEach(([reqId, list]) => {
    (list || []).forEach((a) => {
      bag.push(normalizeExpedienteDoc(a, {
        origen: ORIGEN_DOC.REQUERIMIENTO,
        source: 'requerimiento',
        requerimiento_id: reqId,
        requerimiento_codigo: a.requerimiento_codigo || '',
      }));
    });
  });

  const adjuntosFlat = dedupeDocumentos(bag);

  parseList(solicitud?.docs_solicitados).forEach((d, i) => {
    bag.push(resolveSolicitudEntry(d, adjuntosFlat, {
      origen: ORIGEN_DOC.SOLICITUD,
      source: 'docs_solicitados',
      hint: 'docs_solicitados',
      categoria: classifyCategoria(d, 'docs_solicitados'),
    }));
    void i;
  });
  parseList(solicitud?.docs_convocatoria).forEach((d) => {
    bag.push(resolveSolicitudEntry(d, adjuntosFlat, {
      origen: ORIGEN_DOC.SOLICITUD,
      source: 'docs_convocatoria',
      hint: 'docs_solicitados',
    }));
  });
  parseList(solicitud?.requisitos_tecnicos).forEach((d) => {
    if (!(d.archivo || d.nombre || d.contenido_base64 || d.documento)) return;
    bag.push(resolveSolicitudEntry(d, adjuntosFlat, {
      origen: ORIGEN_DOC.SOLICITUD,
      source: 'requisitos_tecnicos',
      hint: 'requisito_tecnico',
      categoria: CATEGORIA_DOC.RTM,
    }));
  });

  Object.entries(docsPorCot || {}).forEach(([cotId, docs]) => {
    const prov = (proveedores || []).find((p) => String(p.cotizacion_id) === String(cotId));
    (docs || []).forEach((d, i) => {
      bag.push(normalizeExpedienteDoc({
        id: d.id || d.adjunto_id || null,
        nombre_archivo: d.nombre || d.nombre_archivo || d.documento || d.ref || `doc-${i}`,
        mime_type: d.mime_type || '',
        created_at: d.fecha || d.created_at,
        tamaño_bytes: d.tamaño_bytes || 0,
        contenido_base64: d.contenido_base64 || null,
      }, {
        origen: ORIGEN_DOC.PROVEEDOR,
        source: 'proveedor',
        hint: 'proveedor',
        categoria: CATEGORIA_DOC.PROVEEDOR,
      }));
      void prov;
    });
  });

  if (cuadro?.tiene_pdf || cuadro?.pdf_nombre) {
    bag.push(normalizeExpedienteDoc({
      id: cuadro.pdf_adjunto_id || null,
      nombre_archivo: cuadro.pdf_nombre || 'Cuadro_Comparativo.pdf',
      created_at: cuadro.actualizado_at || cuadro.creado_at,
      mime_type: 'application/pdf',
    }, { origen: ORIGEN_DOC.CUADRO, source: 'cuadro', categoria: CATEGORIA_DOC.CUADRO }));
  }
  if (cuadro?.tiene_pdf_firmado || cuadro?.firmado_nombre) {
    bag.push(normalizeExpedienteDoc({
      id: cuadro.firmado_adjunto_id || null,
      nombre_archivo: cuadro.firmado_nombre || 'Cuadro_firmado_Coord.pdf',
      created_at: cuadro.firmado_at,
      mime_type: 'application/pdf',
    }, { origen: ORIGEN_DOC.FIRMA_COORD, source: 'firma_coord', categoria: CATEGORIA_DOC.FIRMA }));
  }
  if (cuadro?.tiene_pdf_firmado_dec || cuadro?.firmado_dec_nombre) {
    bag.push(normalizeExpedienteDoc({
      id: cuadro.firmado_dec_adjunto_id || null,
      nombre_archivo: cuadro.firmado_dec_nombre || 'Cuadro_firmado_DEC.pdf',
      created_at: cuadro.firmado_dec_at,
      mime_type: 'application/pdf',
    }, { origen: ORIGEN_DOC.FIRMA_DEC, source: 'firma_dec', categoria: CATEGORIA_DOC.FIRMA }));
  }

  const unique = dedupeDocumentos(bag);
  unique.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return unique;
}

/**
 * Documentos enviados en la convocatoria, separados técnico / administrativo.
 * Incluye paquete SC + adjuntos de requerimiento (como en portal).
 */
export function splitDocumentosSolicitudEnviados({
  solicitud = null,
  adjuntosPorReq = {},
} = {}) {
  const adjuntosFlat = [];
  Object.values(adjuntosPorReq || {}).forEach((list) => {
    (list || []).forEach((a) => adjuntosFlat.push(normalizeExpedienteDoc(a, {
      origen: ORIGEN_DOC.REQUERIMIENTO,
      source: 'requerimiento',
    })));
  });
  const uniqueAdj = dedupeDocumentos(adjuntosFlat);

  const tecnicos = [];
  const administrativos = [];

  // Paquete enviado: todos los adjuntos del requerimiento (convocatoria)
  uniqueAdj.forEach((a) => {
    const cat = classifyCategoria(a, 'requerimiento');
    const doc = { ...a, categoria: cat, origen: ORIGEN_DOC.REQUERIMIENTO };
    if (isCategoriaTecnica(cat)) tecnicos.push(doc);
    else administrativos.push({ ...doc, categoria: cat === CATEGORIA_DOC.OTROS ? CATEGORIA_DOC.REQUERIMIENTO : cat });
  });

  parseList(solicitud?.requisitos_tecnicos).forEach((d) => {
    if (!(d.archivo || d.nombre || d.contenido_base64 || d.documento || d.requisito)) {
      // checklist sin archivo: aún se lista como requisito enviado
      tecnicos.push(normalizeExpedienteDoc({
        nombre_archivo: d.requisito || d.documento || 'Requisito técnico',
        created_at: d.fecha || null,
      }, {
        origen: ORIGEN_DOC.SOLICITUD,
        source: 'requisitos_tecnicos',
        categoria: CATEGORIA_DOC.RTM,
      }));
      return;
    }
    tecnicos.push(resolveSolicitudEntry(d, uniqueAdj, {
      origen: ORIGEN_DOC.SOLICITUD,
      source: 'requisitos_tecnicos',
      categoria: CATEGORIA_DOC.RTM,
    }));
  });

  parseList(solicitud?.docs_solicitados).forEach((d) => {
    const doc = resolveSolicitudEntry(d, uniqueAdj, {
      origen: ORIGEN_DOC.SOLICITUD,
      source: 'docs_solicitados',
      hint: 'docs_solicitados',
    });
    if (isCategoriaTecnica(doc.categoria)) tecnicos.push(doc);
    else administrativos.push(doc);
  });

  parseList(solicitud?.docs_convocatoria).forEach((d) => {
    const doc = resolveSolicitudEntry(d, uniqueAdj, {
      origen: ORIGEN_DOC.SOLICITUD,
      source: 'docs_convocatoria',
    });
    if (isCategoriaTecnica(doc.categoria)) tecnicos.push(doc);
    else administrativos.push(doc);
  });

  return {
    tecnicos: dedupeDocumentos(tecnicos).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    administrativos: dedupeDocumentos(administrativos).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
  };
}

/** Compat: merge cronológico con dedupe (corrige causa de duplicados). */
export function mergeDocumentosCronologicos(listas = []) {
  const all = [];
  (listas || []).forEach((lista, idx) => {
    (lista || []).forEach((a) => {
      all.push(normalizeExpedienteDoc(a, { source: `lista_${idx}`, origen: a.origen }));
    });
  });
  const unique = dedupeDocumentos(all);
  unique.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return unique;
}

/** Tabla institucional con Origen / Categoría + acciones del visor existente. */
export function renderExpedienteDocsTable(docs = [], { showActions = true } = {}) {
  if (!docs.length) {
    return '<p class="text-muted small mb-0">Sin documentos en esta sección.</p>';
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>
          <th>Documento</th><th>Categoría</th><th>Origen</th><th>Fecha</th><th>Estado</th>
          ${showActions ? '<th>Acciones</th>' : ''}
        </tr></thead>
        <tbody>${docs.map((a, i) => {
    const id = a.id || a.adjunto_id || '';
    const hasBase64 = !!a.contenido_base64;
    const canOpen = !!id || hasBase64;
    return `
          <tr>
            <td class="small">${esc(a.nombre_archivo || a.nombre || '—')}</td>
            <td class="small">${esc(a.categoria || '—')}</td>
            <td class="small"><span class="badge bg-light text-dark border">${esc(a.origen || '—')}</span></td>
            <td class="small text-nowrap">${esc(fmtFecha(a.created_at))}</td>
            <td><span class="badge bg-${canOpen ? 'success' : 'secondary'}">${esc(a.estado || (canOpen ? 'Disponible' : 'Referencia'))}</span></td>
            ${showActions ? `<td class="text-nowrap">
              ${id ? `<button type="button" class="btn btn-sm btn-outline-primary sgc-adj-ver" data-id="${esc(id)}"
                data-name="${esc(a.nombre_archivo)}" data-mime="${esc(a.mime_type || '')}">Ver</button>
              <button type="button" class="btn btn-sm btn-outline-secondary sgc-adj-dl" data-id="${esc(id)}"
                data-name="${esc(a.nombre_archivo)}">Descargar</button>` : ''}
              ${!id && hasBase64 ? `<button type="button" class="btn btn-sm btn-outline-primary sgc-exp-doc-b64" data-i="${i}">Ver</button>
              <button type="button" class="btn btn-sm btn-outline-secondary sgc-exp-doc-b64-dl" data-i="${i}">Descargar</button>` : ''}
              ${!canOpen ? '<span class="text-muted small">—</span>' : ''}
            </td>` : ''}
          </tr>`;
  }).join('')}</tbody>
      </table>
    </div>`;
}

/**
 * RC8.5-C3 — Configuración almacenada en SC (docs_solicitados), sin reconstruir.
 * Incluye adicionales/convocatoria si existen en la misma solicitud.
 */
export function listDocsSolicitadosConfig(solicitud = null) {
  const rows = [];
  parseList(solicitud?.docs_solicitados).forEach((d, i) => {
    rows.push({
      ...d,
      _source: 'docs_solicitados',
      _index: i,
      documento: d.documento || d.nombre || d.tipo || `Documento ${i + 1}`,
      archivo: d.archivo || d.nombre_archivo || d.nombre || '',
      fecha: d.fecha_registro || d.fecha || d.created_at || '',
      mime_type: d.mime_type || '',
      contenido_base64: d.contenido_base64 || null,
      adjunto_id: d.adjunto_id || d.id || null,
      comentario: d.comentario || d.observacion || '',
    });
  });
  parseList(solicitud?.docs_convocatoria).forEach((d, i) => {
    rows.push({
      ...d,
      _source: 'docs_convocatoria',
      _index: i,
      documento: d.documento || d.nombre || `Documento convocatoria ${i + 1}`,
      archivo: d.archivo || d.nombre_archivo || d.nombre || '',
      fecha: d.fecha_registro || d.fecha || d.created_at || '',
      mime_type: d.mime_type || '',
      contenido_base64: d.contenido_base64 || null,
      adjunto_id: d.adjunto_id || d.id || null,
      comentario: d.comentario || d.observacion || '',
    });
  });
  return rows;
}

/** Checklist RTM desde requisitos_tecnicos (no inferido de documentos). */
export function listRequisitosTecnicosConfig(solicitud = null) {
  return parseList(solicitud?.requisitos_tecnicos).map((r, i) => ({
    ...r,
    _index: i,
    requisito: r.requisito || r.nombre || `Requisito ${i + 1}`,
    obligatorio: r.obligatorio !== false,
    observacion: r.observacion || r.comentario || r.observaciones || '',
    archivo: r.archivo || r.nombre_archivo || '',
    contenido_base64: r.contenido_base64 || null,
    mime_type: r.mime_type || '',
    adjunto_id: r.adjunto_id || r.id || null,
  }));
}

/** Tabla A: documentos solicitados al proveedor (configuración SC). */
export function renderDocsSolicitadosConfigTable(rows = []) {
  if (!rows.length) {
    return '<p class="text-muted small mb-0">No hay documentos solicitados configurados en la Solicitud de Cotización.</p>';
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>
          <th>Documento</th><th>Nombre del archivo</th><th>Fecha</th><th>Acciones</th>
        </tr></thead>
        <tbody>${rows.map((d, i) => {
    const id = d.adjunto_id || '';
    const hasBase64 = !!d.contenido_base64;
    const canOpen = !!id || hasBase64;
    const nombreArchivo = d.archivo || (canOpen ? 'Archivo adjunto' : '—');
    return `
          <tr>
            <td class="small"><strong>${esc(d.documento)}</strong>
              ${d.comentario ? `<div class="text-muted">${esc(d.comentario)}</div>` : ''}
            </td>
            <td class="small">${esc(nombreArchivo)}</td>
            <td class="small text-nowrap">${esc(fmtFecha(d.fecha))}</td>
            <td class="text-nowrap">
              ${id ? `<button type="button" class="btn btn-sm btn-outline-primary sgc-adj-ver" data-id="${esc(id)}"
                data-name="${esc(nombreArchivo)}" data-mime="${esc(d.mime_type || '')}">Ver</button>
              <button type="button" class="btn btn-sm btn-outline-secondary sgc-adj-dl" data-id="${esc(id)}"
                data-name="${esc(nombreArchivo)}">Descargar</button>` : ''}
              ${!id && hasBase64 ? `<button type="button" class="btn btn-sm btn-outline-primary sgc-exp-doc-b64" data-i="${i}">Ver</button>
              <button type="button" class="btn btn-sm btn-outline-secondary sgc-exp-doc-b64-dl" data-i="${i}">Descargar</button>` : ''}
              ${!canOpen ? '<span class="text-muted small">Sin archivo adjunto</span>' : ''}
            </td>
          </tr>`;
  }).join('')}</tbody>
      </table>
    </div>`;
}

/** Tabla B: requisitos técnicos mínimos (configuración SC). */
export function renderRequisitosTecnicosConfigTable(rows = []) {
  if (!rows.length) {
    return '<p class="text-muted small mb-0">No se registraron requisitos técnicos mínimos en la Solicitud de Cotización.</p>';
  }
  return `
    <div class="table-responsive">
      <table class="table table-sm table-bordered mb-0">
        <thead class="table-light"><tr>
          <th>Requisito</th>
          <th class="text-center" style="width:110px;">Obligatorio</th>
          <th>Observaciones</th>
        </tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td class="small">${esc(r.requisito)}</td>
            <td class="text-center">${r.obligatorio
    ? '<span class="badge bg-success">Sí</span>'
    : '<span class="badge bg-secondary">No</span>'}</td>
            <td class="small">${esc(r.observacion || '—')}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

/** Agrupa documentos de cotización por tipo funcional (manifiesto portal). */
export function groupDocsCotizacionPresentada(docs = []) {
  const groups = {
    'Propuesta técnica': [],
    'Propuesta económica': [],
    Anexos: [],
    'Documentos administrativos': [],
    'Documentos técnicos': [],
    Declaraciones: [],
    'Archivos complementarios': [],
  };
  (docs || []).forEach((d) => {
    const g = String(d.grupo || '').toLowerCase();
    const n = String(d.nombre || d.nombre_archivo || '').toLowerCase();
    const ref = String(d.ref || '').toLowerCase();
    if (g.includes('propuesta económica') || ref === 'anexo05b' || /05-?b|propuesta\s*econ/.test(n)) {
      groups['Propuesta económica'].push(d);
    } else if (g.includes('anexos firmados') || ref === 'anexo05a' || /05-?a|propuesta\s*t[eé]c/.test(n)) {
      groups['Propuesta técnica'].push(d);
    } else if (g.includes('requisitos técnicos') || ref.startsWith('req-')) {
      groups['Documentos técnicos'].push(d);
    } else if (g.includes('documentos solicitados') || ref.startsWith('docs-')) {
      if (/declaraci[oó]n|compromiso|canje/.test(n)) groups.Declaraciones.push(d);
      else if (/anexo|formato/.test(n)) groups.Anexos.push(d);
      else groups['Documentos administrativos'].push(d);
    } else if (g.includes('certificado') || ref.startsWith('cert-')) {
      groups['Archivos complementarios'].push(d);
    } else if (g.includes('anexo')) {
      groups.Anexos.push(d);
    } else {
      groups['Archivos complementarios'].push(d);
    }
  });
  return Object.entries(groups).filter(([, list]) => list.length > 0);
}

export function bindExpedienteDocsTable(root, docs = []) {
  if (!root) return;
  const openB64 = async (i, download = false) => {
    const d = docs[i];
    if (!d?.contenido_base64) return;
    const { openBase64Document, downloadBase64Document } = await import('./documentViewer.js');
    const payload = {
      nombre: d.nombre_archivo || d.nombre || d.archivo || 'documento.pdf',
      mime_type: d.mime_type || 'application/pdf',
      contenido_base64: d.contenido_base64,
    };
    if (download && typeof downloadBase64Document === 'function') {
      downloadBase64Document(payload);
      return;
    }
    if (download) {
      const bin = atob(String(payload.contenido_base64).replace(/^data:[^;]+;base64,/, ''));
      const bytes = new Uint8Array(bin.length);
      for (let j = 0; j < bin.length; j += 1) bytes[j] = bin.charCodeAt(j);
      const blob = new Blob([bytes], { type: payload.mime_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return;
    }
    openBase64Document(payload);
  };
  root.querySelectorAll('.sgc-exp-doc-b64').forEach((btn) => {
    btn.onclick = () => openB64(Number(btn.dataset.i), false);
  });
  root.querySelectorAll('.sgc-exp-doc-b64-dl').forEach((btn) => {
    btn.onclick = () => openB64(Number(btn.dataset.i), true);
  });
}
