/**
 * RC8.6F.3 — Dry-run / apply reconciliación etapa+responsable por evidencia.
 *
 *   node scripts/reconcile-rc86f3-etapa-responsable-ejecucion.mjs
 *   node scripts/reconcile-rc86f3-etapa-responsable-ejecucion.mjs --codigo=REQ-00001
 *   node scripts/reconcile-rc86f3-etapa-responsable-ejecucion.mjs --apply
 *
 * Por defecto: dry-run (no escribe BD).
 */
import {
  planReconciliarEtapaResponsableEjecucion,
  aplicarReconciliarEtapaResponsableEjecucion,
} from '../server/lib/reconciliarEtapaResponsableEjecucion.js';
import { query } from '../server/db.js';

function parseArgs(argv) {
  const args = { dryRun: true, ids: null, codigos: null };
  for (const a of argv) {
    if (a === '--apply') args.dryRun = false;
    else if (a === '--dry-run') args.dryRun = true;
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

function fmtResp(r) {
  if (!r) return '—';
  const tipo = r.responsableTipo || r.responsable_tipo || '';
  if (tipo === 'PERSONA') {
    return `PERSONA:${r.responsableUsuarioId ?? r.responsable_usuario_id ?? '?'}`;
  }
  if (tipo === 'UNIDAD') {
    return `UNIDAD:${r.responsableUnidad || r.responsable_unidad || ''}`;
  }
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

  console.log(`\n=== RC8.6F.3 reconciliación etapa/responsable (mode=${args.dryRun ? 'DRY-RUN' : 'APPLY'}) ===\n`);

  const result = args.dryRun
    ? await planReconciliarEtapaResponsableEjecucion({ requerimientoIds })
    : await aplicarReconciliarEtapaResponsableEjecucion({
      requerimientoIds,
      dryRun: false,
    });

  const rows = result.rows || [];
  console.log(
    `| ${pad('REQ', 12)} | ${pad('Etapa persistida', 16)} | ${pad('Evidencia avanzada', 28)} | ${pad('Etapa propuesta', 16)} |`,
  );
  console.log(`|${'-'.repeat(14)}|${'-'.repeat(18)}|${'-'.repeat(30)}|${'-'.repeat(18)}|`);
  for (const r of rows) {
    console.log(
      `| ${pad(r.codigo, 12)} | ${pad(r.etapaPersistida, 16)} | ${pad(r.evidenciaAvanzada, 28)} | ${pad(r.etapaPropuesta, 16)} |`,
    );
  }

  console.log('');
  console.log(
    `| ${pad('REQ', 12)} | ${pad('Resp. actual', 28)} | ${pad('Resp. propuesto', 28)} | ${pad('Fuente', 40)} | ${pad('Acción', 14)} |`,
  );
  console.log(`|${'-'.repeat(14)}|${'-'.repeat(30)}|${'-'.repeat(30)}|${'-'.repeat(42)}|${'-'.repeat(16)}|`);
  for (const r of rows) {
    console.log(
      `| ${pad(r.codigo, 12)} | ${pad(fmtResp(r.responsableActual), 28)} | ${pad(fmtResp(r.responsablePropuesto), 28)} | ${pad(r.fuente, 40)} | ${pad(r.accion, 14)} |`,
    );
  }

  const req1 = rows.find((r) => r.codigo === 'REQ-00001');
  if (req1) {
    console.log('\n— Foco REQ-00001 —');
    console.log(JSON.stringify({
      etapaPersistida: req1.etapaPersistida,
      evidenciaAvanzada: req1.evidenciaAvanzada,
      etapaPropuesta: req1.etapaPropuesta,
      estadoPropuesto: req1.estadoPropuesto,
      responsablePropuesto: req1.responsablePropuesto,
      accion: req1.accion,
      hallazgos: req1.hallazgos,
    }, null, 2));
  }

  if (args.dryRun) {
    console.log('\nSin cambios en BD. Para aplicar (requiere aprobación):');
    console.log('  node scripts/reconcile-rc86f3-etapa-responsable-ejecucion.mjs --apply\n');
  } else {
    console.log(`\nAplicados: ${result.applied}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
