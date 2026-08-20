/**
 * Reconcilia entregables legacy sin entregable_estado_vigente asignando PERSONA
 * según evidencia operativa (última recepción, derivación o expediente global).
 *
 * Uso: node scripts/reconciliar-responsable-entregables-legacy.mjs [--dry-run]
 */
import pool, { query } from '../server/db.js';
import {
  ensureResponsablePersonaEntregable,
  inicializarEstadoResponsableEntregable,
  obtenerEstadoResponsableEntregable,
} from '../server/lib/entregableEstadoPersistido.js';

const dryRun = process.argv.includes('--dry-run');

async function resolverUsuarioIdDesdeUsername(username) {
  const key = String(username || '').trim();
  if (!key) return null;
  const { rows } = await query(`
    SELECT id FROM usuarios
    WHERE activo = TRUE
      AND (LOWER(username) = LOWER($1) OR LOWER(nombre) = LOWER($1))
    ORDER BY id
    LIMIT 1
  `, [key]);
  return rows[0]?.id ? Number(rows[0].id) : null;
}

async function resolverPersonaDesdeEvidencia(ordenEntregaId, ordenId, requerimientoId) {
  const asignacion = (await query(`
    SELECT usuario_id FROM entregable_asignaciones
    WHERE orden_entrega_id = $1 AND tipo_responsable = 'PERSONA' AND usuario_id IS NOT NULL
    ORDER BY COALESCE(cerrado_at, asignado_at) DESC NULLS LAST, id DESC
    LIMIT 1
  `, [ordenEntregaId])).rows[0];
  if (asignacion?.usuario_id) return Number(asignacion.usuario_id);

  const recepcion = (await query(`
    SELECT registrado_por FROM entregable_recepciones
    WHERE orden_entrega_id = $1
    ORDER BY numero_recepcion DESC, id DESC
    LIMIT 1
  `, [ordenEntregaId])).rows[0];
  if (recepcion?.registrado_por) {
    const uid = await resolverUsuarioIdDesdeUsername(recepcion.registrado_por);
    if (uid) return uid;
  }

  const derivacion = (await query(`
    SELECT payload_json FROM orden_ejecucion_derivaciones WHERE orden_id = $1 LIMIT 1
  `, [ordenId])).rows[0];
  const payload = derivacion?.payload_json || {};
  if (payload.responsable_usuario_id) return Number(payload.responsable_usuario_id);

  const expediente = (await query(`
    SELECT a.usuario_id
    FROM expediente_asignaciones a
    WHERE a.requerimiento_id = $1 AND a.activo = TRUE
      AND a.tipo_responsable = 'PERSONA' AND a.usuario_id IS NOT NULL
    LIMIT 1
  `, [requerimientoId])).rows[0];
  if (expediente?.usuario_id) return Number(expediente.usuario_id);

  return null;
}

async function main() {
  const candidatos = (await query(`
    SELECT oe.id AS orden_entrega_id, oe.orden_id, oc.requerimiento_id, oc.numero_orden
    FROM orden_entregas oe
    JOIN ordenes_contratacion oc ON oc.id = oe.orden_id
    LEFT JOIN entregable_estado_vigente eev ON eev.orden_entrega_id = oe.id
    WHERE UPPER(COALESCE(oe.estado, '')) = 'ACTIVO'
      AND oc.tipo_orden = 'OS'
      AND eev.orden_entrega_id IS NULL
    ORDER BY oc.id, oe.id
  `)).rows;

  console.log(`\n=== Reconciliar responsable entregables legacy (${dryRun ? 'DRY-RUN' : 'APLICAR'}) ===`);
  console.log(`Candidatos: ${candidatos.length}\n`);

  let aplicados = 0;
  let omitidos = 0;

  for (const row of candidatos) {
    const personaId = await resolverPersonaDesdeEvidencia(
      row.orden_entrega_id,
      row.orden_id,
      row.requerimiento_id,
    );
    if (!personaId) {
      omitidos += 1;
      console.log(`  - omitido entrega ${row.orden_entrega_id} (OS ${row.numero_orden}): sin evidencia PERSONA`);
      continue;
    }
    const usuario = (await query('SELECT username FROM usuarios WHERE id=$1', [personaId])).rows[0];
    if (dryRun) {
      aplicados += 1;
      console.log(`  ~ entrega ${row.orden_entrega_id} (OS ${row.numero_orden}) → ${usuario?.username || personaId}`);
      continue;
    }
    await ensureResponsablePersonaEntregable({
      ordenEntregaId: row.orden_entrega_id,
      usuarioDestinoId: personaId,
      ejecutadoPor: 'reconciliar-responsable-entregables-legacy',
      motivo: 'Reconciliación legacy desde evidencia operativa',
      metadata: { via: 'reconciliar-responsable-entregables-legacy' },
    });
    const estado = await obtenerEstadoResponsableEntregable(row.orden_entrega_id);
    aplicados += 1;
    console.log(`  ✓ entrega ${row.orden_entrega_id} (OS ${row.numero_orden}) → ${estado?.responsableUsername || personaId}`);
  }

  console.log(`\nAplicados: ${aplicados}, omitidos: ${omitidos}\n`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  try { await pool.end(); } catch (_) { /* noop */ }
  process.exit(1);
});
