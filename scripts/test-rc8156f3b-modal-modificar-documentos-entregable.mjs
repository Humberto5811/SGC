/**
 * RC8.15.6F-3B — Modal Modificar entregable: solo documentos del entregable (INICIAL).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import { toIsoDateString } from '../server/lib/diasPlazo.js';
import {
  adjuntarDocumentosRecepcionEntregable,
  getDetalleEntregableServicio,
  inicializarEstadoResponsableEntregable,
  listarBandejaEntregablesServicios,
  modificarRecepcionEntregable,
  retirarDocumentoRecepcionEntregable,
} from '../server/lib/entregablesServicios.js';
import { ensureResponsablePersonaEntregable } from '../server/lib/entregableEstadoPersistido.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(c, m) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }
async function expectReject(work) { try { await work(); return null; } catch (e) { return e; } }
function pdfBase64(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF`).toString('base64');
}

console.log('\n=== RC8.15.6F-3B — Modal Modificar entregable ===\n');

const view = read('src/views/ejecucion/presentacionEntregableView.js');
const openFn = view.match(/async function openRegistrarRecepcion[\s\S]*?^}/m)?.[0] || '';
const submitFn = view.match(/async function submitRegistrarRecepcion[\s\S]*?^}/m)?.[0] || '';
ok(/documentos_entregable_gestionables/.test(view), 'A. UI usa documentos_entregable_gestionables');
ok(/Entregable N\.°/.test(view), 'B. UI muestra Entregable N.°');
ok(/pe-doc-retire/.test(view) && /Eliminar/.test(view), 'C. UI tiene Eliminar');
ok(/pe-doc-replace/.test(view) && /Reemplazar/.test(view), 'D. UI tiene Reemplazar');
ok(!/Presentación inicial/.test(view.match(/renderModificarDocumentosSection[\s\S]*?^}/m)?.[0] || ''), 'E. modal sin bloques históricos');
ok(/Fecha recepción Mesa de Partes/.test(view) && /Expediente SGD/.test(view) && /Observación/.test(view),
  'F. modal conserva campos de metadatos');
ok(/recepcionInicial\.fecha_recepcion_mesa_partes/.test(openFn), 'G. fecha cargada desde recepción INICIAL');
ok(/recepcionInicial\.numero_expediente_sgd/.test(openFn), 'H. SGD cargado desde recepción INICIAL');
ok(/recepcionInicial\.observacion/.test(openFn), 'I. observación cargada desde recepción INICIAL');
ok(!/if \(editando\) \{[\s\S]*?metaWrap\?\.classList\.add\('d-none'\)/.test(openFn),
  'J. metadatos visibles en modo edición');
ok(/if \(editando\)[\s\S]*modificarRecepcion/.test(submitFn),
  'K. Guardar cambios persiste metadatos vía modificarRecepcion');

const permPe = {
  modulos: ['EJECUCION'],
  submodulos: ['PRESENTACION_ENTREGABLES'],
  actividades: ['VER', 'EDITAR'],
  actividadesPorSubmodulo: { PRESENTACION_ENTREGABLES: ['VER', 'EDITAR'] },
};
const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
let ordenId = null;
let e1 = null;
let docSubId = null;
let usuarioResp = null;

try {
  usuarioResp = (await query(`
    INSERT INTO usuarios (dni, username, nombre, rol, activo, permisos)
    VALUES ($1,$2,$3,'usuario',TRUE,$4::jsonb) RETURNING *
  `, [`F3B${nonce}`.slice(0, 20), `f3b_${nonce}`, 'Fixture F3B', JSON.stringify(permPe)])).rows[0];
  const respCtx = { id: Number(usuarioResp.id), rol: 'usuario', username: usuarioResp.username, permisos: permPe };

  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];
  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,100,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F3B${nonce}`])).rows[0].id);
  e1 = Number((await query(`
    INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
    VALUES ($1,1,'ENTREGABLE','F3B E1',10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);

  const recepInicialId = Number((await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL','2026-08-19',$3,'Entregable','RECIBIDO','test-f3b') RETURNING id
  `, [e1, ordenId, `SGD-INI-${nonce}`])).rows[0].id);
  await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente
    ) VALUES ($1,'CONFORMIDAD ENTREGABLE.pdf','application/pdf',$2,120,TRUE)
  `, [recepInicialId, pdfBase64('ENT')]);

  const recepSubId = Number((await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado, registrado_por
    ) VALUES ($1,$2,2,'SUBSANACION','2026-08-19',$3,'Respuesta obs','RECIBIDO','test-f3b') RETURNING id
  `, [e1, ordenId, `SGD-SUB-${nonce}`])).rows[0].id);
  docSubId = Number((await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente
    ) VALUES ($1,'RESPUESTA SUBSANACION.pdf','application/pdf',$2,120,TRUE) RETURNING id
  `, [recepSubId, pdfBase64('SUB')])).rows[0].id);

  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-f3b' });
  await ensureResponsablePersonaEntregable({
    ordenEntregaId: e1,
    usuarioDestinoId: Number(usuarioResp.id),
    usuarioOrigenId: Number(usuarioResp.id),
    ejecutadoPor: 'test-f3b',
    motivo: 'Fixture F3B',
  });

  const detalle = await getDetalleEntregableServicio(e1);
  const gestionables = detalle.documentos_entregable_gestionables || [];
  ok(gestionables.length === 1, '1. un solo documento gestionable');
  ok(gestionables[0]?.nombre_archivo === 'CONFORMIDAD ENTREGABLE.pdf', '2. gestionable es documento INICIAL');
  ok(!gestionables.some((d) => String(d.nombre_archivo).includes('SUBSANACION')),
    '3. adjunto de subsanación NO aparece en gestionables');
  ok(Number(detalle.recepcion_vigente?.id) === recepSubId, '4. subsanación sigue siendo presentación vigente');

  const errSub = await expectReject(() => retirarDocumentoRecepcionEntregable(
    e1, docSubId, respCtx, usuarioResp.username,
  ));
  ok(errSub?.code === 'DOCUMENTO_NO_ENCONTRADO',
    '5. no se puede eliminar documento de subsanación vía gestión entregable');

  await adjuntarDocumentosRecepcionEntregable(e1, {
    documentos: [{ nombre_archivo: 'anexo-entregable.pdf', mime_type: 'application/pdf', contenido_base64: pdfBase64('A') }],
  }, respCtx, usuarioResp.username);
  const detalle2 = await getDetalleEntregableServicio(e1);
  ok((detalle2.documentos_entregable_gestionables || []).length === 2, '6. múltiples vigentes INICIAL en gestionables');

  const mod = await modificarRecepcionEntregable(e1, {
    fecha_recepcion_mesa_partes: '2026-08-20',
    numero_expediente_sgd: `SGD-EDIT-${nonce}`,
    observacion: 'Observación editada',
    documentos: [],
  }, respCtx, usuarioResp.username);
  ok(mod.numero_expediente_sgd === `SGD-EDIT-${nonce}`, '8. expediente SGD INICIAL persistido');
  ok(mod.observacion === 'Observación editada', '9. observación INICIAL persistida');
  const fechaIni = (await query(
    'SELECT fecha_recepcion_mesa_partes::text AS f FROM entregable_recepciones WHERE id=$1',
    [recepInicialId],
  )).rows[0]?.f;
  ok(String(fechaIni).slice(0, 10) === '2026-08-20', '7. fecha INICIAL persistida');

  const detalle3 = await getDetalleEntregableServicio(e1);
  ok(toIsoDateString(detalle3.recepcion_inicial?.fecha_recepcion_mesa_partes) === '2026-08-20',
    '12. detalle refleja fecha INICIAL modificada');
  const bandeja = await listarBandejaEntregablesServicios(respCtx);
  const fila = bandeja.find((row) => Number(row.orden_entrega_id) === e1);
  ok(String(fila?.fecha_recepcion_mesa_partes || '').slice(0, 10) === '2026-08-20',
    '13. bandeja refleja fecha INICIAL modificada');
  ok(String(fila?.ultima_recepcion?.fecha_recepcion_mesa_partes || '').slice(0, 10) === '2026-08-19',
    '14. subsanación conserva su propia fecha');

  const subRow = (await query('SELECT numero_expediente_sgd, observacion FROM entregable_recepciones WHERE id=$1', [recepSubId])).rows[0];
  ok(subRow.numero_expediente_sgd === `SGD-SUB-${nonce}`, '10. metadatos de subsanación no se alteran');
  ok(subRow.observacion === 'Respuesta obs', '11. observación de subsanación intacta');
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
console.log(`\n=== Resultado F-3B: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);
