/**
 * RC102 — Checklist preventivo Registro de Órdenes.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  evaluarChecklist,
  listoParaNotificacion,
  ETAPAS_CHECKLIST,
} from '../shared/expedienteChecklist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const tests = [];
function assert(cond, msg) {
  tests.push({ ok: !!cond, msg });
  console.log(cond ? 'OK' : 'FAIL', msg);
}

console.log('\n=== RC102 Checklist Órdenes ===\n');

const vacio = evaluarChecklist(ETAPAS_CHECKLIST.REGISTRO_ORDENES_NOTIFICACION, {});
assert(!vacio.completo, 'vacío incompleto');
assert(vacio.pendientes.length === 8, '8 requisitos pendientes');
assert(vacio.primerPendiente?.id === 'ccp_firmado', 'primer pendiente CCP');

const completoSnap = {
  ccp_firmado: true,
  numero_orden: '001',
  fecha_orden: '2026-07-27',
  orden_firmada: true,
  entregas_count: 1,
  inicio_actividad: true,
  items: [{ id: 1, cantidad: 1, precio_unitario: 100, precio_total: 100 }],
  entrega_items: [{ orden_item_id: 1, cantidad: 1, precio_total: 100 }],
  monto_total: 100,
};
assert(listoParaNotificacion(completoSnap), 'completo → listo notificación');

const sinInicio = { ...completoSnap, inicio_actividad: false };
assert(!listoParaNotificacion(sinInicio), 'sin inicio → no listo');

const malCant = {
  ...completoSnap,
  entrega_items: [{ orden_item_id: 1, cantidad: 0.5, precio_total: 50 }],
};
assert(!listoParaNotificacion(malCant), 'cantidades incompletas');

const recep = evaluarChecklist(ETAPAS_CHECKLIST.RECEPCION, { orden_notificada: true });
assert(recep.pendientes.some((p) => p.id === 'recepcion_confirmada'), 'etapa recepción extensible');

const shared = fs.readFileSync(path.join(root, 'shared/expedienteChecklist.js'), 'utf8');
assert(shared.includes('RECEPCION') && shared.includes('EJECUCION') && shared.includes('PAGO'), 'etapas futuras');

const be = fs.readFileSync(path.join(root, 'server/lib/ordenesChecklist.js'), 'utf8');
assert(be.includes('sincronizarEstadoSegunChecklist'), 'sync estado BE');

const routes = fs.readFileSync(path.join(root, 'server/routes/ordenesContratacion.js'), 'utf8');
assert(routes.includes('/:id/checklist'), 'endpoint checklist orden');
assert(
  routes.indexOf('/checklist/requerimiento/') < routes.indexOf("router.get('/:id'"),
  'checklist route antes de /:id',
);

const ent = fs.readFileSync(path.join(root, 'server/lib/ordenesEntregas.js'), 'utf8');
assert(ent.includes('sincronizarEstadoSegunChecklist'), 'cronograma usa checklist estado');

const ui = fs.readFileSync(path.join(root, 'src/utils/expedienteChecklistUi.js'), 'utf8');
assert(ui.includes('Completar información'), 'botón completar');

const view = fs.readFileSync(path.join(root, 'src/views/contratacion/registroOrdenesView.js'), 'utf8');
assert(view.includes('verChecklist') && view.includes('validarYMostrarChecklist'), 'vista integrada');

const menu = fs.readFileSync(path.join(root, 'src/utils/ordenesUtils.js'), 'utf8');
assert(menu.includes('checklist_completo'), 'notificar condicionado');

const failed = tests.filter((x) => !x.ok);
console.log(`\nRC102: ${tests.length - failed.length}/${tests.length} OK`);
if (failed.length) {
  failed.forEach((f) => console.error(' -', f.msg));
  process.exit(1);
}
