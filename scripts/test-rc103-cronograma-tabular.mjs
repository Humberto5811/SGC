/**
 * RC103 — Modal entregas tabular + conteo inclusivo de fechas máximas.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  calcularFechaMaxima,
  calcularFechaMaximaEntrega,
  toIsoDateString,
} from '../shared/diasPlazo.js';
import { calcularFechasInicioActividad } from '../server/lib/ordenesContratacion.js';
import { registroOrdenesMenuItems } from '../src/utils/ordenesUtils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC103 Cronograma tabular + fechas inclusivas ===\n');

const modalPath = path.join(root, 'src/utils/registroOrdenEntregasModal.js');
const modal = fs.readFileSync(modalPath, 'utf8');
const utils = fs.readFileSync(path.join(root, 'src/utils/ordenesUtils.js'), 'utf8');

// 1–3 Modal ancho / tabla / columnas
assert(/94vw|96vw/.test(modal), '1. Modal ancho ~92–96% viewport');
assert(/ro-ent-table|table-bordered/.test(modal), '2. Tabla horizontal');
const cols = [
  'Ítem', 'Cantidad', 'Precio unitario', 'Precio total', 'Tipo de entrega', 'Entrega',
  'Plazo ofertado por el proveedor', 'Plazo aplicable', 'Inicio de actividad',
  'Fecha del evento', 'Fecha efectiva de inicio', 'Fecha máxima de entrega',
  'Lugar de entrega', 'Acciones',
];
assert(modal.includes('COL_HEADERS'), '3a. COL_HEADERS definido');
let orderOk = true;
let last = -1;
for (const c of cols) {
  const i = modal.indexOf(`'${c}'`);
  if (i < 0 || i < last) { orderOk = false; break; }
  last = i;
}
assert(orderOk, '3. Orden exacto de columnas');

// 4–5 Campos retirados
assert(!/Descripción operativa/.test(modal), '4. No aparece Descripción operativa');
assert(!/Tipo de días/.test(modal) && !/ro-tipodias/.test(modal), '5. No aparece Tipo de días');

// 6–9 Lugar / PU / total
assert(/ro-lugar/.test(modal) && /textarea/.test(modal), '6. Lugar de entrega editable');
const contratacion = fs.readFileSync(path.join(root, 'server/lib/ordenesContratacion.js'), 'utf8');
assert(/resolverLugarEntrega/.test(contratacion) && /lugares_entrega_item/.test(contratacion),
  '7. Lugar resuelto desde solicitud / lugares_entrega_item');
assert(/readonly/.test(modal) || /fmtMonto\(it\.precio_unitario\)/.test(modal), '8. Precio unitario solo lectura');
assert(/round2\(.*\* |precio_total: round2/.test(modal), '9. Total se calcula');

// Date object no debe producir "Fri Jul 24"
const fromDate = toIsoDateString(new Date(2026, 6, 24));
assert(fromDate === '2026-07-24', 'Fecha Date → YYYY-MM-DD (no Fri Jul 24)');
const fromBadSlice = String(new Date(2026, 6, 24)).slice(0, 10);
assert(fromBadSlice !== '2026-07-24', 'Sanity: String(Date).slice es inválido para PG');
const Adate = calcularFechaMaximaEntrega({
  condicionInicio: 'EMISION_ORDEN',
  fechaOrden: new Date(2026, 6, 24),
  plazoDias: 20,
});
assert(Adate.fechaMaxima === '2026-08-12', 'Date object en BE calcula inclusivo sin error PG');

// 10–11 Selectores
assert(/ÚNICO|UNICO/.test(modal), '10. Selector ÚNICO');
assert(/length: 24|i \+ 1/.test(modal), '11. Selector 1–24');

// 12–13 Inicio actividad
assert(/ro-ini-cond|Inicio de actividad/.test(modal), '12. Inicio de actividad integrado');
const menu = registroOrdenesMenuItems({
  ccp_firmado: true, orden_id: 1, estado: 'ORDEN_REGISTRADA', checklist_completo: true,
}, { canManage: true });
assert(!menu.some((x) => /inicio/i.test(x.act) || /Inicio de actividad/i.test(x.label)),
  '13. Inicio de actividad no aparece en menú Acciones');

// 14–23 Conteo inclusivo
const A = calcularFechaMaximaEntrega({
  condicionInicio: 'EMISION_ORDEN', fechaOrden: '2026-07-24', plazoDias: 20,
});
assert(A.fechaEfectivaInicio === '2026-07-24', '14a. Emisión: efectiva = orden');
assert(A.fechaMaxima === '2026-08-12', '14. Emisión 24/07 + 20 días → 12/08');

const C = calcularFechaMaximaEntrega({
  condicionInicio: 'SUSCRIPCION_ACTA_INICIO', fechaActa: '2026-08-01', plazoDias: 10,
});
assert(C.fechaMaxima === '2026-08-10', '15. Acta 01/08 + 10 → 10/08');

const E = calcularFechaMaximaEntrega({
  condicionInicio: 'SUSCRIPCION_CONTRATO', fechaContrato: '2026-08-05', plazoDias: 15,
});
assert(E.fechaMaxima === '2026-08-19', '16. Contrato 05/08 + 15 → 19/08');

const B = calcularFechaMaximaEntrega({
  condicionInicio: 'DIA_SIGUIENTE_NOTIFICACION',
  fechaNotificacion: '2026-07-27',
  plazoDias: 10,
});
assert(B.fechaEfectivaInicio === '2026-07-28', '17. Día siguiente notif: efectiva 28/07');
assert(B.fechaMaxima === '2026-08-06', '21. 28/07 + 10 inclusivo → 06/08');

const D = calcularFechaMaximaEntrega({
  condicionInicio: 'DIA_SIGUIENTE_ACTA_INICIO', fechaActa: '2026-08-01', plazoDias: 10,
});
assert(D.fechaEfectivaInicio === '2026-08-02', '18. Día siguiente acta: +1');
assert(D.fechaMaxima === '2026-08-11', '18b. máx 11/08');

const F = calcularFechaMaximaEntrega({
  condicionInicio: 'DIA_SIGUIENTE_CONTRATO', fechaContrato: '2026-08-05', plazoDias: 15,
});
assert(F.fechaEfectivaInicio === '2026-08-06', '19. Día siguiente contrato: +1');
assert(F.fechaMaxima === '2026-08-20', '19b. máx 20/08');

assert(calcularFechaMaxima('2026-07-24', 1, 'calendario') === '2026-07-24', '20. Plazo 1 día = mismo día');
assert(calcularFechaMaxima('2026-07-24', 20, 'calendario') === '2026-08-12', '22. 20 días desde 24/07 → 12/08');
assert(calcularFechaMaxima('2026-07-24', 20, 'calendario') !== '2026-08-13', '23. No día adicional (no 13/08)');

// 24–25 Pendiente notificación
const pend = calcularFechaMaximaEntrega({
  condicionInicio: 'DIA_SIGUIENTE_NOTIFICACION',
  fechaNotificacion: null,
  plazoDias: 10,
});
assert(pend.pendienteNotificacion === true && !pend.fechaMaxima, '24. Pendiente no inventa fecha');

const after = calcularFechasInicioActividad({
  condicion: 'DIA_SIGUIENTE_NOTIFICACION',
  fechaNotificacion: '2026-07-27',
  diasPlazo: 10,
  allowPending: false,
});
assert(after.fecha_maxima === '2026-08-06', '25. Tras notificar recalcula inclusivo');

// 26–29 UI checklist / resumen / guardado
assert(/Resumen de distribución/.test(modal), '26. Resumen de distribución');
assert(/Validación del cronograma/.test(modal), '27. Checklist preventivo');
assert(/Guardar cronograma/.test(modal) && /dias_plazo/.test(modal), '28. Guardado valida plazo');
assert(/Cronograma válido/.test(modal), '29. Badge Cronograma válido');

// Shared export path
const shared = fs.readFileSync(path.join(root, 'shared/diasPlazo.js'), 'utf8');
assert(/plazo_dias - 1|toAdd = Math\.trunc\(n\) - 1/.test(shared), 'Fórmula inclusiva en shared');
assert(/calcularFechaMaximaEntrega/.test(shared), 'Función central calcularFechaMaximaEntrega');

// No reutilizar módulos prohibidos
assert(!/mantenimiento\/ordenes|ejecucion\/registro/.test(modal + utils),
  'No reutiliza mantenimiento/ordenes ni ejecucion/registro');

const failed = tests.filter((t) => !t.ok);
console.log(`\nRC103: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((f) => console.error(' -', f.msg));
  process.exit(1);
}
