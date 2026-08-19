/**
 * RC8.15.6B-2 — Observación formal de entregables de servicios.
 * Usa fixtures aislados y nunca modifica la OS 1105.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  observarEntregable,
  listarBandejaEntregablesServicios,
  generarActaConformidadEntregable,
} from '../server/lib/entregablesServicios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const adminCtx = { id: -81562, rol: 'admin', alcance_datos: 'GLOBAL' };
let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

async function expectReject(fn) {
  try { await fn(); return null; } catch (error) { return error; }
}

async function countTables(tableNames) {
  const result = {};
  for (const tableName of tableNames) {
    result[tableName] = Number((await query(
      `SELECT COUNT(*)::int AS n FROM ${tableName}`,
    )).rows[0].n);
  }
  return result;
}

async function snapshotOs1105() {
  return JSON.stringify((await query(`
    SELECT oc.id,
      (SELECT COUNT(*)::int FROM entregable_recepciones er WHERE er.orden_id=oc.id) AS recepciones,
      (SELECT COUNT(*)::int FROM entregable_observaciones eo WHERE eo.orden_id=oc.id) AS observaciones
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
    ORDER BY oc.id
  `)).rows);
}

console.log('\n=== RC8.15.6B-2 — Observar entregable de servicios ===\n');

const route = read('server/routes/entregablesServicios.js');
const service = read('src/services/entregablesServiciosService.js');
const view = read('src/views/ejecucion/presentacionEntregableView.js');
ok(/router\.post\('\/:id\/observaciones'/.test(route)
  && /observarEntregable/.test(route), 'endpoint POST de observaciones conectado');
ok(/api\.post\(`\$\{BASE\}\/\$\{id\}\/observaciones`/.test(service),
  'cliente frontend consume endpoint de observación');
ok(/Observar entregable/.test(view) && /Motivo de observación/.test(view)
  && /Registrar observación/.test(view), 'modal institucional de observación implementado');
ok(/situacion_codigo === 'OBSERVADO'/.test(view)
  && /estadoCodigo: 'OBSERVADO'/.test(view), 'situación OBSERVADO usa badge institucional');

const protectedTables = [
  'recepcion_bienes_expedientes',
  'recepciones_bienes',
  'recepcion_bienes_eventos',
];
const protectedBefore = await countTables(protectedTables);
const os1105Before = await snapshotOs1105();
let ordenId = null;

try {
  const proveedor = (await query(
    `SELECT proveedor_id FROM ordenes_contratacion WHERE proveedor_id IS NOT NULL LIMIT 1`,
  )).rows[0];
  const requerimiento = (await query(`
    SELECT r.id
    FROM requerimientos r
    JOIN expediente_estado_vigente e ON e.requerimiento_id = r.id
    WHERE UPPER(COALESCE(e.etapa_codigo, e.estado_codigo, '')) = 'PRESENTACION_ENTREGABLES'
    ORDER BY r.id
    LIMIT 1
  `)).rows[0];
  if (!proveedor?.proveedor_id || !requerimiento?.id) {
    throw new Error('No existe base mínima en etapa PRESENTACION_ENTREGABLES');
  }

  ordenId = (await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,300,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [requerimiento.id, proveedor.proveedor_id, `RC8156B2${Date.now()}`])).rows[0].id;

  async function crearEntrega(numero, descripcion) {
    return (await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
        fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, descripcion])).rows[0].id;
  }
  const entregaId = await crearEntrega(1, 'Fixture observable');
  const sinRecepcionId = await crearEntrega(2, 'Fixture sin recepción');
  const ajenaId = await crearEntrega(3, 'Fixture recepción ajena');

  const sinRecepcion = await expectReject(() => observarEntregable(
    sinRecepcionId, { motivo: 'No debe registrarse' }, adminCtx, 'admin-b2',
  ));
  ok(sinRecepcion?.code === 'SIN_RECEPCION_VIGENTE', 'A. sin recepción no observa');

  const recepcionId = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion,
      estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,'SGD-B2','Recepción original','RECIBIDO','test-b2')
    RETURNING id
  `, [entregaId, ordenId])).rows[0].id;
  const recepcionAjenaId = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,'SGD-B2-AJENA','RECIBIDO','test-b2')
    RETURNING id
  `, [ajenaId, ordenId])).rows[0].id;
  const documentoId = (await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, nombre_archivo, mime_type, contenido_base64, tamanio_bytes, vigente
    ) VALUES ($1,'entregable-b2.pdf','application/pdf',$2,20,TRUE)
    RETURNING id
  `, [recepcionId, Buffer.from('%PDF-1.4 RC8156B2').toString('base64')])).rows[0].id;

  const motivoVacio = await expectReject(() => observarEntregable(
    entregaId, { motivo: '   ' }, adminCtx, 'admin-b2',
  ));
  ok(motivoVacio?.code === 'MOTIVO_OBSERVACION_REQUERIDO', 'B. motivo obligatorio');

  const accesoAjeno = await expectReject(() => observarEntregable(
    entregaId,
    { recepcion_id: recepcionAjenaId, motivo: 'Cruce indebido' },
    adminCtx,
    'admin-b2',
  ));
  const noAutorizado = await expectReject(() => observarEntregable(
    entregaId,
    { recepcion_id: recepcionId, motivo: 'Usuario ajeno' },
    { id: -999999, rol: 'usuario' },
    'usuario-ajeno',
  ));
  ok(accesoAjeno?.code === 'RECEPCION_NO_PERTENECE'
    && noAutorizado?.code === 'OBSERVACION_NO_AUTORIZADA',
  'N. acceso cruzado y usuario no responsable son rechazados');

  const recepcionAntes = JSON.stringify((await query(
    `SELECT * FROM entregable_recepciones WHERE id=$1`,
    [recepcionId],
  )).rows[0]);
  const documentoAntes = JSON.stringify((await query(
    `SELECT * FROM entregable_recepcion_documentos WHERE id=$1`,
    [documentoId],
  )).rows[0]);
  const recepcionesAntes = Number((await query(
    `SELECT COUNT(*)::int AS n FROM entregable_recepciones WHERE orden_entrega_id=$1`,
    [entregaId],
  )).rows[0].n);

  const observacion = await observarEntregable(
    entregaId,
    { recepcion_id: recepcionId, motivo: 'Falta sustento técnico del informe.' },
    adminCtx,
    'usuario-observador-b2',
  );
  ok(Number(observacion.recepcion_id) === Number(recepcionId), 'C. observa recepción vigente');
  ok(observacion.estado === 'OBS_EMITIDA', 'D. estado inicial OBS_EMITIDA');
  ok(observacion.observado_por === 'usuario-observador-b2'
    && observacion.observado_at instanceof Date, 'E. usuario y fecha persistidos');

  const recepcionDespues = JSON.stringify((await query(
    `SELECT * FROM entregable_recepciones WHERE id=$1`,
    [recepcionId],
  )).rows[0]);
  const documentoDespues = JSON.stringify((await query(
    `SELECT * FROM entregable_recepcion_documentos WHERE id=$1`,
    [documentoId],
  )).rows[0]);
  const recepcionesDespues = Number((await query(
    `SELECT COUNT(*)::int AS n FROM entregable_recepciones WHERE orden_entrega_id=$1`,
    [entregaId],
  )).rows[0].n);
  ok(recepcionDespues === recepcionAntes, 'F. observación no altera recepción');
  ok(documentoDespues === documentoAntes, 'G. observación no altera PDF');
  ok(recepcionesDespues === recepcionesAntes, 'H. observación no crea nueva recepción');
  ok(!(await query(`
    SELECT 1 FROM entregable_recepciones
    WHERE orden_entrega_id=$1 AND tipo_recepcion='SUBSANACION'
  `, [entregaId])).rows.length, 'I. observación no crea SUBSANACION');

  const segunda = await expectReject(() => observarEntregable(
    entregaId,
    { recepcion_id: recepcionId, motivo: 'Duplicada' },
    adminCtx,
    'admin-b2',
  ));
  ok(segunda?.code === 'OBSERVACION_ABIERTA_EXISTE',
    'J. segunda observación abierta se rechaza');

  const fila = (await listarBandejaEntregablesServicios(adminCtx))
    .find((item) => Number(item.orden_entrega_id) === Number(entregaId));
  ok(fila?.situacion_codigo === 'OBSERVADO'
    && fila?.situacion_label === 'Observado', 'K. situación pasa a OBSERVADO');
  const actaBloqueada = await expectReject(() => generarActaConformidadEntregable(
    entregaId, { conclusion: 'CONFORME' }, adminCtx, 'admin-b2',
  ));
  ok(actaBloqueada?.code === 'ENTREGABLE_OBSERVADO', 'L. Generar Acta queda bloqueado');

  await query(`
    UPDATE entregable_observaciones
    SET estado='OBS_CERRADA', updated_at=NOW()
    WHERE id=$1
  `, [observacion.id]);
  const nuevoCiclo = await observarEntregable(
    entregaId,
    { recepcion_id: recepcionId, motivo: 'Nueva observación formal.' },
    adminCtx,
    'usuario-observador-b2',
  );
  ok(nuevoCiclo.estado === 'OBS_EMITIDA'
    && Number(nuevoCiclo.id) !== Number(observacion.id),
  'M. histórico cerrado no impide un ciclo posterior');
} catch (error) {
  ok(false, `integración completada sin error inesperado (${error.message})`);
} finally {
  if (ordenId) {
    await query(`DELETE FROM entregable_observaciones WHERE orden_id=$1`, [ordenId]);
    await query(`
      DELETE FROM entregable_recepcion_documentos
      WHERE recepcion_id IN (SELECT id FROM entregable_recepciones WHERE orden_id=$1)
    `, [ordenId]);
    await query(`DELETE FROM entregable_recepciones WHERE orden_id=$1`, [ordenId]);
    await query(`DELETE FROM orden_entregas WHERE orden_id=$1`, [ordenId]);
    await query(`DELETE FROM ordenes_contratacion WHERE id=$1`, [ordenId]);
  }
}

ok(await snapshotOs1105() === os1105Before, 'O. OS 1105 permanece intacta');
const protectedAfter = await countTables(protectedTables);
ok(JSON.stringify(protectedAfter) === JSON.stringify(protectedBefore),
  'P. Recepción de Bienes permanece intacta');

await pool.end();
console.log(`\n=== Resultado RC8.15.6B-2: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
