/**
 * RC8.17.8H6-C3-D4.1 — Reconciliar cotizaciones legacy (invitacion_id NULL) con invitación canónica.
 *
 * Criterio: única invitacion_proveedores del mismo SC+proveedor con
 *   estado = COTIZACION_PRESENTADA y fecha_envio <= cp.fecha_presentacion.
 *
 * Uso:
 *   node scripts/reconcile-rc8178h6-c3d41-cotizacion-invitacion-legacy.mjs
 *   node scripts/reconcile-rc8178h6-c3d41-cotizacion-invitacion-legacy.mjs --apply
 *   node scripts/reconcile-rc8178h6-c3d41-cotizacion-invitacion-legacy.mjs --sc SC-00001-2026-INS
 *
 * Sin --apply: solo SELECT / análisis. Con --apply: UPDATE en transacción (2 campos cp).
 */
import pool, { query } from '../server/db.js';
import {
  analyzeLegacyCotizaciones,
  applyLegacyCotizacionInvitacionLink,
  ESTADO_INVITACION_COTIZACION_PRESENTADA,
} from '../server/lib/reconcileCotizacionInvitacionLegacy.js';

const APPLY = process.argv.includes('--apply');
const scArgIdx = process.argv.indexOf('--sc');
const SC_FILTER = scArgIdx >= 0 ? process.argv[scArgIdx + 1] : null;

function printRow(r) {
  const inv = r.invitacion || (r.candidates && r.candidates[0]);
  console.log([
    `  cp.id=${r.cp?.id ?? r.cotizacion_id}`,
    `sc=${r.cp?.solicitud_codigo ?? '—'}`,
    `prov=${r.cp?.proveedor_id ?? '—'}`,
    `status=${r.status}`,
    inv ? `→ inv.id=${inv.id} nro=${inv.nro_invitacion} estado=${inv.estado}` : '',
    r.candidates?.length > 1 ? `(candidatas=${r.candidates.length})` : '',
  ].filter(Boolean).join(' '));
}

async function main() {
  console.log(`\n=== RC8.17.8H6-C3-D4.1 — Reconciliar cotización ↔ invitación legacy ===`);
  console.log(`Modo: ${APPLY ? 'APPLY (UPDATE)' : 'DRY-RUN (solo lectura)'}`);
  console.log(`Criterio evidencia: ip.estado = ${ESTADO_INVITACION_COTIZACION_PRESENTADA},`);
  console.log(`  mismo solicitud_id+proveedor_id, fecha_envio <= cp.fecha_presentacion,`);
  console.log(`  exactamente 1 invitación elegible (0=skip, >1=ambiguo).\n`);

  const options = SC_FILTER ? { solicitudCodigo: SC_FILTER } : {};
  const client = { query: (...args) => query(...args) };
  const report = await analyzeLegacyCotizaciones(client, options);

  console.log(`Legacy COTIZACION_PRESENTADA sin FK: ${report.legacy.length}`);
  console.log(`  Reconciliables: ${report.reconciliable.length}`);
  console.log(`  Ambiguos: ${report.ambiguous.length}`);
  console.log(`  Sin candidata: ${report.no_candidate.length}`);

  if (report.reconciliable.length) {
    console.log('\n-- Reconciliables --');
    report.reconciliable.forEach(printRow);
  }
  if (report.ambiguous.length) {
    console.log('\n-- Ambiguos (no se modificarán) --');
    report.ambiguous.forEach(printRow);
  }
  if (report.no_candidate.length) {
    console.log('\n-- Sin candidata inequívoca --');
    report.no_candidate.forEach(printRow);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN: ningún UPDATE. Use --apply para aplicar solo reconciliables.\n');
    await pool.end().catch(() => {});
    return;
  }

  if (!report.reconciliable.length) {
    console.log('\nNada que aplicar.\n');
    await pool.end().catch(() => {});
    return;
  }

  const pgClient = await pool.connect();
  try {
    await pgClient.query('BEGIN');
    const applied = [];
    for (const row of report.reconciliable) {
      const result = await applyLegacyCotizacionInvitacionLink(pgClient, row.cp.id);
      applied.push(result);
      if (result.status === 'applied') {
        console.log(`  ✓ UPDATE cp.id=${result.cotizacion_id} → invitacion_id=${result.invitacion_id} nro=${result.nro_invitacion_presentacion}`);
      } else {
        console.log(`  ✗ cp.id=${result.cotizacion_id} no aplicado: ${result.status}`);
      }
    }
    await pgClient.query('COMMIT');
    console.log(`\nApply completado: ${applied.filter((a) => a.status === 'applied').length} fila(s) actualizada(s).\n`);
  } catch (e) {
    await pgClient.query('ROLLBACK');
    console.error('ROLLBACK:', e.message);
    process.exitCode = 1;
  } finally {
    pgClient.release();
    await pool.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
