/**
 * Reparación idempotente — OS 1105 / Entregable 1
 * Restaura responsable AU tras subsanación dirigida previa al fix F-2C.
 *
 * Uso:
 *   node scripts/repair-os1105-e1-responsable-post-f2c.mjs           # dry-run
 *   node scripts/repair-os1105-e1-responsable-post-f2c.mjs --apply     # aplicar
 */
import pool, { query } from '../server/db.js';
import { listarBandejaEntregablesServicios } from '../server/lib/entregablesServicios.js';
import { reasignarResponsableEntregableMismaEtapa } from '../server/lib/entregableEstadoPersistido.js';
import { clasificarObservacionEntregable } from '../server/lib/observacionesEntregableRouting.js';

const APPLY = process.argv.includes('--apply');
const OS_NUMERO = '1105';
const ENTREGA_NUMERO = 1;

async function cargarContexto(client = null) {
  const run = client ? (sql, p) => client.query(sql, p) : (sql, p) => query(sql, p);
  const { rows: ordenRows } = await run(`
    SELECT oc.id AS orden_id, oc.requerimiento_id, oc.numero_orden
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = $1
    ORDER BY oc.id ASC LIMIT 1
  `, [OS_NUMERO]);
  const orden = ordenRows[0];
  if (!orden) throw new Error(`OS ${OS_NUMERO} no encontrada`);

  const { rows: entregaRows } = await run(`
    SELECT oe.id AS orden_entrega_id, oe.numero_entrega, oe.estado
    FROM orden_entregas oe
    WHERE oe.orden_id = $1 AND oe.numero_entrega = $2 AND oe.estado = 'ACTIVO'
    ORDER BY oe.id DESC LIMIT 1
  `, [orden.orden_id, ENTREGA_NUMERO]);
  const entrega = entregaRows[0];
  if (!entrega) throw new Error(`Entregable ${ENTREGA_NUMERO} ACTIVO no encontrado en OS ${OS_NUMERO}`);

  const { rows: estadoRows } = await run(`
    SELECT ev.*, u.username AS responsable_username, u.nombre AS responsable_nombre
    FROM entregable_estado_vigente ev
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE ev.orden_entrega_id = $1
  `, [entrega.orden_entrega_id]);

  const { rows: asigRows } = await run(`
    SELECT a.*, u.username, u.nombre
    FROM entregable_asignaciones a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.orden_entrega_id = $1
    ORDER BY a.activo DESC, a.asignado_at DESC, a.id DESC
  `, [entrega.orden_entrega_id]);

  const { rows: obsRows } = await run(`
    SELECT eo.*,
      wo.usuario_origen_id, wo.usuario_destino_id, wo.id AS workflow_id,
      uo.username AS origen_username, ud.username AS destino_username
    FROM entregable_observaciones eo
    LEFT JOIN workflow_observaciones wo ON wo.id = eo.workflow_observacion_id
    LEFT JOIN usuarios uo ON uo.id = wo.usuario_origen_id
    LEFT JOIN usuarios ud ON ud.id = wo.usuario_destino_id
    WHERE eo.orden_entrega_id = $1
      AND eo.estado = 'OBS_SUBSANADA'
      AND eo.workflow_observacion_id IS NOT NULL
    ORDER BY eo.subsanado_at DESC NULLS LAST, eo.id DESC
    LIMIT 1
  `, [entrega.orden_entrega_id]);

  const { rows: e2Rows } = await run(`
    SELECT oe.id AS orden_entrega_id, ev.responsable_usuario_id, u.username
    FROM orden_entregas oe
    LEFT JOIN entregable_estado_vigente ev ON ev.orden_entrega_id = oe.id
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE oe.orden_id = $1 AND oe.numero_entrega = 2 AND oe.estado = 'ACTIVO'
    ORDER BY oe.id DESC LIMIT 1
  `, [orden.orden_id]);

  return {
    orden,
    entrega,
    estado: estadoRows[0] || null,
    asignaciones: asigRows,
    observacion: obsRows[0] || null,
    e2: e2Rows[0] || null,
  };
}

function evaluarReparacion(ctx) {
  const obs = ctx.observacion;
  const estado = ctx.estado;
  const activa = ctx.asignaciones.find((a) => a.activo === true) || null;

  if (!obs) {
    return { accion: 'SKIP', motivo: 'No hay observación dirigida subsanada en E1' };
  }
  if (clasificarObservacionEntregable(obs) !== 'DIRIGIDA_CANONICA') {
    return { accion: 'SKIP', motivo: 'La observación subsanada no es dirigida canónica' };
  }
  const origenId = Number(obs.usuario_origen_id);
  const destinoId = Number(obs.usuario_destino_id);
  if (!(origenId > 0 && destinoId > 0)) {
    return { accion: 'SKIP', motivo: 'Observación sin origen/destino institucional' };
  }
  if (String(estado?.etapa_codigo || '').toUpperCase() !== 'PRESENTACION_ENTREGABLES') {
    return { accion: 'SKIP', motivo: `Etapa actual ${estado?.etapa_codigo || '—'} no es PRESENTACION_ENTREGABLES` };
  }

  const responsableActual = Number(estado?.responsable_usuario_id);
  if (responsableActual === origenId) {
    return {
      accion: 'OK',
      motivo: 'Responsable ya restaurado al emisor AU',
      origenId,
      destinoId,
      activa,
    };
  }
  if (responsableActual !== destinoId) {
    return {
      accion: 'SKIP',
      motivo: `Responsable actual (${estado?.responsable_username || responsableActual}) no coincide con destinatario (${obs.destino_username || destinoId})`,
    };
  }

  return {
    accion: 'REPAIR',
    motivo: 'Restaurar emisor AU tras subsanación dirigida pre-F2C',
    origenId,
    destinoId,
    origenUsername: obs.origen_username,
    destinoUsername: obs.destino_username,
    observacionId: obs.id,
    workflowId: obs.workflow_id,
    activa,
  };
}

async function verificarPost(ctx, wvasquezId) {
  const post = await cargarContexto();
  const e1Ok = Number(post.estado?.responsable_usuario_id) === Number(wvasquezId);
  const e2Resp = post.e2?.responsable_usuario_id != null
    ? Number(post.e2.responsable_usuario_id)
    : null;
  const e2Global = (await query(`
    SELECT eev.responsable_usuario_id, u.username
    FROM expediente_estado_vigente eev
    LEFT JOIN usuarios u ON u.id = eev.responsable_usuario_id
    WHERE eev.requerimiento_id = $1
  `, [ctx.orden.requerimiento_id])).rows[0];
  const e2Ok = e2Resp != null
    ? e2Resp === Number(wvasquezId)
    : Number(e2Global?.responsable_usuario_id) === Number(wvasquezId);

  const wvasquezUser = (await query(`
    SELECT id, username, nombre, rol, permisos FROM usuarios WHERE id = $1
  `, [wvasquezId])).rows[0];
  const bandeja = wvasquezUser
    ? await listarBandejaEntregablesServicios({
      id: Number(wvasquezUser.id),
      rol: wvasquezUser.rol,
      username: wvasquezUser.username,
      permisos: wvasquezUser.permisos,
    })
    : [];
  const filaE1 = bandeja.find((r) => Number(r.orden_entrega_id) === Number(ctx.entrega.orden_entrega_id));
  const jcrisostomoId = Number(ctx.observacion?.usuario_destino_id);

  return {
    e1Responsable: post.estado?.responsable_username || post.estado?.responsable_usuario_id,
    e1Ok,
    e2Responsable: post.e2?.username || e2Global?.username || 'fallback global',
    e2Ok,
    permisosE1: filaE1 ? {
      modificar: filaE1.puede_modificar_entregable,
      conformidad: filaE1.puede_gestionar_conformidad,
      observar: filaE1.puede_observar,
    } : null,
    jcrisostomoYaNoResponsable: Number(post.estado?.responsable_usuario_id) !== jcrisostomoId,
    eventosCount: Number((await query(`
      SELECT COUNT(*)::int AS n FROM entregable_eventos WHERE orden_entrega_id = $1
    `, [ctx.entrega.orden_entrega_id])).rows[0].n),
    obsCount: Number((await query(`
      SELECT COUNT(*)::int AS n FROM entregable_observaciones WHERE orden_entrega_id = $1
    `, [ctx.entrega.orden_entrega_id])).rows[0].n),
  };
}

console.log(`\n=== Reparación OS ${OS_NUMERO} E${ENTREGA_NUMERO} (F-2C histórico) ===`);
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const ctx = await cargarContexto();
console.log('Diagnóstico previo:');
console.log(`  orden_entrega_id: ${ctx.entrega.orden_entrega_id}`);
console.log(`  responsable actual: ${ctx.estado?.responsable_nombre || '—'} (${ctx.estado?.responsable_username || '—'}, id ${ctx.estado?.responsable_usuario_id ?? 'null'})`);
console.log(`  etapa: ${ctx.estado?.etapa_codigo || '—'}`);
if (ctx.observacion) {
  console.log(`  obs subsanada id ${ctx.observacion.id}: ${ctx.observacion.origen_username} → ${ctx.observacion.destino_username} (workflow ${ctx.observacion.workflow_id})`);
} else {
  console.log('  obs subsanada dirigida: ninguna');
}
const activa = ctx.asignaciones.find((a) => a.activo);
console.log(`  asignación activa: ${activa?.username || '—'} (id ${activa?.usuario_id ?? 'null'}, origen ${activa?.origen_asignacion || '—'})`);

const plan = evaluarReparacion(ctx);
console.log(`\nEvaluación: ${plan.accion} — ${plan.motivo}\n`);

if (plan.accion === 'REPAIR' && APPLY) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await reasignarResponsableEntregableMismaEtapa({
      ordenEntregaId: ctx.entrega.orden_entrega_id,
      usuarioDestinoId: plan.origenId,
      eventoCodigo: 'ENTREGABLE_OBSERVACION_SUBSANADA',
      ejecutadoPor: 'repair-os1105-e1-f2c',
      motivo: 'Reparación histórica post subsanación dirigida (pre F-2C)',
      metadata: {
        origen: 'REPARACION_HISTORICA_F2C',
        observacion_id: plan.observacionId,
        workflow_observacion_id: plan.workflowId,
        os: OS_NUMERO,
        entrega: ENTREGA_NUMERO,
      },
      client,
    });
    await client.query('COMMIT');
    console.log('Reparación aplicada.\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error aplicando reparación:', error.message);
    await pool.end();
    process.exit(1);
  } finally {
    client.release();
  }
} else if (plan.accion === 'REPAIR') {
  console.log('Dry-run: se restauraría responsable');
  console.log(`  destino actual (${plan.destinoUsername}, id ${plan.destinoId})`);
  console.log(`  → emisor AU (${plan.origenUsername}, id ${plan.origenId})\n`);
}

if (plan.accion === 'REPAIR' || plan.accion === 'OK') {
  const ver = await verificarPost(ctx, plan.origenId || Number(ctx.observacion?.usuario_origen_id));
  console.log('Verificación:');
  console.log(`  E1 responsable: ${ver.e1Responsable} ${ver.e1Ok ? '✓' : '✗'}`);
  console.log(`  E2 responsable: ${ver.e2Responsable} ${ver.e2Ok ? '✓' : '✗'}`);
  console.log(`  jcrisostomo ya no responsable E1: ${ver.jcrisostomoYaNoResponsable ? '✓' : '✗'}`);
  if (ver.permisosE1) {
    console.log(`  permisos wvasquez E1: modificar=${ver.permisosE1.modificar}, acta=${ver.permisosE1.conformidad}, observar=${ver.permisosE1.observar}`);
  }
  console.log(`  historial conservado: eventos=${ver.eventosCount}, observaciones=${ver.obsCount}`);
}

await pool.end();
if (plan.accion === 'REPAIR' && !APPLY) {
  console.log('\nEjecute con --apply para aplicar.\n');
  process.exit(0);
}
if (plan.accion === 'SKIP') {
  process.exit(1);
}
