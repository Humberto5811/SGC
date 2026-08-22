/**
 * RC8.15.6F1 — Frontera Presentación → Pagos (PREPARACION_EXPEDIENTE_PAGO).
 */
import pool, { query } from '../server/db.js';
import {
  derivarEntregableAnalistaCM,
  derivarEntregableCoordinadorCM,
  listarBandejaEntregablesServicios,
  listarBandejaPreparacionExpedientePago,
  listarTrazabilidadEntregable,
} from '../server/lib/entregablesServicios.js';
import { inicializarEstadoResponsableEntregable } from '../server/lib/entregableEstadoPersistido.js';
import { pagoMenuItems } from '../src/views/ejecucion/derivacionPagoView.js';
import { entregableMenuItems } from '../src/views/ejecucion/presentacionEntregableView.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import { EVENTOS } from '../shared/workflow/eventos.js';
import { getTransition } from '../shared/workflow/transiciones.js';

let passed = 0;
let failed = 0;
const fixture = {
  ordenIds: [],
  ordenEntregaIds: [],
  recepcionIds: [],
  actaIds: [],
  usuarioIds: [],
};

function ok(c, m) {
  if (c) { passed++; console.log(`  ✓ ${m}`); }
  else { failed++; console.error(`  ✗ ${m}`); }
}
function pdf(label) {
  return Buffer.from(`%PDF-1.4\n% ${label}\n%%EOF`).toString('base64');
}
function trackOrden(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.ordenIds.includes(n)) fixture.ordenIds.push(n);
}
function trackEntrega(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.ordenEntregaIds.includes(n)) fixture.ordenEntregaIds.push(n);
}
function trackUsuario(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 0 && !fixture.usuarioIds.includes(n)) fixture.usuarioIds.push(n);
}

async function cleanup() {
  for (const oid of fixture.ordenIds) {
    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_observaciones WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_conformidad_acta_visados WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_conformidad_actas WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_recepcion_documentos WHERE recepcion_id = ANY(SELECT id FROM entregable_recepciones WHERE orden_id=$1)', [oid]);
    await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [oid]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [oid]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [oid]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [oid]);
  }
  if (fixture.usuarioIds.length) {
    await query('DELETE FROM workflow_observaciones WHERE usuario_origen_id = ANY($1::int[]) OR usuario_destino_id = ANY($1::int[])', [fixture.usuarioIds]);
    await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [fixture.usuarioIds]);
  }
}

async function snapshotBienes() {
  const result = {};
  for (const table of ['recepcion_bienes_expedientes', 'recepciones_bienes', 'recepcion_bienes_eventos']) {
    result[table] = Number((await query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n);
  }
  return JSON.stringify(result);
}

console.log('\n=== RC8.15.6F1 — Frontera Pagos / PREPARACION_EXPEDIENTE_PAGO ===\n');

const bienesBefore = await snapshotBienes();

try {
  ok(getTransition({
    tipoContratacion: 'SERVICIO',
    etapaOrigen: ETAPAS.REVISION_COORDINADOR_CM,
    eventoCodigo: EVENTOS.ENTREGABLE_DERIVADO_ANALISTA_CM,
  })?.etapa_destino === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
  'transición Coordinador → Analista CM destina a PREPARACION_EXPEDIENTE_PAGO');

  const nonce = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const base = (await query(`
    SELECT oc.requerimiento_id, oc.proveedor_id FROM ordenes_contratacion oc
    WHERE oc.proveedor_id IS NOT NULL ORDER BY oc.id LIMIT 1
  `)).rows[0];

  async function crearUsuario(sufijo, perfil, centro = 'OA') {
    const row = (await query(`
      INSERT INTO usuarios (dni, username, nombre, rol, cargo, activo, permisos, centro, codigo_centro_costo)
      VALUES ($1,$2,$3,'usuario',$4,TRUE,$5::jsonb,$6,$6) RETURNING *
    `, [
      `F1${sufijo}${nonce}`.slice(0, 20),
      `f1_${nonce}_${sufijo}`,
      `Fixture F1 ${sufijo}`,
      perfil === 'AREA_USUARIA' ? 'Área Usuaria' : (perfil === 'COORDINADOR_CM' ? 'Coordinador CM' : 'Analista CM'),
      JSON.stringify({ perfil }),
      centro,
    ])).rows[0];
    trackUsuario(row.id);
    return row;
  }

  const au = await crearUsuario('au', 'AREA_USUARIA');
  const coord = await crearUsuario('coord', 'COORDINADOR_CM');
  const analista = await crearUsuario('anal', 'ANALISTA_CM');
  const otroAnalista = await crearUsuario('otro', 'ANALISTA_CM');

  const ctx = (user, perfil) => ({
    id: Number(user.id),
    username: user.username,
    nombre: user.nombre,
    cargo: user.cargo,
    rol: user.rol,
    permisos: { perfil },
  });

  const ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,900,'EN_EJECUCION','SERVICIO') RETURNING id
  `, [base.requerimiento_id, base.proveedor_id, `RC8156F1${nonce}`])).rows[0].id);
  trackOrden(ordenId);

  const eid = Number((await query(`
    INSERT INTO orden_entregas (orden_id, numero_entrega, tipo_entrega, descripcion, dias_plazo, fecha_maxima, importe, estado)
    VALUES ($1,1,'ENTREGABLE','F1 E1',10,CURRENT_DATE+10,100,'ACTIVO') RETURNING id
  `, [ordenId])).rows[0].id);
  trackEntrega(eid);
  await inicializarEstadoResponsableEntregable(eid, { actualizadoPor: 'test-f1' });
  await query(`
    UPDATE entregable_estado_vigente SET responsable_tipo='PERSONA', responsable_usuario_id=$2
    WHERE orden_entrega_id=$1
  `, [eid, au.id]);
  await query(`
    UPDATE entregable_asignaciones SET usuario_id=$2, unidad_codigo='AREA_USUARIA', tipo_responsable='PERSONA'
    WHERE orden_entrega_id=$1 AND activo=TRUE
  `, [eid, au.id]);
  const recepcion = (await query(`
    INSERT INTO entregable_recepciones (
      orden_entrega_id, orden_id, numero_recepcion, tipo_recepcion,
      fecha_recepcion_mesa_partes, numero_expediente_sgd, estado, registrado_por
    ) VALUES ($1,$2,1,'INICIAL',CURRENT_DATE,$3,'RECIBIDO','test-f1') RETURNING *
  `, [eid, ordenId, `SGD-F1-${nonce}`])).rows[0];
  const acta = (await query(`
    INSERT INTO entregable_conformidad_actas (
      orden_id, orden_entrega_id, recepcion_id, numero_acta, version,
      estado_documental, generado_at, generado_por
    ) VALUES ($1,$2,$3,$4,1,'ACTA_CONFORMIDAD_GENERADA',NOW(),'test-f1') RETURNING *
  `, [ordenId, eid, recepcion.id, `ACTA-F1-${nonce}`])).rows[0];
  await query(`
    INSERT INTO entregable_conformidad_acta_visados (
      orden_id, orden_entrega_id, acta_id, version, nombre, mime_type,
      contenido_base64, estado_documental, vigente, created_by
    ) VALUES ($1,$2,$3,1,$4,'application/pdf',$5,'ACTA_CONFORMIDAD_FIRMADA',TRUE,'test-f1')
  `, [ordenId, eid, acta.id, `firmada-f1.pdf`, pdf('f1')]);

  await derivarEntregableCoordinadorCM(
    eid, { responsable_id: coord.id }, ctx(au, 'AREA_USUARIA'), au.username,
  );
  const resultado = await derivarEntregableAnalistaCM(
    eid, { responsable_id: analista.id }, ctx(coord, 'COORDINADOR_CM'), coord.username,
  );

  ok(resultado.estado?.etapaCodigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
    'Coordinador deriva a Analista CM → etapa PREPARACION_EXPEDIENTE_PAGO');
  ok(Number(resultado.estado?.responsableUsuarioId) === Number(analista.id),
    'responsable = Analista CM seleccionado');

  const bandejaPe = await listarBandejaEntregablesServicios(ctx(analista, 'ANALISTA_CM'));
  const filaPe = bandejaPe.find((row) => Number(row.orden_entrega_id) === eid);
  ok(Boolean(filaPe), 'expediente visible en bandeja Presentación de Entregables');
  ok(filaPe?.estado_etapa_codigo === ETAPAS.PREPARACION_EXPEDIENTE_PAGO,
    'Presentación muestra etapa Preparación de expediente para Pago');
  const menuPe = entregableMenuItems(filaPe);
  ok(menuPe.some((item) => item.act === 'verExpediente')
    && menuPe.some((item) => item.act === 'verTrazabilidad')
    && !menuPe.some((item) => ['derivarPago', 'observarEntregable', 'evaluarPenalidad'].includes(item.act)),
  'Presentación solo expone acciones de consulta para etapa Pagos');

  const bandejaPagos = await listarBandejaPreparacionExpedientePago(ctx(analista, 'ANALISTA_CM'));
  const filaPagos = bandejaPagos.find((row) => Number(row.orden_entrega_id) === eid);
  ok(Boolean(filaPagos), 'expediente aparece en bandeja Pagos');
  ok(pagoMenuItems(filaPagos).length >= 2,
    'Analista responsable tiene acciones operativas en Pagos');

  const bandejaOtro = await listarBandejaPreparacionExpedientePago(ctx(otroAnalista, 'ANALISTA_CM'));
  const filaOtro = bandejaOtro.find((row) => Number(row.orden_entrega_id) === eid);
  ok(filaOtro && pagoMenuItems(filaOtro).length === 0,
    'otro Analista CM no obtiene acciones operativas');

  const filaPeCoord = (await listarBandejaEntregablesServicios(ctx(coord, 'COORDINADOR_CM')))
    .find((row) => Number(row.orden_entrega_id) === eid);
  ok(Boolean(filaPeCoord), 'Coordinador ve el entregable en bandeja Presentación (seguimiento)');
  ok(!entregableMenuItems(filaPeCoord || {}).some((item) => item.act === 'derivarAnalistaCM'),
    'Coordinador no obtiene acciones operativas en etapa Pagos desde Presentación');

  const filaPeLegacyMenu = filaPagos
    ? entregableMenuItems({ ...filaPagos, estado_etapa_codigo: ETAPAS.PREPARACION_EXPEDIENTE_PAGO })
    : [];
  ok(!filaPeLegacyMenu.some((item) => item.act === 'derivarPago' || item.act === 'observarEntregable'),
    'Presentación no expone acciones Analista CM para etapa Pagos');

  const traza = await listarTrazabilidadEntregable(eid, ctx(analista, 'ANALISTA_CM'));
  const codigos = traza.map((e) => e.evento_codigo);
  ok(codigos.includes(EVENTOS.ENTREGABLE_DERIVADO_COORDINADOR_CM)
    && codigos.includes(EVENTOS.ENTREGABLE_DERIVADO_ANALISTA_CM),
  'trazabilidad conserva AU → Coordinador → Analista');

  ok(await snapshotBienes() === bienesBefore, 'flujo de Recepción de Bienes intacto');
} catch (error) {
  ok(false, `fixture (${error.message})`);
  console.error(error);
} finally {
  try {
    await cleanup();
  } catch (error) {
    failed++;
    console.error('  ✗ cleanup falló:', error.message);
  }
  const residuos = Number((await query(`
    SELECT COUNT(*)::int AS n FROM ordenes_contratacion WHERE numero_orden ~ '^RC8156F1'
  `)).rows[0].n);
  ok(residuos === 0, 'sin residuos RC8156F1');
  await pool.end();
}

console.log(`\n=== Resultado F1: ${passed} OK, ${failed} FAIL ===\n`);
if (failed) process.exit(1);
