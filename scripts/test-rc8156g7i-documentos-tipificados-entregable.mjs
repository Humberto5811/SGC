/**
 * RC8.15.6G-7I — Documentos tipificados del entregable.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import { runMigrations } from '../server/migrate.js';
import {
  adjuntarDocumentosRecepcionEntregable,
  getDetalleEntregableServicio,
  inicializarEstadoResponsableEntregable,
  listarDocumentosTipificadosEntregable,
  registrarRecepcionEntregable,
  reemplazarDocumentoRecepcionEntregable,
  retirarDocumentoRecepcionEntregable,
} from '../server/lib/entregablesServicios.js';
import { getExpedienteOrdenCompleto } from '../server/lib/ordenesContratacion.js';
import { ensureResponsablePersonaEntregable } from '../server/lib/entregableEstadoPersistido.js';
import {
  documentoValidoParaPago,
  TIPO_ENTREGABLE,
  TIPO_OTRO,
} from '../shared/entregableDocumentosTipos.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const ok = (cond, msg) => { assert.ok(cond, msg); console.log(`  ✓ ${msg}`); };
async function expectReject(work) { try { await work(); return null; } catch (e) { return e; } }
function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}

console.log('\n=== RC8.15.6G-7I — Documentos tipificados entregable ===\n');

await runMigrations();
ok(read('server/migrations/057_entregable_documentos_tipificados.js').includes('tipo_documento'),
  '0. migración 057 presente');

const permPe = {
  modulos: ['EJECUCION'],
  submodulos: ['PRESENTACION_ENTREGABLES'],
  actividades: ['VER', 'EDITAR'],
  actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
};
const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
let ordenId = null;
let e1 = null;
let recepSubId = null;
let docEntId = null;
let docSegId = null;
let docOtro1 = null;
let docOtro2 = null;
let usuarioResp = null;

try {
  usuarioResp = (await query(`
    INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
    VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb) RETURNING *
  `, [`G7I${nonce}`.slice(0, 20), `g7i_${nonce}`, 'Fixture G7I', JSON.stringify(permPe)])).rows[0];
  const respCtx = { id: Number(usuarioResp.id), rol: 'usuario', username: usuarioResp.username, permisos: permPe };

  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];
  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,700,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156G7I${nonce}`])).rows[0].id);
  e1 = Number((await query(`
    INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
    VALUES ($1,1,'ENTREGABLE','G7I E1',10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);

  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-g7i' });
  await ensureResponsablePersonaEntregable({
    ordenEntregaId: e1,
    usuarioDestinoId: Number(usuarioResp.id),
    usuarioOrigenId: Number(usuarioResp.id),
    ejecutadoPor: 'test-g7i',
    motivo: 'Fixture G7I',
  });

  const errSinEnt = await expectReject(() => registrarRecepcionEntregable(e1, {
    fecha_recepcion_mesa_partes: '2026-08-20',
    numero_expediente_sgd: `SGD-G7I-${nonce}`,
    documentos: [{
      tipo_documento: 'SEGURO',
      nombre_archivo: 'solo-seguro.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('SEG'),
      vigencia_desde: '2026-01-01',
      vigencia_hasta: '2027-01-01',
    }],
  }, respCtx, usuarioResp.username));
  ok(errSinEnt?.code === 'ENTREGABLE_OBLIGATORIO', '1. ENTREGABLE obligatorio al registrar');

  await registrarRecepcionEntregable(e1, {
    fecha_recepcion_mesa_partes: '2026-08-20',
    numero_expediente_sgd: `SGD-G7I-${nonce}`,
    documentos: [{
      tipo_documento: TIPO_ENTREGABLE,
      nombre_archivo: 'entregable.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('ENT'),
    }],
  }, respCtx, usuarioResp.username);

  const seg = await adjuntarDocumentosRecepcionEntregable(e1, {
    documentos: [{
      tipo_documento: 'SEGURO',
      nombre: 'Póliza RC',
      nombre_archivo: 'seguro.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('SEG'),
      vigencia_desde: '2024-01-01',
      vigencia_hasta: '2024-12-31',
    }],
  }, respCtx, usuarioResp.username);
  docSegId = Number(seg.documentos[0]?.id);

  const otros = await adjuntarDocumentosRecepcionEntregable(e1, {
    documentos: [
      {
        tipo_documento: TIPO_OTRO,
        nombre: 'Anexo complementario A',
        nombre_archivo: 'otro-a.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdf('OT1'),
      },
      {
        tipo_documento: TIPO_OTRO,
        nombre: 'Anexo complementario B',
        nombre_archivo: 'otro-b.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdf('OT2'),
      },
    ],
  }, respCtx, usuarioResp.username);
  docOtro1 = Number(otros.documentos[0]?.id);
  docOtro2 = Number(otros.documentos[1]?.id);

  const detalle = await getDetalleEntregableServicio(e1);
  ok((detalle.documentos_tipificados || []).length >= 4, '2. varios tipos por recepción INICIAL');
  const segRow = (detalle.documentos_tipificados || []).find((d) => d.tipo_documento === 'SEGURO');
  ok(segRow?.vigencia_desde === '2024-01-01' && segRow?.vigencia_hasta === '2024-12-31',
    '3. vigencia persistida');
  ok(segRow?.valido_para_pago === false, '4. documento vencido no válido para pago');
  ok(documentoValidoParaPago({ vigente: true, vigencia_hasta: '2099-12-31' }), '4b. vigente futuro OK');

  const tipificados = await listarDocumentosTipificadosEntregable(e1);
  ok(tipificados.filter((d) => d.tipo_documento === TIPO_OTRO).length === 2, '5. OTRO múltiple');

  const detallePre = await getDetalleEntregableServicio(e1);
  docEntId = Number((detallePre.documentos_tipificados || []).find((d) => d.tipo_documento === TIPO_ENTREGABLE)?.id);
  const reemplazo = await reemplazarDocumentoRecepcionEntregable(
    e1,
    docEntId,
    { documentos: [{
      tipo_documento: TIPO_ENTREGABLE,
      nombre_archivo: 'entregable-v2.pdf',
      mime_type: 'application/pdf',
      contenido_base64: pdf('ENT2'),
    }] },
    respCtx,
    usuarioResp.username,
  );
  ok(Number(reemplazo.documento.reemplaza_id) === docEntId, '6. reemplazo versionado');
  const original = (await query('SELECT vigente FROM entregable_recepcion_documentos WHERE id=$1', [docEntId])).rows[0];
  ok(original.vigente === false, '7. eliminación lógica del reemplazado');

  const expediente = await getExpedienteOrdenCompleto(ordenId);
  ok((expediente.documentos || []).some((d) => d.kind === 'entregable_recepcion'), '8. visibles en expediente de orden');

  recepSubId = Number((await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado, registrado_por
    ) VALUES ($1,$2,2,'SUBSANACION',CURRENT_DATE,$3,'Sub G7I','RECIBIDO','test-g7i') RETURNING id
  `, [e1, ordenId, `SGD-SUB-${nonce}`])).rows[0].id);
  const docSubId = Number((await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente, tipo_documento
    ) VALUES ($1,'sub.pdf','application/pdf',$2,120,TRUE,'ENTREGABLE') RETURNING id
  `, [recepSubId, pdf('SUB')])).rows[0].id);
  const errSub = await expectReject(() => retirarDocumentoRecepcionEntregable(
    e1, docSubId, respCtx, usuarioResp.username,
  ));
  ok(errSub?.code === 'DOCUMENTO_NO_ENCONTRADO', '9. subsanación intacta (no gestionable)');

  const errUltimoEnt = await expectReject(async () => {
    const det = await getDetalleEntregableServicio(e1);
    const entDoc = (det.documentos_tipificados || []).find((d) => d.tipo_documento === TIPO_ENTREGABLE && d.vigente);
    return retirarDocumentoRecepcionEntregable(e1, entDoc.id, respCtx, usuarioResp.username);
  });
  ok(errUltimoEnt?.code === 'ENTREGABLE_OBLIGATORIO', '10. no retirar último ENTREGABLE');

  ok(read('src/views/ejecucion/presentacionEntregableView.js').includes('documentos tipificados'),
    '11. UI modal documentos tipificados');
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
  if (usuarioResp?.id) await query('DELETE FROM usuarios WHERE id=$1', [usuarioResp.id]);
}

await pool.end();
console.log('\nOK — test-rc8156g7i-documentos-tipificados-entregable\n');
