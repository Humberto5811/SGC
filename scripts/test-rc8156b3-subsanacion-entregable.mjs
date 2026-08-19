/**
 * RC8.15.6B-3 — Subsanación formal de entregables observados.
 * Crea fixtures aislados; no modifica OS 1105, Bienes ni Portal Proveedor.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  listarBandejaEntregablesServicios,
  listarObservacionesEntregable,
  modificarRecepcionEntregable,
  observarEntregable,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const adminCtx = { id: -81563, rol: 'admin', alcance_datos: 'GLOBAL' };
let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

async function expectReject(fn) {
  try { await fn(); return null; } catch (error) { return error; }
}

function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}

function payloadSubsanacion(label, overrides = {}) {
  return {
    fecha_recepcion_mesa_partes: '2026-08-19',
    numero_expediente_sgd: `SGD-${label}`,
    observacion: `Comentario ${label}`,
    documentos: [{
      nombre_archivo: `${label}.pdf`,
      mime_type: 'application/pdf',
      contenido_base64: pdf(label),
    }],
    ...overrides,
  };
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

async function snapshotBienes() {
  const result = {};
  for (const table of [
    'recepcion_bienes_expedientes',
    'recepciones_bienes',
    'recepcion_bienes_eventos',
  ]) {
    result[table] = Number((await query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n);
  }
  return JSON.stringify(result);
}

console.log('\n=== RC8.15.6B-3 — Subsanación formal de entregable ===\n');

const route = read('server/routes/entregablesServicios.js');
const service = read('src/services/entregablesServiciosService.js');
const view = read('src/views/ejecucion/presentacionEntregableView.js');
ok(/router\.post\('\/:id\/subsanaciones'/.test(route)
  && /subsanarEntregable/.test(route), 'endpoint POST de subsanación conectado');
ok(/api\.post\(`\$\{BASE\}\/\$\{id\}\/subsanaciones`/.test(service),
  'cliente frontend consume endpoint de subsanación');
ok(/Subsanar observación/.test(view) && /Registrar subsanación/.test(view)
  && /Nuevo PDF del entregable/.test(view), 'modal de subsanación implementado');

const os1105Before = await snapshotOs1105();
const bienesBefore = await snapshotBienes();
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
    ORDER BY r.id LIMIT 1
  `)).rows[0];
  if (!proveedor?.proveedor_id || !requerimiento?.id) {
    throw new Error('No existe base mínima en PRESENTACION_ENTREGABLES');
  }

  ordenId = (await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,400,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [requerimiento.id, proveedor.proveedor_id, `RC8156B3${Date.now()}`])).rows[0].id;

  async function crearEntrega(numero, estado = 'ACTIVO') {
    return (await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo,
        fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,$4)
      RETURNING id
    `, [ordenId, numero, `Fixture B3 ${numero}`, estado])).rows[0].id;
  }
  async function crearRecepcion(entregaId, numero, sgd) {
    return (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,$3,'INICIAL',CURRENT_DATE,$4,'RECIBIDO','test-b3')
      RETURNING *
    `, [entregaId, ordenId, numero, sgd])).rows[0];
  }
  async function crearDocumento(recepcionId, label) {
    return (await query(`
      INSERT INTO entregable_recepcion_documentos (
        recepcion_id, nombre_archivo, mime_type, contenido_base64,
        tamanio_bytes, vigente
      ) VALUES ($1,$2,'application/pdf',$3,20,TRUE)
      RETURNING *
    `, [recepcionId, `${label}.pdf`, pdf(label)])).rows[0];
  }

  const entregaId = await crearEntrega(1);
  const normalId = await crearEntrega(2);
  const ajenaId = await crearEntrega(3);
  const anuladaId = await crearEntrega(4, 'ANULADO');
  const recepcionInicial = await crearRecepcion(entregaId, 1, 'SGD-INICIAL-B3');
  const docInicial = await crearDocumento(recepcionInicial.id, 'inicial-b3');
  const recepcionNormal = await crearRecepcion(normalId, 1, 'SGD-NORMAL-B3');
  await crearDocumento(recepcionNormal.id, 'normal-b3');
  const recepcionAjena = await crearRecepcion(ajenaId, 1, 'SGD-AJENA-B3');
  await crearDocumento(recepcionAjena.id, 'ajena-b3');
  const recepcionAnulada = await crearRecepcion(anuladaId, 1, 'SGD-ANULADA-B3');
  await crearDocumento(recepcionAnulada.id, 'anulada-b3');

  const sinObservacion = await expectReject(() => subsanarEntregable(
    entregaId, payloadSubsanacion('sin-observacion'), adminCtx, 'admin-b3',
  ));
  ok(sinObservacion?.code === 'SIN_OBSERVACION_ABIERTA',
    'A. sin observación abierta no permite subsanar');

  const observacion1 = await observarEntregable(
    entregaId,
    { recepcion_id: recepcionInicial.id, motivo: 'Primera observación formal.' },
    adminCtx,
    'observador-b3',
  );
  const observacionAjena = await observarEntregable(
    ajenaId,
    { recepcion_id: recepcionAjena.id, motivo: 'Observación de otro entregable.' },
    adminCtx,
    'observador-b3',
  );

  const sinPdf = await expectReject(() => subsanarEntregable(
    entregaId,
    payloadSubsanacion('sin-pdf', {
      observacion_id: observacion1.id,
      documentos: [],
    }),
    adminCtx,
    'subsanador-b3',
  ));
  ok(sinPdf?.code === 'PDF_SUBSANACION_REQUERIDO', 'C. PDF obligatorio');

  const cruce = await expectReject(() => subsanarEntregable(
    entregaId,
    payloadSubsanacion('cruce', { observacion_id: observacionAjena.id }),
    adminCtx,
    'subsanador-b3',
  ));
  const noAutorizado = await expectReject(() => subsanarEntregable(
    entregaId,
    payloadSubsanacion('no-autorizado', { observacion_id: observacion1.id }),
    { id: -999999, rol: 'usuario' },
    'usuario-ajeno',
  ));
  ok(cruce?.code === 'OBSERVACION_NO_PERTENECE'
    && noAutorizado?.code === 'SUBSANACION_NO_AUTORIZADA',
  'P. acceso cruzado y usuario no responsable rechazados');

  const inicialAntes = JSON.stringify((await query(
    `SELECT * FROM entregable_recepciones WHERE id=$1`,
    [recepcionInicial.id],
  )).rows[0]);
  const pdfInicialAntes = JSON.stringify((await query(
    `SELECT * FROM entregable_recepcion_documentos WHERE id=$1`,
    [docInicial.id],
  )).rows[0]);

  const resultado1 = await subsanarEntregable(
    entregaId,
    payloadSubsanacion('subsanacion-1', { observacion_id: observacion1.id }),
    adminCtx,
    'subsanador-b3',
  );
  ok(resultado1.recepcion.tipo_recepcion === 'SUBSANACION', 'B/D. observación abierta crea SUBSANACION');
  ok(Number(resultado1.recepcion.numero_recepcion) === 2, 'E. incrementa numero_recepcion');
  ok(JSON.stringify((await query(
    `SELECT * FROM entregable_recepciones WHERE id=$1`,
    [recepcionInicial.id],
  )).rows[0]) === inicialAntes, 'F. recepción inicial queda intacta');
  ok(JSON.stringify((await query(
    `SELECT * FROM entregable_recepcion_documentos WHERE id=$1`,
    [docInicial.id],
  )).rows[0]) === pdfInicialAntes, 'G. PDF inicial queda intacto');
  ok(Number(resultado1.documento.recepcion_id) === Number(resultado1.recepcion.id)
    && resultado1.documento.reemplaza_id == null, 'H. nuevo PDF pertenece solo a la nueva recepción');
  ok(Number(resultado1.observacion.recepcion_subsanacion_id)
      === Number(resultado1.recepcion.id), 'I. observación vinculada a la subsanación');
  ok(resultado1.observacion.estado === 'OBS_SUBSANADA', 'J. observación pasa a OBS_SUBSANADA');

  const historial1 = await listarObservacionesEntregable(entregaId);
  ok(historial1.some((item) => Number(item.id) === Number(observacion1.id)
    && item.motivo === 'Primera observación formal.'), 'K. historial conserva la observación');
  const filaSubsanada = (await listarBandejaEntregablesServicios(adminCtx))
    .find((item) => Number(item.orden_entrega_id) === Number(entregaId));
  ok(filaSubsanada?.situacion_codigo === 'SUBSANADO'
    && filaSubsanada?.situacion_label === 'Subsanado', 'L. situación pasa a SUBSANADO');

  const observacion2 = await observarEntregable(
    entregaId,
    {
      recepcion_id: resultado1.recepcion.id,
      motivo: 'Segunda observación sobre la subsanación.',
    },
    adminCtx,
    'observador-b3',
  );
  ok(Number(observacion2.recepcion_id) === Number(resultado1.recepcion.id),
    'M. puede volver a observarse la subsanación');
  const resultado2 = await subsanarEntregable(
    entregaId,
    payloadSubsanacion('subsanacion-2', { observacion_id: observacion2.id }),
    adminCtx,
    'subsanador-b3',
  );
  ok(resultado2.recepcion.tipo_recepcion === 'SUBSANACION'
    && Number(resultado2.recepcion.numero_recepcion) === 3
    && Number(resultado2.observacion.recepcion_subsanacion_id)
      === Number(resultado2.recepcion.id), 'N. segundo ciclo de subsanación es posible');

  const normalCountBefore = Number((await query(`
    SELECT COUNT(*)::int AS n FROM entregable_recepciones WHERE orden_entrega_id=$1
  `, [normalId])).rows[0].n);
  await modificarRecepcionEntregable(normalId, {
    fecha_recepcion_mesa_partes: '2026-08-20',
    numero_expediente_sgd: 'SGD-NORMAL-EDITADO',
    observacion: 'Edición administrativa',
    documentos: [],
  }, 'editor-b3', 'admin');
  const normalRows = (await query(`
    SELECT tipo_recepcion FROM entregable_recepciones WHERE orden_entrega_id=$1
  `, [normalId])).rows;
  ok(normalRows.length === normalCountBefore
    && normalRows.every((r) => r.tipo_recepcion === 'INICIAL'),
  'O. Modificar entregable sigue sin crear SUBSANACION');

  const observacionAnulada = (await query(`
    INSERT INTO entregable_observaciones (
      orden_id, orden_entrega_id, recepcion_id, motivo, estado,
      observado_por, observado_at
    ) VALUES ($1,$2,$3,'No debe subsanarse','OBS_EMITIDA','test-b3',NOW())
    RETURNING *
  `, [ordenId, anuladaId, recepcionAnulada.id])).rows[0];
  const anuladaAntes = JSON.stringify((await query(
    `SELECT * FROM entregable_recepciones WHERE orden_entrega_id=$1 ORDER BY id`,
    [anuladaId],
  )).rows);
  const rechazoAnulada = await expectReject(() => subsanarEntregable(
    anuladaId,
    payloadSubsanacion('anulada', { observacion_id: observacionAnulada.id }),
    adminCtx,
    'admin-b3',
  ));
  const anuladaDespues = JSON.stringify((await query(
    `SELECT * FROM entregable_recepciones WHERE orden_entrega_id=$1 ORDER BY id`,
    [anuladaId],
  )).rows);
  ok(rechazoAnulada?.code === 'ENTREGABLE_NO_ACTIVO'
    && anuladaDespues === anuladaAntes, 'Q. entregables ANULADOS permanecen intactos');
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

ok(await snapshotOs1105() === os1105Before, 'R. OS 1105 permanece intacta');
ok(await snapshotBienes() === bienesBefore, 'S. Recepción de Bienes permanece intacta');
const changedFiles = execFileSync('git', ['diff', '--name-only'], {
  cwd: root,
  encoding: 'utf8',
}).split(/\r?\n/).filter(Boolean);
ok(!changedFiles.some((file) => file.startsWith('src/views/proveedor/')
  || file.startsWith('src/services/proveedor')), 'T. Portal Proveedor permanece intacto');

await pool.end();
console.log(`\n=== Resultado RC8.15.6B-3: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
