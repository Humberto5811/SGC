/**
 * RC8.15.6B-1 — Modelo persistente de observaciones de entregables.
 *
 * Crea un fixture OS aislado y lo elimina al finalizar. Nunca modifica OS 1105.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  listarObservacionesEntregable,
  obtenerObservacionAbierta,
  obtenerObservacionesRecepcion,
} from '../server/lib/entregablesServicios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

let passed = 0;
let failed = 0;
function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}
async function expectSqlReject(sql, params) {
  try {
    await query(sql, params);
    return null;
  } catch (error) {
    return error;
  }
}

async function countTables(tableNames) {
  const result = {};
  for (const tableName of tableNames) {
    const { rows } = await query(`SELECT COUNT(*)::int AS n FROM ${tableName}`);
    result[tableName] = Number(rows[0].n);
  }
  return result;
}

async function snapshotOs1105() {
  const { rows } = await query(`
    SELECT oc.id,
      (SELECT COUNT(*)::int FROM entregable_recepciones er WHERE er.orden_id=oc.id) AS recepciones,
      (SELECT COUNT(*)::int FROM entregable_observaciones eo WHERE eo.orden_id=oc.id) AS observaciones
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
    ORDER BY oc.id
  `);
  return JSON.stringify(rows);
}

console.log('\n=== RC8.15.6B-1 — Modelo observaciones de entregables ===\n');

const migration = read('server/migrations/049_entregable_observaciones.js');
ok(
  /CREATE TABLE IF NOT EXISTS entregable_observaciones/.test(migration),
  'A-base. migración 049 define entregable_observaciones',
);
ok(
  /OBS_EMITIDA/.test(migration) && /OBS_EN_ATENCION/.test(migration)
    && /OBS_SUBSANADA/.test(migration) && /OBS_CERRADA/.test(migration),
  'A-base. reutiliza estados institucionales de observación',
);

const exists = (await query(
  `SELECT to_regclass('public.entregable_observaciones') AS tabla`,
)).rows[0]?.tabla;
ok(Boolean(exists), 'A. tabla entregable_observaciones existe');

const protectedTables = [
  'entregable_recepcion_documentos',
  'entregable_conformidad_actas',
  'entregable_conformidad_acta_visados',
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
  const requerimiento = (await query(
    `SELECT id FROM requerimientos ORDER BY id LIMIT 1`,
  )).rows[0];
  if (!proveedor?.proveedor_id || !requerimiento?.id) {
    throw new Error('No existe base mínima para el fixture aislado');
  }

  ordenId = (await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,100,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [requerimiento.id, proveedor.proveedor_id, `RC8156B1${Date.now()}`])).rows[0].id;

  const entrega1Id = (await query(`
    INSERT INTO orden_entregas (
      orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
      fecha_maxima, importe, estado
    ) VALUES ($1,1,'ENTREGABLE','Fixture observaciones 1',10,CURRENT_DATE+10,100,'ACTIVO')
    RETURNING id
  `, [ordenId])).rows[0].id;
  const entrega2Id = (await query(`
    INSERT INTO orden_entregas (
      orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
      fecha_maxima, importe, estado
    ) VALUES ($1,2,'ENTREGABLE','Fixture observaciones 2',20,CURRENT_DATE+20,0,'ACTIVO')
    RETURNING id
  `, [ordenId])).rows[0].id;

  const recepcion1Id = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,'SGD-B1-1','RECIBIDO','test-b1')
    RETURNING id
  `, [entrega1Id, ordenId])).rows[0].id;
  const recepcion2Id = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,2,'SUBSANACION',CURRENT_DATE,'SGD-B1-2','RECIBIDO','test-b1')
    RETURNING id
  `, [entrega1Id, ordenId])).rows[0].id;
  const recepcionAjenaId = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,'SGD-B1-AJENA','RECIBIDO','test-b1')
    RETURNING id
  `, [entrega2Id, ordenId])).rows[0].id;

  const insertObservation = `
    INSERT INTO entregable_observaciones (
      orden_id, orden_entrega_id, recepcion_id, motivo, estado,
      observado_por, observado_at
    ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
    RETURNING *
  `;

  const invalidOrder = await expectSqlReject(insertObservation, [
    -999999, entrega1Id, recepcion1Id, 'Orden inválida', 'OBS_EMITIDA', 'test-b1',
  ]);
  ok(invalidOrder?.code === '23503', 'B. FK rechaza una orden inexistente');

  const invalidDelivery = await expectSqlReject(insertObservation, [
    ordenId, -999999, recepcion1Id, 'Entregable inválido', 'OBS_EMITIDA', 'test-b1',
  ]);
  ok(invalidDelivery?.code === '23503', 'C. FK rechaza un entregable inexistente');

  const invalidReception = await expectSqlReject(insertObservation, [
    ordenId, entrega1Id, -999999, 'Recepción inválida', 'OBS_EMITIDA', 'test-b1',
  ]);
  ok(invalidReception?.code === '23503', 'D. FK rechaza una recepción inexistente');

  const crossedReception = await expectSqlReject(insertObservation, [
    ordenId, entrega1Id, recepcionAjenaId, 'Cruce inválido', 'OBS_EMITIDA', 'test-b1',
  ]);
  ok(crossedReception?.code === '23503',
    'E. FK compuesta rechaza recepción perteneciente a otro entregable');

  const receptionsBefore = JSON.stringify((await query(`
    SELECT id, orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado,
      registrado_por, registrado_at, actualizado_at
    FROM entregable_recepciones WHERE orden_id=$1 ORDER BY id
  `, [ordenId])).rows);

  const observation1 = (await query(insertObservation, [
    ordenId,
    entrega1Id,
    recepcion1Id,
    'El informe no contiene el sustento técnico requerido.',
    'OBS_EMITIDA',
    'usuario-observador',
  ])).rows[0];
  ok(observation1.motivo === 'El informe no contiene el sustento técnico requerido.',
    'F. observación conserva el motivo formal');
  ok(observation1.observado_por === 'usuario-observador'
    && observation1.observado_at instanceof Date,
  'G. observado_por y observado_at quedan registrados');

  const open1 = await obtenerObservacionAbierta(entrega1Id);
  ok(Number(open1?.id) === Number(observation1.id),
    'H. observación abierta puede consultarse por entregable');

  await query(`
    UPDATE entregable_observaciones
    SET estado='OBS_CERRADA', subsanado_por='usuario-subsana',
        subsanado_at=NOW(), recepcion_subsanacion_id=$2, updated_at=NOW()
    WHERE id=$1
  `, [observation1.id, recepcion2Id]);

  const observation2 = (await query(insertObservation, [
    ordenId,
    entrega1Id,
    recepcion2Id,
    'La subsanación todavía presenta una inconsistencia.',
    'OBS_EMITIDA',
    'segundo-observador',
  ])).rows[0];

  const history = await listarObservacionesEntregable(entrega1Id);
  const reception1History = await obtenerObservacionesRecepcion(recepcion1Id);
  ok(history.some((item) => Number(item.id) === Number(observation1.id)
      && item.estado === 'OBS_CERRADA')
    && reception1History.some((item) => Number(item.id) === Number(observation1.id)),
  'I. historial conserva observaciones cerradas');
  ok(history.length === 2
    && history.some((item) => Number(item.id) === Number(observation2.id)),
  'J. modelo permite múltiples ciclos históricos en presentaciones sucesivas');

  const duplicateOpen = await expectSqlReject(insertObservation, [
    ordenId, entrega1Id, recepcion2Id, 'Abierta duplicada', 'OBS_EN_ATENCION', 'test-b1',
  ]);
  ok(duplicateOpen?.code === '23505',
    'J2. índice parcial impide dos observaciones abiertas en la misma recepción');

  const receptionsAfter = JSON.stringify((await query(`
    SELECT id, orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, observacion, estado,
      registrado_por, registrado_at, actualizado_at
    FROM entregable_recepciones WHERE orden_id=$1 ORDER BY id
  `, [ordenId])).rows);
  ok(receptionsAfter === receptionsBefore,
    'K. registrar/consultar observaciones no modifica entregable_recepciones');

  const protectedDuring = await countTables(protectedTables);
  ok(protectedDuring.entregable_recepcion_documentos
      === protectedBefore.entregable_recepcion_documentos,
  'L. documentos de entregables permanecen intactos');
  ok(protectedDuring.entregable_conformidad_actas
      === protectedBefore.entregable_conformidad_actas
    && protectedDuring.entregable_conformidad_acta_visados
      === protectedBefore.entregable_conformidad_acta_visados,
  'M. actas de conformidad permanecen intactas');
} catch (error) {
  ok(false, `integración completada sin error inesperado (${error.message})`);
} finally {
  if (ordenId) {
    await query(`DELETE FROM entregable_observaciones WHERE orden_id=$1`, [ordenId]);
    await query(`DELETE FROM entregable_recepciones WHERE orden_id=$1`, [ordenId]);
    await query(`DELETE FROM orden_entregas WHERE orden_id=$1`, [ordenId]);
    await query(`DELETE FROM ordenes_contratacion WHERE id=$1`, [ordenId]);
  }
}

const os1105After = await snapshotOs1105();
ok(os1105After === os1105Before, 'N. OS 1105 real permanece intacta');

const protectedAfter = await countTables(protectedTables);
ok(
  protectedAfter.recepcion_bienes_expedientes === protectedBefore.recepcion_bienes_expedientes
    && protectedAfter.recepciones_bienes === protectedBefore.recepciones_bienes
    && protectedAfter.recepcion_bienes_eventos === protectedBefore.recepcion_bienes_eventos,
  'O. Recepción de Bienes permanece intacta',
);

await pool.end();
console.log(`\n=== Resultado RC8.15.6B-1: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
