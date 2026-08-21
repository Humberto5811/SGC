/**
 * Reparación idempotente — OS 1105 / E1 — workflow #57 desincronizado post-G3
 *
 * Corrige únicamente:
 * - entregable_observaciones #97 = OBS_SUBSANADA
 * - workflow_observaciones #57 = OBS_EMITIDA  →  OBS_SUBSANADA
 *
 * Uso:
 *   node scripts/repair-os1105-e1-workflow-57-g3.mjs           # dry-run
 *   node scripts/repair-os1105-e1-workflow-57-g3.mjs --apply   # aplicar
 */
import pool, { query } from '../server/db.js';
import { listarBandejaEntregablesServicios } from '../server/lib/entregablesServicios.js';
import { PERFILES_FUNCIONALES, resolveFunctionalProfiles } from '../server/utils/userRoleCatalog.js';

const APPLY = process.argv.includes('--apply');
const OS_NUMERO = '1105';
const ENTREGA_NUMERO = 1;
const OBS_ID = 97;
const WORKFLOW_ID = 57;
const RESPONSABLE_ESPERADO_USERNAME = 'wrodriguez';

async function cargarContexto(client = null) {
  const run = client ? (sql, p) => client.query(sql, p) : (sql, p) => query(sql, p);

  const { rows: ordenRows } = await run(`
    SELECT oc.id AS orden_id, oc.requerimiento_id
    FROM ordenes_contratacion oc
    WHERE oc.tipo_orden = 'OS' AND oc.numero_orden = $1
    ORDER BY oc.id ASC LIMIT 1
  `, [OS_NUMERO]);
  const orden = ordenRows[0];
  if (!orden) throw new Error(`OS ${OS_NUMERO} no encontrada`);

  const { rows: entregaRows } = await run(`
    SELECT oe.id AS orden_entrega_id, oe.numero_entrega, oe.orden_id
    FROM orden_entregas oe
    WHERE oe.orden_id = $1 AND oe.numero_entrega = $2 AND oe.estado = 'ACTIVO'
    ORDER BY oe.id DESC LIMIT 1
  `, [orden.orden_id, ENTREGA_NUMERO]);
  const entrega = entregaRows[0];
  if (!entrega) throw new Error(`Entregable ${ENTREGA_NUMERO} ACTIVO no encontrado en OS ${OS_NUMERO}`);

  const estado = (await run(`
    SELECT ev.*, u.username AS responsable_username
    FROM entregable_estado_vigente ev
    LEFT JOIN usuarios u ON u.id = ev.responsable_usuario_id
    WHERE ev.orden_entrega_id = $1
  `, [entrega.orden_entrega_id])).rows[0] || null;

  const obs97 = (await run(`
    SELECT eo.*,
      wo.id AS workflow_id, wo.estado AS workflow_estado,
      wo.usuario_origen_id, wo.usuario_destino_id,
      wo.origen_submodulo_codigo,
      uo.username AS origen_username, ud.username AS destino_username
    FROM entregable_observaciones eo
    LEFT JOIN workflow_observaciones wo ON wo.id = eo.workflow_observacion_id
    LEFT JOIN usuarios uo ON uo.id = wo.usuario_origen_id
    LEFT JOIN usuarios ud ON ud.id = wo.usuario_destino_id
    WHERE eo.id = $1 AND eo.orden_entrega_id = $2
  `, [OBS_ID, entrega.orden_entrega_id])).rows[0] || null;

  const workflow57 = (await run(`
    SELECT wo.*, uo.username AS origen_username, ud.username AS destino_username
    FROM workflow_observaciones wo
    LEFT JOIN usuarios uo ON uo.id = wo.usuario_origen_id
    LEFT JOIN usuarios ud ON ud.id = wo.usuario_destino_id
    WHERE wo.id = $1
  `, [WORKFLOW_ID])).rows[0] || null;

  return { orden, entrega, estado, obs97, workflow57 };
}

function evaluarPlan(ctx) {
  const bloqueos = [];
  const pasos = [];

  if (!ctx.obs97) {
    bloqueos.push(`entregable_observaciones #${OBS_ID} no encontrada en E1`);
  } else {
    if (Number(ctx.obs97.workflow_observacion_id) !== WORKFLOW_ID
      && Number(ctx.obs97.workflow_id) !== WORKFLOW_ID) {
      bloqueos.push(
        `obs #${OBS_ID} no referencia workflow #${WORKFLOW_ID} (workflow_observacion_id=${ctx.obs97.workflow_observacion_id ?? 'null'})`,
      );
    }
    if (ctx.obs97.estado !== 'OBS_SUBSANADA') {
      bloqueos.push(`obs #${OBS_ID} debe estar OBS_SUBSANADA, actual ${ctx.obs97.estado}`);
    }
  }

  if (!ctx.workflow57) {
    bloqueos.push(`workflow_observaciones #${WORKFLOW_ID} no encontrado`);
  } else if (ctx.obs97 && Number(ctx.workflow57.id) === WORKFLOW_ID) {
    const obsWorkflowId = Number(ctx.obs97.workflow_observacion_id || ctx.obs97.workflow_id);
    if (obsWorkflowId !== WORKFLOW_ID) {
      bloqueos.push(`workflow #${WORKFLOW_ID} no corresponde a obs #${OBS_ID}`);
    } else if (ctx.workflow57.estado === 'OBS_SUBSANADA') {
      return { accion: 'OK', motivo: 'workflow #57 ya OBS_SUBSANADA; no requiere cambios', pasos: [] };
    } else if (ctx.workflow57.estado === 'OBS_EMITIDA') {
      pasos.push({
        tipo: 'SINCRONIZAR_WORKFLOW',
        workflow_id: WORKFLOW_ID,
        entregable_observacion_id: OBS_ID,
        motivo: 'Alinear workflow #57 con entregable_obs #97 ya subsanada (G3)',
      });
    } else {
      bloqueos.push(
        `workflow #${WORKFLOW_ID} en estado ${ctx.workflow57.estado}; solo se corrige desde OBS_EMITIDA`,
      );
    }
  }

  if (bloqueos.length) return { accion: 'BLOCKED', bloqueos, pasos };
  if (!pasos.length) return { accion: 'OK', motivo: 'Estado ya consistente; no requiere cambios', pasos };
  return { accion: 'REPAIR', pasos };
}

function imprimirDiagnostico(ctx) {
  console.log('--- Diagnóstico ---');
  console.log(`  orden_entrega_id: ${ctx.entrega.orden_entrega_id}`);
  console.log(`  etapa: ${ctx.estado?.etapa_codigo || '—'}`);
  console.log(`  responsable: ${ctx.estado?.responsable_username || '—'} (id ${ctx.estado?.responsable_usuario_id ?? 'null'})`);

  if (ctx.obs97) {
    console.log(`\n  obs #${OBS_ID}:`);
    console.log(`    estado: ${ctx.obs97.estado}`);
    console.log(`    workflow_observacion_id: ${ctx.obs97.workflow_observacion_id}`);
    console.log(`    subsanado_por: ${ctx.obs97.subsanado_por}`);
    console.log(`    subsanado_at: ${ctx.obs97.subsanado_at}`);
    console.log(`    routing: ${ctx.obs97.origen_username || '—'} → ${ctx.obs97.destino_username || '—'}`);
    console.log(`    origen_submodulo: ${ctx.obs97.origen_submodulo_codigo || '—'}`);
  }

  if (ctx.workflow57) {
    console.log(`\n  workflow #${WORKFLOW_ID}:`);
    console.log(`    estado: ${ctx.workflow57.estado}`);
    console.log(`    subsanada_at: ${ctx.workflow57.subsanada_at || '—'}`);
    console.log(`    origen: ${ctx.workflow57.origen_username} → ${ctx.workflow57.destino_username}`);
  }
}

async function registrarEventoReparacion(client, ctx) {
  const estado = ctx.estado;
  const metadata = JSON.stringify({
    origen: 'REPARACION_HISTORICA_G3',
    os: OS_NUMERO,
    entrega: ENTREGA_NUMERO,
    orden_entrega_id: ctx.entrega.orden_entrega_id,
    workflow_id: WORKFLOW_ID,
    entregable_observacion_id: OBS_ID,
    cambio: 'workflow_observaciones.estado OBS_EMITIDA → OBS_SUBSANADA',
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
    'repair-os1105-e1-workflow-57-g3',
    'Reparación histórica G3: sincronizar workflow #57 con obs #97 subsanada',
    metadata,
  ]);
}

async function aplicarReparacion(ctx) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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
        AND eo.orden_entrega_id = $3
        AND eo.workflow_observacion_id = wo.id
        AND eo.estado = 'OBS_SUBSANADA'
        AND wo.estado = 'OBS_EMITIDA'
      RETURNING wo.id, wo.estado, wo.subsanada_at
    `, [WORKFLOW_ID, OBS_ID, ctx.entrega.orden_entrega_id]);

    if (!rows.length && ctx.workflow57?.estado !== 'OBS_SUBSANADA') {
      throw new Error(`No se pudo sincronizar workflow #${WORKFLOW_ID}`);
    }

    await registrarEventoReparacion(client, ctx);
    await client.query('COMMIT');
    return rows[0] || null;
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

  return {
    post,
    fila,
    checks: {
      workflow57_subsanada: post.workflow57?.estado === 'OBS_SUBSANADA',
      obs97_subsanada: post.obs97?.estado === 'OBS_SUBSANADA',
      etapa_rcm: String(post.estado?.etapa_codigo || '').toUpperCase() === 'REVISION_COORDINADOR_CM',
      responsable_wrodriguez: String(post.estado?.responsable_username || '').toLowerCase() === RESPONSABLE_ESPERADO_USERNAME,
      situacion_conforme: fila?.situacion_codigo === 'CONFORME',
      firmada_vigente: fila?.firmada_vigente === true,
      puede_derivar_analista_cm: fila?.puede_derivar_analista_cm === true,
    },
  };
}

console.log(`\n=== Reparación OS ${OS_NUMERO} E${ENTREGA_NUMERO} — workflow #${WORKFLOW_ID} / obs #${OBS_ID} ===`);
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const ctx = await cargarContexto();
imprimirDiagnostico(ctx);

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
  const updated = await aplicarReparacion(ctx);
  console.log('\nReparación aplicada:');
  console.log(`  workflow #${WORKFLOW_ID} → ${updated?.estado || 'OBS_SUBSANADA'}`);
  console.log(`  subsanada_at: ${updated?.subsanada_at || '—'}\n`);
}

if (plan.accion === 'REPAIR' && !APPLY) {
  console.log('\nEjecute con --apply para aplicar.\n');
}

if (plan.accion === 'REPAIR' || plan.accion === 'OK') {
  const ver = await verificarPost(ctx);
  console.log('Verificación:');
  console.log(`  workflow #${WORKFLOW_ID}: ${ver.post.workflow57?.estado || '—'}`);
  console.log(`  obs #${OBS_ID}: ${ver.post.obs97?.estado || '—'}`);
  console.log(`  etapa: ${ver.post.estado?.etapa_codigo || '—'}`);
  console.log(`  responsable: ${ver.post.estado?.responsable_username || '—'}`);
  console.log(`  situacion_codigo: ${ver.fila?.situacion_codigo || '—'}`);
  console.log(`  firmada_vigente: ${ver.fila?.firmada_vigente ?? '—'}`);
  console.log(`  puede_derivar_analista_cm: ${ver.fila?.puede_derivar_analista_cm ?? '—'}`);
  console.log('  checks:');
  for (const [k, v] of Object.entries(ver.checks)) {
    console.log(`    ${v ? '✓' : '✗'} ${k}`);
  }
}

await pool.end();

if (plan.accion === 'BLOCKED') process.exit(1);
if (plan.accion === 'REPAIR' && !APPLY) process.exit(0);
