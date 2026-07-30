/**
 * Paquete documental oficial para Derivar al Área Usuaria.
 * Solo recepción/conformidad — no cotización, requerimiento ni CCP.
 */
import { query } from '../db.js';

function httpError(message, status = 400, code = null, detail = null) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (detail) err.detail = detail;
  return err;
}

const ORIGENES_EXCLUIDOS = new Set([
  'COTIZACION', 'PORTAL_PROVEEDOR_COTIZACION', 'VALIDACION',
  'CUADRO_COMPARATIVO', 'CCP', 'REQUERIMIENTO', 'PEDIDO_SIGAMEF', 'TEST', 'RC_TEST',
]);

const TIPOS_EXCLUIDOS = new Set([
  'ANEXO_05A', 'ANEXO_05B', 'COTIZACION', 'REQUERIMIENTO', 'CCP', 'CUADRO',
]);

let _tableReady = false;
export async function ensureDerivacionDocsTable() {
  if (_tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS recepcion_bienes_derivacion_documentos (
      id SERIAL PRIMARY KEY,
      derivacion_id INTEGER NOT NULL
        REFERENCES recepcion_bienes_derivaciones(id) ON DELETE CASCADE,
      expediente_recepcion_id INTEGER NOT NULL
        REFERENCES recepcion_bienes_expedientes(id) ON DELETE CASCADE,
      documento_key VARCHAR(120) NOT NULL,
      documento_id VARCHAR(80) NULL,
      tipo VARCHAR(80) NOT NULL,
      grupo VARCHAR(80) NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      origen VARCHAR(80) NULL,
      obligatorio BOOLEAN NOT NULL DEFAULT FALSE,
      seleccionado BOOLEAN NOT NULL DEFAULT TRUE,
      recepcion_id INTEGER NULL,
      acta_id INTEGER NULL,
      version INTEGER NULL,
      vigente BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `).catch(() => {});
  await query('CREATE INDEX IF NOT EXISTS idx_rbdd_der ON recepcion_bienes_derivacion_documentos(derivacion_id)').catch(() => {});
  _tableReady = true;
}

function item({
  documentoId, nombre, tipo, grupo, origen, obligatorio = false,
  seleccionado = true, recepcionId = null, actaId = null, version = null,
  vigente = true, previewDisponible = true, fechaRegistro = null, registradoPor = null,
  endpointTipo = null, mimeType = 'application/pdf', tamano = null, storageKey = null,
  firma = null,
}) {
  const ep = endpointTipo || tipo.toLowerCase();
  const key = `${tipo}:${documentoId}`;
  const disponible = !!previewDisponible && !!documentoId && Number(tamano || 0) > 0;
  return {
    documentoId,
    documentoKey: key,
    nombre,
    tipo,
    grupo,
    origen,
    obligatorio: !!obligatorio,
    seleccionado: obligatorio ? true : !!seleccionado,
    recepcionId,
    actaId,
    version,
    vigente: !!vigente,
    mimeType: mimeType || 'application/pdf',
    tamano: tamano != null ? Number(tamano) : null,
    storageKey: storageKey || `rb:${ep}:${documentoId}`,
    firma: firma || null,
    previewDisponible: disponible,
    fechaRegistro,
    registradoPor,
    endpointTipo: ep,
    previewEndpoint: `/api/recepcion-bienes/{expId}/documentos/${ep}/${documentoId}/preview`,
    downloadEndpoint: `/api/recepcion-bienes/{expId}/documentos/${ep}/${documentoId}/download`,
  };
}

async function enrichFromB64(partial, b64) {
  const { inspectPdfB64 } = await import('./resolveActaRecepcionVigente.js');
  const insp = inspectPdfB64(b64);
  return {
    ...partial,
    tamano: insp.tamano || partial.tamano || 0,
    firma: insp.firma,
    mimeType: insp.ok ? (partial.mimeType || 'application/pdf') : (partial.mimeType || null),
    previewDisponible: insp.ok,
  };
}

/**
 * Construye el paquete documental de conformidad para una recepción/acta.
 */
export async function buildPaqueteDocumentalDerivacionAu(expedienteId, opts = {}) {
  const expId = parseInt(expedienteId, 10);
  const { rows: expRows } = await query(`
    SELECT rbe.*, oc.id AS orden_id, oc.numero_orden
    FROM recepcion_bienes_expedientes rbe
    JOIN ordenes_contratacion oc ON oc.id = rbe.orden_id
    WHERE rbe.id = $1
  `, [expId]);
  if (!expRows.length) throw httpError('Expediente no encontrado', 404);
  const exp = expRows[0];

  const { resolveActaRecepcionVigente } = await import('./resolveActaRecepcionVigente.js');
  const actaVigente = await resolveActaRecepcionVigente({
    expedienteId: exp.id,
    ordenId: exp.orden_id,
    recepcionId: opts.recepcion_id || opts.recepcionId || null,
    actaId: opts.acta_id || opts.actaId || null,
    etapa: 'DERIVAR_AU',
  });

  const recepcionId = opts.recepcion_id || opts.recepcionId
    || actaVigente.recepcionId
    || null;
  const actaSelId = actaVigente.actaId || null;

  // 1) Orden firmada vigente (una sola)
  const { rows: ordenDocs } = await query(`
    SELECT id, tipo_documento AS tipo, nombre_archivo AS nombre, mime_type, version,
      subido_at AS created_at, subido_por AS created_by, activo AS vigente, firmado
    FROM orden_documentos
    WHERE orden_id = $1 AND activo = TRUE
      AND (
        tipo_documento = 'ORDEN_FIRMADA'
        OR firmado = TRUE
        OR UPPER(COALESCE(tipo_documento,'')) LIKE '%ORDEN%'
      )
    ORDER BY
      CASE WHEN tipo_documento = 'ORDEN_FIRMADA' THEN 0 ELSE 1 END,
      version DESC NULLS LAST, id DESC
    LIMIT 1
  `, [exp.orden_id]).catch(() => ({ rows: [] }));

  let ordenItem = null;
  if (ordenDocs.length) {
    const o = ordenDocs[0];
    const { rows: rawOrd } = await query(
      'SELECT contenido_base64, mime_type FROM orden_documentos WHERE id = $1',
      [o.id],
    ).catch(() => ({ rows: [] }));
    ordenItem = await enrichFromB64(item({
      documentoId: o.id,
      nombre: o.nombre || `Orden ${exp.numero_orden || exp.orden_id}`,
      tipo: 'ORDEN',
      grupo: 'Orden de Compra',
      origen: 'ORDEN',
      obligatorio: true,
      seleccionado: true,
      version: o.version,
      vigente: true,
      mimeType: o.mime_type || rawOrd[0]?.mime_type || 'application/pdf',
      fechaRegistro: o.created_at,
      registradoPor: o.created_by,
      endpointTipo: 'orden',
    }), rawOrd[0]?.contenido_base64);
  } else {
    const { rows: anyOrd } = await query(`
      SELECT id, tipo_documento AS tipo, nombre_archivo AS nombre, mime_type, version,
        subido_at AS created_at, subido_por AS created_by, contenido_base64
      FROM orden_documentos
      WHERE orden_id = $1 AND activo = TRUE
      ORDER BY id DESC LIMIT 1
    `, [exp.orden_id]).catch(() => ({ rows: [] }));
    if (anyOrd.length) {
      const o = anyOrd[0];
      ordenItem = await enrichFromB64(item({
        documentoId: o.id,
        nombre: o.nombre || `Orden ${exp.numero_orden || exp.orden_id}`,
        tipo: 'ORDEN',
        grupo: 'Orden de Compra',
        origen: 'ORDEN',
        obligatorio: true,
        version: o.version,
        mimeType: o.mime_type || 'application/pdf',
        fechaRegistro: o.created_at,
        registradoPor: o.created_by,
        endpointTipo: 'orden',
      }), o.contenido_base64);
    }
  }

  // 2) Guías de la recepción seleccionada
  const guiaParams = [exp.id];
  let guiaSql = `
    SELECT g.id, g.numero_guia, g.documento_nombre, g.documento_mime, g.fecha_guia,
      g.created_at, rb.id AS recepcion_id
    FROM recepcion_bienes_guias g
    JOIN recepciones_bienes rb ON rb.id = g.recepcion_bien_id
    WHERE rb.expediente_recepcion_id = $1
      AND g.documento_base64 IS NOT NULL
  `;
  if (recepcionId) {
    guiaParams.push(recepcionId);
    guiaSql += ` AND rb.id = $2`;
  }
  guiaSql += ' ORDER BY g.id ASC';
  const { rows: guias } = await query(guiaSql, guiaParams).catch(() => ({ rows: [] }));
  const guiaItems = [];
  for (const g of guias) {
    const { rows: rawG } = await query(
      'SELECT documento_base64, documento_mime FROM recepcion_bienes_guias WHERE id = $1',
      [g.id],
    ).catch(() => ({ rows: [] }));
    guiaItems.push(await enrichFromB64(item({
      documentoId: g.id,
      nombre: g.documento_nombre || `Guía ${g.numero_guia}`,
      tipo: 'GUIA_REMISION',
      grupo: 'Guías de Remisión',
      origen: 'GUIA_REMISION',
      obligatorio: true,
      recepcionId: g.recepcion_id,
      mimeType: g.documento_mime || 'application/pdf',
      fechaRegistro: g.created_at || g.fecha_guia,
      endpointTipo: 'guia',
    }), rawG[0]?.documento_base64));
  }

  // 3) Documentos técnicos de recepción (no cotización, no acta visada)
  const docParams = [exp.id];
  let docSql = `
    SELECT id, tipo, nombre, mime_type, version, created_at, created_by, vigente, origen,
      recepcion_bien_id, deleted_at, contenido_base64
    FROM recepcion_bienes_documentos
    WHERE expediente_recepcion_id = $1
      AND vigente = TRUE
      AND (deleted_at IS NULL)
      AND UPPER(COALESCE(tipo,'')) NOT IN ('ACTA_VISADA_ALMACEN','ACTA_RECEPCION','ACTA_FIRMADA_AU','ADJUNTO_DERIVACION')
      AND UPPER(COALESCE(origen,'')) NOT IN (
        'COTIZACION','PORTAL_PROVEEDOR_COTIZACION','VALIDACION','CUADRO_COMPARATIVO','CCP','REQUERIMIENTO','TEST','RC_TEST'
      )
  `;
  if (recepcionId) {
    docParams.push(recepcionId);
    docSql += ` AND (recepcion_bien_id IS NULL OR recepcion_bien_id = $2)`;
  }
  docSql += ' ORDER BY id ASC';
  const { rows: docsRec } = await query(docSql, docParams).catch(() => ({ rows: [] }));
  const techItems = [];
  for (const d of docsRec) {
    const tipo = String(d.tipo || '').toUpperCase();
    const origen = String(d.origen || '').toUpperCase();
    if (TIPOS_EXCLUIDOS.has(tipo) || ORIGENES_EXCLUIDOS.has(origen)) continue;
    techItems.push(await enrichFromB64(item({
      documentoId: d.id,
      nombre: d.nombre,
      tipo: 'DOCUMENTO_TECNICO_RECEPCION',
      grupo: 'Documentos técnicos de recepción',
      origen: d.origen || 'RECEPCION_BIENES',
      obligatorio: false,
      seleccionado: true,
      recepcionId: d.recepcion_bien_id,
      version: d.version,
      mimeType: d.mime_type || 'application/pdf',
      fechaRegistro: d.created_at,
      registradoPor: d.created_by,
      endpointTipo: 'recepcion',
    }), d.contenido_base64));
  }

  // 4–5) Solo acta visada vigente para derivar AU (no la generada V4 si existe V5 visada)
  const actaItems = [];
  const visadaItems = [];
  if (actaVigente.ok && actaVigente.fuente === 'ACTA_VISADA_ALMACEN') {
    visadaItems.push(await enrichFromB64(item({
      documentoId: actaVigente.documentoId,
      nombre: actaVigente.nombre || 'Acta visada por Almacén',
      tipo: 'ACTA_VISADA_ALMACEN',
      grupo: 'Acta visada por Almacén',
      origen: 'ACTA_VISADA_ALMACEN',
      obligatorio: true,
      actaId: actaVigente.actaId,
      recepcionId: actaVigente.recepcionId,
      version: actaVigente.version,
      mimeType: actaVigente.mimeType || 'application/pdf',
      tamano: actaVigente.tamano,
      storageKey: actaVigente.storageKey,
      fechaRegistro: null,
      endpointTipo: actaVigente.endpointTipo || 'acta_visada',
    }), actaVigente.contenido_base64));
  }

  // 6) Adjuntos propios de derivación (aún no enviados / vigentes)
  const { rows: adjuntos } = await query(`
    SELECT id, nombre, mime_type, version, created_at, created_by, vigente, origen, contenido_base64
    FROM recepcion_bienes_documentos
    WHERE expediente_recepcion_id = $1
      AND vigente = TRUE AND (deleted_at IS NULL)
      AND UPPER(COALESCE(tipo,'')) = 'ADJUNTO_DERIVACION'
    ORDER BY id ASC
  `, [exp.id]).catch(() => ({ rows: [] }));
  const adjuntoItems = [];
  for (const d of adjuntos) {
    adjuntoItems.push(await enrichFromB64(item({
      documentoId: d.id,
      nombre: d.nombre,
      tipo: 'ADJUNTO_DERIVACION',
      grupo: 'Adjuntos de derivación',
      origen: 'ADJUNTO_DERIVACION',
      obligatorio: false,
      seleccionado: true,
      version: d.version,
      mimeType: d.mime_type || 'application/pdf',
      fechaRegistro: d.created_at,
      registradoPor: d.created_by,
      endpointTipo: 'recepcion',
    }), d.contenido_base64));
  }

  const documentos = [
    ...(ordenItem ? [ordenItem] : []),
    ...guiaItems,
    ...techItems.filter((d) => d.previewDisponible),
    ...actaItems,
    ...visadaItems,
    ...adjuntoItems.filter((d) => d.previewDisponible || d.tipo === 'ADJUNTO_DERIVACION'),
  ].map((d) => ({
    ...d,
    previewEndpoint: (d.previewEndpoint || '').replace('{expId}', String(exp.id)),
    downloadEndpoint: (d.downloadEndpoint || '').replace('{expId}', String(exp.id)),
  }));

  const faltantes = [];
  if (!ordenItem || !ordenItem.previewDisponible) faltantes.push('ORDEN');
  if (!guiaItems.some((g) => g.previewDisponible)) faltantes.push('GUIA_REMISION');
  if (!visadaItems.some((v) => v.previewDisponible)) faltantes.push('ACTA_VISADA_ALMACEN');

  return {
    ok: true,
    expedienteId: exp.id,
    ordenId: exp.orden_id,
    numeroOrden: exp.numero_orden,
    recepcionId: recepcionId ? Number(recepcionId) : null,
    actaId: actaSelId,
    actaVigente: {
      actaId: actaVigente.actaId,
      documentoId: actaVigente.documentoId,
      version: actaVigente.version,
      estadoDocumental: actaVigente.estadoDocumental,
      nombre: actaVigente.nombre,
      fuente: actaVigente.fuente,
      ok: actaVigente.ok,
    },
    documentos,
    grupos: [
      'Orden de Compra',
      'Guías de Remisión',
      'Documentos técnicos de recepción',
      'Acta visada por Almacén',
      'Adjuntos de derivación',
    ],
    faltantes,
    completo: faltantes.length === 0,
  };
}

/**
 * Valida IDs seleccionados contra el paquete autorizado.
 * @returns {{ autorizados: object[], rechazados: string[] }}
 */
export function filtrarDocumentosAutorizados(paquete, selectedKeys = []) {
  const byKey = new Map((paquete.documentos || []).map((d) => [d.documentoKey, d]));
  const byIdTipo = new Map((paquete.documentos || []).map((d) => [`${d.tipo}:${d.documentoId}`, d]));
  const autorizados = [];
  const rechazados = [];
  const seen = new Set();

  // Obligatorios siempre
  for (const d of paquete.documentos || []) {
    if (d.obligatorio) {
      autorizados.push({ ...d, seleccionado: true });
      seen.add(d.documentoKey);
    }
  }

  for (const raw of selectedKeys || []) {
    const key = String(raw);
    if (seen.has(key)) continue;
    let doc = byKey.get(key) || byIdTipo.get(key);
    if (!doc && key.includes(':')) {
      doc = byKey.get(key);
    }
    // compat keys del FE antiguo
    if (!doc) {
      for (const d of paquete.documentos || []) {
        if (key === `ord-${d.documentoId}` && d.tipo === 'ORDEN') { doc = d; break; }
        if (key === `guia-${d.documentoId}` && d.tipo === 'GUIA_REMISION') { doc = d; break; }
        if (key === `rec-${d.documentoId}` && d.tipo === 'DOCUMENTO_TECNICO_RECEPCION') { doc = d; break; }
        if (key === `acta-${d.documentoId}` && d.tipo === 'ACTA_RECEPCION') { doc = d; break; }
        if (key.startsWith('acta-vis-') && d.tipo === 'ACTA_VISADA_ALMACEN') { doc = d; break; }
      }
    }
    if (!doc) {
      rechazados.push(key);
      continue;
    }
    if (!doc.vigente) {
      rechazados.push(key);
      continue;
    }
    if (!seen.has(doc.documentoKey)) {
      autorizados.push({ ...doc, seleccionado: true });
      seen.add(doc.documentoKey);
    }
  }

  return { autorizados, rechazados };
}

export async function assertPaqueteCompletoParaDerivar(paquete, selectedKeys = []) {
  const { autorizados, rechazados } = filtrarDocumentosAutorizados(paquete, selectedKeys);
  if (rechazados.length) {
    throw httpError(
      'Se intentó incluir documentos no autorizados para esta derivación.',
      409,
      'DOCUMENTOS_NO_AUTORIZADOS',
      { rechazados },
    );
  }
  const tipos = new Set(autorizados.map((d) => d.tipo));
  const faltantes = [];
  if (![...tipos].includes('ORDEN')) faltantes.push('ORDEN');
  if (![...tipos].includes('GUIA_REMISION')) faltantes.push('GUIA_REMISION');
  if (![...tipos].includes('ACTA_VISADA_ALMACEN')) faltantes.push('ACTA_VISADA_ALMACEN');
  if (faltantes.length) {
    throw httpError(
      'No se puede derivar porque faltan documentos obligatorios.',
      409,
      'PAQUETE_DOCUMENTAL_INCOMPLETO',
      { faltantes },
    );
  }
  const sinContenido = autorizados.filter((d) => d.obligatorio && !d.previewDisponible);
  if (sinContenido.length) {
    throw httpError(
      'Uno o más documentos obligatorios no tienen un archivo válido.',
      409,
      'DOCUMENTO_SIN_CONTENIDO',
      {
        documentos: sinContenido.map((d) => ({
          documentoId: d.documentoId,
          nombre: d.nombre,
          tipo: d.tipo,
          grupo: d.grupo,
        })),
      },
    );
  }
  // No enviar filas sin archivo real
  return autorizados.filter((d) => !!d.previewDisponible);
}

export async function persistirPaqueteDerivacion(derivacionId, expedienteId, docs = []) {
  await ensureDerivacionDocsTable();
  for (const d of docs) {
    await query(`
      INSERT INTO recepcion_bienes_derivacion_documentos (
        derivacion_id, expediente_recepcion_id, documento_key, documento_id,
        tipo, grupo, nombre, origen, obligatorio, seleccionado,
        recepcion_id, acta_id, version, vigente
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [
      derivacionId, expedienteId, d.documentoKey, String(d.documentoId),
      d.tipo, d.grupo, d.nombre, d.origen, !!d.obligatorio, true,
      d.recepcionId || null, d.actaId || null, d.version || null, true,
    ]);
  }
}

export async function listarPaqueteDerivado(expedienteId) {
  await ensureDerivacionDocsTable();
  const { rows: ders } = await query(`
    SELECT id FROM recepcion_bienes_derivaciones
    WHERE expediente_recepcion_id = $1 AND accion = 'DERIVAR_AU'
    ORDER BY id DESC LIMIT 1
  `, [expedienteId]);
  if (!ders.length) return { ok: true, items: [] };
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_derivacion_documentos
    WHERE derivacion_id = $1
    ORDER BY id ASC
  `, [ders[0].id]);
  return { ok: true, derivacionId: ders[0].id, items: rows };
}

/**
 * Adjunto propio de derivación (JSON+base64, arquitectura del proyecto).
 */
export async function adjuntarAdjuntoDerivacionAu(expedienteId, body = {}, usuario = '') {
  const expId = parseInt(expedienteId, 10);
  const { rows: der } = await query(`
    SELECT estado_global FROM recepcion_bienes_expedientes WHERE id = $1
  `, [expId]);
  if (der[0] && ['CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU', 'CONFORMIDAD_EN_COORDINACION_CM', 'EXPEDIENTE_DERIVADO_PAGO'].includes(der[0].estado_global)) {
    throw httpError('No se pueden agregar adjuntos: el expediente ya fue derivado', 409, 'YA_DERIVADO');
  }
  let raw = String(body.documento_base64 || body.archivo_base64 || body.contenido_base64 || '');
  if (raw.includes('base64,')) raw = raw.split('base64,').pop();
  raw = raw.replace(/\s+/g, '');
  if (!raw) throw httpError('Archivo obligatorio', 400, 'ARCHIVO_REQUERIDO');
  const buf = Buffer.from(raw, 'base64');
  if (!buf.length) throw httpError('Archivo vacío', 400);
  if (buf.length > 10 * 1024 * 1024) throw httpError('Archivo supera 10 MB', 400);
  const mime = String(body.mime_type || 'application/pdf').toLowerCase();
  const firma = buf.slice(0, 5).toString('utf8');
  if (mime.includes('pdf') || /\.pdf$/i.test(String(body.nombre || ''))) {
    if (firma !== '%PDF-') {
      throw httpError('Solo se aceptan archivos PDF válidos', 400, 'SOLO_PDF');
    }
  }
  let nombre = String(body.nombre || body.documento_nombre || 'adjunto.pdf')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .slice(0, 200);

  const { rows } = await query(`
    INSERT INTO recepcion_bienes_documentos
      (expediente_recepcion_id, tipo, nombre, mime_type, contenido_base64,
       version, vigente, origen, observacion, created_by)
    VALUES ($1,'ADJUNTO_DERIVACION',$2,$3,$4,1,TRUE,'ADJUNTO_DERIVACION',$5,$6)
    RETURNING id, nombre, mime_type, version, created_at, created_by
  `, [
    expId, nombre, mime.includes('pdf') ? 'application/pdf' : mime, raw,
    body.observacion || null,
    String(usuario || '').slice(0, 150),
  ]);
  const d = rows[0];
  return enrichFromB64(item({
    documentoId: d.id,
    nombre: d.nombre,
    tipo: 'ADJUNTO_DERIVACION',
    grupo: 'Adjuntos de derivación',
    origen: 'ADJUNTO_DERIVACION',
    obligatorio: false,
    version: d.version,
    mimeType: d.mime_type || 'application/pdf',
    fechaRegistro: d.created_at,
    registradoPor: d.created_by,
    endpointTipo: 'recepcion',
  }), raw);
}

export async function eliminarAdjuntoDerivacionAu(expedienteId, documentoId, body = {}, usuario = '') {
  const expId = parseInt(expedienteId, 10);
  const docId = parseInt(documentoId, 10);
  const { rows: expRows } = await query(`
    SELECT estado_global FROM recepcion_bienes_expedientes WHERE id = $1
  `, [expId]);
  if (expRows[0] && ['CONFORMIDAD_PENDIENTE_AU', 'CONFORMIDAD_RECIBIDA_AU', 'CONFORMIDAD_EN_COORDINACION_CM', 'EXPEDIENTE_DERIVADO_PAGO'].includes(expRows[0].estado_global)) {
    throw httpError('No se pueden eliminar adjuntos después de derivar', 409, 'YA_DERIVADO');
  }
  const { rows } = await query(`
    SELECT * FROM recepcion_bienes_documentos
    WHERE id = $1 AND expediente_recepcion_id = $2
  `, [docId, expId]);
  if (!rows.length) throw httpError('Adjunto no encontrado', 404);
  if (String(rows[0].tipo || '').toUpperCase() !== 'ADJUNTO_DERIVACION') {
    throw httpError('Solo se pueden eliminar adjuntos propios de la derivación', 409, 'NO_ELIMINABLE');
  }
  await query(`
    UPDATE recepcion_bienes_documentos SET
      vigente = FALSE, deleted_at = NOW(), deleted_by = $2,
      deleted_motivo = $3
    WHERE id = $1
  `, [docId, String(usuario || '').slice(0, 150), String(body.motivo || 'Eliminado antes de derivar').slice(0, 500)]);
  return { ok: true, eliminado: true, documentoId: docId };
}
