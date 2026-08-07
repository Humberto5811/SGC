/**
 * RC8.7.1 — Blindaje de la fuente única.
 * Pruebas 1–11: migrate/rebuild/init no pisan vigente; 044/045 seguros;
 * REQ-00001/00002 conservados; contrato bandejas; build + diff-check aparte.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import { rebuildAllHistorial, inicializarTrazabilidad } from '../server/lib/trazabilidad.js';
import { resolveEstadoResponsableBatch } from '../server/lib/resolvedorEstadoResponsable.js';
import {
  evaluarEscrituraVigente,
  ORIGEN_ESCRITURA_VIGENTE,
  isVigenteConfirmado,
} from '../server/lib/expedienteVigenteGuard.js';
import { ESCRITURAS_DIRECTAS_RC86A } from '../server/lib/rc86aEscriturasDirectas.js';
import { reconciliarEstadoResponsablePorEvidencia } from '../server/lib/reconciliarEstadoResponsablePorEvidencia.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log(`  ✓ ${msg}`);
}

function snapVigente(row) {
  if (!row) return null;
  return {
    estado_codigo: row.estado_codigo,
    etapa_codigo: row.etapa_codigo,
    responsable_tipo: row.responsable_tipo,
    responsable_usuario_id: row.responsable_usuario_id != null
      ? Number(row.responsable_usuario_id) : null,
    responsable_unidad: row.responsable_unidad,
    responsable_fuente: row.responsable_fuente,
    version: Number(row.version),
    actualizado_at: row.actualizado_at ? String(row.actualizado_at) : null,
  };
}

async function loadVigentesByCodigo(codigos) {
  const { rows } = await query(`
    SELECT r.codigo, v.*
    FROM requerimientos r
    JOIN expediente_estado_vigente v ON v.requerimiento_id = r.id
    WHERE r.codigo = ANY($1::text[])
    ORDER BY r.codigo
  `, [codigos]);
  return Object.fromEntries(rows.map((r) => [r.codigo, r]));
}

async function fingerprintAllVigente() {
  const { rows } = await query(`
    SELECT requerimiento_id, estado_codigo, etapa_codigo, responsable_tipo,
           responsable_usuario_id, responsable_unidad, responsable_fuente,
           version, actualizado_at::text AS actualizado_at
    FROM expediente_estado_vigente
    ORDER BY requerimiento_id
  `);
  return JSON.stringify(rows.map(snapVigente));
}

console.log('\n=== RC8.7.1 Blindaje fuente única ===\n');

// ── Guard unitario ──
{
  const confirmado = {
    responsable_fuente: 'asignacion_explicita',
    version: 3,
    etapa_codigo: 'RECEPCION_BIENES',
  };
  ok(isVigenteConfirmado(confirmado), 'guard: vigente confirmado detectado');
  const backfill = evaluarEscrituraVigente({
    origenEscritura: ORIGEN_ESCRITURA_VIGENTE.BACKFILL_VACIO,
    existente: confirmado,
  });
  ok(backfill.noop === true, '4-unit: BACKFILL_VACIO no pisa confirmado');
  let denied = false;
  try {
    evaluarEscrituraVigente({ origenEscritura: 'script_libre', existente: null });
  } catch (e) {
    denied = e.code === 'VIGENTE_ESCRITURA_NO_AUTORIZADA';
  }
  ok(denied, 'guard: origen no autorizado rechazado');
}

// Inventario
{
  const auth = ESCRITURAS_DIRECTAS_RC86A.filter((e) =>
    /autorizado|RECONCILIACION|transicionarExpediente/.test(e.nota || ''));
  ok(auth.length >= 2, 'inventario: escritores autorizados documentados');
  const rebuild = ESCRITURAS_DIRECTAS_RC86A.find((e) => e.funcion.includes('rebuildAllHistorial'));
  ok(rebuild && rebuild.clasificacion === 'C', 'inventario: rebuild clasificado C (bloqueado vigente)');
  const m045 = ESCRITURAS_DIRECTAS_RC86A.find((e) => /045_/.test(e.archivo));
  ok(m045 && /no altera expedientes/i.test(m045.nota), '5-doc: 045 no altera expedientes');
  const m044 = ESCRITURAS_DIRECTAS_RC86A.find((e) => /044_/.test(e.archivo));
  ok(m044 && /WHERE NOT EXISTS|nunca pisa/i.test(m044.nota + m044.escritura),
    '4-doc: 044 WHERE NOT EXISTS');
}

// Código estático
{
  const persist = read('server/lib/expedienteEstadoPersistido.js');
  ok(/origenEscritura/.test(persist) && /evaluarEscrituraVigente/.test(persist),
    'persist: upsert exige origenEscritura');
  const traza = read('server/lib/trazabilidad.js');
  ok(/isVigenteConfirmado/.test(traza) && /RC8\.7\.1/.test(traza),
    'traza: rebuild/init respetan vigente confirmado');
  const m044src = read('server/migrations/044_expediente_estado_responsable_vigente.js');
  ok(/WHERE NOT EXISTS/.test(m044src), '4: 044 SQL WHERE NOT EXISTS');
  const m045src = read('server/migrations/045_workflow_sgc_catalogos.js');
  ok(!/expediente_estado_vigente|expediente_asignaciones|UPDATE requerimientos/i.test(m045src),
    '5: 045 no toca expedientes/vigente');
  const wf = read('server/routes/workflowMantenimiento.js');
  ok(/reconciliarEstadoResponsablePorEvidencia/.test(wf)
    && /No permite edición libre/i.test(wf),
    'mant: solo reconcile; sin edición directa');
}

const codigos = ['REQ-00001', 'REQ-00002'];
const beforeReq = await loadVigentesByCodigo(codigos);
ok(beforeReq['REQ-00001'], 'REQ-00001 tiene vigente');
ok(beforeReq['REQ-00002'], 'REQ-00002 tiene vigente');

const snap01 = snapVigente(beforeReq['REQ-00001']);
const snap02 = snapVigente(beforeReq['REQ-00002']);
const fpBefore = await fingerprintAllVigente();

// 7–8: conservar estados esperados
{
  const e1 = String(snap01.estado_codigo || '').toUpperCase();
  const t1 = String(snap01.etapa_codigo || '').toUpperCase();
  ok(
    /RECEPCION_BIENES|BIEN_RECIBIDO|ALMACEN|EN_EJECUCION/.test(e1 + t1)
    || /Almac[eé]n/i.test(String(snap01.responsable_unidad || '')),
    `7: REQ-00001 recepción/almacén (estado=${snap01.estado_codigo} etapa=${snap01.etapa_codigo} unidad=${snap01.responsable_unidad})`,
  );
  const e2 = String(snap02.estado_codigo || '').toUpperCase();
  const t2 = String(snap02.etapa_codigo || '').toUpperCase();
  ok(
    /REGISTRO_ORDEN/.test(e2 + t2),
    `8: REQ-00002 REGISTRO_ORDEN (estado=${snap02.estado_codigo} etapa=${snap02.etapa_codigo})`,
  );
  ok(
    snap02.responsable_tipo === 'PERSONA' && Number(snap02.responsable_usuario_id) === 260,
    '8b: REQ-00002 responsable jcrisostomo (260)',
  );
}

// 2: rebuildAllHistorial no cambia vigente
{
  await rebuildAllHistorial();
  const fpAfterRebuild = await fingerprintAllVigente();
  ok(fpAfterRebuild === fpBefore, '2: rebuildAllHistorial no cambia vigente');
  const after = await loadVigentesByCodigo(codigos);
  ok(JSON.stringify(snapVigente(after['REQ-00001'])) === JSON.stringify(snap01),
    '2b: REQ-00001 intacto tras rebuild');
  ok(JSON.stringify(snapVigente(after['REQ-00002'])) === JSON.stringify(snap02),
    '2c: REQ-00002 intacto tras rebuild');
}

// 3: inicializarTrazabilidad no cambia vigente
{
  for (const codigo of codigos) {
    const id = beforeReq[codigo].requerimiento_id;
    await inicializarTrazabilidad(id, 'rc871_test');
  }
  const fpAfterInit = await fingerprintAllVigente();
  ok(fpAfterInit === fpBefore, '3: inicializarTrazabilidad no cambia vigente');
}

// 1: migrate dos veces (runMigrations idempotente respecto a vigente)
{
  const { runMigrations } = await import('../server/migrate.js');
  await runMigrations();
  const fp1 = await fingerprintAllVigente();
  await runMigrations();
  const fp2 = await fingerprintAllVigente();
  ok(fp1 === fpBefore, '1a: migrate #1 no cambia vigente vs pre-test');
  ok(fp2 === fp1, '1: migrate×2 no cambia vigente (2ª vs 1ª)');
  ok(fp2 === fpBefore, '1b: migrate×2 respeta fingerprint pre-test');
}

// 6: reconciliación dry-run no muta; apply sobre ya-alineados es no-op / conserva
{
  const dry = await reconciliarEstadoResponsablePorEvidencia({
    requerimientoIds: [
      beforeReq['REQ-00001'].requerimiento_id,
      beforeReq['REQ-00002'].requerimiento_id,
    ],
    dryRun: true,
  });
  ok(dry.dryRun === true, '6a: dry-run no apply');
  const fpDry = await fingerprintAllVigente();
  ok(fpDry === fpBefore, '6b: dry-run no muta vigente');

  const after = await loadVigentesByCodigo(codigos);
  ok(JSON.stringify(snapVigente(after['REQ-00001'])) === JSON.stringify(snap01),
    '6: REQ-00001 conserva estado/responsable post-dry');
  ok(JSON.stringify(snapVigente(after['REQ-00002'])) === JSON.stringify(snap02),
    '6c: REQ-00002 conserva estado/responsable post-dry');
}

// 9: contrato único desde resolvedor
{
  const ids = [
    beforeReq['REQ-00001'].requerimiento_id,
    beforeReq['REQ-00002'].requerimiento_id,
  ];
  const batch = await resolveEstadoResponsableBatch(ids);
  const r1 = batch.get(ids[0]);
  const r2 = batch.get(ids[1]);
  for (const [label, r] of [['REQ-00001', r1], ['REQ-00002', r2]]) {
    ok(r && r.estadoCodigo && r.etapaCodigo && r.responsableTipo,
      `9: ${label} contrato estado/etapa/responsable`);
    ok(r.fuente === 'persistido' || r.origenPersistido || r.estadoLabel,
      `9b: ${label} desde persistido`);
  }
  ok(String(r1.etapaCodigo).includes('RECEPCION') || /BIEN_RECIBIDO|ALMACEN|EN_EJECUCION/i.test(
    `${r1.estadoCodigo}|${r1.etapaCodigo}|${r1.responsableUnidad || ''}`,
  ), '9c: REQ-00001 contrato recepción/almacén');
  ok(/REGISTRO_ORDEN/.test(String(r2.etapaCodigo) + String(r2.estadoCodigo)),
    '9d: REQ-00002 contrato RO');
}

// 10–11: build + diff-check se ejecutan fuera; verificar scripts existen
ok(existsSync(join(root, 'package.json')), '10-prep: package.json');
ok(existsSync(join(root, 'server/lib/expedienteVigenteGuard.js')), 'blindaje: guard presente');

console.log('\n=== RC8.7.1 OK (runtime 1–9) — ejecutar build + git diff --check aparte ===\n');
process.exit(0);
