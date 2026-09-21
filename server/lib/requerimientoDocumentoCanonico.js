import { query } from '../db.js';
import {
  extractPayloadReferenciasDocumento,
  resolveDocumentoRequerimientoCanonicoFromList,
  RESOLUCION_DOC_REQ,
} from '../../shared/requerimientoDocumentoCanonico.js';

const META_SELECT = `
  SELECT id, requerimiento_id, nombre_archivo, mime_type, tamaño_bytes,
         usuario_carga, created_at
  FROM requerimientos_adjuntos
  WHERE requerimiento_id = $1
  ORDER BY id ASC
`;

export async function listAdjuntosRequerimientoMetadata(requerimientoId) {
  const rid = Number(requerimientoId);
  if (!Number.isInteger(rid) || rid <= 0) return [];
  const { rows } = await query(META_SELECT, [rid]);
  return rows || [];
}

export async function resolveDocumentoRequerimientoCanonico(requerimientoId) {
  const rid = Number(requerimientoId);
  if (!Number.isInteger(rid) || rid <= 0) {
    return {
      status: RESOLUCION_DOC_REQ.NONE,
      adjunto: null,
      requerimiento_codigo: null,
      razon: 'requerimiento_id_invalido',
    };
  }

  const { rows: reqRows } = await query(
    `SELECT id, codigo, payload FROM requerimientos WHERE id = $1 LIMIT 1`,
    [rid],
  );
  if (!reqRows.length) {
    return {
      status: RESOLUCION_DOC_REQ.NONE,
      adjunto: null,
      requerimiento_codigo: null,
      razon: 'requerimiento_no_existe',
    };
  }

  const req = reqRows[0];
  const payloadRefs = extractPayloadReferenciasDocumento(req.payload);
  const adjuntos = await listAdjuntosRequerimientoMetadata(rid);
  const resolved = resolveDocumentoRequerimientoCanonicoFromList(adjuntos, {
    requerimientoCodigo: req.codigo,
    payloadRefs,
  });

  return {
    ...resolved,
    requerimiento_id: rid,
    requerimiento_codigo: req.codigo || null,
    adjunto: resolved.adjunto
      ? {
        id: resolved.adjunto.id,
        nombre_archivo: resolved.adjunto.nombre_archivo,
        mime_type: resolved.adjunto.mime_type,
        created_at: resolved.adjunto.created_at,
      }
      : null,
    candidatos: (resolved.candidatos || []).map((a) => ({
      id: a.id,
      nombre_archivo: a.nombre_archivo,
    })),
  };
}
