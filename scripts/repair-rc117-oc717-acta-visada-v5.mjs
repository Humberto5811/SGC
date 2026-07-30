/**
 * Reparación segura OC 717: reactivar acta visada V5 real (id=5) en acta 4.
 * No inventa bytes; solo restaura vigencia de un registro existente con PDF válido.
 */
import 'dotenv/config';
import { query } from '../server/db.js';
import { resolveActaRecepcionVigente, inspectPdfB64 } from '../server/lib/resolveActaRecepcionVigente.js';

const { rows: v5 } = await query(`
  SELECT id, acta_id, nombre, mime_type, contenido_base64, tamano_bytes, vigente, deleted_at
  FROM recepcion_bienes_acta_visados WHERE id = 5
`);
if (!v5.length) {
  console.log('No existe visado id=5; no se repara.');
  process.exit(0);
}
const insp = inspectPdfB64(v5[0].contenido_base64);
console.log('V5', { id: v5[0].id, nombre: v5[0].nombre, firma: insp.firma, tamano: insp.tamano, vigente: v5[0].vigente });
if (!insp.ok) {
  console.log('V5 no tiene PDF válido; no se repara.');
  process.exit(1);
}

await query(`
  UPDATE recepcion_bienes_acta_visados
  SET vigente = FALSE
  WHERE expediente_recepcion_id = 1 AND acta_id = 4 AND id <> 5
`);
await query(`
  UPDATE recepcion_bienes_acta_visados
  SET vigente = TRUE, deleted_at = NULL, estado_documental = 'ACTA_RECEPCION_VISADA_ALMACEN'
  WHERE id = 5
`);
await query(`
  UPDATE recepcion_bienes_actas SET
    estado_documental = 'ACTA_RECEPCION_VISADA_ALMACEN',
    acta_visada_nombre = $1,
    acta_visada_mime = $2,
    acta_visada_base64 = $3,
    visado_almacen_at = COALESCE(visado_almacen_at, NOW())
  WHERE id = 4
`, [v5[0].nombre, v5[0].mime_type || 'application/pdf', v5[0].contenido_base64]);

const r = await resolveActaRecepcionVigente({ expedienteId: 1, etapa: 'DERIVAR_AU' });
console.log('RESOLVED', {
  ok: r.ok, nombre: r.nombre, documentoId: r.documentoId, actaId: r.actaId, tamano: r.tamano,
});
process.exit(r.ok && String(r.documentoId) === '5' ? 0 : 1);
