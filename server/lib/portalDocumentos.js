// Documentos del portal de proveedores — agregación y entrega segura
import { query } from '../db.js';
import { registrarTrazaPortal } from './invitaciones.js';

function parseJson(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

export async function assertAccesoSolicitud(proveedorId, solicitudId) {
  const { rows } = await query(`
    SELECT ip.*, sc.*
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.solicitud_id = $2
  `, [proveedorId, solicitudId]);
  if (!rows.length) throw new Error('Sin acceso a esta convocatoria');
  return rows[0];
}

async function loadAdjuntosPorRequerimiento(requerimientoIds) {
  if (!requerimientoIds.length) return {};
  const { rows } = await query(`
    SELECT id, requerimiento_id, nombre_archivo, mime_type, tamaño_bytes, created_at
    FROM requerimientos_adjuntos
    WHERE requerimiento_id = ANY($1::int[])
    ORDER BY created_at ASC
  `, [requerimientoIds]);
  const map = {};
  rows.forEach((r) => {
    if (!map[r.requerimiento_id]) map[r.requerimiento_id] = [];
    map[r.requerimiento_id].push(r);
  });
  return map;
}

function matchAdjuntoPorNombre(adjuntos, nombre) {
  if (!nombre || !adjuntos?.length) return null;
  const norm = String(nombre).trim().toLowerCase();
  return adjuntos.find((a) => String(a.nombre_archivo || '').trim().toLowerCase() === norm)
    || adjuntos.find((a) => String(a.nombre_archivo || '').trim().toLowerCase().includes(norm))
    || null;
}

function guessMime(nombre) {
  const n = String(nombre || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (n.endsWith('.doc')) return 'application/msword';
  if (n.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

function pushDoc(list, seen, doc) {
  const nombre = String(doc.nombre || '').trim();
  if (!nombre) return;
  const key = doc.ref || `${doc.fuente}|${nombre}|${doc.adjunto_id || ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  const embedded = !!doc.embedded;
  list.push({
    ref: doc.ref || (doc.adjunto_id ? `adj-${doc.adjunto_id}` : key),
    nombre,
    fuente: doc.fuente || 'Documento',
    adjunto_id: doc.adjunto_id || null,
    mime_type: doc.mime_type || guessMime(nombre),
    disponible: doc.disponible !== false && (!!doc.adjunto_id || embedded),
    embedded,
  });
}

function pushDocsFromSolicitudList(list, fuente, prefix, docs, seen, adjuntosMap, reqIds) {
  list.forEach((d, i) => {
    const nombre = d.archivo || d.documento || d.nombre;
    if (!nombre && !d.contenido_base64) return;
    if (d.contenido_base64) {
      pushDoc(docs, seen, {
        ref: `${prefix}-${i}`,
        nombre: nombre || d.documento,
        mime_type: d.mime_type || guessMime(nombre),
        fuente,
        embedded: true,
        disponible: true,
      });
      return;
    }
    let match = null;
    for (const reqId of reqIds) {
      match = matchAdjuntoPorNombre(adjuntosMap[reqId], nombre);
      if (match) break;
    }
    pushDoc(docs, seen, {
      ref: match ? `adj-${match.id}` : `${prefix}-${i}`,
      nombre,
      adjunto_id: match?.id || null,
      mime_type: match?.mime_type || guessMime(nombre),
      fuente,
      disponible: !!match?.id,
    });
  });
}

function isPdfFile(nombre, mime) {
  const n = String(nombre || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  return m.includes('pdf') || n.endsWith('.pdf');
}

export function buildDocumentosPorItem(item, adjuntosMap) {
  const docs = [];
  const seen = new Set();
  const reqId = item.requerimiento_id;
  const adjuntosReq = adjuntosMap[reqId] || [];

  adjuntosReq.filter((a) => isPdfFile(a.nombre_archivo, a.mime_type)).forEach((a) => {
    pushDoc(docs, seen, {
      ref: `adj-${a.id}`,
      nombre: a.nombre_archivo,
      adjunto_id: a.id,
      mime_type: a.mime_type,
      fuente: 'Requerimiento / Pedido',
      disponible: true,
    });
  });

  (item.documentos || []).forEach((d, i) => {
    const nombre = d.nombre || d.archivo || d.documento;
    if (!isPdfFile(nombre, d.mime_type) && !d.adjunto_id) return;
    const match = d.adjunto_id
      ? adjuntosReq.find((a) => a.id === d.adjunto_id)
      : matchAdjuntoPorNombre(adjuntosReq, nombre);
    if (match && !isPdfFile(match.nombre_archivo, match.mime_type)) return;
    if (!match && !d.adjunto_id) return;
    pushDoc(docs, seen, {
      ref: match ? `adj-${match.id}` : `item-${reqId}-${item.item_index}-${i}`,
      nombre: match?.nombre_archivo || nombre,
      adjunto_id: match?.id || d.adjunto_id || null,
      mime_type: match?.mime_type || d.mime_type,
      fuente: d.fuente || 'Anexo requerimiento',
      disponible: !!(match?.id || d.adjunto_id),
    });
  });

  return docs;
}

export function buildDocumentosConvocatoria(solicitud, requerimientoIds, adjuntosMap) {
  const docs = [];
  const seen = new Set();
  requerimientoIds.forEach((reqId) => {
    (adjuntosMap[reqId] || []).forEach((a) => {
      pushDoc(docs, seen, {
        ref: `adj-${a.id}`,
        nombre: a.nombre_archivo,
        adjunto_id: a.id,
        mime_type: a.mime_type,
        fuente: 'Requerimiento original',
        disponible: true,
      });
    });
  });

  [
    { list: parseJson(solicitud.docs_solicitados), fuente: 'Solicitud de Cotización', prefix: 'sol-ds' },
    { list: parseJson(solicitud.docs_convocatoria), fuente: 'Documentos convocatoria', prefix: 'sol-dc' },
    { list: parseJson(solicitud.requisitos_tecnicos), fuente: 'Requisito técnico adjunto', prefix: 'sol-rt' },
  ].forEach(({ list, fuente, prefix }) => {
    pushDocsFromSolicitudList(list, fuente, prefix, docs, seen, adjuntosMap, requerimientoIds);
  });

  return docs;
}

export async function getSolicitudDetalleProveedor(proveedorId, solicitudId) {
  const acceso = await assertAccesoSolicitud(proveedorId, solicitudId);
  const reqs = await query(`
    SELECT r.id, r.codigo, r.denominacion, r.area, r.cmn
    FROM solicitud_requerimientos sr
    JOIN requerimientos r ON r.id = sr.requerimiento_id
    WHERE sr.solicitud_id = $1
  `, [solicitudId]);
  const reqIds = reqs.rows.map((r) => r.id);
  const adjuntosMap = await loadAdjuntosPorRequerimiento(reqIds);
  const documentos = buildDocumentosConvocatoria(acceso, reqIds, adjuntosMap);

  return {
    solicitud: {
      id: acceso.id,
      codigo: acceso.codigo,
      objeto: acceso.objeto,
      denominacion: acceso.denominacion,
      estado: acceso.estado,
      tipo_evaluacion: acceso.tipo_evaluacion,
      consultas_inicio: acceso.consultas_inicio,
      consultas_fin: acceso.consultas_fin,
      cotizaciones_inicio: acceso.cotizaciones_inicio,
      cotizaciones_fin: acceso.cotizaciones_fin,
      docs_solicitados: parseJson(acceso.docs_solicitados),
      requisitos_tecnicos: parseJson(acceso.requisitos_tecnicos),
      detalle_items: parseJson(acceso.detalle_items),
    },
    requerimientos: reqs.rows,
    documentos,
    token_acceso: acceso.token_acceso,
  };
}

export async function getCotizacionWorkspace(proveedorId, solicitudId) {
  const acceso = await assertAccesoSolicitud(proveedorId, solicitudId);
  const items = parseJson(acceso.detalle_items);
  if (!items.length) throw new Error('La solicitud no tiene ítems configurados');

  const reqIds = [...new Set(items.map((it) => it.requerimiento_id).filter(Boolean))];
  const adjuntosMap = await loadAdjuntosPorRequerimiento(reqIds);

  const itemsConDocs = items.map((it, idx) => ({
    ...it,
    item_key: `${it.requerimiento_id}-${it.item_index ?? idx}`,
    unidad_medida: it.unidad_medida || it.um || 'UND',
    documentos_tecnicos: buildDocumentosPorItem(it, adjuntosMap),
  }));

  const { rows: cotRows } = await query(`
    SELECT * FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND proveedor_id = $2
  `, [solicitudId, proveedorId]);

  return {
    solicitud: {
      id: acceso.id,
      codigo: acceso.codigo,
      denominacion: acceso.denominacion,
      objeto: acceso.objeto,
      estado: acceso.estado,
      consultas_inicio: acceso.consultas_inicio,
      consultas_fin: acceso.consultas_fin,
      cotizaciones_inicio: acceso.cotizaciones_inicio,
      cotizaciones_fin: acceso.cotizaciones_fin,
      docs_solicitados: parseJson(acceso.docs_solicitados),
      requisitos_tecnicos: parseJson(acceso.requisitos_tecnicos),
    },
    items: itemsConDocs,
    cotizacion_existente: cotRows[0] || null,
    convocatoria_cerrada: acceso.cotizaciones_fin
      ? (new Date() > new Date(acceso.cotizaciones_fin) || String(acceso.estado).toUpperCase() === 'CERRADA')
      : false,
  };
}

export async function resolverDocumentoPortal(proveedorId, solicitudId, docRef) {
  const acceso = await assertAccesoSolicitud(proveedorId, solicitudId);
  const ref = String(docRef || '');

  const adjMatch = ref.match(/^adj-(\d+)$/);
  if (adjMatch) {
    const adjuntoId = parseInt(adjMatch[1], 10);
    const { rows: adj } = await query(`
      SELECT ra.* FROM requerimientos_adjuntos ra
      JOIN solicitud_requerimientos sr ON sr.requerimiento_id = ra.requerimiento_id
      WHERE ra.id = $1 AND sr.solicitud_id = $2
    `, [adjuntoId, solicitudId]);
    if (!adj.length) throw new Error('Documento no encontrado o sin acceso');
    return adj[0];
  }

  const embeddedMatch = ref.match(/^sol-(ds|dc|rt)-(\d+)$/);
  if (embeddedMatch) {
    const kind = embeddedMatch[1];
    const idx = parseInt(embeddedMatch[2], 10);
    const map = {
      ds: parseJson(acceso.docs_solicitados),
      dc: parseJson(acceso.docs_convocatoria),
      rt: parseJson(acceso.requisitos_tecnicos),
    };
    const list = map[kind] || [];
    const row = list[idx];
    if (!row?.contenido_base64) throw new Error('Documento no disponible — vuelva a adjuntarlo en la solicitud de cotización');
    const nombre = row.archivo || row.documento || row.requisito || row.nombre || 'documento';
    return {
      nombre_archivo: nombre,
      mime_type: row.mime_type || guessMime(nombre),
      contenido_base64: row.contenido_base64,
    };
  }

  throw new Error('Documento no disponible para visualización');
}

export async function registrarDocumentoTraza({
  solicitudId, proveedorId, documentoRef, evento, usuario, ip, requerimientoId,
}) {
  await registrarTrazaPortal({
    solicitud_id: solicitudId,
    proveedor_id: proveedorId,
    requerimiento_id: requerimientoId || null,
    evento,
    detalle: JSON.stringify({ documento_id: documentoRef, tipo_evento: evento }),
    usuario,
    ip,
  });
}
