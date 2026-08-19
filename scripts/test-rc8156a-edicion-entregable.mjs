/**
 * RC8.15.6A — Edición de recepción INICIAL y versión documental vigente.
 *
 * Usa una OS ficticia aislada y verifica que la OS 1105 permanezca intacta.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}
async function expectReject(fn) {
  try { await fn(); return null; } catch (error) { return error; }
}
function pdfBase64(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF`)
    .toString('base64');
}

console.log('\n=== RC8.15.6A — Edición correcta del entregable ===\n');

{
  const migration = read('server/migrations/048_entregable_documento_vigente.js');
  const route = read('server/routes/entregablesServicios.js');
  const service = read('src/services/entregablesServiciosService.js');
  const view = read('src/views/ejecucion/presentacionEntregableView.js');
  const lib = read('server/lib/entregablesServicios.js');

  ok(/vigente BOOLEAN NOT NULL DEFAULT TRUE/.test(migration)
    && /reemplaza_id INTEGER NULL/.test(migration),
  'migración 048 agrega vigencia y relación de reemplazo');
  ok(/router\.put\('\/:id\/recepcion'/.test(route)
    && /modificarRecepcionEntregable/.test(route),
  'endpoint PUT /:id/recepcion conectado al backend');
  ok(/api\.put\(`\$\{BASE\}\/\$\{id\}\/recepcion`/.test(service),
    'cliente frontend utiliza PUT para modificar');
  ok(/Registrar entregable/.test(view) && /Modificar entregable/.test(view)
    && !/label: 'Registrar recepción'/.test(view),
  'labels funcionales registrar/modificar actualizados');
  ok(/documentos: contenido \? \[/.test(view) && !/archivos: contenido \? \[/.test(view),
    'se conserva payload documentos de RC8.15.5C');
  ok(/BEGIN/.test(lib) && /FOR UPDATE/.test(lib) && /ROLLBACK/.test(lib),
    'edición implementada con transacción y bloqueo');
}

let db = null;
try { db = await import('../server/db.js'); } catch (_) { /* sin BD */ }
if (!db?.query) {
  console.log('  ⚠ Sin acceso a BD: integración omitida.');
} else {
  const { query } = db;
  const {
    registrarRecepcionEntregable,
    modificarRecepcionEntregable,
    getDetalleEntregableServicio,
  } = await import('../server/lib/entregablesServicios.js');
  await runIntegration({
    query,
    registrarRecepcionEntregable,
    modificarRecepcionEntregable,
    getDetalleEntregableServicio,
  });
  try { await db.default?.end(); } catch (_) { /* noop */ }
}

console.log(`\n=== Resultado RC8.15.6A: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);

async function snapshotOs1105(query) {
  const { rows } = await query(`
    SELECT oc.id,
      (SELECT COUNT(*)::int FROM entregable_recepciones er WHERE er.orden_id = oc.id) AS recepciones,
      (SELECT COUNT(*)::int
       FROM entregable_recepcion_documentos d
       JOIN entregable_recepciones er ON er.id = d.recepcion_id
       WHERE er.orden_id = oc.id) AS documentos
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = '1105'
    ORDER BY oc.id
  `);
  return JSON.stringify(rows);
}

async function runIntegration({
  query,
  registrarRecepcionEntregable,
  modificarRecepcionEntregable,
  getDetalleEntregableServicio,
}) {
  const columns = (await query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entregable_recepcion_documentos'
      AND column_name IN ('vigente','reemplaza_id')
  `)).rows;
  if (columns.length !== 2) {
    ok(false, 'migración 048 debe estar aplicada antes de la integración');
    return;
  }

  const os1105Antes = await snapshotOs1105(query);
  const unique = `RC8156A${Date.now()}`;
  let ordenId = null;

  try {
    const proveedor = (await query(
      `SELECT proveedor_id FROM ordenes_contratacion WHERE proveedor_id IS NOT NULL LIMIT 1`,
    )).rows[0];
    const requerimiento = (await query(`SELECT id FROM requerimientos ORDER BY id LIMIT 1`)).rows[0];
    if (!proveedor?.proveedor_id || !requerimiento?.id) {
      throw new Error('No existe base mínima para crear el fixture aislado');
    }

    ordenId = (await query(`
      INSERT INTO ordenes_contratacion (
        requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
        fecha_orden, monto_total, estado, tipo_contratacion
      ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,100,'EN_EJECUCION','SERVICIO')
      RETURNING id
    `, [requerimiento.id, proveedor.proveedor_id, unique])).rows[0].id;

    const activaId = (await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
        fecha_maxima, importe, estado
      ) VALUES ($1,1,'ENTREGABLE','Fixture RC8.15.6A',10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId])).rows[0].id;
    const anuladaId = (await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
        fecha_maxima, importe, estado
      ) VALUES ($1,2,'ENTREGABLE','Fixture anulado RC8.15.6A',10,CURRENT_DATE+10,0,'ANULADO')
      RETURNING id
    `, [ordenId])).rows[0].id;

    const inicial = await registrarRecepcionEntregable(activaId, {
      fecha_recepcion_mesa_partes: '2026-08-18',
      numero_expediente_sgd: 'SGD-INICIAL',
      observacion: 'Inicial',
      documentos: [{
        nombre_archivo: 'inicial.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdfBase64('INICIAL'),
      }],
    }, 'test-rc8156a', 'admin');
    ok(inicial.tipo_recepcion === 'INICIAL' && Number(inicial.numero_recepcion) === 1,
      'registro inicial crea recepción INICIAL N.° 1');

    const segundoPost = await expectReject(() => registrarRecepcionEntregable(activaId, {
      fecha_recepcion_mesa_partes: '2026-08-19',
      numero_expediente_sgd: 'SGD-NO-DEBE',
      documentos: [{
        nombre_archivo: 'no-debe.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdfBase64('NO DEBE'),
      }],
    }, 'test-rc8156a', 'admin'));
    ok(segundoPost?.code === 'RECEPCION_YA_EXISTE',
      'un segundo POST se rechaza y no crea SUBSANACION');

    const docInicial = (await query(`
      SELECT d.* FROM entregable_recepcion_documentos d
      WHERE d.recepcion_id=$1
    `, [inicial.id])).rows[0];

    const sinPdf = await modificarRecepcionEntregable(activaId, {
      fecha_recepcion_mesa_partes: '2026-08-19',
      numero_expediente_sgd: 'SGD-EDITADO',
      observacion: 'Dato corregido',
      documentos: [],
    }, 'test-rc8156a', 'admin');
    ok(Number(sinPdf.id) === Number(inicial.id), 'edición conserva el id de recepción');
    const datosEditados = (await query(`
      SELECT TO_CHAR(fecha_recepcion_mesa_partes, 'YYYY-MM-DD') AS fecha,
        numero_expediente_sgd, observacion
      FROM entregable_recepciones WHERE id=$1
    `, [inicial.id])).rows[0];
    ok(datosEditados.fecha === '2026-08-19'
      && datosEditados.numero_expediente_sgd === 'SGD-EDITADO'
      && datosEditados.observacion === 'Dato corregido',
    'fecha, SGD y observación se actualizan');
    ok(Number(sinPdf.documento_vigente?.id) === Number(docInicial.id),
      'edición sin PDF conserva el documento vigente');

    const reemplazo = await modificarRecepcionEntregable(activaId, {
      fecha_recepcion_mesa_partes: '2026-08-20',
      numero_expediente_sgd: 'SGD-FINAL',
      observacion: 'PDF reemplazado',
      documentos: [{
        nombre_archivo: 'reemplazo.pdf',
        mime_type: 'application/pdf',
        contenido_base64: pdfBase64('REEMPLAZO'),
      }],
    }, 'test-rc8156a', 'admin');

    const recepciones = (await query(
      `SELECT * FROM entregable_recepciones WHERE orden_entrega_id=$1 ORDER BY id`,
      [activaId],
    )).rows;
    const documentos = (await query(
      `SELECT * FROM entregable_recepcion_documentos WHERE recepcion_id=$1 ORDER BY id`,
      [inicial.id],
    )).rows;
    ok(recepciones.length === 1 && Number(recepciones[0].id) === Number(inicial.id),
      'editar no crea una segunda recepción');
    ok(recepciones.every((r) => r.tipo_recepcion !== 'SUBSANACION'),
      'no aparece SUBSANACION');
    ok(documentos.length === 2, 'reemplazo conserva el PDF histórico');
    ok(documentos.filter((d) => d.vigente).length === 1
      && Number(documentos.find((d) => d.vigente)?.id) === Number(reemplazo.documento_vigente.id),
    'solo el PDF nuevo queda vigente');
    ok(Number(reemplazo.documento_vigente.reemplaza_id) === Number(docInicial.id)
      && documentos.find((d) => Number(d.id) === Number(docInicial.id))?.vigente === false,
    'reemplaza_id apunta al PDF anterior, que queda histórico');

    const detalle = await getDetalleEntregableServicio(activaId);
    ok(Number(detalle.recepcion_vigente?.id) === Number(inicial.id)
      && Number(detalle.documento_vigente?.id) === Number(reemplazo.documento_vigente.id),
    'lectura devuelve recepción INICIAL y documento vigentes');

    const antesError = recepciones[0];
    const errorDocumento = await expectReject(() => modificarRecepcionEntregable(activaId, {
      fecha_recepcion_mesa_partes: '2026-08-21',
      numero_expediente_sgd: 'SGD-NO-PERSISTE',
      observacion: 'No debe persistir',
      documentos: [{
        nombre_archivo: 'invalido.exe',
        mime_type: 'application/x-msdownload',
        contenido_base64: pdfBase64('INVALIDO'),
      }],
    }, 'test-rc8156a', 'admin'));
    const despuesError = (await query(
      `SELECT * FROM entregable_recepciones WHERE id=$1`,
      [inicial.id],
    )).rows[0];
    ok(errorDocumento?.code === 'ARCHIVO_MIME'
      && despuesError.numero_expediente_sgd === antesError.numero_expediente_sgd,
    'error documental no deja cambios parciales');

    const anuladaError = await expectReject(() => modificarRecepcionEntregable(anuladaId, {
      fecha_recepcion_mesa_partes: '2026-08-20',
      numero_expediente_sgd: 'SGD-ANULADO',
      documentos: [],
    }, 'test-rc8156a', 'admin'));
    ok(anuladaError?.code === 'ENTREGABLE_NO_ACTIVO',
      'entregables ANULADOS son rechazados');
  } catch (error) {
    ok(false, `integración completada sin error inesperado (${error.message})`);
  } finally {
    if (ordenId) {
      await query(`
        DELETE FROM entregable_recepcion_documentos
        WHERE recepcion_id IN (SELECT id FROM entregable_recepciones WHERE orden_id=$1)
      `, [ordenId]);
      await query(`DELETE FROM entregable_recepciones WHERE orden_id=$1`, [ordenId]);
      await query(`DELETE FROM orden_entregas WHERE orden_id=$1`, [ordenId]);
      await query(`DELETE FROM ordenes_contratacion WHERE id=$1`, [ordenId]);
    }
  }

  const os1105Despues = await snapshotOs1105(query);
  ok(os1105Despues === os1105Antes, 'OS 1105 real permanece intacta');
}
