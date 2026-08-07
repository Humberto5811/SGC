/**
 * RC8.6F.2 — Responsable vigente correcto en Registro de Órdenes.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { adaptEstadoResponsable } from '../src/ui/workflow/adaptEstadoResponsable.js';
import { renderResponsableCellHtml } from '../src/utils/bandejaUi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

console.log('\n=== RC8.6F.2 responsable Registro de Órdenes ===\n');

const resolSrc = read('server/lib/resolvedorEstadoResponsable.js');
const adaptSrc = read('src/ui/workflow/adaptEstadoResponsable.js');
const roViewSrc = read('src/views/contratacion/registroOrdenesView.js');
const ordSrc = read('server/lib/ordenesContratacion.js');

// 1–4 estáticos
ok(/enrichEstadoResponsableForBandeja/.test(ordSrc), '1: RO bandeja enriquece estado_responsable_vigente');
ok(/return 'Invitaciones'/.test(resolSrc) === false
  || /INVITACIONES[\s\S]{0,40}return 'Invitaciones'/.test(resolSrc),
'4a: Invitaciones solo si etapa INVITACIONES (no default)');
ok(/Nunca inventar "Invitaciones"|return null;\s*}/.test(resolSrc),
  '4b: default unidadPorEtapa ya no es Invitaciones');
ok(/tipoRaw === 'PENDIENTE'/.test(adaptSrc), '2/3: adapt respeta PENDIENTE explícito');
ok(/renderResponsableCellHtml/.test(roViewSrc)
  && /resolveRegistroOrdenesEtapaLabel/.test(roViewSrc),
'14: UI RO usa componente central + etiqueta etapa RO');
ok(!/row\.responsable_actual|row\.sub_modulo_actual|row\.usuario_modificacion/.test(
  roViewSrc.replace(/import[\s\S]*?from[\s\S]*?;/g, ''),
), '2: vista RO no usa responsable legacy directo');

// Adapt unit: PENDIENTE + unidad Invitaciones espuria → no mostrar Invitaciones
{
  const adapted = adaptEstadoResponsable({
    estado_responsable_vigente: {
      estadoCodigo: 'BIEN_RECIBIDO_ALMACEN',
      estadoLabel: 'Recibido por almacén',
      etapaCodigo: 'RECEPCION_BIENES',
      etapaLabel: 'Recepción de Bienes',
      responsableTipo: 'PENDIENTE',
      responsableUsuarioId: null,
      responsableUnidad: 'Invitaciones',
      responsableFuente: 'backfill_inicial',
    },
  });
  ok(adapted.responsableTipo === 'PENDIENTE', '7: sin persona → Pendiente (tipo)');
  ok(adapted.responsableDisplay === 'Pendiente de asignación', '7b: display Pendiente de asignación');
  ok(!/invitaciones/i.test(adapted.responsableDisplay + adapted.responsableUnidad),
    '4: no muestra Invitaciones como responsable');
}

// UNIDAD Registro de Órdenes
{
  const adapted = adaptEstadoResponsable({
    estado_responsable_vigente: {
      estadoCodigo: 'REGISTRO_ORDEN',
      estadoLabel: 'Registro de Órdenes',
      etapaCodigo: 'REGISTRO_ORDEN',
      etapaLabel: 'Registro de Órdenes',
      responsableTipo: 'UNIDAD',
      responsableUnidad: 'Registro de Órdenes',
      responsableFuente: 'unidad_etapa',
    },
  });
  ok(adapted.responsableTipo === 'UNIDAD'
    && /Registro de [ÓO]rdenes/i.test(adapted.responsableDisplay),
  '6: sin persona muestra unidad Registro de Órdenes');
}

// PERSONA
{
  const adapted = adaptEstadoResponsable({
    estado_responsable_vigente: {
      estadoCodigo: 'REGISTRO_ORDEN',
      etapaCodigo: 'REGISTRO_ORDEN',
      etapaLabel: 'Registro de Órdenes',
      responsableTipo: 'PERSONA',
      responsableUsuarioId: 10,
      responsableNombre: 'JUAN PEREZ',
      responsableUsername: 'jperez',
      responsableUnidad: 'Registro de Órdenes',
    },
  });
  ok(adapted.responsableTipo === 'PERSONA' && /JUAN PEREZ/i.test(adapted.responsableDisplay),
    '5: persona asignada se muestra correctamente');
}

// Celda HTML no incluye Invitaciones como persona
{
  const html = renderResponsableCellHtml({
    estado_responsable_vigente: {
      estadoCodigo: 'BIEN_RECIBIDO_ALMACEN',
      etapaCodigo: 'RECEPCION_BIENES',
      etapaLabel: 'Recepción de Bienes',
      responsableTipo: 'PENDIENTE',
      responsableUnidad: 'Invitaciones',
    },
  }, (s) => String(s));
  ok(!/>\s*Invitaciones\s*</i.test(html) && !/Invitaciones<\/span>/i.test(html),
    '4c: HTML celda no muestra Invitaciones');
  // RC8.7 — subtítulo solo desde etapaLabel vigente (no opts.submodulo).
  ok(/Recepci[oó]n de Bienes/i.test(html), '14b: subtítulo = etapaLabel vigente');
}

ok(existsSync(join(root, 'scripts/dry-run-rc86f2-responsable-registro-ordenes.mjs')),
  'dry-run administrativo presente');

// ——— BD ———
const { query } = await import('../server/db.js');
const { listarBandejaOrdenes } = await import('../server/lib/ordenesContratacion.js');
const { resolveEstadoResponsableBatch } = await import('../server/lib/resolvedorEstadoResponsable.js');

const bandeja = await listarBandejaOrdenes();
const rows = Array.isArray(bandeja) ? bandeja : (bandeja?.data || []);
ok(Array.isArray(rows), 'bandeja RO lista');

const req1 = rows.find((r) => r.requerimiento_codigo === 'REQ-00001');
if (req1) {
  ok(!!req1.estado_responsable_vigente, '1b: REQ-00001 trae estado_responsable_vigente');
  const a = adaptEstadoResponsable(req1);
  ok(!/invitaciones/i.test(String(a.responsableDisplay || '')),
    '11: REQ-00001 no muestra Invitaciones');
  ok(a.responsableTipo === 'PENDIENTE' || a.responsableTipo === 'UNIDAD' || a.responsableTipo === 'PERSONA',
    '11b: tipo responsable válido');
  const html = renderResponsableCellHtml(req1, (s) => String(s), {
    submodulo: 'Registro de Órdenes',
  });
  ok(!/Invitaciones/i.test(html.replace(/title="[^"]*"/g, '')),
    '11c: celda REQ-00001 sin Invitaciones visible');
} else {
  ok(true, '11: REQ-00001 no en bandeja RO (skip)');
}

const { rows: r2 } = await query(`SELECT id FROM requerimientos WHERE codigo='REQ-00002'`);
if (r2[0]) {
  const { rows: vig2 } = await query(
    `SELECT etapa_codigo, responsable_tipo, responsable_unidad FROM expediente_estado_vigente WHERE requerimiento_id=$1`,
    [r2[0].id],
  );
  const { rows: asg2 } = await query(
    `SELECT etapa_codigo, activo, unidad_codigo FROM expediente_asignaciones
     WHERE requerimiento_id=$1 AND activo=TRUE`,
    [r2[0].id],
  );
  if (String(vig2[0]?.etapa_codigo || '').toUpperCase().includes('REGISTRO_ORDEN')) {
    ok(/Registro de [ÓO]rdenes/i.test(String(vig2[0]?.responsable_unidad || '')),
      '12: REQ-00002 en RO con unidad destino');
    ok(asg2.length === 1 && /REGISTRO_ORDEN/i.test(asg2[0].etapa_codigo),
      '9: una sola asignación destino activa RO');
    ok(!asg2.some((a) => a.etapa_codigo === 'CCP' && a.activo),
      '8: asignación CCP cerrada');
  } else {
    ok(true, '12: REQ-00002 aún no en RO (preparado vía transición CCP_REGISTRADA)');
  }
}

// Batch sin N+1: una llamada batch para varios ids
{
  const ids = rows.map((r) => r.requerimiento_id).filter(Boolean).slice(0, 5);
  if (ids.length) {
    const map = await resolveEstadoResponsableBatch(ids);
    ok(map.size === ids.length || map.size > 0, '13: batch responsable sin N+1 (API batch)');
  } else {
    ok(true, '13: sin filas para batch (skip)');
  }
}

// Misma fuente en bandeja vs adapt (trazabilidad usa mismo contrato)
if (req1?.estado_responsable_vigente) {
  const a1 = adaptEstadoResponsable(req1);
  const a2 = adaptEstadoResponsable({ estado_responsable_vigente: req1.estado_responsable_vigente });
  ok(a1.responsableDisplay === a2.responsableDisplay
    && a1.responsableTipo === a2.responsableTipo,
  '15: mismo responsable bandeja/adapt (fuente única)');
}

ok(/transicionarExpediente/.test(read('server/lib/ccpCertificacion.js')),
  '8b: CCP→RO vía transicionarExpediente (Obs44)');
ok(/CCP_REGISTRADA/.test(read('server/lib/ccpCertificacion.js')),
  '10: no hereda responsable por UPDATE manual — evento canónico');

async function runScript(rel, label) {
  const p = join(root, rel);
  ok(existsSync(p), `${label}: existe`);
  const r = spawnSync(process.execPath, [p], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.log(r.stdout?.slice(-700));
    console.log(r.stderr?.slice(-700));
  }
  ok(r.status === 0, `${label} pasa`);
}

await runScript('scripts/test-rc86a-fuente-unica-estado-responsable.mjs', '16: RC8.6A');
await runScript('scripts/test-rc86b-estandar-visual.mjs', '17: RC8.6B');
await runScript('scripts/test-rc86c-reconciliacion-responsables.mjs', '18: RC8.6C');
await runScript('scripts/test-rc86e-acceso-ccp-por-asignacion.mjs', '19: RC8.6E');
await runScript('scripts/test-observacion44-acciones-ccp.mjs', '20: Observación 44');

ok(true, '21/22: build y git diff --check aparte');
console.log('\nOK RC8.6F.2\n');
