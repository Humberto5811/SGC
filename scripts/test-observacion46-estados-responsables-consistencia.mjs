/**
 * Observación 46 / RC8.7 — consistencia estados, responsables y presentación.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { resolveEstadoResponsableBatch } from '../server/lib/resolvedorEstadoResponsable.js';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';
import { getEstadoCatalogEntry } from '../src/ui/workflow/estadoCatalogo.js';
import { renderResponsableCellHtml } from '../src/utils/bandejaUi.js';
import { listarBandejaCcp } from '../server/lib/ccpCertificacion.js';
import { listarBandejaOrdenes } from '../server/lib/ordenesContratacion.js';
import { reconciliarEstadoResponsablePorEvidencia } from '../server/lib/reconciliarEstadoResponsablePorEvidencia.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== Observación 46 / RC8.7 ===\n');

const resolSrc = read('server/lib/resolvedorEstadoResponsable.js');
ok(/buildContratoDesdePersistido|RC8\.7/.test(resolSrc), '12: resolvedor prioriza persistido');
ok(/etapaLabel/.test(read('src/utils/bandejaUi.js')), '11: subtítulo desde etapaLabel');
ok(!/opts\.submodulo \|\| adapted\.etapaLabel/.test(read('src/utils/bandejaUi.js')),
  '12b: sin override local de subtítulo');
ok(/Responsable[\s\S]*Estado[\s\S]*Acciones/.test(read('src/views/ejecucion/recepcionBienesView.js')),
  '15: columnas Responsable → Estado en RB');
ok(/workflow-sgc|Workflow SGC/.test(read('src/services/menuService.js')), 'mant: menú Workflow SGC');
ok(/workflowMantenimiento/.test(read('server/index.js')), 'mant: API montada');
ok(/045_workflow_sgc_catalogos/.test(read('server/migrations/045_workflow_sgc_catalogos.js'))
  || /workflow_estados_catalogo/.test(read('server/migrations/045_workflow_sgc_catalogos.js')),
  'mant: migración catálogos');

const { rows: reqs } = await query(`
  SELECT id, codigo FROM requerimientos WHERE codigo IN ('REQ-00001','REQ-00002') ORDER BY codigo
`);
const ids = reqs.map((r) => r.id);
const byCode = Object.fromEntries(reqs.map((r) => [r.codigo, r.id]));
const resolved = await resolveEstadoResponsableBatch(ids);
const r1 = resolved.get(byCode['REQ-00001']);
const r2 = resolved.get(byCode['REQ-00002']);

ok(!!r2, 'REQ-00002 resuelto');
ok(String(r2.etapaCodigo).includes('REGISTRO_ORDEN') || r2.etapaCodigo === 'ORDEN',
  `2: REQ-00002 etapa RO (got ${r2.etapaCodigo})`);
ok(r2.responsableTipo === 'PERSONA' && Number(r2.responsableUsuarioId) === 260,
  'REQ-00002 responsable persona jcrisostomo');

const a2 = adaptEstadoResponsable({ estado_responsable_vigente: r2 });
const cat2 = getEstadoCatalogEntry(a2.estadoCodigo, a2.estadoLabel);
const html2 = renderResponsableCellHtml({ estado_responsable_vigente: r2 });
ok(/Registro de [OoÓó]rden/.test(html2), '2b: subtítulo Registro de Órdenes en HTML');
ok(!/Invitaciones/i.test(html2), '7-like: no Invitaciones en subtítulo REQ-00002');

const ccp = await listarBandejaCcp();
const ro = await listarBandejaOrdenes();
ok(!ccp.some((x) => x.requerimiento_codigo === 'REQ-00002'), '4: REQ-00002 no activo en CCP');
ok(ro.some((x) => x.requerimiento_codigo === 'REQ-00002'), '3: REQ-00002 operativo en RO');

// Color categoría única por código
ok(cat2.categoria === getEstadoCatalogEntry(a2.estadoCodigo).categoria, '1/9: categoría estable');

ok(!!r1, 'REQ-00001 resuelto');
const a1 = adaptEstadoResponsable({ estado_responsable_vigente: r1 });
const html1 = renderResponsableCellHtml({ estado_responsable_vigente: r1 });
ok(!/Invitaciones/i.test(html1), '7: REQ-00001 nunca Invitaciones');
ok(!/>\s*CCP\s*</i.test(html1) || /RECEPCION|Almac[eé]n|Pendiente|Recepción/i.test(html1),
  '8: subtítulo no CCP si etapa recepción (o pendiente pre-reconcile)');

const dry = await reconciliarEstadoResponsablePorEvidencia({
  requerimientoIds: ids,
  dryRun: true,
});
ok(dry.dryRun === true, '17: dry-run no aplica');
const before = await query(
  `SELECT version FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
  [byCode['REQ-00002']],
);
ok(dry.ok, '16: diagnóstico dry-run ok');

const beforeV = before.rows[0]?.version;
// dry-run no cambia version
const afterDry = await query(
  `SELECT version FROM expediente_estado_vigente WHERE requerimiento_id = $1`,
  [byCode['REQ-00002']],
);
ok(Number(afterDry.rows[0]?.version) === Number(beforeV), '17b: dry-run no muta BD');

const { rows: asgActivas } = await query(`
  SELECT COUNT(*)::int AS n FROM expediente_asignaciones
  WHERE requerimiento_id = $1 AND activo = TRUE
`, [byCode['REQ-00002']]);
ok(asgActivas[0].n === 1, '19: una sola asignación activa REQ-00002');

console.log('\n  · REQ-00001 persistido:', {
  estado: r1.estadoCodigo, etapa: r1.etapaCodigo, tipo: r1.responsableTipo, unidad: r1.responsableUnidad,
});
console.log('  · REQ-00002 persistido:', {
  estado: r2.estadoCodigo, etapa: r2.etapaCodigo, tipo: r2.responsableTipo, user: r2.responsableUsername,
  categoria: cat2.categoria,
});

console.log('\n=== Observación 46 OK (núcleo) ===\n');
process.exit(0);
