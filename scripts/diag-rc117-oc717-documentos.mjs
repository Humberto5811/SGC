/**
 * Diagnóstico documental OC 717 para RC117.
 */
import 'dotenv/config';
import { query } from '../server/db.js';

function firmaFromB64(b64, len = 8) {
  if (!b64) return null;
  try {
    const buf = Buffer.from(String(b64).replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, ''), 'base64');
    return buf.slice(0, len).toString('utf8');
  } catch {
    return 'ERR';
  }
}

const { rows: ords } = await query(`
  SELECT oc.id AS orden_id, oc.numero_orden, rbe.id AS exp_id, rbe.estado_global
  FROM ordenes_contratacion oc
  LEFT JOIN recepcion_bienes_expedientes rbe ON rbe.orden_id = oc.id
  WHERE oc.numero_orden::text LIKE '%717%' OR oc.id = 717
  ORDER BY oc.id DESC LIMIT 5
`);
console.log('ORDENES', JSON.stringify(ords, null, 2));
if (!ords.length || !ords[0].exp_id) {
  console.log('Sin expediente');
  process.exit(0);
}
const expId = ords[0].exp_id;
const ordenId = ords[0].orden_id;

const { rows: actas } = await query(`
  SELECT id, version, estado_documental, documento_nombre, acta_visada_nombre,
    eliminado_at, recepcion_bien_id, numero_acta,
    CASE WHEN documento_base64 IS NOT NULL THEN length(documento_base64) ELSE 0 END AS gen_b64_len,
    CASE WHEN acta_visada_base64 IS NOT NULL THEN length(acta_visada_base64) ELSE 0 END AS vis_legacy_len,
    documento_mime, acta_visada_mime
  FROM recepcion_bienes_actas
  WHERE expediente_recepcion_id = $1
  ORDER BY id
`, [expId]);

console.log('\n=== ACTAS ===');
for (const a of actas) {
  const { rows: raw } = await query(`
    SELECT documento_base64, acta_visada_base64 FROM recepcion_bienes_actas WHERE id = $1
  `, [a.id]);
  const genSig = firmaFromB64(raw[0]?.documento_base64);
  const visSig = firmaFromB64(raw[0]?.acta_visada_base64);
  console.log({
    ...a,
    gen_firma: genSig,
    vis_legacy_firma: visSig,
  });
}

const { rows: vis } = await query(`
  SELECT id, acta_id, version, nombre, mime_type, tamano_bytes, estado_documental, vigente,
    reemplazado_por, deleted_at,
    CASE WHEN contenido_base64 IS NOT NULL THEN length(contenido_base64) ELSE 0 END AS b64_len
  FROM recepcion_bienes_acta_visados
  WHERE expediente_recepcion_id = $1
  ORDER BY id
`, [expId]).catch((e) => ({ rows: [{ err: e.message }] }));

console.log('\n=== VISADOS ===');
for (const v of vis) {
  if (v.err) { console.log(v); continue; }
  const { rows: raw } = await query(`SELECT contenido_base64 FROM recepcion_bienes_acta_visados WHERE id = $1`, [v.id]);
  console.log({ ...v, firma: firmaFromB64(raw[0]?.contenido_base64) });
}

const { rows: guias } = await query(`
  SELECT g.id, g.numero_guia, g.documento_nombre, g.documento_mime, rb.id AS recepcion_id,
    CASE WHEN g.documento_base64 IS NOT NULL THEN length(g.documento_base64) ELSE 0 END AS b64_len
  FROM recepcion_bienes_guias g
  JOIN recepciones_bienes rb ON rb.id = g.recepcion_bien_id
  WHERE rb.expediente_recepcion_id = $1
`, [expId]);
console.log('\n=== GUIAS ===');
for (const g of guias) {
  const { rows: raw } = await query(`SELECT documento_base64 FROM recepcion_bienes_guias WHERE id = $1`, [g.id]);
  console.log({ ...g, firma: firmaFromB64(raw[0]?.documento_base64) });
}

const { rows: docs } = await query(`
  SELECT id, tipo, nombre, mime_type, origen, vigente, deleted_at, version, recepcion_bien_id,
    CASE WHEN contenido_base64 IS NOT NULL THEN length(contenido_base64) ELSE 0 END AS b64_len
  FROM recepcion_bienes_documentos
  WHERE expediente_recepcion_id = $1
  ORDER BY id
`, [expId]);
console.log('\n=== DOCS RECEPCION ===');
for (const d of docs) {
  const { rows: raw } = await query(`SELECT contenido_base64 FROM recepcion_bienes_documentos WHERE id = $1`, [d.id]);
  console.log({ ...d, firma: firmaFromB64(raw[0]?.contenido_base64) });
}

const { rows: ordDocs } = await query(`
  SELECT id, tipo_documento, nombre_archivo, mime_type, activo, firmado, version,
    CASE WHEN contenido_base64 IS NOT NULL THEN length(contenido_base64) ELSE 0 END AS b64_len
  FROM orden_documentos WHERE orden_id = $1 AND activo = TRUE
  ORDER BY id DESC LIMIT 5
`, [ordenId]);
console.log('\n=== ORDEN DOCS ===');
for (const o of ordDocs) {
  const { rows: raw } = await query(`SELECT contenido_base64 FROM orden_documentos WHERE id = $1`, [o.id]);
  console.log({ ...o, firma: firmaFromB64(raw[0]?.contenido_base64) });
}

// Build package
const { buildPaqueteDocumentalDerivacionAu } = await import('../server/lib/recepcionPaqueteDerivacionAu.js');
const pack = await buildPaqueteDocumentalDerivacionAu(expId);
console.log('\n=== PAQUETE ACTUAL ===');
console.log(JSON.stringify(pack.documentos?.map((d) => ({
  documentoId: d.documentoId,
  nombre: d.nombre,
  tipo: d.tipo,
  grupo: d.grupo,
  version: d.version,
  endpointTipo: d.endpointTipo,
  previewDisponible: d.previewDisponible,
  downloadEndpoint: d.downloadEndpoint,
})), null, 2));

process.exit(0);
