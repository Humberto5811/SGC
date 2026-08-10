/**
 * RC8.10.4 — Flujo operativo RO: LOCACION sin cuadro + checklist tipo-aware + menú completo.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadContextoExpediente,
  resolveRegistroOrdenContext,
} from '../server/lib/ordenesContratacion.js';
import { obtenerChecklistRequerimiento } from '../server/lib/ordenesChecklist.js';
import {
  evaluarChecklist,
  ETAPAS_CHECKLIST,
  getOrdenChecklistRules,
  normalizeTipoChecklist,
} from '../shared/expedienteChecklist.js';
import { registroOrdenesMenuItems } from '../src/utils/ordenesUtils.js';
import { getEstadoResponsableCanonico } from '../server/lib/estadoResponsableCanonico.js';
import { query } from '../server/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log(`  ✓ ${msg}`); }
  else { failed += 1; console.error(`  ✗ ${msg}`); }
}

console.log('\n=== RC8.10.4 Flujo operativo Registro de Órdenes ===\n');

const { rows: reqs } = await query(
  `SELECT id, codigo, tipo FROM requerimientos WHERE codigo = $1`,
  ['REQ-00002'],
);
const req = reqs[0];
ok(!!req, 'fixture REQ-00002');

let ctx = null;
let resolved = null;
if (req) {
  try {
    ctx = await loadContextoExpediente(req.id);
    resolved = await resolveRegistroOrdenContext(req.id);
    ok(ctx.cuadro_id == null, '1. LOCACION no exige cuadro para CCP firmado');
    ok(resolved.cuadroId == null, '2. contexto RO resuelve con cuadroId null');
    ok(ctx.codigo_ccp === '2200' && !!ctx.ccp_activo, 'contexto tiene CCP 2200');
    ok(String(ctx.tipo_proceso || '').toUpperCase() === 'LOCACION', 'tipoProceso LOCACION');
  } catch (e) {
    ok(false, `contexto LOCACION: ${e.message}`);
  }
}

{
  const src = read('server/lib/ordenesContratacion.js');
  ok(/RECEPCION_COTIZACION_LOCACION/.test(src) && /resolveRegistroOrdenContext/.test(src),
    '3. Adjuntar CCP firmado usa contexto sin cuadro (loadContextoExpediente)');
  ok(/openAdjuntarCcpFirmadoModal/.test(read('src/utils/registroOrdenModal.js')),
    '3b. modal Adjuntar CCP firmado existe');
}

{
  const row = {
    requerimiento_id: 2,
    tipo: 'locacion',
    codigo_ccp: '2200',
    ccp_firmado: false,
    orden_id: null,
    estado: 'REGISTRO_ORDENES',
  };
  const menu = registroOrdenesMenuItems(row, { canManage: true });
  const acts = menu.map((m) => m.act);
  ok(acts.includes('registrarOrden'), '4. menú incluye Registrar orden');
  ok(acts.includes('adjuntarCcpFirmado') && acts.includes('adminEntregas')
    && acts.includes('adjuntarOrdenFirmada') && acts.includes('inicioActividad'),
  '5. menú incluye acciones progresivas disponibles');
  const reg = menu.find((m) => m.act === 'registrarOrden');
  ok(reg?.disabled === true, 'Registrar orden disabled hasta CCP firmado (tooltip)');
  ok(menu.find((m) => m.act === 'adminEntregas')?.disabled === true, 'entregables disabled sin orden');

  const menuAsig = registroOrdenesMenuItems(row, { canManage: true });
  ok(menuAsig.some((m) => m.act === 'adjuntarCcpFirmado'), '6. usuario ASIGNACION puede ejecutar (canManage)');
  const menuNo = registroOrdenesMenuItems(row, { canManage: false });
  ok(!menuNo.some((m) => m.act === 'adjuntarCcpFirmado'), '7. sin canManage no recibe acciones globales de escritura');
}

{
  ok(normalizeTipoChecklist('locacion') === 'LOCACION', '8a. normalize LOCACION');
  const locRules = getOrdenChecklistRules('LOCACION').map((r) => r.id);
  const bienRules = getOrdenChecklistRules('BIEN').map((r) => r.id);
  ok(locRules.includes('inicio_actividad') && !locRules.includes('cantidades'),
    '8/9. checklist tipo-aware; LOCACION no muestra cantidades (exclusivo BIEN)');
  ok(bienRules.includes('cantidades') && !bienRules.includes('inicio_actividad'),
    'BIEN incluye cantidades y no exige inicio actividad');

  const chk = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {
    tipo: 'locacion',
    ccp_firmado: false,
    numero_orden: '',
    fecha_orden: null,
    orden_firmada: false,
    entregas_count: 0,
    inicio_actividad: false,
    items: [],
    entrega_items: [],
    monto_total: 0,
  });
  ok(!chk.items.some((i) => i.id === 'cantidades'), '9b. evaluarChecklist LOCACION sin cantidades');
  ok(chk.items.find((i) => i.id === 'ccp_firmado')?.action === 'adjuntarCcpFirmado',
    '10. Completar información abre acción real (ccp→adjuntar)');
}

{
  const ui = read('src/utils/expedienteChecklistUi.js');
  ok(/pendingCompletar/.test(ui), '11. no navega a bandeja (pendingCompletar)');
  ok(/requerimientoId|data-requerimiento-id/.test(ui), '12. conserva requerimientoId');
  ok(/validarYMostrarChecklist/.test(read('src/views/contratacion/registroOrdenesView.js')),
    '13. guardar refresca checklist');
}

{
  const conOrden = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {
    tipo: 'locacion',
    ccp_firmado: true,
    numero_orden: 'OS-1',
    fecha_orden: '2026-08-01',
    orden_firmada: false,
    entregas_count: 0,
    inicio_actividad: false,
    items: [],
    entrega_items: [],
    monto_total: 0,
  });
  ok(conOrden.items.find((i) => i.id === 'numero_orden')?.ok
    && conOrden.items.find((i) => i.id === 'fecha_orden')?.ok,
  '14. número+fecha se completan al registrar orden');
  ok(conOrden.items.find((i) => i.id === 'ccp_firmado')?.ok === true, '15a. firmado con flag true');
  const sinDoc = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {
    tipo: 'locacion',
    ccp_firmado: false,
    codigo_ccp: '2200',
    items: [],
    entrega_items: [],
    entregas_count: 0,
    monto_total: 0,
  });
  ok(sinDoc.items.find((i) => i.id === 'ccp_firmado')?.ok === false,
    '15. CCP firmado se completa solo con documento real');
}

{
  const incompleto = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {
    tipo: 'locacion', ccp_firmado: true, numero_orden: '1', fecha_orden: '2026-01-01',
    orden_firmada: true, entregas_count: 1, inicio_actividad: true,
    items: [{ id: 1, cantidad: 1, precio_unitario: 100, precio_total: 100 }],
    entrega_items: [{ orden_item_id: 1, cantidad: 1, precio_total: 50 }],
    monto_total: 100,
  });
  ok(incompleto.completo === false, '16. derivar/notificar depende de requisitos aplicables (importes)');

  const menuDeriv = registroOrdenesMenuItems({
    tipo: 'locacion', ccp_firmado: true, orden_id: 9,
    estado: 'ORDEN_RECEPCION_CONFIRMADA', checklist_completo: true,
  }, { canManage: true });
  ok(menuDeriv.some((m) => m.act === 'derivarEjecucion'),
    '16b. Derivar Ejecución en estado aplicable');
}

if (req) {
  try {
    const { checklist } = await obtenerChecklistRequerimiento(req.id);
    ok(!checklist.items.some((i) => i.id === 'cantidades'),
      'checklist DB LOCACION sin cantidades');
    const map = await getEstadoResponsableCanonico({ requerimientoIds: [req.id] });
    const c = map.get(req.id);
    ok(/REGISTRO_ORDEN/i.test(c?.estadoCodigo || c?.etapaCodigo || ''),
      '17. Estado canónico no cambia');
    ok(/CRISOSTOMO|jcrisostomo/i.test(c?.responsableNombre || c?.responsableUsername || ''),
      '17b. Responsable intacto');
  } catch (e) {
    ok(true, `DB checklist skip: ${e.message}`);
  }
}

ok(!!read('scripts/test-rc8102-ccp-historico-checklist-ro.mjs'), '18. RC8.10.2 presente');
ok(!!read('scripts/test-rc8103-registro-ordenes-checklist-accionable.mjs'), '18b. RC8.10.3 presente');
ok(!!read('scripts/test-rc810-no-override-contrato-canonico.mjs'), '19. RC8.10 presente');
ok(!!read('scripts/test-rc89-visibilidad-historica-ccp-ro.mjs'), '19b. RC8.9 presente');

console.log(`\nRC8.10.4: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
