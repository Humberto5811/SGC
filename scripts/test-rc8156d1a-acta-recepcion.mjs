/**
 * RC8.15.6D-1A — Acta vinculada a presentación/recepción.
 * Fixtures aislados; no modifica OS 1105 ni el flujo de Bienes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  adjuntarActaConformidadFirmada,
  buildDatosActaConformidadServicio,
  derivarEntregableCoordinadorCM,
  generarActaConformidadEntregable,
  listarConformidadEntregable,
  obtenerActaFirmadaVigente,
  obtenerActaGeneradaVigente,
  obtenerRecepcionVigenteEntregable,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const ADMIN = { id: 1, rol: 'admin', alcance_datos: 'INSTITUCIONAL' };
const PDF = Buffer.from('%PDF-1.4 RC8156D1A '.repeat(8)).toString('base64');
let passed = 0;
let failed = 0;
let ordenId = null;

function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

async function expectReject(work) {
  try { await work(); return null; } catch (error) { return error; }
}

async function snapshotOs1105() {
  return JSON.stringify((await query(`
    SELECT oc.id,
      (SELECT COUNT(*)::int FROM entregable_conformidad_actas a WHERE a.orden_id=oc.id) AS actas,
      (SELECT COUNT(*)::int FROM entregable_conformidad_acta_visados v WHERE v.orden_id=oc.id) AS firmadas
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden='OS' AND oc.numero_orden='1105'
    ORDER BY oc.id
  `)).rows);
}

async function snapshotBienes() {
  const result = {};
  for (const table of ['recepcion_bienes_expedientes', 'recepciones_bienes', 'recepcion_bienes_eventos']) {
    result[table] = Number((await query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n);
  }
  return JSON.stringify(result);
}

console.log('\n=== RC8.15.6D-1A — Acta ↔ recepción vigente ===\n');

const migration = read('server/migrations/051_entregable_conformidad_recepcion.js');
const visadosMigration = read('server/migrations/047_entregable_conformidad_actas.js');
ok(/ADD COLUMN IF NOT EXISTS recepcion_id INTEGER NULL/.test(migration), 'A. migración agrega recepcion_id nullable');
ok(/fk_eca_recepcion_contexto/.test(migration)
  && /recepcion_id, orden_entrega_id, orden_id/.test(migration), 'B/C. FK simple y contexto compuesto declarados');
ok(!/recepcion_id/.test(visadosMigration.slice(visadosMigration.indexOf('CREATE TABLE IF NOT EXISTS entregable_conformidad_acta_visados'))),
  'L. visados conserva su esquema sin recepcion_id');

const os1105Before = await snapshotOs1105();
const bienesBefore = await snapshotBienes();

try {
  const base = (await query(`
    SELECT requerimiento_id, proveedor_id
    FROM ordenes_contratacion
    WHERE requerimiento_id IS NOT NULL AND proveedor_id IS NOT NULL
    ORDER BY id LIMIT 1
  `)).rows[0];
  assert(base, 'Fixture requiere orden base con requerimiento y proveedor');

  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,200,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156D1A${Date.now()}`])).rows[0].id);

  async function crearEntrega(numero) {
    const id = Number((await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture D1A ${numero}`])).rows[0].id);
    await inicializarEstadoResponsableEntregable(id, { actualizadoPor: 'test-d1a' });
    return id;
  }

  async function crearRecepcion(entregaId, numero, tipo, sgd) {
    const recepcion = (await query(`
      INSERT INTO entregable_recepciones (
        orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
        fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
      ) VALUES ($1,$2,$3,$4,CURRENT_DATE,$5,$6,'test-d1a')
      RETURNING *
    `, [entregaId, ordenId, numero, tipo, sgd, tipo === 'INICIAL' ? 'RECIBIDO' : 'SUBSANADO'])).rows[0];
    await query(`
      INSERT INTO entregable_recepcion_documentos (
        recepcion_id, nombre_archivo, mime_type, contenido_base64, vigente
      ) VALUES ($1,$2,'application/pdf',$3,TRUE)
    `, [recepcion.id, `${tipo}-${numero}.pdf`, PDF]);
    return recepcion;
  }

  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  const r1 = await crearRecepcion(e1, 1, 'INICIAL', 'SGD-D1A-R1');
  const rOtro = await crearRecepcion(e2, 1, 'INICIAL', 'SGD-D1A-OTRO');

  const fkError = await expectReject(() => query(`
    INSERT INTO entregable_conformidad_actas (
      orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
      estado_documental, generado_at, generado_por
    ) VALUES ($1,$2,$3,'ACTA-CRUZADA',90,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-d1a')
  `, [ordenId, e1, rOtro.id]));
  ok(fkError?.code === '23503', 'C. recepción de otro entregable se rechaza por FK contextual');

  const legacy = (await query(`
    INSERT INTO entregable_conformidad_actas (
      orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
      estado_documental, generado_at, generado_por
    ) VALUES ($1,$2,NULL,'ACTA-LEGACY',1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-d1a')
    RETURNING *
  `, [ordenId, e1])).rows[0];
  const lecturaLegacy = await listarConformidadEntregable(e1);
  ok(lecturaLegacy.actas.some((acta) => Number(acta.id) === Number(legacy.id)
    && acta.vigencia_razon === 'LEGACY_SIN_RECEPCION' && !acta.vigente_operativa),
  'E. acta legacy NULL permanece visible y marcada histórica');
  const derivacionLegacy = await expectReject(() => derivarEntregableCoordinadorCM(
    e1, { responsable_id: 99999999 }, ADMIN, 'test-d1a',
  ));
  ok(derivacionLegacy?.code === 'SIN_ACTA_GENERADA', 'F. acta legacy no habilita derivación');

  const generadaR1 = await generarActaConformidadEntregable(
    e1, { conclusion: 'CONFORME' }, ADMIN, 'test-d1a',
  );
  ok(Number(generadaR1.data.recepcion_id) === Number(r1.id), 'D/H. nueva acta guarda la recepción vigente');
  const firmadaR1 = await adjuntarActaConformidadFirmada(e1, {
    acta_id: generadaR1.data.id,
    contenido_base64: PDF,
    mime_type: 'application/pdf',
    idempotency_key: `d1a-r1-${Date.now()}`,
  }, ADMIN, 'test-d1a');
  ok(Number(firmadaR1.data.acta_id) === Number(generadaR1.data.id), 'I. firmada hereda recepción mediante acta_id');

  const r2 = await crearRecepcion(e1, 2, 'SUBSANACION', 'SGD-D1A-R2');
  const canonica = await obtenerRecepcionVigenteEntregable(e1);
  const lecturaR2 = await listarConformidadEntregable(e1);
  ok(Number(canonica.id) === Number(r2.id)
    && lecturaR2.actas.find((acta) => Number(acta.id) === Number(generadaR1.data.id))?.vigencia_razon === 'PRESENTACION_ANTERIOR',
  'G. acta de recepción anterior queda histórica');
  ok(await obtenerActaGeneradaVigente(e1) === null
    && await obtenerActaFirmadaVigente(e1) === null,
  'J. acta/firmada anterior no son operativamente vigentes');
  const derivacionAnterior = await expectReject(() => derivarEntregableCoordinadorCM(
    e1, { responsable_id: 99999999 }, ADMIN, 'test-d1a',
  ));
  ok(derivacionAnterior?.code === 'SIN_ACTA_GENERADA', 'J. firmada de recepción anterior no habilita derivación');
  const firmadaHistorica = await expectReject(() => adjuntarActaConformidadFirmada(e1, {
    acta_id: generadaR1.data.id,
    contenido_base64: PDF,
    mime_type: 'application/pdf',
  }, ADMIN, 'test-d1a'));
  ok(firmadaHistorica?.code === 'ACTA_GENERADA_HISTORICA', 'G. carga firmada sobre acta histórica se rechaza');

  const datosR2 = await buildDatosActaConformidadServicio(e1);
  const generadaR2 = await generarActaConformidadEntregable(
    e1, { conclusion: 'CONFORME' }, ADMIN, 'test-d1a',
  );
  ok(datosR2.numero_expediente_sgd === 'SGD-D1A-R2'
    && Number(generadaR2.data.recepcion_id) === Number(r2.id),
  'H. generación vigente usa los datos de la subsanación');
  await adjuntarActaConformidadFirmada(e1, {
    acta_id: generadaR2.data.id,
    contenido_base64: PDF,
    mime_type: 'application/pdf',
    idempotency_key: `d1a-r2-${Date.now()}`,
  }, ADMIN, 'test-d1a');
  const vigenteGenerada = await obtenerActaGeneradaVigente(e1);
  const vigenteFirmada = await obtenerActaFirmadaVigente(e1);
  ok(Number(vigenteGenerada?.id) === Number(generadaR2.data.id)
    && Number(vigenteFirmada?.acta_id) === Number(generadaR2.data.id),
  'H/K. acta y firmada de recepción vigente cuentan');
  const precondicionesSuperadas = await expectReject(() => derivarEntregableCoordinadorCM(
    e1, { responsable_id: 99999999 }, ADMIN, 'test-d1a',
  ));
  ok(precondicionesSuperadas?.code === 'COORDINADOR_CM_INVALIDO',
    'K. acta y firmada vigentes superan la precondición documental');

  const columnasVisado = (await query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='entregable_conformidad_acta_visados'
  `)).rows.map((row) => row.column_name);
  ok(!columnasVisado.includes('recepcion_id'), 'L. schema de visados no fue ampliado');
  ok(await snapshotOs1105() === os1105Before, 'M. OS 1105 permanece intacta');
  ok(await snapshotBienes() === bienesBefore, 'N. Bienes permanece intacto');
} catch (error) {
  ok(false, `integración completada sin error inesperado (${error.message})`);
} finally {
  if (ordenId) {
    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_observaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_conformidad_actas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
  }
  await pool.end();
}

console.log(`\n=== Resultado RC8.15.6D-1A: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
