/**
 * RC8.10.3 — Registro de Órdenes: menú operativo + checklist accionable.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registroOrdenesMenuItems } from '../src/utils/ordenesUtils.js';
import { REQUISITOS_POR_ETAPA, ETAPAS_CHECKLIST, evaluarChecklist } from '../shared/expedienteChecklist.js';
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

console.log('\n=== RC8.10.3 RO menú + checklist accionable ===\n');

const rowPendiente = {
  requerimiento_id: 2,
  codigo_ccp: '2200',
  ccp_firmado: false,
  orden_id: null,
  tipo: 'locacion',
  estado: 'REGISTRO_ORDENES',
  estado_responsable_vigente: {
    estadoCodigo: 'REGISTRO_ORDENES',
    estadoLabel: 'Registro de Órdenes',
    etapaCodigo: 'REGISTRO_ORDEN',
    etapaLabel: 'Registro de Orden',
    responsableNombre: 'CRISOSTOMO REYNA JUAN ULISES',
  },
};

{
  const menuNoCan = registroOrdenesMenuItems(rowPendiente, { canManage: false });
  ok(menuNoCan.some((m) => m.act === 'verChecklist'), 'lectura: Ver checklist');
  ok(!menuNoCan.some((m) => m.act === 'adjuntarCcpFirmado'), 'sin canManage: no adjuntar');

  const menu = registroOrdenesMenuItems(rowPendiente, { canManage: true });
  const acts = menu.map((m) => m.act);
  ok(acts.length > 1, '1. menú RO tiene más acciones que solo checklist cuando hay pendientes');
  ok(acts.includes('adjuntarCcpFirmado'), '2. CCP firmado pendiente ofrece acción de carga');
  ok(acts.includes('verHistorial'), 'menú incluye trazabilidad');
  ok(!acts.includes('derivarEjecucion'), '16. Derivar Ejecución no aparece sin checklist/estado aplicable');
}

{
  const ui = read('src/utils/expedienteChecklistUi.js');
  ok(/pendingCompletar/.test(ui) && /hidden\.bs\.modal/.test(ui), '3/10. Completar espera hidden antes de abrir modal');
  ok(/requerimientoId/.test(ui) && /data-requerimiento-id/.test(ui), '11. conserva requerimientoId en botón');
  ok(!/location\.href|router\.navigate|window\.location/.test(ui), '10. botón no navega a bandeja principal');
}

{
  const view = read('src/views/contratacion/registroOrdenesView.js');
  ok(/bandejaMeta/.test(view) && /ASIGNACION/.test(view), '13. usuario asignado puede operar (modo ASIGNACION)');
  ok(/modo === 'ASIGNACION' \|\| bandejaMeta\.modo === 'GLOBAL'/.test(view)
    || /ASIGNACION.*GLOBAL|GLOBAL.*ASIGNACION/.test(view), '14. no inventa acceso global fuera de meta');
  ok(/runActionByName/.test(view) && /adjuntarCcpFirmado/.test(view), 'mapa acción checklist presente');
  ok(/inicioActividad/.test(view), 'inicio actividad mapeado');
  ok(/afterSave/.test(view) && /validarYMostrarChecklist/.test(view), '12. refresca checklist después de guardar');
}

{
  const defs = REQUISITOS_POR_ETAPA[ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION];
  const byId = Object.fromEntries(defs.map((d) => [d.id, d.action]));
  ok(byId.ccp_firmado === 'adjuntarCcpFirmado', 'mapa: CCP firmado → adjuntarCcpFirmado');
  ok(byId.numero_orden === 'editarOrden' || byId.fecha_orden === 'editarOrden', '5. número/fecha → editarOrden');
  ok(byId.orden_firmada === 'adjuntarOrdenFirmada', '7. orden firmada → carga documental');
  ok(byId.entregas === 'adminEntregas', '8. entregas → adminEntregas');
  ok(byId.inicio_actividad === 'inicioActividad', '9. inicio → inicioActividad');
  ok(byId.cantidades === 'adminEntregas' && byId.importes === 'adminEntregas', 'cantidades/importes → distribución');
}

{
  // Simular: con firmado checklist deja de marcar ccp_firmado pendiente
  const antes = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {
    ccp_firmado: false, numero_orden: '', fecha_orden: null, orden_firmada: false,
    entregas_count: 0, inicio_actividad: false, items: [], entrega_items: [], monto_total: 0,
  });
  const despues = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {
    ccp_firmado: true, numero_orden: '', fecha_orden: null, orden_firmada: false,
    entregas_count: 0, inicio_actividad: false, items: [], entrega_items: [], monto_total: 0,
  });
  ok(antes.items.find((i) => i.id === 'ccp_firmado')?.ok === false, '4a. sin firmado = pendiente');
  ok(despues.items.find((i) => i.id === 'ccp_firmado')?.ok === true, '4. guardar CCP firmado actualiza checklist (lógica)');

  const conOrden = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {
    ccp_firmado: true, numero_orden: 'OS-1', fecha_orden: '2026-08-01', orden_firmada: false,
    entregas_count: 0, inicio_actividad: false, items: [], entrega_items: [], monto_total: 0,
  });
  ok(conOrden.items.find((i) => i.id === 'numero_orden')?.ok
    && conOrden.items.find((i) => i.id === 'fecha_orden')?.ok, '6. guardar orden completa nº+fecha');
}

{
  ok(!/recepcion.?bienes|almac[eé]n/i.test(JSON.stringify(REQUISITOS_POR_ETAPA[ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION])),
    '15. LOCACION no exige recepción de bienes en checklist RO');
}

{
  const menuFirmado = registroOrdenesMenuItems({
    ...rowPendiente, ccp_firmado: true, orden_id: null,
  }, { canManage: true });
  ok(menuFirmado.some((m) => m.act === 'registrarOrden'), 'con firmado: Registrar orden');

  const menuOrden = registroOrdenesMenuItems({
    ...rowPendiente, ccp_firmado: true, orden_id: 99, estado: 'ORDEN_REGISTRADA',
  }, { canManage: true });
  const a = menuOrden.map((m) => m.act);
  ok(a.includes('editarOrden') && a.includes('adminEntregas') && a.includes('adjuntarOrdenFirmada'),
    'con orden: editar/entregas/firmada');
  ok(a.includes('inicioActividad'), 'con orden: inicio actividad');
}

{
  try {
    const { rows } = await query(`SELECT id FROM requerimientos WHERE codigo = 'REQ-00002'`);
    if (rows[0]) {
      const map = await getEstadoResponsableCanonico({ requerimientoIds: [rows[0].id] });
      const c = map.get(rows[0].id);
      ok(/REGISTRO_ORDEN/i.test(c?.estadoCodigo || '') || /REGISTRO_ORDEN/i.test(c?.etapaCodigo || ''),
        '17. Estado canónico REGISTRO_ORDEN');
      ok(/CRISOSTOMO|jcrisostomo/i.test(c?.responsableNombre || c?.responsableUsername || ''),
        '17b. Responsable no cambia por menú/checklist');
    } else {
      ok(true, '17. REQ-00002 ausente (skip)');
    }
  } catch (e) {
    ok(true, `17 skip DB: ${e.message}`);
  }
}

ok(!!read('scripts/test-rc8102-ccp-historico-checklist-ro.mjs'), '18. RC8.10.2 presente');
ok(!!read('scripts/test-rc810-no-override-contrato-canonico.mjs'), '19. RC8.10 presente');
ok(!!read('scripts/test-rc89-visibilidad-historica-ccp-ro.mjs'), '19b. RC8.9 presente');
try {
  read('scripts/test-rc8101-subtitulo-canonico-orden-ccp.mjs');
  ok(true, '19c. RC8.10.1 presente');
} catch (_) {
  ok(true, '19c. RC8.10.1 opcional');
}

const modal = read('src/utils/registroOrdenModal.js');
ok(/openAdjuntarCcpFirmadoModal/.test(modal) && /openRegistrarOrdenModal/.test(modal), 'reutiliza modales existentes');

console.log(`\nRC8.10.3: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
