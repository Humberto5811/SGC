/**
 * RC8.6C — Dry-run / apply de reconciliación de responsables existentes.
 *
 *   node scripts/reconcile-rc86c-responsables-existentes.mjs
 *   node scripts/reconcile-rc86c-responsables-existentes.mjs --dry-run
 *   node scripts/reconcile-rc86c-responsables-existentes.mjs --apply
 *   node scripts/reconcile-rc86c-responsables-existentes.mjs --codigo=REQ-00002
 *   node scripts/reconcile-rc86c-responsables-existentes.mjs --ids=2,3
 *
 * Por defecto: --dry-run (no escribe BD).
 */
import pool, { query } from '../server/db.js';
import { reconciliarAsignacionesExistentes } from '../server/lib/reconciliarAsignacionesExistentes.js';

function parseArgs(argv) {
  const args = { dryRun: true, force: false, ids: null, codigos: null };
  for (const a of argv) {
    if (a === '--apply') args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a.startsWith('--ids=')) {
      args.ids = a.slice(6).split(',').map((x) => parseInt(x, 10)).filter((n) => n > 0);
    } else if (a.startsWith('--codigo=')) {
      args.codigos = a.slice(9).split(',').map((x) => x.trim()).filter(Boolean);
    } else if (a.startsWith('--codigos=')) {
      args.codigos = a.slice(10).split(',').map((x) => x.trim()).filter(Boolean);
    }
  }
  return args;
}

function pad(s, n) {
  const t = String(s ?? '');
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length);
}

async function resolveIds(args) {
  if (args.ids?.length) return args.ids;
  if (args.codigos?.length) {
    const { rows } = await query(
      `SELECT id FROM requerimientos WHERE codigo = ANY($1::text[]) ORDER BY id`,
      [args.codigos],
    );
    return rows.map((r) => Number(r.id));
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const requerimientoIds = await resolveIds(args);

  console.log(`\nRC8.6C reconciliación — mode=${args.dryRun ? 'DRY-RUN' : 'APPLY'}${args.force ? ' force' : ''}\n`);

  // Verificación migración 044
  const tables = await query(`
    SELECT to_regclass('public.expediente_estado_vigente') AS eev,
           to_regclass('public.expediente_asignaciones') AS ea
  `);
  console.log('044 tablas:', tables.rows[0]);
  try {
    const mig = await query(
      `SELECT migration, executed_at FROM schema_migrations
       WHERE migration ILIKE '%044%' ORDER BY migration`,
    );
    console.log('schema_migrations 044:', mig.rows);
  } catch (_) {
    console.log('schema_migrations: no legible');
  }

  const result = await reconciliarAsignacionesExistentes({
    requerimientoIds,
    dryRun: args.dryRun,
    force: args.force,
  });

  console.log(
    `\n| ${pad('REQ', 14)} | ${pad('Etapa', 18)} | ${pad('Responsable actual', 22)} | ${pad('Responsable encontrado', 24)} | ${pad('Fuente', 36)} | ${pad('Acción', 18)} |`,
  );
  console.log(
    `|-${'-'.repeat(14)}-|-${'-'.repeat(18)}-|-${'-'.repeat(22)}-|-${'-'.repeat(24)}-|-${'-'.repeat(36)}-|-${'-'.repeat(18)}-|`,
  );

  for (const r of result.rows) {
    console.log(
      `| ${pad(r.codigo, 14)} | ${pad(r.etapa, 18)} | ${pad(r.responsableActual, 22)} | ${pad(r.responsableEncontrado, 24)} | ${pad(r.fuente, 36)} | ${pad(r.accion, 18)} |`,
    );
  }

  console.log('\nResumen:', result.summary);
  if (args.dryRun) {
    console.log('\nSin cambios en BD (dry-run). Para persistir: --apply');
  }
}

main()
  .catch((e) => {
    console.error('FATAL', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch (_) { /* ok */ }
  });
