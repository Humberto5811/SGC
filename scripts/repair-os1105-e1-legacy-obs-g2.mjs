/**
 * Reparación idempotente — OS 1105 / Entregable 1 (orden_entrega_id=10)
 *
 * Corrige inconsistencias históricas pre-G2:
 * - obs #89 legacy abierta bloqueando acciones CM
 * - workflow #34 OBS_EMITIDA mientras entregable_obs #64 ya OBS_SUBSANADA
 *
 * Uso:
 *   node scripts/repair-os1105-e1-legacy-obs-g2.mjs           # dry-run
 *   node scripts/repair-os1105-e1-legacy-obs-g2.mjs --apply     # aplicar
 */
import pool, { query } from '../server/db.js';
import { listarBandejaEntregablesServicios } from '../server/lib/entregablesServicios.js';
import { clasificarObservacionEntregable } from '../server/lib/observacionesEntregableRouting.js';
import { PERFILES_FUNCIONALES, resolveFunctionalProfiles } from '../server/utils/userRoleCatalog.js';

const APPLY = process.argv.includes('--apply');
const OS_NUMERO = '1105';
const ENTREGA_NUMERO = 1;
const OBS_LEGACY_ID = 89;
const OBS_SUBSANADA_ID = 64;
const WORKFLOW_DESYNC_ID = 34;
const RESPONSABLE_ESPERADO_USERNAME = 'wrodriguez';

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
    SELECT oe.id AS orden_entrega_id, oe.numero_entrega, oe.estado, oe.orden_id
    FROM orden_entregas oe
    WHERE oe.orden_id = $1 AND oe.numero_entrega = $2 AND oe.estado = 'ACTIVO'
    ORDER BY oe.id DESC LIMIT 1
  `, [orden.orden_id, ENTREGA_NUMERO]);
  const entrega = entregaRows[0];
  if (!entrega) throw new Error(`Entregable ${ENTREGA_NUMERO} ACTIVO no encontrado en OS ${OS_NUMERO}`);

  const { rows: estadoRows } = await run(`
    SELECT ev.*, u.username AS responsable_username, u.nombre AS responsable_nombre, u.cargo
    FROM entregable_estado_vigente ev
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE ev.orden_entrega_id = $1
  `, [entrega.orden_entrega_id]);

  const obs89 = (await run(`
    SELECT eo.*,
      wo.id AS workflow_id, wo.estado AS workflow_estado,
      wo.usuario_origen_id, wo.usuario_destino_id
    FROM entregable_observaciones eo
    LEFT JOIN workflow_observaciones wo ON wo.id = eo.workflow_observacion_id
    WHERE eo.id = $1 AND eo.orden_entrega_id = $2
  `, [OBS_LEGACY_ID, entrega.orden_entrega_id])).rows[0] || null;

  const obs64 = (await run(`
    SELECT eo.*,
      wo.id AS workflow_id, wo.estado AS workflow_estado,
      wo.usuario_origen_id, wo.usuario_destino_id,
      wo.origen_submodulo_codigo, wo.documentos,
      uo.username AS origen_username, ud.username AS destino_username
    FROM entregable_observaciones eo
    LEFT JOIN workflow_observaciones wo ON wo.id = eo.workflow_observacion_id
    LEFT JOIN usuarios uo ON uo.id = wo.usuario_origen_id
    LEFT JOIN usuarios ud ON ud.id = wo.usuario_destino_id
    WHERE eo.id = $1 AND eo.orden_entrega_id = $2
  `, [OBS_SUBSANADA_ID, entrega.orden_entrega_id])).rows[0] || null;

  const workflow34 = (await run(`
    SELECT wo.*, uo.username AS origen_username, ud.username AS destino_username
    FROM workflow_observaciones wo
    LEFT JOIN usuarios uo ON uo.id = wo.usuario_origen_id
    LEFT JOIN usuarios ud ON ud.id = wo.usuario_destino_id
    WHERE wo.id = $1
  `, [WORKFLOW_DESYNC_ID])).rows[0] || null;

  const { rows: obsAbiertas } = await run(`
    SELECT id, estado, observado_por, recepcion_id, observado_at, workflow_observacion_id
    FROM entregable_observaciones
    WHERE orden_entrega_id = $1 AND estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
    ORDER BY id
  `, [entrega.orden_entrega_id]);

  const { rows: eventosRelacionados } = await run(`
    SELECT id, evento_codigo, ejecutado_por, motivo, ocurrido_at,
      metadata_json::text AS metadata_json
    FROM entregable_eventos
    WHERE orden_entrega_id = $1
      AND (
        metadata_json::text ILIKE '%"observacion_id": ${OBS_LEGACY_ID}%'
        OR metadata_json::text ILIKE '%"observacion_id":${OBS_LEGACY_ID}%'
        OR metadata_json::text ILIKE '%"observacion_id": ${OBS_SUBSANADA_ID}%'
        OR metadata_json::text ILIKE '%"observacion_id":${OBS_SUBSANADA_ID}%'
        OR metadata_json::text ILIKE '%"workflow_observacion_id": ${WORKFLOW_DESYNC_ID}%'
        OR metadata_json::text ILIKE '%"workflow_observacion_id":${WORKFLOW_DESYNC_ID}%'
        OR motivo ILIKE '%observ%'
      )
    ORDER BY id DESC
    LIMIT 15
  `, [entrega.orden_entrega_id]);

  const { rows: e2Rows } = await run(`
    SELECT oe.id AS orden_entrega_id, ev.etapa_codigo, ev.responsable_usuario_id, u.username
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
    obs89,
    obs64,
    workflow34,
    obsAbiertas,
    eventosRelacionados,
    e2: e2Rows[0] || null,
  };
}

function evaluarPlan(ctx) {
  const pasos = [];
  const bloqueos = [];

  if (Number(ctx.entrega.orden_entrega_id) !== 10) {
    bloqueos.push(`orden_entrega_id esperado 10, encontrado ${ctx.entrega.orden_entrega_id}`);
  }
  if (String(ctx.estado?.etapa_codigo || '').toUpperCase() !== 'REVISION_COORDINADOR_CM') {
    bloqueos.push(`etapa esperada REVISION_COORDINADOR_CM, actual ${ctx.estado?.etapa_codigo || '—'}`);
  }
  if (String(ctx.estado?.responsable_username || '').toLowerCase() !== RESPONSABLE_ESPERADO_USERNAME) {
    bloqueos.push(
      `responsable esperado ${RESPONSABLE_ESPERADO_USERNAME}, actual ${ctx.estado?.responsable_username || '—'}`,
    );
  }

  const obs89 = ctx.obs89;
  if (!obs89) {
    bloqueos.push(`observación #${OBS_LEGACY_ID} no encontrada en E1`);
  } else if (['OBS_EMITIDA', 'OBS_EN_ATENCION'].includes(obs89.estado)) {
    const clase = clasificarObservacionEntregable(obs89);
    if (clase !== 'LEGACY_SIN_ROUTING') {
      bloqueos.push(`obs #${OBS_LEGACY_ID} no es legacy (${clase}); no se cierra automáticamente`);
    } else {
      pasos.push({
        tipo: 'CERRAR_OBS_LEGACY',
        id: OBS_LEGACY_ID,
        motivo: 'Observación legacy obsoleta sin routing ni destinatario AU inequívoco (decisión A)',
      });
    }
  }

  const obs64 = ctx.obs64;
  const wf34 = ctx.workflow34;
  if (obs64 && Number(obs64.workflow_id || obs64.workflow_observacion_id) === WORKFLOW_DESYNC_ID) {
    if (obs64.estado === 'OBS_SUBSANADA' && wf34 && wf34.estado === 'OBS_EMITIDA') {
      pasos.push({
        tipo: 'SINCRONIZAR_WORKFLOW',
        workflow_id: WORKFLOW_DESYNC_ID,
        entregable_observacion_id: OBS_SUBSANADA_ID,
        motivo: 'Alinear workflow #34 con entregable_obs #64 ya subsanada',
      });
    }
  }

  const otrasAbiertas = (ctx.obsAbiertas || []).filter(
    (o) => Number(o.id) !== OBS_LEGACY_ID,
  );
  if (otrasAbiertas.length) {
    bloqueos.push(`existen otras observaciones abiertas: ${otrasAbiertas.map((o) => o.id).join(', ')}`);
  }

  if (bloqueos.length) {
    return { accion: 'BLOCKED', bloqueos, pasos };
  }
  if (!pasos.length) {
    return { accion: 'OK', motivo: 'Estado ya consistente; no requiere cambios', pasos };
  }
  return { accion: 'REPAIR', pasos };
}

function imprimirDryRun(ctx) {
  console.log('--- Diagnóstico previo ---');
  console.log(`  orden_entrega_id: ${ctx.entrega.orden_entrega_id}`);
  console.log(`  etapa: ${ctx.estado?.etapa_codigo || '—'}`);
  console.log(`  responsable: ${ctx.estado?.responsable_nombre || '—'} (${ctx.estado?.responsable_username || '—'}, id ${ctx.estado?.responsable_usuario_id ?? 'null'})`);

  if (ctx.obs89) {
    console.log('\n  obs #89:');
    console.log(`    estado: ${ctx.obs89.estado}`);
    console.log(`    observado_por: ${ctx.obs89.observado_por}`);
    console.log(`    recepcion_id: ${ctx.obs89.recepcion_id}`);
    console.log(`    observado_at: ${ctx.obs89.observado_at}`);
    console.log(`    workflow_observacion_id: ${ctx.obs89.workflow_observacion_id ?? 'null'}`);
    console.log(`    clasificación: ${clasificarObservacionEntregable(ctx.obs89)}`);
    console.log(`    motivo: ${String(ctx.obs89.motivo || '').slice(0, 120)}`);
  } else {
    console.log('\n  obs #89: no encontrada');
  }

  if (ctx.obs64) {
    console.log('\n  obs #64 (subsanada):');
    console.log(`    estado: ${ctx.obs64.estado}`);
    console.log(`    workflow_observacion_id: ${ctx.obs64.workflow_observacion_id}`);
    console.log(`    subsanado_at: ${ctx.obs64.subsanado_at}`);
    console.log(`    routing: ${ctx.obs64.origen_username || '—'} → ${ctx.obs64.destino_username || '—'}`);
  }

  if (ctx.workflow34) {
    console.log('\n  workflow #34:');
    console.log(`    estado: ${ctx.workflow34.estado}`);
    console.log(`    origen: ${ctx.workflow34.origen_username} (id ${ctx.workflow34.usuario_origen_id})`);
    console.log(`    destino: ${ctx.workflow34.destino_username} (id ${ctx.workflow34.usuario_destino_id})`);
    console.log(`    origen_submodulo: ${ctx.workflow34.origen_submodulo_codigo}`);
  }

  console.log('\n  observaciones abiertas:');
  if (!ctx.obsAbiertas.length) console.log('    (ninguna)');
  else {
    for (const o of ctx.obsAbiertas) {
      console.log(`    #${o.id} ${o.estado} por ${o.observado_por} recepcion=${o.recepcion_id} at ${o.observado_at}`);
    }
  }

  console.log('\n  eventos relacionados (muestra):');
  if (!ctx.eventosRelacionados.length) console.log('    (ninguno en muestra)');
  else {
    for (const e of ctx.eventosRelacionados.slice(0, 8)) {
      console.log(`    #${e.id} ${e.evento_codigo} — ${e.ejecutado_por} — ${String(e.motivo || '').slice(0, 80)}`);
    }
  }

  if (ctx.e2) {
    console.log(`\n  E2 (solo lectura): id=${ctx.e2.orden_entrega_id}, etapa=${ctx.e2.etapa_codigo}, responsable=${ctx.e2.username || '—'}`);
  }
}

async function registrarEventoReparacion(client, ctx, pasos) {
  const estado = ctx.estado;
  const metadata = JSON.stringify({
    origen: 'REPARACION_HISTORICA_G2',
    os: OS_NUMERO,
    entrega: ENTREGA_NUMERO,
    orden_entrega_id: ctx.entrega.orden_entrega_id,
    pasos: pasos.map((p) => p.tipo),
    observacion_legacy_id: OBS_LEGACY_ID,
    workflow_sincronizado_id: WORKFLOW_DESYNC_ID,
  });
  await client.query(`
    INSERT INTO entregable_eventos (
      orden_id, orden_entrega_id, requerimiento_id, evento_codigo,
      estado_anterior_codigo, estado_anterior_label,
      estado_nuevo_codigo, estado_nuevo_label,
      etapa_anterior_codigo, etapa_nueva_codigo,
      responsable_anterior_tipo, responsable_anterior_usuario, responsable_anterior_unidad,
      responsable_nuevo_tipo, responsable_nuevo_usuario, responsable_nuevo_unidad,
      ejecutado_por, motivo, metadata_json
    ) VALUES (
      $1,$2,$3,'ENTREGABLE_REPARACION_HISTORICA',
      $4,$5,$4,$5,$6,$6,
      $7,$8,$9,$7,$8,$9,
      $10,$11,$12::jsonb
    )
  `, [
    Number(ctx.orden.orden_id),
    Number(ctx.entrega.orden_entrega_id),
    Number(ctx.orden.requerimiento_id),
    estado.estado_codigo,
    estado.estado_label,
    estado.etapa_codigo,
    estado.responsable_tipo,
    estado.responsable_usuario_id,
    estado.responsable_unidad,
    'repair-os1105-e1-legacy-obs-g2',
    'Reparación histórica pre-G2: cierre obs legacy y sincronización workflow',
    metadata,
  ]);
}

async function aplicarReparacion(ctx, plan) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const paso of plan.pasos) {
      if (paso.tipo === 'CERRAR_OBS_LEGACY') {
        const { rows } = await client.query(`
          UPDATE entregable_observaciones
          SET estado = 'OBS_CERRADA', updated_at = NOW()
          WHERE id = $1
            AND orden_entrega_id = $2
            AND estado IN ('OBS_EMITIDA', 'OBS_EN_ATENCION')
          RETURNING id, estado
        `, [paso.id, ctx.entrega.orden_entrega_id]);
        if (!rows.length && ctx.obs89?.estado !== 'OBS_CERRADA') {
          throw new Error(`No se pudo cerrar obs #${paso.id}`);
        }
      }

      if (paso.tipo === 'SINCRONIZAR_WORKFLOW') {
        const { rows } = await client.query(`
          UPDATE workflow_observaciones wo
          SET estado = 'OBS_SUBSANADA',
              subsanada_at = COALESCE(
                wo.subsanada_at,
                (SELECT eo.subsanado_at FROM entregable_observaciones eo WHERE eo.id = $2),
                NOW()
              )
          FROM entregable_observaciones eo
          WHERE wo.id = $1
            AND eo.id = $2
            AND eo.workflow_observacion_id = wo.id
            AND eo.estado = 'OBS_SUBSANADA'
            AND wo.estado = 'OBS_EMITIDA'
          RETURNING wo.id, wo.estado
        `, [paso.workflow_id, paso.entregable_observacion_id]);
        if (!rows.length && ctx.workflow34?.estado !== 'OBS_SUBSANADA') {
          throw new Error(`No se pudo sincronizar workflow #${paso.workflow_id}`);
        }
      }
    }

    await registrarEventoReparacion(client, ctx, plan.pasos);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function verificarPost(ctx) {
  const post = await cargarContexto();
  const coordUser = (await query(`
    SELECT id, username, nombre, rol, cargo, permisos
    FROM usuarios WHERE LOWER(username) = $1 AND activo = TRUE LIMIT 1
  `, [RESPONSABLE_ESPERADO_USERNAME])).rows[0];

  const bandeja = coordUser
    ? await listarBandejaEntregablesServicios({
      id: Number(coordUser.id),
      username: coordUser.username,
      nombre: coordUser.nombre,
      cargo: coordUser.cargo,
      rol: coordUser.rol,
      permisos: coordUser.permisos,
    })
    : [];
  const fila = bandeja.find(
    (r) => Number(r.orden_entrega_id) === Number(ctx.entrega.orden_entrega_id),
  );

  const obsCount = Number((await query(`
    SELECT COUNT(*)::int AS n FROM entregable_observaciones WHERE orden_entrega_id = $1
  `, [ctx.entrega.orden_entrega_id])).rows[0].n);
  const eventosCount = Number((await query(`
    SELECT COUNT(*)::int AS n FROM entregable_eventos WHERE orden_entrega_id = $1
  `, [ctx.entrega.orden_entrega_id])).rows[0].n);

  return {
    post,
    fila,
    perfiles: coordUser ? resolveFunctionalProfiles(coordUser) : [],
    obsCount,
    eventosCount,
    checks: {
      sin_obs_abierta: !post.obsAbiertas.length,
      situacion_conforme: fila?.situacion_codigo === 'CONFORME',
      etapa_rcm: String(post.estado?.etapa_codigo || '').toUpperCase() === 'REVISION_COORDINADOR_CM',
      responsable_wrodriguez: String(post.estado?.responsable_username || '').toLowerCase() === RESPONSABLE_ESPERADO_USERNAME,
      puede_observar_coordinador_cm: !!fila?.puede_observar_coordinador_cm,
      puede_derivar_analista_cm: !!fila?.puede_derivar_analista_cm,
      obs89_cerrada: post.obs89?.estado === 'OBS_CERRADA' || !['OBS_EMITIDA', 'OBS_EN_ATENCION'].includes(post.obs89?.estado),
      workflow34_sincronizado: !post.workflow34 || post.workflow34.estado === 'OBS_SUBSANADA',
    },
  };
}

console.log(`\n=== Reparación OS ${OS_NUMERO} E${ENTREGA_NUMERO} — legacy obs + workflow G2 ===`);
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const ctx = await cargarContexto();
imprimirDryRun(ctx);

const plan = evaluarPlan(ctx);
console.log(`\nEvaluación: ${plan.accion}`);
if (plan.bloqueos?.length) {
  for (const b of plan.bloqueos) console.log(`  ✗ ${b}`);
}
if (plan.pasos?.length) {
  console.log('  Pasos propuestos:');
  for (const p of plan.pasos) console.log(`    - ${p.tipo}: ${p.motivo}`);
}
if (plan.motivo) console.log(`  ${plan.motivo}`);

if (plan.accion === 'REPAIR' && APPLY) {
  await aplicarReparacion(ctx, plan);
  console.log('\nReparación aplicada.\n');
}

if (plan.accion === 'REPAIR' && !APPLY) {
  console.log('\nEjecute con --apply para aplicar.\n');
}

if (plan.accion === 'REPAIR' || plan.accion === 'OK') {
  const ver = await verificarPost(ctx);
  console.log('Verificación post:');
  console.log(`  observaciones abiertas: ${ver.post.obsAbiertas.length ? ver.post.obsAbiertas.map((o) => o.id).join(', ') : 'null'}`);
  console.log(`  situacion_codigo: ${ver.fila?.situacion_codigo || '—'}`);
  console.log(`  etapa: ${ver.post.estado?.etapa_codigo || '—'}`);
  console.log(`  responsable: ${ver.post.estado?.responsable_username || '—'}`);
  console.log(`  obs #89 estado: ${ver.post.obs89?.estado || '—'}`);
  console.log(`  workflow #34 estado: ${ver.post.workflow34?.estado || '—'}`);
  console.log('  checks:');
  for (const [k, v] of Object.entries(ver.checks)) {
    console.log(`    ${v ? '✓' : '✗'} ${k}`);
  }
  console.log(`  historial conservado: observaciones=${ver.obsCount}, eventos=${ver.eventosCount}`);
}

await pool.end();

if (plan.accion === 'BLOCKED') process.exit(1);
if (plan.accion === 'REPAIR' && !APPLY) process.exit(0);
