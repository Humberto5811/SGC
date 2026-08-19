/**
 * RC8.15.6C-2A — Estado, responsable, asignación e historial por entregable.
 * Usa una orden fixture y no crea estado para la OS 1105.
 */
import pool, { query } from '../server/db.js';
import { EVENTOS } from '../shared/workflow/eventos.js';
import { ETAPAS } from '../shared/workflow/etapas.js';
import { getTransition } from '../shared/workflow/transiciones.js';
import {
  inicializarEstadoResponsableEntregable,
  listarEstadosResponsablesEntregables,
  obtenerEstadoResponsableEntregable,
  transicionarEntregable,
} from '../server/lib/entregableEstadoPersistido.js';

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
  else { failed += 1; console.error(`  ✗ ${message}`); }
}

async function tableExists(table) {
  return Boolean((await query('SELECT to_regclass($1) AS t', [`public.${table}`])).rows[0]?.t);
}

async function snapshotOs1105() {
  return JSON.stringify((await query(`
    SELECT oc.id,
      (SELECT COUNT(*)::int FROM entregable_estado_vigente eev WHERE eev.orden_id=oc.id) AS estados,
      (SELECT COUNT(*)::int FROM entregable_asignaciones ea WHERE ea.orden_id=oc.id) AS asignaciones,
      (SELECT COUNT(*)::int FROM entregable_eventos ee WHERE ee.orden_id=oc.id) AS eventos
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

async function snapshotExpediente(requerimientoId) {
  return JSON.stringify({
    estado: (await query(
      'SELECT * FROM expediente_estado_vigente WHERE requerimiento_id=$1',
      [requerimientoId],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM expediente_asignaciones WHERE requerimiento_id=$1 ORDER BY id',
      [requerimientoId],
    )).rows,
  });
}

console.log('\n=== RC8.15.6C-2A — Estado y responsable por entregable ===\n');

ok(await tableExists('entregable_estado_vigente'),
  'A. tabla entregable_estado_vigente existe');
ok(await tableExists('entregable_asignaciones'),
  'B. tabla entregable_asignaciones existe');
ok(await tableExists('entregable_eventos'),
  'historial específico entregable_eventos existe');

const indexes = (await query(`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname='public'
    AND tablename IN ('entregable_estado_vigente','entregable_asignaciones')
`)).rows;
ok(indexes.some((i) => i.indexname === 'uq_entregable_estado_vigente_entrega'
  && /UNIQUE/i.test(i.indexdef) && /orden_entrega_id/i.test(i.indexdef)),
'C. UNIQUE de estado vigente por orden_entrega_id');
ok(indexes.some((i) => i.indexname === 'uq_entregable_asignacion_activa'
  && /UNIQUE/i.test(i.indexdef) && /WHERE \(activo = true\)/i.test(i.indexdef)),
'D. máximo una asignación activa por entregable');

const os1105Before = await snapshotOs1105();
const bienesBefore = await snapshotBienes();
let ordenId = null;
let requerimientoId = null;
let expedienteBefore = null;

try {
  const base = (await query(`
    SELECT r.id AS requerimiento_id, oc.proveedor_id
    FROM requerimientos r
    JOIN expediente_estado_vigente e ON e.requerimiento_id=r.id
    JOIN ordenes_contratacion oc ON oc.requerimiento_id=r.id
    WHERE e.etapa_codigo='PRESENTACION_ENTREGABLES'
      AND oc.proveedor_id IS NOT NULL
    ORDER BY r.id
    LIMIT 1
  `)).rows[0];
  const usuario = (await query(`
    SELECT id, COALESCE(NULLIF(username,''), NULLIF(nombre,''), id::text) AS actor
    FROM usuarios
    ORDER BY id
    LIMIT 1
  `)).rows[0];
  if (!base?.requerimiento_id || !base?.proveedor_id || !usuario?.id) {
    throw new Error('No existe base mínima para fixture de transición');
  }
  requerimientoId = Number(base.requerimiento_id);
  expedienteBefore = await snapshotExpediente(requerimientoId);

  ordenId = Number((await query(`
    INSERT INTO ordenes_contratacion (
      requerimiento_id, proveedor_id, tipo_orden, numero_orden, anio_orden,
      fecha_orden, monto_total, estado, tipo_contratacion
    ) VALUES ($1,$2,'OS',$3,2099,CURRENT_DATE,300,'EN_EJECUCION','SERVICIO')
    RETURNING id
  `, [requerimientoId, base.proveedor_id, `RC8156C2A${Date.now()}`])).rows[0].id);

  async function crearEntrega(numero) {
    return Number((await query(`
      INSERT INTO orden_entregas (
        orden_id, numero_entrega, tipo_entrega, descripcion,
        dias_plazo, fecha_maxima, importe, estado
      ) VALUES ($1,$2,'ENTREGABLE',$3,10,CURRENT_DATE+10,100,'ACTIVO')
      RETURNING id
    `, [ordenId, numero, `Fixture C2A ${numero}`])).rows[0].id);
  }

  const e1 = await crearEntrega(1);
  const e2 = await crearEntrega(2);
  const e3 = await crearEntrega(3);
  const global = await obtenerEstadoResponsableEntregable(e1);
  const noBackfill = Number((await query(`
    SELECT COUNT(*)::int AS n
    FROM entregable_estado_vigente
    WHERE orden_entrega_id=ANY($1::int[])
  `, [[e1, e2, e3]])).rows[0].n);
  ok(global?.fallbackGlobal === true
    && global.fuenteEstado === 'EXPEDIENTE_GLOBAL_FALLBACK'
    && noBackfill === 0,
  'E. fallback global funciona sin insertar estado específico');

  await inicializarEstadoResponsableEntregable(e1, { actualizadoPor: 'test-c2a' });
  await inicializarEstadoResponsableEntregable(e2, { actualizadoPor: 'test-c2a' });
  const listado = await listarEstadosResponsablesEntregables([e1, e2]);
  ok(listado.get(e1)?.fuenteEstado === 'ENTREGABLE'
    && listado.get(e1)?.fallbackGlobal === false
    && listado.get(e1)?.etapaCodigo === ETAPAS.PRESENTACION_ENTREGABLES,
  'F. estado específico tiene prioridad sobre fallback');

  const e2Before = JSON.stringify({
    estado: (await query(
      'SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1',
      [e2],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM entregable_asignaciones WHERE orden_entrega_id=$1 ORDER BY id',
      [e2],
    )).rows,
  });
  const evento = EVENTOS.ENTREGABLE_DERIVADO_COORDINADOR_CM;
  const transicionCatalogo = getTransition({
    tipoContratacion: 'SERVICIO',
    etapaOrigen: ETAPAS.PRESENTACION_ENTREGABLES,
    eventoCodigo: evento,
  });
  const cambioE1 = await transicionarEntregable({
    ordenEntregaId: e1,
    evento,
    usuarioOrigenId: usuario.id,
    ejecutadoPor: usuario.actor,
    usuarioDestinoId: usuario.id,
    unidadDestino: 'COORDINADOR_CM',
    motivo: 'Fixture aislamiento multientregable',
    metadata: { rc: 'RC8.15.6C-2A' },
  });
  const e1After = await obtenerEstadoResponsableEntregable(e1);
  const e2After = JSON.stringify({
    estado: (await query(
      'SELECT * FROM entregable_estado_vigente WHERE orden_entrega_id=$1',
      [e2],
    )).rows,
    asignaciones: (await query(
      'SELECT * FROM entregable_asignaciones WHERE orden_entrega_id=$1 ORDER BY id',
      [e2],
    )).rows,
  });
  ok(e1After?.etapaCodigo === ETAPAS.REVISION_COORDINADOR_CM
    && e1After?.responsableTipo === 'PERSONA'
    && Number(e1After?.responsableUsuarioId) === Number(usuario.id),
  'G. únicamente E1 cambia a Revisión Coordinador CM');
  ok(cambioE1.asignacion?.activo === true
    && Number(cambioE1.asignacion?.usuario_id) === Number(usuario.id),
  'H. asignación activa de E1 cambia a Coordinador X');
  ok(e2After === e2Before, 'I. estado y asignación activa de E2 permanecen exactamente iguales');

  const historialE1 = (await query(`
    SELECT COUNT(*)::int AS eventos
    FROM entregable_eventos
    WHERE orden_entrega_id=$1
      AND evento_codigo=$2
      AND etapa_anterior_codigo='PRESENTACION_ENTREGABLES'
      AND etapa_nueva_codigo='REVISION_COORDINADOR_CM'
  `, [e1, evento])).rows[0];
  const asignacionesE1 = (await query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE activo=TRUE)::int AS activas,
      COUNT(*) FILTER (WHERE activo=FALSE AND cerrado_at IS NOT NULL)::int AS cerradas
    FROM entregable_asignaciones
    WHERE orden_entrega_id=$1
  `, [e1])).rows[0];
  ok(Number(historialE1.eventos) === 1
    && Number(asignacionesE1.total) === 2
    && Number(asignacionesE1.activas) === 1
    && Number(asignacionesE1.cerradas) === 1,
  'J. historial y asignación anterior de E1 se conservan');
  ok(e1After?.responsableTipo === 'PERSONA'
    && Number(e1After.responsableUsuarioId) === Number(usuario.id),
  'K. responsable PERSONA es válido');

  await transicionarEntregable({
    ordenEntregaId: e3,
    evento,
    usuarioOrigenId: usuario.id,
    ejecutadoPor: usuario.actor,
    unidadDestino: 'COORDINADOR_CM',
    motivo: 'Fixture responsable unidad',
  });
  const e3After = await obtenerEstadoResponsableEntregable(e3);
  ok(e3After?.responsableTipo === 'UNIDAD'
    && e3After?.responsableUsuarioId == null
    && e3After?.responsableUnidad === 'COORDINADOR_CM',
  'L. responsable UNIDAD es válido sin inventar usuario');
  ok(transicionCatalogo?.etapa_destino === ETAPAS.REVISION_COORDINADOR_CM
    && cambioE1.estado?.etapa_codigo === transicionCatalogo.etapa_destino,
  'M. transición usa el catálogo canónico compartido');
  ok(await snapshotBienes() === bienesBefore, 'N. Recepción de Bienes no fue afectada');
  ok(await snapshotOs1105() === os1105Before, 'O. OS 1105 no fue modificada ni backfilleada');
  ok(await snapshotExpediente(requerimientoId) === expedienteBefore
    && cambioE1.expedienteGlobalActualizado === false,
  'P. expediente_estado_vigente y asignaciones globales no fueron modificados');
} catch (error) {
  ok(false, `integración completada sin error inesperado (${error.message})`);
} finally {
  if (ordenId) {
    await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
    await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
  }
}

await pool.end();
console.log(`\n=== Resultado RC8.15.6C-2A: ${passed} OK, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
