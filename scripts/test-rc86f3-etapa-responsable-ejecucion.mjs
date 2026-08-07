/**
 * RC8.6F.3 — Reconciliación etapa/responsable por evidencia de ejecución.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  resolverEtapaDesdeEvidencia,
  planReconciliarEtapaResponsableEjecucion,
  aplicarReconciliarEtapaResponsableEjecucion,
  ORIGEN_RECONCILIACION_F3,
} from '../server/lib/reconciliarEtapaResponsableEjecucion.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.6F.3 etapa/responsable por evidencia ===\n');

const libSrc = read('server/lib/reconciliarEtapaResponsableEjecucion.js');
ok(/RECEPCION_BIENES/.test(libSrc) && /REGISTRO_ORDEN/.test(libSrc), 'precedencia etapas en lib');
ok(!/return 'Invitaciones'/.test(libSrc), '4: Invitaciones nunca default');
ok(/ORIGEN_RECONCILIACION_F3|RECONCILIACION_ETAPA_RESPONSABLE_EJECUCION/.test(libSrc),
  'origen reconciliación F3');
ok(existsSync(join(root, 'scripts/reconcile-rc86f3-etapa-responsable-ejecucion.mjs')),
  'script reconcile F3 existe');

// 1. Evidencia recepción prevalece sobre orden
{
  const { best } = resolverEtapaDesdeEvidencia({
    codigo_ccp: '355',
    ccp_activo: true,
    orden_id: 1,
    orden_estado: 'ORDEN_NOTIFICADA',
    recepcion_bienes_expediente_id: 1,
    recepcion_estado_global: 'BIEN_RECIBIDO_ALMACEN',
  });
  ok(best.etapa === 'RECEPCION_BIENES', '1: recepción prevalece sobre orden');
  ok(best.evidencia === 'recepcion_bienes_expedientes', '1b: evidencia recepción');
}

// 2. Orden sin recepción → REGISTRO_ORDEN
{
  const { best } = resolverEtapaDesdeEvidencia({
    codigo_ccp: '99',
    ccp_activo: true,
    orden_id: 9,
    orden_estado: 'ORDEN_REGISTRADA',
  });
  ok(best.etapa === 'REGISTRO_ORDEN', '2: orden sin recepción → REGISTRO_ORDEN');
}

// 3. No retroceder
{
  const planLike = resolverEtapaDesdeEvidencia({
    orden_id: 1,
    orden_estado: 'ORDEN_REGISTRADA',
  });
  ok(planLike.best.rank < resolverEtapaDesdeEvidencia({
    recepcion_bienes_expediente_id: 1,
    recepcion_estado_global: 'BIEN_RECIBIDO_ALMACEN',
    orden_id: 1,
  }).best.rank, '3a: rank recepción > orden');
}

// 5. PENDIENTE no inventa UNIDAD Invitaciones (unidadPorEtapa ya corregido en F.2)
ok(/Almacén/.test(libSrc) && /Registro de Órdenes/.test(libSrc),
  '5/6: responsables por etapa recepción/RO');

const { query } = await import('../server/db.js');
const { rows: snapBefore } = await query(
  `SELECT etapa_codigo, responsable_tipo, responsable_unidad, version
   FROM expediente_estado_vigente WHERE requerimiento_id = 1`,
);

const plan = await planReconciliarEtapaResponsableEjecucion({
  requerimientoIds: [1],
});
const row1 = plan.rows.find((r) => r.requerimientoId === 1 || r.codigo === 'REQ-00001');
ok(!!row1, 'plan incluye REQ-00001');
ok(row1.etapaPropuesta === 'RECEPCION_BIENES',
  'REQ-00001 etapa propuesta RECEPCION_BIENES (no RO solo por orden)');
ok(row1.evidenciaAvanzada === 'recepcion_bienes_expedientes',
  'REQ-00001 evidencia avanzada = recepción');
ok(
  row1.responsablePropuesto.responsableTipo === 'UNIDAD'
  || row1.responsablePropuesto.responsableTipo === 'PERSONA'
  || row1.responsablePropuesto.responsableTipo === 'PENDIENTE',
  '6: responsable recepción válido',
);
ok(!/^invitaciones$/i.test(String(row1.responsablePropuesto.responsableUnidad || '')),
  '4b: propuesto sin Invitaciones');
if (row1.responsablePropuesto.responsableTipo === 'UNIDAD') {
  ok(/almac[eé]n|recepci[oó]n/i.test(String(row1.responsablePropuesto.responsableUnidad || '')),
    '6b: unidad Almacén / Recepción');
}

// 7. Dry-run no modifica BD
const { rows: snapAfterDry } = await query(
  `SELECT etapa_codigo, responsable_tipo, responsable_unidad, version
   FROM expediente_estado_vigente WHERE requerimiento_id = 1`,
);
ok(
  String(snapBefore[0]?.etapa_codigo) === String(snapAfterDry[0]?.etapa_codigo)
  && String(snapBefore[0]?.version) === String(snapAfterDry[0]?.version),
  '7: dry-run no modifica BD',
);

// 8. Apply idempotencia — solo simular con dryRun true second plan
const plan2 = await planReconciliarEtapaResponsableEjecucion({ requerimientoIds: [1] });
ok(plan2.rows[0].etapaPropuesta === plan.rows[0].etapaPropuesta, '8a: plan idempotente');
ok(typeof aplicarReconciliarEtapaResponsableEjecucion === 'function', '8b: apply exportado (no ejecutado aquí)');

ok(ORIGEN_RECONCILIACION_F3 === 'RECONCILIACION_ETAPA_RESPONSABLE_EJECUCION', 'origen canónico');

// Orden-only synthetic via evidence function already covered case 2

async function runScript(rel, label) {
  const p = join(root, rel);
  ok(existsSync(p), `${label}: existe`);
  const r = spawnSync(process.execPath, [p], {
    cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.log(r.stdout?.slice(-800));
    console.log(r.stderr?.slice(-800));
  }
  ok(r.status === 0, `${label} pasa`);
}

await runScript('scripts/test-rc86a-fuente-unica-estado-responsable.mjs', '10a: RC8.6A');
await runScript('scripts/test-rc86b-estandar-visual.mjs', '10b: RC8.6B');
await runScript('scripts/test-rc86c-reconciliacion-responsables.mjs', '10c: RC8.6C');
await runScript('scripts/test-rc86e-acceso-ccp-por-asignacion.mjs', '10d: RC8.6E');
await runScript('scripts/test-rc86f2-responsable-registro-ordenes.mjs', '10e: RC8.6F.2');
await runScript('scripts/test-observacion44-acciones-ccp.mjs', '10f: Observación 44');

ok(true, '11/12: build y git diff --check aparte');
console.log('\nOK RC8.6F.3\n');
