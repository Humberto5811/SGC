/**
 * RC8.15.6D-1C — Regenerar Acta de Conformidad (V2+ sin subsanación).
 */
import pool, { query } from '../server/db.js';
import {
  adjuntarActaConformidadFirmada,
  generarActaConformidadEntregable,
  getActaConformidadGeneradaBytes,
  listarBandejaEntregablesServicios,
  listarConformidadEntregable,
  obtenerActaGeneradaVigente,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

const ADMIN = { id: 1, rol: 'admin', alcance_datos: 'INSTITUCIONAL' };
const PDF = Buffer.from('%PDF-1.4 RC8156D1C '.repeat(8)).toString('base64');
let passed = 0;
let failed = 0;
let ordenId = null;

function ok(c, m) { if (c) { passed++; console.log(`  ✓ ${m}`); } else { failed++; console.error(`  ✗ ${m}`); } }

console.log('\n=== RC8.15.6D-1C — Regenerar Acta de Conformidad ===\n');

try {
  const base = (await query(`
    SELECT requerimiento_id, proveedor_id FROM ordenes_contratacion
    WHERE requerimiento_id IS NOT NULL AND proveedor_id IS NOT NULL
    ORDER BY id LIMIT 1
  `)).rows[0];
  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,300,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156D1C${Date.now()}`])).rows[0].id);

  const e1 = Number((await query(`
    INSERT INTO orden_entregas (
      orden_id, numero_entrega, tipo_entrega, descripcion, etiqueta_entrega,
      dias_plazo, fecha_maxima, importe, estado
    ) VALUES ($1,1,'ENTREGABLE','Fixture D1C','PRIMER ENTREGABLE',10,CURRENT_DATE+10,100,'ACTIVO')
    RETURNING id
  `, [ordenId])).rows[0].id);
  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-d1c' });

  const recepInicial = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL','2026-08-20','SGD-D1C-INI','RECIBIDO','test-d1c') RETURNING id
  `, [e1, ordenId])).rows[0].id;
  await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, nombre_archivo, mime_type, contenido_base64, vigente
    ) VALUES ($1,'entregable.pdf','application/pdf',$2,TRUE)
  `, [recepInicial, PDF]);

  const filaSinActa = (await listarBandejaEntregablesServicios(ADMIN))
    .find((row) => Number(row.orden_entrega_id) === e1);
  const menuSinActa = entregableMenuItems(filaSinActa);
  ok(Boolean(filaSinActa?.puede_gestionar_conformidad), '1. sin acta permite gestionar conformidad');
  ok(!filaSinActa?.puede_regenerar_acta, '2. sin acta no permite regenerar');
  ok(menuSinActa.some((item) => item.act === 'generarActa' && item.label === 'Generar Acta de Conformidad'),
    '3. menú muestra Generar Acta');

  const v1 = (await generarActaConformidadEntregable(
    e1, { conclusion: 'CONFORME' }, ADMIN, 'test-d1c',
  )).data;

  const filaV1 = (await listarBandejaEntregablesServicios(ADMIN))
    .find((row) => Number(row.orden_entrega_id) === e1);
  const menuV1 = entregableMenuItems(filaV1);
  ok(!filaV1?.puede_gestionar_conformidad, '4. V1 oculta Generar inicial');
  ok(Boolean(filaV1?.puede_regenerar_acta), '5. V1 no firmada permite regenerar');
  ok(menuV1.some((item) => item.act === 'generarActa' && item.label === 'Regenerar Acta de Conformidad'),
    '6. menú muestra Regenerar Acta');

  const v2 = (await generarActaConformidadEntregable(
    e1, { conclusion: 'CONFORME' }, ADMIN, 'test-d1c',
  )).data;
  ok(Number(v1.version) === 1 && Number(v2.version) === 2, '7. regenerar crea V2');

  const vigente = await obtenerActaGeneradaVigente(e1);
  ok(Number(vigente?.id) === Number(v2.id), '8. acta vigente operativa es V2');

  const conf = await listarConformidadEntregable(e1);
  const v1Lectura = conf.actas.find((acta) => Number(acta.id) === Number(v1.id));
  const v2Lectura = conf.actas.find((acta) => Number(acta.id) === Number(v2.id));
  ok(v1Lectura && v2Lectura, '9. V1 y V2 permanecen en expediente');
  ok(Number(conf.acta_generada_vigente?.id) === Number(v2.id), '10. Ver/Descargar apuntan a V2');

  const v1Bytes = await getActaConformidadGeneradaBytes(e1, v1.id);
  const v2Bytes = await getActaConformidadGeneradaBytes(e1, v2.id);
  ok(v1Bytes.buffer.length > 100 && v2Bytes.buffer.length > 100, '11. V1 histórica sigue descargable');

  await adjuntarActaConformidadFirmada(e1, {
    acta_id: v2.id,
    contenido_base64: PDF,
    mime_type: 'application/pdf',
    idempotency_key: `d1c-v2-${Date.now()}`,
  }, ADMIN, 'test-d1c');

  const filaFirmada = (await listarBandejaEntregablesServicios(ADMIN))
    .find((row) => Number(row.orden_entrega_id) === e1);
  const menuFirmada = entregableMenuItems(filaFirmada);
  ok(filaFirmada?.situacion_codigo === 'CONFORME', '12. firmada vigente pasa a CONFORME');
  ok(!filaFirmada?.puede_regenerar_acta, '13. firmada vigente bloquea regenerar');
  ok(!menuFirmada.some((item) => item.label === 'Regenerar Acta de Conformidad'),
    '14. menú sin Regenerar tras firmada');
  ok(menuFirmada.some((item) => item.act === 'derivarCoordinadorCM'),
    '15. firmada vigente conserva derivación CM');
} catch (error) {
  ok(false, `fixture (${error.message})`);
} finally {
  if (ordenId) {
    await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_conformidad_actas WHERE orden_id=$1', [ordenId]);
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
}

await pool.end();
console.log(`\n=== Resultado D-1C: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);
