/**
 * Resuelve el acta de recepción vigente para un expediente/recepción.
 * Prioridad:
 *  1. Acta firmada por AU (etapas posteriores)
 *  2. Acta visada por Almacén
 *  3. Acta generada vigente (solo antes del visado)
 */
import { query } from '../db.js';

function httpError(message, status = 400, code = null) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
}

function inspectPdfB64(b64) {
  if (!b64) return { ok: false, tamano: 0, firma: null, mimeType: null };
  try {
    let raw = String(b64);
    if (raw.includes('base64,')) raw = raw.split('base64,').pop();
    raw = raw.replace(/\s+/g, '');
    const buf = Buffer.from(raw, 'base64');
    const firma = buf.slice(0, 5).toString('utf8');
    const ok = buf.length > 0 && firma === '%PDF-';
    return { ok, tamano: buf.length, firma, mimeType: ok ? 'application/pdf' : null, buffer: buf };
  } catch {
    return { ok: false, tamano: 0, firma: null, mimeType: null };
  }
}

/**
 * @param {{ expedienteId?: number, ordenId?: number, recepcionId?: number, actaId?: number, etapa?: string }} opts
 */
export async function resolveActaRecepcionVigente(opts = {}) {
  const etapa = String(opts.etapa || 'DERIVAR_AU').toUpperCase();
  let expId = opts.expedienteId ? parseInt(opts.expedienteId, 10) : null;
  const ordenId = opts.ordenId ? parseInt(opts.ordenId, 10) : null;
  const recepcionId = opts.recepcionId ? parseInt(opts.recepcionId, 10) : null;
  const actaIdOpt = opts.actaId ? parseInt(opts.actaId, 10) : null;

  if (!expId && ordenId) {
    const { rows } = await query(`
      SELECT id FROM recepcion_bienes_expedientes WHERE orden_id = $1 ORDER BY id DESC LIMIT 1
    `, [ordenId]);
    expId = rows[0]?.id || null;
  }
  if (!expId) throw httpError('Expediente de recepción no encontrado', 404);

  const actaParams = [expId];
  let actaSql = `
    SELECT * FROM recepcion_bienes_actas
    WHERE expediente_recepcion_id = $1 AND eliminado_at IS NULL
      AND COALESCE(estado_documental,'') NOT IN ('ACTA_RECEPCION_ELIMINADA','ACTA_RECEPCION_REEMPLAZADA')
  `;
  if (actaIdOpt) {
    actaParams.push(actaIdOpt);
    actaSql += ` AND id = $${actaParams.length}`;
  }
  if (recepcionId) {
    actaParams.push(recepcionId);
    actaSql += ` AND (recepcion_bien_id IS NULL OR recepcion_bien_id = $${actaParams.length})`;
  }
  actaSql += ' ORDER BY id DESC';
  const { rows: actas } = await query(actaSql, actaParams);
  if (!actas.length) {
    return {
      ok: false,
      code: 'ACTA_REQUERIDA',
      message: 'No hay acta de recepción vigente',
      actaId: null,
      documentoId: null,
      version: null,
      estadoDocumental: null,
      nombre: null,
      mimeType: null,
      storageKey: null,
      vigente: false,
      previewDisponible: false,
      fuente: null,
    };
  }

  // Acta objetivo: la más reciente (o la indicada). No caer a actas antiguas con stubs.
  const acta = actas[0];
  const { ensureActaVisadosTable } = await import('./recepcionActaVisada.js');
  await ensureActaVisadosTable();

  // 1) Firmada AU
  if (acta.acta_firmada_base64 && ['CONFORMIDAD_RECIBIDA_AU', 'POST_AU', 'FIRMADA_AU'].includes(etapa)) {
    const insp = inspectPdfB64(acta.acta_firmada_base64);
    if (insp.ok) {
      return {
        ok: true,
        actaId: acta.id,
        documentoId: acta.id,
        version: acta.version,
        estadoDocumental: 'ACTA_RECEPCION_FIRMADA_AU',
        nombre: acta.acta_firmada_nombre || `${acta.numero_acta || 'acta'}-firmada.pdf`,
        mimeType: acta.acta_firmada_mime || 'application/pdf',
        storageKey: `rb:acta_firmada:${acta.id}`,
        vigente: true,
        previewDisponible: true,
        tamano: insp.tamano,
        firma: insp.firma,
        fuente: 'ACTA_FIRMADA_AU',
        endpointTipo: 'acta_firmada',
        recepcionId: acta.recepcion_bien_id,
        contenido_base64: acta.acta_firmada_base64,
      };
    }
  }

  // 2) Visada Almacén (tabla versionada) — solo de esta acta
  const { rows: vis } = await query(`
    SELECT * FROM recepcion_bienes_acta_visados
    WHERE expediente_recepcion_id = $1 AND acta_id = $2
      AND deleted_at IS NULL AND vigente = TRUE
      AND estado_documental = 'ACTA_RECEPCION_VISADA_ALMACEN'
    ORDER BY version DESC, id DESC
    LIMIT 1
  `, [expId, acta.id]);
  if (vis.length) {
    const v = vis[0];
    const insp = inspectPdfB64(v.contenido_base64);
    if (insp.ok) {
      return {
        ok: true,
        actaId: acta.id,
        documentoId: v.id,
        version: v.version,
        estadoDocumental: 'ACTA_RECEPCION_VISADA_ALMACEN',
        nombre: v.nombre || acta.acta_visada_nombre || 'acta-visada.pdf',
        mimeType: v.mime_type || 'application/pdf',
        storageKey: `rb:acta_visada:${v.id}`,
        vigente: true,
        previewDisponible: true,
        tamano: insp.tamano || v.tamano_bytes,
        firma: insp.firma,
        fuente: 'ACTA_VISADA_ALMACEN',
        endpointTipo: 'acta_visada',
        recepcionId: acta.recepcion_bien_id,
        contenido_base64: v.contenido_base64,
        documentoRecepcionId: v.documento_recepcion_id || null,
      };
    }
  }

  // Legacy mirror en acta
  if (acta.acta_visada_base64) {
    const insp = inspectPdfB64(acta.acta_visada_base64);
    if (insp.ok) {
      return {
        ok: true,
        actaId: acta.id,
        documentoId: `legacy-${acta.id}`,
        version: acta.version,
        estadoDocumental: 'ACTA_RECEPCION_VISADA_ALMACEN',
        nombre: acta.acta_visada_nombre || 'acta-visada.pdf',
        mimeType: acta.acta_visada_mime || 'application/pdf',
        storageKey: `rb:acta_visada_legacy:${acta.id}`,
        vigente: true,
        previewDisponible: true,
        tamano: insp.tamano,
        firma: insp.firma,
        fuente: 'ACTA_VISADA_ALMACEN',
        endpointTipo: 'acta_visada_legacy',
        recepcionId: acta.recepcion_bien_id,
        contenido_base64: acta.acta_visada_base64,
      };
    }
  }

  // Para DERIVAR_AU la visada es obligatoria (no usar actas anteriores)
  if (etapa === 'DERIVAR_AU') {
    return {
      ok: false,
      code: 'ACTA_VISADA_REQUERIDA',
      message: 'Debe adjuntar el acta visada por Almacén antes de derivar',
      actaId: acta.id,
      documentoId: null,
      version: acta.version,
      estadoDocumental: acta.estado_documental,
      nombre: acta.documento_nombre,
      mimeType: null,
      storageKey: null,
      vigente: false,
      previewDisponible: false,
      fuente: null,
      recepcionId: acta.recepcion_bien_id,
    };
  }

  // 3) Acta generada (solo etapas previas al visado)
  if (acta.documento_base64) {
    const insp = inspectPdfB64(acta.documento_base64);
    if (insp.ok) {
      return {
        ok: true,
        actaId: acta.id,
        documentoId: acta.id,
        version: acta.version,
        estadoDocumental: acta.estado_documental || 'ACTA_RECEPCION_GENERADA',
        nombre: acta.documento_nombre || `${acta.numero_acta || 'acta'}.pdf`,
        mimeType: acta.documento_mime || 'application/pdf',
        storageKey: `rb:acta:${acta.id}`,
        vigente: true,
        previewDisponible: true,
        tamano: insp.tamano,
        firma: insp.firma,
        fuente: 'ACTA_RECEPCION_GENERADA',
        endpointTipo: 'acta',
        recepcionId: acta.recepcion_bien_id,
        contenido_base64: acta.documento_base64,
      };
    }
  }

  return {
    ok: false,
    code: 'ACTA_SIN_CONTENIDO',
    message: 'El acta vigente no tiene un archivo PDF válido',
    actaId: acta.id,
    documentoId: null,
    version: acta.version,
    estadoDocumental: acta.estado_documental,
    nombre: acta.documento_nombre,
    mimeType: null,
    storageKey: null,
    vigente: false,
    previewDisponible: false,
    fuente: null,
  };
}

export { inspectPdfB64 };
