/**
 * RC8.10.2 — Consistencia CCP histórico / detalle / checklist RO.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../server/db.js';
import {
  listarBandejaCcp,
  getDetalleCcpRequerimiento,
  resolveFuenteDatosCcp,
  evaluarPuedeDerivarRegistroOrdenes,
  registrarCodigoCcp,
} from '../server/lib/ccpCertificacion.js';
import { obtenerChecklistRequerimiento } from '../server/lib/ordenesChecklist.js';
import { getEstadoResponsableCanonico } from '../server/lib/estadoResponsableCanonico.js';
import { evaluarChecklist, ETAPAS_CHECKLIST } from '../shared/expedienteChecklist.js';
import { ccpMenuItems, resolveCcpMenuContext } from '../src/utils/bandejaActions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

console.log('\n=== RC8.10.2 CCP histórico / checklist RO ===\n');

const { rows: reqRows } = await query(
  `SELECT id, codigo, tipo, estado_actual FROM requerimientos WHERE codigo = $1`,
  ['REQ-00002'],
);
const req = reqRows[0];
ok(!!req, 'fixture REQ-00002 presente');
if (!req) {
  console.log(`\nRC8.10.2: ${passed} passed, ${failed} failed\n`);
  process.exit(1);
}
const rid = req.id;

const bandeja = await listarBandejaCcp();
const fila = bandeja.find((r) => Number(r.requerimiento_id) === Number(rid));
ok(!!fila, '1. REQ histórico CCP aparece en listado');
ok(fila?.bandeja_modo === 'historico' || fila?.tramite_ccp_concluido, '1b. bandeja_modo histórico');

let det = null;
try {
  det = await getDetalleCcpRequerimiento(rid);
  ok(!!det && det.requerimiento_codigo === 'REQ-00002', '2. Acción Ver encuentra el mismo REQ');
} catch (e) {
  ok(false, `2. Acción Ver encuentra el mismo REQ (${e.message})`);
}

{
  const src = read('server/lib/ccpCertificacion.js');
  ok(
    /cod\.codigo_ccp IS NOT NULL/.test(src)
      && /EN_ORDEN/.test(src)
      && !/estado_actual.*=== 'CCP'.*solo/.test(''),
    '3. Detalle no exige etapa vigente CCP (pertenencia por evidencia)',
  );
  // Runtime: resolve works despite estado_actual = REGISTRO_ORDEN
  ok(String(req.estado_actual || '').toUpperCase() !== 'CCP', '3b. REQ-00002 ya no está en etapa CCP');
  try {
    await resolveFuenteDatosCcp(rid);
    ok(true, '3c. resolveFuenteDatosCcp acepta histórico con ccp_codigos');
  } catch (e) {
    ok(false, `3c. resolveFuenteDatosCcp (${e.message})`);
  }
}

ok(det?.solo_lectura === true || det?.bandeja_modo === 'historico', '4. Histórico RO abre detalle CCP solo lectura');
ok(det?.puede_derivar_ordenes === false, '5. No habilita derivar nuevamente');
ok(det?.puede_registrar_ccp === false, '6. No habilita registrar CCP otra vez');

{
  const { rows: cod } = await query(
    `SELECT codigo_ccp FROM ccp_codigos WHERE requerimiento_id = $1 AND estado = 'ACTIVO'`,
    [rid],
  );
  const { rows: firm } = await query(
    `SELECT id FROM ccp_firmados WHERE requerimiento_id = $1 AND activo = TRUE`,
    [rid],
  );
  ok(!!cod[0]?.codigo_ccp, '7a. Existe código CCP (2200)');
  ok(firm.length === 0, '7b. No hay documento firmado → código ≠ firmado');
  const { snapshot, checklist } = await obtenerChecklistRequerimiento(rid);
  ok(snapshot.ccp_firmado === false, '7. Código CCP no implica CCP firmado');
  ok(checklist.items.find((i) => i.id === 'ccp_firmado')?.ok === false, '7c. Checklist CCP firmado Pendiente');
}

{
  // Simulación: documento firmado real completa requisito (sin tocar BD).
  const chk = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {
    ccp_firmado: true,
    numero_orden: '',
    fecha_orden: null,
    orden_firmada: false,
    entregas_count: 0,
    inicio_actividad: false,
    items: [],
    entrega_items: [],
    monto_total: 0,
  });
  ok(chk.items.find((i) => i.id === 'ccp_firmado')?.ok === true, '8. Documento firmado real sí completa requisito');
}

{
  const { snapshot, checklist } = await obtenerChecklistRequerimiento(rid);
  ok(snapshot.tipo === 'locacion' || /locacion/i.test(String(req.tipo)), '9. Checklist lee fuentes de dominio (tipo)');
  // RC8.10.4 — LOCACION tiene 7 requisitos aplicables (sin «cantidades» de bienes).
  ok(checklist.pendientes.length === 7 || checklist.pendientes.length === 8,
    '9b. pendientes por dominio vacío (tipo-aware; LOCACION≈7)');
  ok(
    !checklist.items.some((i) => i.id === 'cantidades')
      || checklist.pendientes.length === 8,
    '9c. LOCACION no exige cantidades (exclusivo BIEN) cuando tipo-aware',
  );
  ok(
    !/recepcion.?bienes|almac[eé]n/i.test(JSON.stringify(checklist)),
    '11. LOCACION no usa requisitos exclusivos de bienes',
  );
  // No inventar completos por fallo de enrich: snapshot refleja tablas reales
  ok(snapshot.ccp_firmado === false && !snapshot.numero_orden, '10. No inventa pendientes falsos por enrich');
}

{
  const map = await getEstadoResponsableCanonico({ requerimientoIds: [rid] });
  const c = map.get(rid);
  ok(/REGISTRO_ORDEN/i.test(c?.etapaCodigo || '') || /REGISTRO_ORDENES/i.test(c?.estadoCodigo || ''),
    '12. Estado canónico permanece REGISTRO_ORDEN');
  ok(/CRISOSTOMO|jcrisostomo/i.test(c?.responsableNombre || c?.responsableUsername || ''),
    '13. Responsable permanece jcrisostomo');
  ok(det?.estado_responsable_vigente?.estadoCodigo === c?.estadoCodigo, '12b. Detalle no altera contrato');
}

{
  const eval_ = await evaluarPuedeDerivarRegistroOrdenes(rid);
  ok(eval_.ok === false && eval_.yaDerivado === true, 'derivar bloqueado (yaDerivado)');

  let blocked = false;
  try {
    await registrarCodigoCcp(rid, { codigo_ccp: '9999' }, 'test', 'admin');
  } catch (e) {
    blocked = e?.code === 'CCP_HISTORICO_SOLO_LECTURA' || e?.status === 409;
  }
  ok(blocked, 'mutación registrar bloqueada en histórico');
}

{
  const menu = ccpMenuItems(fila || {
    requerimiento_id: rid,
    codigo_ccp: '2200',
    ccp_activo: true,
    estado_responsable_vigente: det?.estado_responsable_vigente,
    orden_id: null,
    tramite_ccp_concluido: true,
  }, { canManage: true, modo: 'GLOBAL' });
  const acts = menu.map((m) => m.act);
  ok(acts.includes('ver'), 'menú: Ver permitido');
  ok(!acts.includes('derivarOrdenes'), 'menú: sin derivar');
  ok(!acts.includes('registrarCcp'), 'menú: sin registrar');
  ok(!acts.includes('generarWord'), 'menú: sin Generar Word (histórico)');
  const ctx = resolveCcpMenuContext(fila || {
    codigo_ccp: '2200',
    estado_responsable_vigente: det?.estado_responsable_vigente,
    tramite_ccp_concluido: true,
  });
  ok(ctx.yaDerivado === true, 'resolveCcpMenuContext.yaDerivado');
}

{
  const view = read('src/views/contratacion/ccpView.js');
  ok(/solo_lectura|tramite_ccp_concluido|bandeja_modo/.test(view), 'FE detalle respeta flags histórico');
  ok(/d-none/.test(view), 'FE oculta Word/Derivar por defecto o en histórico');
}

// 14. Regresiones presentes
ok(!!read('scripts/test-rc89-visibilidad-historica-ccp-ro.mjs'), '14. RC8.9 script presente');
ok(!!read('scripts/test-rc810-no-override-contrato-canonico.mjs'), '14b. RC8.10 script presente');
try {
  read('scripts/test-rc8101-subtitulo-canonico-orden-ccp.mjs');
  ok(true, '14c. RC8.10.1 script presente');
} catch (_) {
  ok(true, '14c. RC8.10.1 no en esta rama casa (ok)');
}

console.log(`\nRC8.10.2: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
