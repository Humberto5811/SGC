/**
 * Limpieza segura de fixtures RC8.15.6F-2D residuales (por orden_id / usuario_id).
 * Uso: node scripts/cleanup-rc8156f2d-fixture.mjs [--apply]
 */
import pool, { query } from '../server/db.js';

const apply = process.argv.includes('--apply');

async function listarResiduales() {
  const ordenes = (await query(`
    SELECT oc.id, oc.numero_orden
    FROM ordenes_contratacion oc
    WHERE oc.numero_orden LIKE 'RC8156F2D%'
    ORDER BY oc.id
  `)).rows;
  const usuarios = (await query(`
    SELECT id, username, nombre FROM usuarios
    WHERE username LIKE 'f2d_%' OR nombre LIKE 'Fixture F2D%'
    ORDER BY id
  `)).rows;
  return { ordenes, usuarios };
}

async function limpiarOrden(ordenId) {
  const woIds = (await query(`
    SELECT DISTINCT workflow_observacion_id AS id
    FROM entregable_observaciones
    WHERE orden_id=$1 AND workflow_observacion_id IS NOT NULL
  `, [ordenId])).rows.map((r) => r.id);

  await query('DELETE FROM entregable_eventos WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM entregable_asignaciones WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM entregable_estado_vigente WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM entregable_observaciones WHERE orden_id=$1', [ordenId]);
  if (woIds.length) {
    await query('DELETE FROM workflow_observaciones WHERE id = ANY($1::int[])', [woIds]);
  }
  await query(`
    DELETE FROM entregable_recepcion_documentos
    WHERE recepcion_id IN (SELECT id FROM entregable_recepciones WHERE orden_id=$1)
  `, [ordenId]);
  await query('DELETE FROM entregable_recepciones WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM orden_entregas WHERE orden_id=$1', [ordenId]);
  await query('DELETE FROM ordenes_contratacion WHERE id=$1', [ordenId]);
}

async function limpiarUsuarios(ids) {
  if (!ids.length) return;
  await query('DELETE FROM usuarios WHERE id = ANY($1::int[])', [ids]);
}

const { ordenes, usuarios } = await listarResiduales();
console.log(`Residuales F-2D: ${ordenes.length} orden(es), ${usuarios.length} usuario(s)`);
for (const o of ordenes) console.log(`  orden ${o.id} — ${o.numero_orden}`);
for (const u of usuarios) console.log(`  usuario ${u.id} — ${u.username}`);

if (!ordenes.length && !usuarios.length) {
  console.log('Nada que limpiar.');
  await pool.end();
  process.exit(0);
}

if (!apply) {
  console.log('\nDry-run. Ejecute con --apply para borrar.');
  await pool.end();
  process.exit(0);
}

for (const o of ordenes) {
  await limpiarOrden(o.id);
  console.log(`Limpia orden ${o.id}`);
}
await limpiarUsuarios(usuarios.map((u) => u.id));
console.log(`Limpios ${usuarios.length} usuario(s)`);

const restantes = await listarResiduales();
console.log(`Restantes: ${restantes.ordenes.length} orden(es), ${restantes.usuarios.length} usuario(s)`);
await pool.end();
