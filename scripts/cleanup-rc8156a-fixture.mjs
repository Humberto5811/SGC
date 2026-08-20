/**
 * Limpieza segura de fixtures RC8.15.6A residuales (por orden_id concreto).
 * Uso: node scripts/cleanup-rc8156a-fixture.mjs [--apply]
 */
import pool, { query } from '../server/db.js';

const apply = process.argv.includes('--apply');

async function listarResiduales() {
  return (await query(`
    SELECT oc.id, oc.numero_orden
    FROM ordenes_contratacion oc
    WHERE oc.numero_orden LIKE 'RC8156A%'
    ORDER BY oc.id
  `)).rows;
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

const ordenes = await listarResiduales();
console.log(`Residuales RC8156A: ${ordenes.length} orden(es)`);
for (const o of ordenes) console.log(`  orden ${o.id} — ${o.numero_orden}`);

if (!ordenes.length) {
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

const restantes = await listarResiduales();
console.log(`Restantes: ${restantes.length} orden(es)`);
await pool.end();
