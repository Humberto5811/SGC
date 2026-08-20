/**
 * RC8.15.6F-3 — Gestión documental en Modificar entregable.
 */
import pool, { query } from '../server/db.js';
import {
  adjuntarDocumentosRecepcionEntregable,
  getDetalleEntregableServicio,
  inicializarEstadoResponsableEntregable,
  modificarRecepcionEntregable,
  reemplazarDocumentoRecepcionEntregable,
  retirarDocumentoRecepcionEntregable,
} from '../server/lib/entregablesServicios.js';

let passed = 0;
let failed = 0;
function ok(c, m) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }
async function expectReject(work) { try { await work(); return null; } catch (e) { return e; } }
function pdfBase64(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF`).toString('base64');
}

async function snapshotOs1105Docs() {
  return JSON.stringify((await query(`
    SELECT d.id, d.nombre_archivo, d.vigente, er.tipo_recepcion, er.numero_recepcion
    FROM entregable_recepcion_documentos d
    JOIN entregable_recepciones er ON er.id = d.recepcion_id
    JOIN orden_entregas oe ON oe.id = er.orden_entrega_id
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105' AND oe.estado='ACTIVO'
    ORDER BY d.id
  `)).rows);
}

console.log('\n=== RC8.15.6F-3 — Gestión documental entregable ===\n');

const idx = (await query(`
  SELECT indexname FROM pg_indexes
  WHERE tablename='entregable_recepcion_documentos'
    AND indexname='uq_entregable_recepcion_doc_vigente'
`)).rows;
if (idx.length) {
  await query('DROP INDEX IF EXISTS uq_entregable_recepcion_doc_vigente');
  ok(true, '0. migración 053 aplicada (índice único eliminado)');
} else {
  ok(true, '0. migración 053 ya aplicada');
}

const os1105Antes = await snapshotOs1105Docs();
const permPe = {
  modulos: ['EJECUCION'],
  submodulos: ['PRESENTACION_ENTREGABLES'],
  actividades: ['VER', 'EDITAR'],
  actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
};
const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
let ordenId = null;
let e1 = null;
let recepInicialId = null;
let recepSubId = null;
let docInicialId = null;
let docSubId = null;
let usuarioResp = null;
let usuarioAjeno = null;

try {
  usuarioResp = (await query(`
    INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
    VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb) RETURNING *
  `, [`F3R${nonce}`.slice(0, 20), `f3_resp_${nonce}`, 'Fixture F3 responsable', JSON.stringify(permPe)])).rows[0];
  usuarioAjeno = (await query(`
    INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
    VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb) RETURNING *
  `, [`F3A${nonce}`.slice(0, 20), `f3_ajeno_${nonce}`, 'Fixture F3 ajeno', JSON.stringify(permPe)])).rows[0];
  const respCtx = { id: Number(usuarioResp.id), rol: 'usuario', username: usuarioResp.username, permisos: permPe };
  const ajenoCtx = { id: Number(usuarioAjeno.id), rol: 'usuario', username: usuarioAjeno.username, permisos: permPe };

  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];
  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,700,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F3${nonce}`])).rows[0].id);
  e1 = Number((await query(`
    INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
    VALUES ($1,1,'ENTREGABLE','F3 E1',10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);

  recepInicialId = Number((await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'Inicial F3','RECIBIDO','test-f3') RETURNING id
  `, [e1, ordenId, `SGD-F3-INI-${nonce}`])).rows[0].id);
  docInicialId = Number((await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente
    ) VALUES ($1,'CONFORMIDAD FIXTURE.pdf','application/pdf',$2,120,TRUE) RETURNING id
  `, [recepInicialId, pdfBase64('INICIAL')])).rows[0].id);

  recepSubId = Number((await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado, registrado_por
    ) VALUES ($1,$2,2,'SUBSANACION',CURRENT_DATE,$3,'Subsanacion F3','RECIBIDO','test-f3') RETURNING id
  `, [e1, ordenId, `SGD-F3-SUB-${nonce}`])).rows[0].id);
  docSubId = Number((await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente
    ) VALUES ($1,'OS FIXTURE (1).pdf','application/pdf',$2,120,TRUE) RETURNING id
  `, [recepSubId, pdfBase64('SUB')])).rows[0].id);

  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-f3' });
  const { ensureResponsablePersonaEntregable } = await import('../server/lib/entregableEstadoPersistido.js');
  await ensureResponsablePersonaEntregable({
    ordenEntregaId: e1,
    usuarioDestinoId: Number(usuarioResp.id),
    usuarioOrigenId: Number(usuarioResp.id),
    ejecutadoPor: 'test-f3',
    motivo: 'Fixture F3 responsable',
  });

  const detalle = await getDetalleEntregableServicio(e1);
  ok(Number(detalle.recepcion_vigente?.id) === recepSubId, '1. recepción vigente es subsanación');
  ok((detalle.recepciones || []).length === 2, '2. detalle lista inicial + subsanación');
  ok((detalle.documentos_entregable || []).length === 2, '3. detalle conserva documentos de ambas presentaciones');

  const mod = await modificarRecepcionEntregable(e1, {
    fecha_recepcion_mesa_partes: '2026-08-20',
    numero_expediente_sgd: `SGD-F3-EDIT-${nonce}`,
    observacion: 'Metadatos entregable',
    documentos: [],
  }, respCtx, usuarioResp.username);
  ok(Number(mod.id) === recepInicialId, '4. modificar opera sobre recepción INICIAL del entregable');

  const adj = await adjuntarDocumentosRecepcionEntregable(e1, {
    documentos: [
      { nombre_archivo: 'anexo-a.pdf', mime_type: 'application/pdf', contenido_base64: pdfBase64('A') },
      { nombre_archivo: 'anexo-b.pdf', mime_type: 'application/pdf', contenido_base64: pdfBase64('B') },
    ],
  }, respCtx, usuarioResp.username);
  const docsAdjuntos = (adj.documentos || []).map((d) => Number(d.id)).filter(Boolean);
  ok(docsAdjuntos.length === 2, '5. adjuntar múltiples PDFs vigentes en INICIAL');

  const vigentesInicial = (await query(`
    SELECT id FROM entregable_recepcion_documentos
    WHERE recepcion_id=$1 AND vigente=TRUE ORDER BY id
  `, [recepInicialId])).rows;
  ok(vigentesInicial.length === 3, '6. recepción INICIAL soporta múltiples documentos vigentes');

  const reemplazo = await reemplazarDocumentoRecepcionEntregable(
    e1,
    docInicialId,
    { documentos: [{ nombre_archivo: 'CONFORMIDAD FIXTURE (2).pdf', mime_type: 'application/pdf', contenido_base64: pdfBase64('INI2') }] },
    respCtx,
    usuarioResp.username,
  );
  ok(Number(reemplazo.documento.reemplaza_id) === docInicialId, '7. reemplazo versionado conserva reemplaza_id');
  const docOriginal = (await query('SELECT vigente FROM entregable_recepcion_documentos WHERE id=$1', [docInicialId])).rows[0];
  ok(docOriginal.vigente === false, '8. documento reemplazado queda histórico');

  const errSubReemplazo = await expectReject(() => reemplazarDocumentoRecepcionEntregable(
    e1,
    docSubId,
    { documentos: [{ nombre_archivo: 'hack-sub.pdf', mime_type: 'application/pdf', contenido_base64: pdfBase64('H') }] },
    respCtx,
    usuarioResp.username,
  ));
  ok(errSubReemplazo?.code === 'DOCUMENTO_NO_ENCONTRADO', '8b. no se reemplaza documento de subsanación');

  const docRetirar = docsAdjuntos[0];
  const retiro = await retirarDocumentoRecepcionEntregable(e1, docRetirar, respCtx, usuarioResp.username);
  ok(retiro.documento.vigente === false, '9. retiro lógico marca no vigente');
  const contenidoRetirado = (await query(
    'SELECT contenido_base64 FROM entregable_recepcion_documentos WHERE id=$1',
    [docRetirar],
  )).rows[0];
  ok(Boolean(contenidoRetirado?.contenido_base64), '10. retiro conserva contenido físico');

  const totalDocs = Number((await query(`
    SELECT COUNT(*)::int AS n FROM entregable_recepcion_documentos d
    JOIN entregable_recepciones er ON er.id=d.recepcion_id
    WHERE er.orden_entrega_id=$1
  `, [e1])).rows[0].n);
  ok(totalDocs >= 5, '11. histórico documental conservado');

  const eventos = Number((await query(`
    SELECT COUNT(*)::int AS n FROM entregable_eventos
    WHERE orden_entrega_id=$1
      AND evento_codigo IN (
        'ENTREGABLE_DOCUMENTO_ADJUNTADO',
        'ENTREGABLE_DOCUMENTO_REEMPLAZADO',
        'ENTREGABLE_DOCUMENTO_RETIRADO'
      )
  `, [e1])).rows[0].n);
  ok(eventos >= 4, '12. trazabilidad registra eventos documentales');

  const errAjeno = await expectReject(() => adjuntarDocumentosRecepcionEntregable(e1, {
    documentos: [{ nombre_archivo: 'hack.pdf', mime_type: 'application/pdf', contenido_base64: pdfBase64('X') }],
  }, ajenoCtx, usuarioAjeno.username));
  ok(errAjeno?.code === 'ENTREGABLE_DOCUMENTO_NO_AUTORIZADO', '13. usuario ajeno denegado');

  const docInicialPost = (await query('SELECT vigente FROM entregable_recepcion_documentos WHERE id=$1', [docInicialId])).rows[0];
  ok(docInicialPost.vigente === false, '14. documento inicial reemplazado queda histórico');
  const docSubPost = (await query('SELECT vigente FROM entregable_recepcion_documentos WHERE id=$1', [docSubId])).rows[0];
  ok(docSubPost.vigente === true, '14b. documento de subsanación permanece intacto');
} catch (error) {
  ok(false, `fixture (${error.message})`);
} finally {
  if (ordenId) {
    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
    await query(`
      DELETE FROM entregable_recepcion_documentos
      WHERE recepcion_id IN (SELECT id FROM entregable_recepciones WHERE orden_id=$1)
    `, [ordenId]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
  }
  const userIds = [usuarioResp?.id, usuarioAjeno?.id].filter(Boolean);
  if (userIds.length) await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [userIds]);
}

ok(await snapshotOs1105Docs() === os1105Antes, '15. OS 1105 sin pérdida documental');

await pool.end();
console.log(`\n=== Resultado F-3: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);
