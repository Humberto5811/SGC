// Documentos del portal de proveedores — agregación y entrega segura
import { query } from '../db.js';
import { registrarTrazaPortal } from './invitaciones.js';
import {
  CRONOGRAMA_SELECT_SQL, normalizeCronogramaRow, isConvocatoriaCerrada,
  formatTimestampNaive,
} from './cronogramaDatetime.js';

function parseJson(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  try { return JSON.parse(val || 'null') ?? fallback; } catch (_) { return fallback; }
}

function trimText(v) {
  if (v == null) return '';
  return String(v).trim();
}

function itemHasCentro(it) {
  return !!(
    trimText(it?.centro_display)
    || trimText(it?.centro_nombre)
    || trimText(it?.centro)
    || trimText(it?.centro_codigo)
  );
}

function buildCentroDisplay(centro, centroCodigo, centroNombre) {
  const codigo = trimText(centroCodigo);
  const nombre = trimText(centroNombre);
  const c = trimText(centro);
  if (codigo && nombre && codigo !== nombre) return `${codigo} — ${nombre}`;
  return nombre || codigo || c || '';
}

/** Carga agrupada de centros por requerimiento (pedido → área/centros → req). Sin N+1. */
async function loadCentrosPorRequerimiento(requerimientoIds) {
  const ids = [...new Set((requerimientoIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return new Map();
  const { rows } = await query(`
    SELECT r.id AS requerimiento_id,
      COALESCE((
        SELECT NULLIF(TRIM(p.centro), '')
        FROM requerimiento_pedidos rp
        JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
        WHERE rp.requerimiento_id = r.id AND NULLIF(TRIM(p.centro), '') IS NOT NULL
        ORDER BY rp.id ASC
        LIMIT 1
      ), '') AS pedido_centro,
      COALESCE((
        SELECT NULLIF(TRIM(p.centro_costo), '')
        FROM requerimiento_pedidos rp
        JOIN pedidos_sigamef p ON rp.pedido_sigamef_id = p.id
        WHERE rp.requerimiento_id = r.id AND NULLIF(TRIM(p.centro_costo), '') IS NOT NULL
        ORDER BY rp.id ASC
        LIMIT 1
      ), '') AS pedido_centro_costo,
      COALESCE(NULLIF(TRIM(c.nombre), ''), '') AS centro_nombre,
      COALESCE(NULLIF(TRIM(c.codigo), ''), '') AS centro_codigo,
      COALESCE(NULLIF(TRIM(a.responsable), ''), '') AS area_responsable,
      COALESCE(NULLIF(TRIM(r.responsable), ''), '') AS req_responsable,
      COALESCE(NULLIF(TRIM(r.cmn), ''), '') AS req_cmn
    FROM requerimientos r
    LEFT JOIN areas a ON r.area = a.nombre OR a.codigo = r.area
    LEFT JOIN centros c ON a.centro_id = c.id
    WHERE r.id = ANY($1::int[])
  `, [ids]);
  const map = new Map();
  rows.forEach((row) => {
    const pedidoCentro = trimText(row.pedido_centro);
    const centroNombre = trimText(row.centro_nombre);
    const centroCodigo = trimText(row.centro_codigo);
    const areaFallback = trimText(row.area_responsable);
    const reqResponsable = trimText(row.req_responsable);
    const reqCmn = trimText(row.req_cmn);
    // Prioridad: pedido.centro → catálogo centros → área → responsable REQ → cmn
    const centro = pedidoCentro || centroNombre || centroCodigo || areaFallback
      || reqResponsable || reqCmn || '';
    const displayBase = centroNombre || pedidoCentro || centroCodigo || reqResponsable || centro;
    map.set(Number(row.requerimiento_id), {
      centro,
      centro_codigo: centroCodigo || (pedidoCentro || ''),
      centro_nombre: displayBase,
      centro_display: buildCentroDisplay(centro, centroCodigo || pedidoCentro, displayBase),
      centro_costo: trimText(row.pedido_centro_costo),
    });
  });
  return map;
}

/** Resuelve centros adicionales por código de pedido SIGAMEF (fallback si falta vínculo). */
async function loadCentrosPorPedidoSigamef(pedidoCodes) {
  const codes = [...new Set((pedidoCodes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (!codes.length) return new Map();
  const { rows } = await query(`
    SELECT
      COALESCE(NULLIF(TRIM(pedido_sigamef), ''), CONCAT(UPPER(LEFT(COALESCE(tipo, 'PB'), 2)), '-', nro_pedido)) AS pedido_key,
      NULLIF(TRIM(centro), '') AS centro,
      NULLIF(TRIM(centro_costo), '') AS centro_costo
    FROM pedidos_sigamef
    WHERE NULLIF(TRIM(centro), '') IS NOT NULL
      AND (
        pedido_sigamef = ANY($1::text[])
        OR CONCAT(UPPER(LEFT(COALESCE(tipo, 'PB'), 2)), '-', nro_pedido) = ANY($1::text[])
      )
  `, [codes]);
  const map = new Map();
  rows.forEach((row) => {
    const key = trimText(row.pedido_key);
    const centro = trimText(row.centro);
    if (!key || !centro) return;
    map.set(key, {
      centro,
      centro_codigo: centro,
      centro_nombre: centro,
      centro_display: centro,
      centro_costo: trimText(row.centro_costo),
    });
  });
  return map;
}

function firstPedidoCodeFromItem(it) {
  const raw = trimText(it?.pedido_sigamef);
  if (!raw) return '';
  return raw.split(',')[0].trim();
}

/** Respeta centro ya presente en el ítem; si falta, enriquece desde mapas precargados. */
function enrichDetalleItemsConCentro(items, centroMap, pedidoCentroMap = new Map()) {
  return (items || []).map((it) => {
    if (itemHasCentro(it)) {
      const centro = trimText(it.centro) || trimText(it.centro_nombre) || trimText(it.centro_codigo);
      const centro_codigo = trimText(it.centro_codigo);
      const centro_nombre = trimText(it.centro_nombre) || centro;
      const centro_display = trimText(it.centro_display)
        || buildCentroDisplay(centro, centro_codigo, centro_nombre);
      return { ...it, centro, centro_codigo, centro_nombre, centro_display };
    }
    const byReq = centroMap.get(Number(it.requerimiento_id));
    const byPedido = pedidoCentroMap.get(firstPedidoCodeFromItem(it));
    const resolved = (byReq && trimText(byReq.centro))
      ? byReq
      : (byPedido || byReq || {
        centro: '', centro_codigo: '', centro_nombre: '', centro_display: '',
      });
    return { ...it, ...resolved };
  });
}

async function enrichItemsCentroPipeline(items) {
  const list = items || [];
  const reqIds = list.map((it) => it.requerimiento_id).filter(Boolean);
  const pedidoCodes = list.map(firstPedidoCodeFromItem).filter(Boolean);
  const [centroMap, pedidoCentroMap] = await Promise.all([
    loadCentrosPorRequerimiento(reqIds),
    loadCentrosPorPedidoSigamef(pedidoCodes),
  ]);
  return enrichDetalleItemsConCentro(list, centroMap, pedidoCentroMap);
}

export async function assertAccesoSolicitud(proveedorId, solicitudId) {
  const { rows } = await query(`
    SELECT ip.*, sc.id, sc.codigo, sc.objeto, sc.denominacion, sc.estado, sc.tipo,
      sc.tipo_evaluacion, sc.docs_solicitados, sc.requisitos_tecnicos, sc.detalle_items,
      ${CRONOGRAMA_SELECT_SQL}
    FROM invitacion_proveedores ip
    JOIN solicitudes_cotizacion sc ON sc.id = ip.solicitud_id
    WHERE ip.proveedor_id = $1 AND ip.solicitud_id = $2
  `, [proveedorId, solicitudId]);
  if (!rows.length) throw new Error('Sin acceso a esta convocatoria');
  return normalizeCronogramaRow(rows[0]);
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
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.txt')) return 'text/plain';
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
    if (!isPdfFile(nombre, d.mime_type) && !d.adjunto_id && !d.contenido_base64) return;
    const match = d.adjunto_id
      ? adjuntosReq.find((a) => a.id === d.adjunto_id)
      : matchAdjuntoPorNombre(adjuntosReq, nombre);
    if (match && !isPdfFile(match.nombre_archivo, match.mime_type)) return;
    if (d.contenido_base64) {
      pushDoc(docs, seen, {
        ref: `item-${reqId}-${item.item_index ?? 0}-${i}`,
        nombre: nombre || `Documento ${i + 1}`,
        mime_type: d.mime_type || guessMime(nombre),
        fuente: d.fuente || 'Anexo ítem',
        embedded: true,
        disponible: true,
      });
      return;
    }
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

  const anexos = item.documentos_anexos && typeof item.documentos_anexos === 'object'
    ? item.documentos_anexos
    : {};
  Object.entries(anexos).forEach(([tipo, d], i) => {
    if (!d) return;
    const nombre = d.nombre || d.archivo || tipo;
    if (d.contenido_base64) {
      pushDoc(docs, seen, {
        ref: `anexo-${reqId}-${item.item_index ?? 0}-${i}`,
        nombre,
        mime_type: d.mime_type || guessMime(nombre),
        fuente: `Anexo SC — ${tipo}`,
        embedded: true,
        disponible: true,
      });
    }
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
  const detalleRaw = parseJson(acceso.detalle_items);
  const detalle_items = await enrichItemsCentroPipeline(detalleRaw);

  return {
    solicitud: {
      id: acceso.id,
      codigo: acceso.codigo,
      objeto: acceso.objeto,
      denominacion: acceso.denominacion,
      estado: acceso.estado,
      tipo: acceso.tipo || '',
      tipo_evaluacion: acceso.tipo_evaluacion,
      consultas_inicio: acceso.consultas_inicio,
      consultas_fin: acceso.consultas_fin,
      cotizaciones_inicio: acceso.cotizaciones_inicio,
      cotizaciones_fin: acceso.cotizaciones_fin,
      docs_solicitados: parseJson(acceso.docs_solicitados),
      requisitos_tecnicos: parseJson(acceso.requisitos_tecnicos),
      detalle_items,
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
  const itemsEnriquecidos = await enrichItemsCentroPipeline(items);

  const itemsConDocs = itemsEnriquecidos.map((it, idx) => ({
    ...it,
    item_key: `${it.requerimiento_id}-${it.item_index ?? idx}`,
    unidad_medida: it.unidad_medida || it.um || 'UND',
    documentos_tecnicos: buildDocumentosPorItem(it, adjuntosMap),
  }));

  const { rows: cotRows } = await query(`
    SELECT * FROM cotizaciones_proveedor
    WHERE solicitud_id = $1 AND proveedor_id = $2
  `, [solicitudId, proveedorId]);

  const { rows: provRows } = await query(`
    SELECT id, ruc, razon_social, direccion, telefono, correo, persona_contacto, rubro, emails
    FROM proveedores WHERE id = $1
  `, [proveedorId]);

  return {
    solicitud: {
      id: acceso.id,
      codigo: acceso.codigo,
      denominacion: acceso.denominacion,
      objeto: acceso.objeto,
      estado: acceso.estado,
      tipo: acceso.tipo || '',
      consultas_inicio: acceso.consultas_inicio,
      consultas_fin: acceso.consultas_fin,
      cotizaciones_inicio: acceso.cotizaciones_inicio,
      cotizaciones_fin: acceso.cotizaciones_fin,
      docs_solicitados: parseJson(acceso.docs_solicitados),
      requisitos_tecnicos: parseJson(acceso.requisitos_tecnicos),
    },
    items: itemsConDocs,
    cotizacion_existente: cotRows[0] || null,
    proveedor: provRows[0] || null,
    convocatoria_cerrada: isConvocatoriaCerrada(acceso),
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

  const itemMatch = ref.match(/^(item|anexo)-(\d+)-(\d+)-(\d+)$/);
  if (itemMatch) {
    const items = parseJson(acceso.detalle_items);
    const reqId = parseInt(itemMatch[2], 10);
    const itemIdx = parseInt(itemMatch[3], 10);
    const docIdx = parseInt(itemMatch[4], 10);
    const item = items.find((it) => it.requerimiento_id === reqId && (it.item_index ?? 0) === itemIdx)
      || items.find((it) => it.requerimiento_id === reqId);
    if (!item) throw new Error('Ítem no encontrado');
    if (ref.startsWith('anexo-')) {
      const anexos = Object.values(item.documentos_anexos || {});
      const row = anexos[docIdx];
      if (!row?.contenido_base64) throw new Error('Documento no disponible');
      return {
        nombre_archivo: row.nombre || row.archivo || 'documento',
        mime_type: row.mime_type || guessMime(row.nombre),
        contenido_base64: row.contenido_base64,
      };
    }
    const docs = item.documentos || [];
    const row = docs[docIdx];
    if (!row?.contenido_base64) throw new Error('Documento no disponible');
    return {
      nombre_archivo: row.nombre || row.documento || 'documento',
      mime_type: row.mime_type || guessMime(row.nombre),
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

function parseCotizacionAnexos(val) {
  const parsed = parseJson(val, {});
  if (Array.isArray(parsed)) return {};
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function fileFromEntry(f, fallbackNombre = 'documento') {
  const b64 = f?.base64 || f?.contenido_base64;
  if (!b64) return null;
  const nombre = f.nombre || f.nombre_archivo || fallbackNombre;
  return {
    nombre_archivo: nombre,
    mime_type: f.mime_type || guessMime(nombre),
    contenido_base64: b64,
  };
}

export function buildManifiestoCotizacion(cot) {
  const docs = [];
  const anexos = parseCotizacionAnexos(cot?.anexos);
  (anexos.docs_solicitados || []).forEach((f, i) => {
    const file = fileFromEntry(f, `Documento solicitado ${i + 1}`);
    if (file) {
      docs.push({
        ref: `docs-${i}`,
        nombre: file.nombre_archivo,
        grupo: 'Documentos solicitados',
        mime_type: file.mime_type,
        key: f?.key || null,
        disponible: true,
      });
    }
  });
  (anexos.requisitos || []).forEach((f, i) => {
    const file = fileFromEntry(f, `Requisito técnico ${i + 1}`);
    if (file) {
      docs.push({
        ref: `req-${i}`,
        nombre: file.nombre_archivo,
        grupo: 'Requisitos técnicos',
        mime_type: file.mime_type,
        key: f?.key || null,
        disponible: true,
      });
    }
  });
  const a05a = fileFromEntry(anexos.anexo05a_firmado, 'Anexo 05-A firmado');
  if (a05a) {
    docs.push({
      ref: 'anexo05a',
      nombre: a05a.nombre_archivo,
      grupo: 'Anexos firmados',
      mime_type: a05a.mime_type,
      disponible: true,
    });
  }
  const a05b = fileFromEntry(anexos.anexo05b_firmado, 'Anexo 05-B firmado');
  if (a05b) {
    docs.push({
      ref: 'anexo05b',
      nombre: a05b.nombre_archivo,
      grupo: 'Propuesta económica',
      mime_type: a05b.mime_type,
      economico: true,
      disponible: true,
    });
  }
  const certs = parseJson(cot?.certificados, []);
  (Array.isArray(certs) ? certs : []).forEach((f, i) => {
    const file = fileFromEntry(f, `Certificado ${i + 1}`);
    if (file) {
      docs.push({
        ref: `cert-${i}`,
        nombre: file.nombre_archivo,
        grupo: 'Certificados',
        mime_type: file.mime_type,
        disponible: true,
      });
    }
  });
  return docs;
}

/** Documentos técnicos para derivación al área usuaria (sin propuesta económica). */
export function buildManifiestoCotizacionTecnica(cot) {
  return buildManifiestoCotizacion(cot).filter((d) => !d.economico && d.ref !== 'anexo05b');
}

export { parseCotizacionAnexos };

export async function getCotizacionRecepcionDetalle(cotizacionId) {
  const { rows } = await query(`
    SELECT cot.*, p.ruc, p.razon_social,
      sc.codigo AS solicitud_codigo, sc.denominacion, sc.objeto, sc.tipo, sc.detalle_items,
      sc.docs_solicitados AS sc_docs_solicitados,
      sc.requisitos_tecnicos AS sc_requisitos_tecnicos
    FROM cotizaciones_proveedor cot
    JOIN proveedores p ON p.id = cot.proveedor_id
    JOIN solicitudes_cotizacion sc ON sc.id = cot.solicitud_id
    WHERE cot.id = $1
  `, [cotizacionId]);
  if (!rows.length) throw new Error('Cotización no encontrada');
  const cot = rows[0];
  const anexos = parseCotizacionAnexos(cot.anexos);
  const propuestaEconomica = parseJson(cot.propuesta_economica, {});
  const datosProveedor = anexos.datos_proveedor || propuestaEconomica.datos_proveedor || {};
  // RC8.5-C4 — config SC + keys de anexos (sin base64) para relacionar requisito↔archivo
  const stripFile = (f) => (f && typeof f === 'object'
    ? {
      key: f.key || null,
      nombre: f.nombre || f.nombre_archivo || '',
      mime_type: f.mime_type || '',
      size: f.size || f.tamaño_bytes || f.tamano || null,
      tiene_archivo: !!(f.base64 || f.contenido_base64),
    }
    : null);
  return {
    id: cot.id,
    solicitud_id: cot.solicitud_id,
    proveedor_id: cot.proveedor_id,
    solicitud_codigo: cot.solicitud_codigo,
    denominacion: cot.denominacion,
    objeto: cot.objeto,
    tipo: cot.tipo || '',
    detalle_items: parseJson(cot.detalle_items, []),
    ruc: cot.ruc,
    razon_social: cot.razon_social,
    estado: cot.estado,
    validacion_estado: cot.validacion_estado || '',
    validacion_responsable: cot.validacion_responsable || cot.validado_por || '',
    fecha_presentacion: formatTimestampNaive(cot.fecha_presentacion) || cot.fecha_presentacion,
    monto: propuestaEconomica.monto ?? null,
    moneda: propuestaEconomica.moneda || 'PEN',
    propuesta_tecnica: parseJson(cot.propuesta_tecnica, {}),
    propuesta_economica: propuestaEconomica,
    datos_proveedor: datosProveedor,
    documentos: buildManifiestoCotizacion(cot),
    docs_solicitados_sc: parseJson(cot.sc_docs_solicitados, []),
    requisitos_tecnicos_sc: parseJson(cot.sc_requisitos_tecnicos, []),
    anexos_meta: {
      docs_solicitados: (anexos.docs_solicitados || []).map(stripFile),
      requisitos: (anexos.requisitos || []).map(stripFile),
      tiene_anexo_tecnico: !!(anexos.anexo05a_firmado?.base64 || anexos.anexo05a_firmado?.contenido_base64
        || anexos.anexo_tecnico_firmado?.base64 || anexos.anexo_tecnico_firmado?.contenido_base64),
      tiene_anexo_economico: !!(anexos.anexo05b_firmado?.base64 || anexos.anexo05b_firmado?.contenido_base64
        || anexos.anexo_economico_firmado?.base64 || anexos.anexo_economico_firmado?.contenido_base64),
    },
  };
}

export async function resolverDocumentoCotizacionAnalista(cotizacionId, docRef) {
  const { rows } = await query('SELECT * FROM cotizaciones_proveedor WHERE id = $1', [cotizacionId]);
  if (!rows.length) throw new Error('Cotización no encontrada');
  const cot = rows[0];
  const anexos = parseCotizacionAnexos(cot.anexos);
  const ref = String(docRef || '');

  const docsMatch = ref.match(/^docs-(\d+)$/);
  if (docsMatch) {
    const f = (anexos.docs_solicitados || [])[parseInt(docsMatch[1], 10)];
    const file = fileFromEntry(f);
    if (file) return file;
  }

  const reqMatch = ref.match(/^req-(\d+)$/);
  if (reqMatch) {
    const f = (anexos.requisitos || [])[parseInt(reqMatch[1], 10)];
    const file = fileFromEntry(f);
    if (file) return file;
  }

  if (ref === 'anexo05a') {
    const file = fileFromEntry(anexos.anexo05a_firmado, 'Anexo_05-A_firmado.pdf');
    if (file) return file;
  }
  if (ref === 'anexo05b') {
    const file = fileFromEntry(anexos.anexo05b_firmado, 'Anexo_05-B_firmado.pdf');
    if (file) return file;
  }

  const certMatch = ref.match(/^cert-(\d+)$/);
  if (certMatch) {
    const certs = parseJson(cot.certificados, []);
    const f = (Array.isArray(certs) ? certs : [])[parseInt(certMatch[1], 10)];
    const file = fileFromEntry(f);
    if (file) return file;
  }

  throw new Error('Documento no encontrado');
}
