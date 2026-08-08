/**
 * RC8.11 — Dry-run bootstrap canónico (BD local).
 *
 *   node scripts/reconcile-rc811-bootstrap-canonico.mjs
 *   node scripts/reconcile-rc811-bootstrap-canonico.mjs --codigo=REQ-00001
 *
 * NUNCA aplica. Si se pasa --apply, aborta con error.
 */
import {
  planReconciliarBootstrapCanonico,
} from '../server/lib/reconciliarBootstrapCanonico.js';
import { query } from '../server/db.js';

function parseArgs(argv) {
  const args = { ids: null, codigos: null };
  for (const a of argv) {
    if (a === '--apply') {
      console.error('\nERROR RC8.11: --apply está prohibido en este script. Solo dry-run.\n');
      process.exit(2);
    }
    if (a.startsWith('--ids=')) {
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

function fmtResp(r) {
  if (!r) return '—';
  const tipo = r.responsableTipo || '';
  if (tipo === 'PERSONA') {
    const name = r.responsableNombre || r.responsableUsername || '';
    return `PERSONA:${r.responsableUsuarioId ?? '?'}${name ? `(${name})` : ''}`;
  }
  if (tipo === 'UNIDAD') return `UNIDAD:${r.responsableUnidad || ''}`;
  if (tipo === 'PENDIENTE') return 'PENDIENTE';
  return tipo || '—';
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

  console.log('\n=== RC8.11 Bootstrap canónico — DRY-RUN (sin escritura) ===\n');

  const plan = await planReconciliarBootstrapCanonico({ requerimientoIds });
  const rows = plan.rows || [];
  const c = plan.contadores || {};

  console.log('Contadores:');
  console.log(`  Total: ${c.total}`);
  console.log(`  Canónicos confirmados: ${c.canonicosConfirmados}`);
  console.log(`  Backfill inicial: ${c.backfillInicial}`);
  console.log(`  Sin asignación: ${c.sinAsignacion}`);
  console.log(`  Inconsistentes: ${c.inconsistentes}`);
  console.log(`  Inconsistente tipo/etapa: ${c.inconsistenteTipoEtapa}`);
  console.log(`  Sin evidencia suficiente: ${c.sinEvidenciaSuficiente}`);
  console.log(`  A reconciliar: ${c.aReconciliar}`);
  console.log('');

  console.log(
    `| ${pad('REQ', 12)} | ${pad('Tipo', 8)} | ${pad('ERV etapa', 14)} | ${pad('Fuente ERV', 18)} | ${pad('Evidencia', 28)} | ${pad('Etapa prop.', 16)} | ${pad('Resp. propuesto', 28)} | ${pad('Acción', 12)} | ${pad('Clase', 22)} |`,
  );
  console.log(`|${'-'.repeat(14)}|${'-'.repeat(10)}|${'-'.repeat(16)}|${'-'.repeat(20)}|${'-'.repeat(30)}|${'-'.repeat(18)}|${'-'.repeat(30)}|${'-'.repeat(14)}|${'-'.repeat(24)}|`);

  for (const r of rows) {
    const clase = (r.clasificaciones || []).join(',') || '—';
    console.log(
      `| ${pad(r.codigo, 12)} | ${pad(r.tipo, 8)} | ${pad(r.ervActual?.etapa, 14)} | ${pad(r.ervActual?.fuente, 18)} | ${pad(r.evidenciaAvanzada, 28)} | ${pad(r.etapaPropuesta, 16)} | ${pad(fmtResp(r.responsablePropuesto), 28)} | ${pad(r.accion, 12)} | ${pad(clase, 22)} |`,
    );
  }

  console.log(`\nOrigen: ${plan.origen}`);
  console.log('BD no modificada (dry-run).\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
