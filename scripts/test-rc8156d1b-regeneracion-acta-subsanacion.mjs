/**
 * RC8.15.6D-1B — Regeneración del Acta después de subsanación.
 * Recorre dos ciclos y verifica aislamiento por orden_entrega_id.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../server/db.js';
import {
  adjuntarActaConformidadFirmada,
  derivarEntregableCoordinadorCM,
  generarActaConformidadEntregable,
  getActaConformidadGeneradaBytes,
  listarBandejaEntregablesServicios,
  listarConformidadEntregable,
  observarEntregable,
  subsanarEntregable,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');
const pdf = (label) => Buffer.from(`%PDF-1.4 ${label} `.repeat(10)).toString('base64');
let passed = 0;
let failed = 0;
let ordenId = null;
let requerimientoId = null;
const usuariosOriginales = [];

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
      (SELECT COUNT(*)::int FROM entregable_conformidad_acta_visados v WHERE v.orden_id=oc.id) AS firmadas,
      (SELECT COUNT(*)::int FROM entregable_recepciones r WHERE r.orden_id=oc.id) AS recepciones
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

async function snapshotExpediente(id) {
  return JSON.stringify({
    estado: (await query(
      'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id=$1',
      [id],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM expediente_asignaciones WHERE requerimiento_id=$1 ORDER BY id',
      [id],
    )).rows,
  });
}

async function snapshotEntregable(id) {
  return JSON.stringify({
    estado: (await query(
      'SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1',
      [id],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM entregable_asignaciones WHERE orden_entrega_id=$1 ORDER BY id',
      [id],
    )).rows,
    eventos: (await query(
      'SELECT * FROM entregable_eventos WHERE orden_entrega_id=$1 ORDER BY id',
      [id],
    )).rows,
  });
}

function payloadSubsanacion(observacionId, ciclo, fecha) {
  return {
    observacion_id: observacionId,
    fecha_recepcion_mesa_partes: fecha,
    numero_expediente_sgd: `SGD-D1B-SUB${ciclo}`,
    observacion: `Subsanación ${ciclo}`,
    documentos: [{
      nombre_archivo: `subsanacion-${ciclo}.pdf`,
      mime_type: 'application/pdf',
      contenido_base64: pdf(`SUBSANACION-${ciclo}`),
    }],
  };
}

console.log('\n=== RC8.15.6D-1B — Regeneración después de subsanación ===\n');

const viewSource = read('src/views/ejecucion/presentacionEntregableView.js');
ok(/SUBSANACIÓN/.test(viewSource) && /vigente_operativa/.test(viewSource)
  && /PRESENTACIÓN INICIAL/.test(viewSource),
'expediente agrupa conformidad por presentación y vigencia operativa');

const os1105Before = await snapshotOs1105();
const bienesBefore = await snapshotBienes();

try {
  const base = (await query(`
    SELECT e.requerimiento_id, oc.proveedor_id
    FROM expediente_estado_vigente e
    JOIN ordenes_contratacion oc ON oc.requerimiento_id=e.requerimiento_id
    WHERE e.etapa_codigo='PRESENTACION_ENTREGABLES'
      AND oc.proveedor_id IS NOT NULL
    ORDER BY e.requerimiento_id
    LIMIT 1
  `)).rows[0];
  const usuarios = (await query(`
    SELECT * FROM usuarios WHERE activo=TRUE ORDER BY id LIMIT 2
  `)).rows;
  if (!base || usuarios.length < 2) throw new Error('No existe base mínima para fixture RC8.15.6D-1B');
  const [areaUsuaria, coordinador] = usuarios;
  for (const usuario of usuarios) {
    usuariosOriginales.push({
      id: usuario.id,
      cargo: usuario.cargo,
      permisos: usuario.permisos,
      activo: usuario.activo,
    });
  }
  await query(`
    UPDATE usuarios SET cargo='Área Usuaria',
      permisos='{"perfil":"AREA_USUARIA"}'::jsonb, activo=TRUE WHERE id=$1
  `, [areaUsuaria.id]);
  await query(`
    UPDATE usuarios SET cargo='Coordinador CM',
      permisos='{"perfil":"COORDINADOR_CM"}'::jsonb, activo=TRUE WHERE id=$1
  `, [coordinador.id]);
  const areaCtx = {
    id: Number(areaUsuaria.id),
    rol: areaUsuaria.rol,
    cargo: 'Área Usuaria',
    permisos: { perfil: 'AREA_USUARIA' },
    username: areaUsuaria.username,
  };
  const coordinadorCtx = {
    id: Number(coordinador.id),
    rol: coordinador.rol,
    cargo: 'Coordinador CM',
    permisos: { perfil: 'COORDINADOR_CM' },
    username: coordinador.username,
  };

  requerimientoId = Number(base.requerimiento_id);
  const expedienteBefore = await snapshotExpediente(requerimientoId);
  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,200,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [requerimientoId, base.proveedor_id, `RC8156D1B${Date.now()}`])).rows[0].id);

  async function crearEntrega(numero) {
    const id = Number((await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture D1B ${numero}`])).rows[0].id);
    await inicializarEstadoResponsableEntregable(id, { actualizadoPor: 'test-d1b' });
    await query(`
      UPDATE entregable_estado_vigente
      SET responsable_tipo='PERSONA', responsable_usuario_id=$2,
        responsable_unidad='AREA_USUARIA', responsable_fuente='asignacion_explicita'
      WHERE orden_entrega_id=$1
    `, [id, areaUsuaria.id]);
    await query(`
      UPDATE entregable_asignaciones
      SET tipo_responsable='PERSONA', usuario_id=$2, unidad_codigo='AREA_USUARIA'
      WHERE orden_entrega_id=$1 AND activo=TRUE
    `, [id, areaUsuaria.id]);
    return id;
  }

  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  const e2Before = await snapshotEntregable(e2);
  const recepcionInicial = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL','2026-08-15','SGD-D1B-INICIAL','RECIBIDO','test-d1b')
    RETURNING *
  `, [e1, ordenId])).rows[0];
  await query(`
    INSERT INTO entregable_recepcion_documentos (
      recepcion_id, nombre_archivo, mime_type, contenido_base64, vigente
    ) VALUES ($1,'inicial.pdf','application/pdf',$2,TRUE)
  `, [recepcionInicial.id, pdf('INICIAL')]);

  const v1 = (await generarActaConformidadEntregable(
    e1, { conclusion: 'CONFORME' }, areaCtx, areaUsuaria.username,
  )).data;
  await adjuntarActaConformidadFirmada(e1, {
    acta_id: v1.id,
    contenido_base64: pdf('FIRMADA-V1'),
    mime_type: 'application/pdf',
    idempotency_key: `d1b-v1-${Date.now()}`,
  }, areaCtx, areaUsuaria.username);
  await derivarEntregableCoordinadorCM(
    e1, { responsable_id: coordinador.id }, areaCtx, areaUsuaria.username,
  );
  const obs1 = await observarEntregable(
    e1,
    { recepcion_id: recepcionInicial.id, motivo: 'Primera observación D1B' },
    coordinadorCtx,
    coordinador.username,
  );
  const sub1 = await subsanarEntregable(
    e1,
    payloadSubsanacion(obs1.id, 1, '2026-08-16'),
    areaCtx,
    areaUsuaria.username,
  );

  const confTrasSub1 = await listarConformidadEntregable(e1);
  const v1Historica = confTrasSub1.actas.find((acta) => Number(acta.id) === Number(v1.id));
  ok(v1Historica?.vigente_operativa === false
    && v1Historica?.vigencia_razon === 'PRESENTACION_ANTERIOR',
  'A/I. nueva subsanación invalida operativamente V1');
  ok(confTrasSub1.actas.some((acta) => Number(acta.id) === Number(v1.id)),
    'B. V1 permanece visible');
  const v1Bytes = await getActaConformidadGeneradaBytes(e1, v1.id);
  ok(v1Bytes.buffer.length > 200, 'C. V1 histórica permanece descargable');

  const filaSub1 = (await listarBandejaEntregablesServicios(areaCtx))
    .find((row) => Number(row.orden_entrega_id) === e1);
  const menuSub1 = entregableMenuItems(filaSub1).map((item) => item.act);
  ok(filaSub1.situacion_codigo === 'SUBSANADO'
    && JSON.stringify(menuSub1) === JSON.stringify(['verExpediente', 'generarActa', 'verTrazabilidad']),
  'matriz SUBSANADO: expediente, generar acta y trazabilidad');

  const v2 = (await generarActaConformidadEntregable(
    e1, { conclusion: 'CONFORME' }, areaCtx, areaUsuaria.username,
  )).data;
  const confV2 = await listarConformidadEntregable(e1);
  const v2Lectura = confV2.actas.find((acta) => Number(acta.id) === Number(v2.id));
  ok(Number(v2.version) === 2, 'D. regenerar crea la versión global V2');
  ok(Number(v2.recepcion_id) === Number(sub1.recepcion.id), 'E. V2 se vincula a la subsanación vigente');
  const v2Bytes = await getActaConformidadGeneradaBytes(e1, v2.id);
  const v2Pdf = v2Bytes.buffer.toString('latin1');
  ok(v2Pdf.includes('16/08/2026'), 'F. PDF V2 usa la nueva fecha de recepción');
  ok(v2Pdf.includes('SGD-D1B-SUB1'), 'G. PDF V2 usa el nuevo expediente SGD');
  ok(v2Lectura?.vigente_operativa === true
    && v2Lectura?.vigencia_razon === 'PRESENTACION_VIGENTE',
  'H. V2 queda operativamente vigente');

  const filaV2SinFirma = (await listarBandejaEntregablesServicios(areaCtx))
    .find((row) => Number(row.orden_entrega_id) === e1);
  const menuV2SinFirma = entregableMenuItems(filaV2SinFirma).map((item) => item.act);
  ok(filaV2SinFirma.situacion_codigo === 'ACTA_GENERADA'
    && menuV2SinFirma.includes('adjuntarActaFirmada')
    && !menuV2SinFirma.includes('derivarCoordinadorCM'),
  'matriz V2 sin firmada habilita adjuntar, pero no derivar');
  const sinFirmadaV2 = await expectReject(() => derivarEntregableCoordinadorCM(
    e1, { responsable_id: coordinador.id }, areaCtx, areaUsuaria.username,
  ));
  ok(sinFirmadaV2?.code === 'SIN_ACTA_FIRMADA_VIGENTE',
    'J/K. Firmada V1 histórica no habilita derivación de V2');

  const firmadaV2 = (await adjuntarActaConformidadFirmada(e1, {
    acta_id: v2.id,
    contenido_base64: pdf('FIRMADA-V2'),
    mime_type: 'application/pdf',
    idempotency_key: `d1b-v2-${Date.now()}`,
  }, areaCtx, areaUsuaria.username)).data;
  ok(Number(firmadaV2.acta_id) === Number(v2.id), 'L/M. firmada V2 se adjunta al acta vigente');
  const filaV2Firmada = (await listarBandejaEntregablesServicios(areaCtx))
    .find((row) => Number(row.orden_entrega_id) === e1);
  const menuV2Firmada = entregableMenuItems(filaV2Firmada).map((item) => item.act);
  ok(filaV2Firmada.situacion_codigo === 'CONFORME'
    && ['verActaGenerada', 'descargarActaGenerada', 'verActaFirmada',
      'descargarActaFirmada', 'derivarCoordinadorCM'].every((act) => menuV2Firmada.includes(act)),
  'matriz V2 firmada muestra ambas actas y habilita derivación');
  const derivacionV2 = await derivarEntregableCoordinadorCM(
    e1, { responsable_id: coordinador.id }, areaCtx, areaUsuaria.username,
  );
  ok(derivacionV2?.estado?.etapaCodigo === 'REVISION_COORDINADOR_CM',
    'N. V2 firmada permite derivar a Coordinador CM');

  const obs2 = await observarEntregable(
    e1,
    { recepcion_id: sub1.recepcion.id, motivo: 'Segunda observación D1B' },
    coordinadorCtx,
    coordinador.username,
  );
  const sub2 = await subsanarEntregable(
    e1,
    payloadSubsanacion(obs2.id, 2, '2026-08-17'),
    areaCtx,
    areaUsuaria.username,
  );
  const v3 = (await generarActaConformidadEntregable(
    e1, { conclusion: 'CONFORME' }, areaCtx, areaUsuaria.username,
  )).data;
  await adjuntarActaConformidadFirmada(e1, {
    acta_id: v3.id,
    contenido_base64: pdf('FIRMADA-V3'),
    mime_type: 'application/pdf',
    idempotency_key: `d1b-v3-${Date.now()}`,
  }, areaCtx, areaUsuaria.username);
  const confV3 = await listarConformidadEntregable(e1);
  const porVersion = new Map(confV3.actas.map((acta) => [Number(acta.version), acta]));
  ok(Number(v3.version) === 3 && Number(v3.recepcion_id) === Number(sub2.recepcion.id),
    'O. segundo ciclo crea V3 sobre SUBSANACIÓN 2');
  ok(!porVersion.get(1)?.vigente_operativa && !porVersion.get(2)?.vigente_operativa,
    'P. V1 y V2 quedan históricas');
  ok(porVersion.get(3)?.vigente_operativa
    && porVersion.get(3)?.vigencia_razon === 'PRESENTACION_VIGENTE',
  'Q. V3 queda vigente');

  ok(await snapshotEntregable(e2) === e2Before,
    'R. E2 conserva estado, asignaciones y eventos');
  ok(await snapshotExpediente(requerimientoId) === expedienteBefore,
    'S. expediente global permanece intacto');
  ok(await snapshotOs1105() === os1105Before, 'T. OS 1105 real permanece intacta');
  ok(await snapshotBienes() === bienesBefore, 'U. Bienes permanece intacto');
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
  for (const usuario of usuariosOriginales) {
    await query(`
      UPDATE usuarios SET cargo=$2, permisos=$3, activo=$4 WHERE id=$1
    `, [usuario.id, usuario.cargo, usuario.permisos, usuario.activo]);
  }
  await pool.end();
}

console.log(`\n=== Resultado RC8.15.6D-1B: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
